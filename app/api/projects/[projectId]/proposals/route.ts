import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { supabaseServer } from '@/lib/supabase-server';

// Simple in-memory cache for proposals (in production, use Redis or similar)
const proposalsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const projectId = params.projectId;

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve project ID - handle both UUID and slug
    let resolvedProjectId = projectId;
    
    // Check if projectId is a slug (not a UUID format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      // Look up project by slug
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      
      resolvedProjectId = project.id;
    }

    // Check project access
    const { data: projectMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', resolvedProjectId)
      .eq('user_id', user.id)
      .single();

    if (!projectMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check cache first
    const cacheKey = `proposals-${resolvedProjectId}`;
    const cached = proposalsCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return NextResponse.json({ proposals: cached.data });
    }

    // Get proposed nodes for the project with optimized query
    const { data: proposals, error } = await supabaseServer
      .from('proposed_nodes')
      .select(`
        id,
        node_json,
        status,
        confidence,
        provenance,
        created_at,
        updated_at
      `)
      .eq('project_id', resolvedProjectId)
      .eq('status', 'proposed')
      .order('created_at', { ascending: false })
      .limit(100); // Limit to prevent large responses

    if (error) {
      console.error('Error fetching proposals:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch proposals' 
      }, { status: 500 });
    }

    // Cache the results
    proposalsCache.set(cacheKey, { data: proposals || [], timestamp: now });

    return NextResponse.json({ proposals: proposals || [] });

  } catch (error) {
    console.error('Get proposals API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const projectId = params.projectId;
    const body = await request.json();
    const { action, proposalIds, treeId, blockId } = body;

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve project ID
    let resolvedProjectId = projectId;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      
      resolvedProjectId = project.id;
    }

    // Check project access
    const { data: projectMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', resolvedProjectId)
      .eq('user_id', user.id)
      .single();

    if (!projectMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (action === 'accept') {
      // Accept proposed nodes and add to experiment tree
      const { data: proposals, error: fetchError } = await supabaseServer
        .from('proposed_nodes')
        .select('*')
        .eq('project_id', resolvedProjectId)
        .in('id', proposalIds);

      if (fetchError || !proposals) {
        return NextResponse.json({ error: 'Failed to fetch proposals' }, { status: 500 });
      }

      // Create or get experiment tree
      let experimentTreeId = treeId;
      if (!experimentTreeId) {
        const { data: tree, error: treeError } = await supabaseServer
          .from('experiment_trees')
          .insert({
            project_id: resolvedProjectId,
            name: 'AI Generated Experiment Tree',
            description: 'Experiment tree generated from uploaded files',
            created_by: user.id,
          })
          .select('id')
          .single();

        if (treeError || !tree) {
          return NextResponse.json({ error: 'Failed to create experiment tree' }, { status: 500 });
        }
        experimentTreeId = tree.id;
      }

      // Group proposals by node type to create blocks
      const nodeTypeGroups = proposals.reduce((groups, proposal) => {
        // Determine node type from tags or fallback to a default
        let nodeType = 'protocol'; // default fallback
        
        if (proposal.node_json.metadata?.tags && Array.isArray(proposal.node_json.metadata.tags)) {
          const tags = proposal.node_json.metadata.tags;
          if (tags.includes('protocol') || tags.includes('method') || tags.includes('procedure')) {
            nodeType = 'protocol';
          } else if (tags.includes('analysis') || tags.includes('processing') || tags.includes('computation')) {
            nodeType = 'analysis';
          } else if (tags.includes('results') || tags.includes('findings') || tags.includes('conclusions')) {
            nodeType = 'results';
          } else if (tags.includes('data') || tags.includes('materials') || tags.includes('equipment')) {
            nodeType = 'data_creation';
          }
        } else if (proposal.node_json.metadata?.node_type) {
          nodeType = proposal.node_json.metadata.node_type.toLowerCase();
        }
        
        if (!groups[nodeType]) {
          groups[nodeType] = [];
        }
        groups[nodeType].push(proposal);
        return groups;
      }, {} as Record<string, typeof proposals>);

      // Create blocks for each node type
      const blockInserts = Object.entries(nodeTypeGroups).map(([nodeType, nodes], blockIndex) => ({
        tree_id: experimentTreeId,
        name: `${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} Block`,
        description: `Block containing ${nodes.length} ${nodeType} nodes`,
        position: blockIndex,
      }));

      console.log('Creating blocks:', blockInserts);

      const { data: blocks, error: blockInsertError } = await supabaseServer
        .from('tree_blocks')
        .insert(blockInserts)
        .select('id, name');

      if (blockInsertError || !blocks) {
        console.error('Block creation error:', blockInsertError);
        return NextResponse.json({ error: 'Failed to create tree blocks' }, { status: 500 });
      }

      console.log('Created blocks:', blocks);

      // Convert proposed nodes to tree nodes, organized by blocks
      const treeNodes = Object.entries(nodeTypeGroups).flatMap(([nodeType, nodes], blockIndex) => {
        const block = blocks[blockIndex];
        return nodes.map((proposal, nodeIndex) => ({
          tree_id: experimentTreeId,
          block_id: block.id,
          name: proposal.node_json.title || proposal.node_json.name || 'Untitled Node',
          description: proposal.node_json.short_summary || proposal.node_json.description || '',
          node_type: nodeType,
          position: nodeIndex,
          provenance: proposal.provenance,
          confidence: proposal.confidence,
        }));
      });

      console.log('Creating tree nodes:', treeNodes.length, 'nodes');

      const { error: insertError } = await supabaseServer
        .from('tree_nodes')
        .insert(treeNodes);

      if (insertError) {
        console.error('Tree nodes creation error:', insertError);
        return NextResponse.json({ error: 'Failed to create tree nodes' }, { status: 500 });
      }

      console.log('Successfully created tree nodes');

      // Update proposed nodes status
      const { error: updateError } = await supabaseServer
        .from('proposed_nodes')
        .update({ 
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .in('id', proposalIds);

      if (updateError) {
        return NextResponse.json({ error: 'Failed to update proposal status' }, { status: 500 });
      }

      // Invalidate cache
      proposalsCache.delete(`proposals-${resolvedProjectId}`);

      return NextResponse.json({ 
        success: true, 
        treeId: experimentTreeId,
        acceptedCount: proposals.length
      });

    } else if (action === 'reject') {
      // Reject proposed nodes
      const { error: updateError } = await supabaseServer
        .from('proposed_nodes')
        .update({ 
          status: 'rejected',
          rejected_at: new Date().toISOString()
        })
        .in('id', proposalIds);

      if (updateError) {
        return NextResponse.json({ error: 'Failed to reject proposals' }, { status: 500 });
      }

      // Invalidate cache
      proposalsCache.delete(`proposals-${resolvedProjectId}`);

      return NextResponse.json({ success: true, rejectedCount: proposalIds.length });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Proposal action API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}