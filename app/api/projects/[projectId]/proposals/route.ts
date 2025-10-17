import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { supabaseServer } from '@/lib/supabase-server';
import { generateTreeName, formatNodeContent, generateBriefSummary } from '@/lib/ai/synthesis';

// Simple in-memory cache for proposals (in production, use Redis or similar)
const proposalsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds

// Dependency graph analysis and workflow-based block organization
async function createWorkflowBasedBlocks(proposals: any[], experimentTreeId: string) {
  console.log('[BLOCK ORGANIZATION] Analyzing dependencies for workflow-based blocks');
  
  // Build dependency graph
  const dependencyGraph = new Map<string, Set<string>>();
  const reverseDependencyGraph = new Map<string, Set<string>>();
  const nodeTitles = new Map<string, string>();
  
  // Initialize graphs and collect node titles
  proposals.forEach(proposal => {
    const nodeId = proposal.id;
    const title = proposal.node_json.title;
    nodeTitles.set(nodeId, title);
    dependencyGraph.set(nodeId, new Set());
    reverseDependencyGraph.set(nodeId, new Set());
  });
  
  // Build dependency relationships
  proposals.forEach(proposal => {
    const nodeId = proposal.id;
    const dependencies = proposal.node_json.dependencies || [];
    
    dependencies.forEach((dep: any) => {
      // Find the node that matches this dependency title
      const matchingNodeId = Array.from(nodeTitles.entries())
        .find(([id, title]) => title.toLowerCase().includes(dep.referenced_title.toLowerCase()) || 
                              dep.referenced_title.toLowerCase().includes(title.toLowerCase()))?.[0];
      
      if (matchingNodeId && matchingNodeId !== nodeId) {
        dependencyGraph.get(nodeId)?.add(matchingNodeId);
        reverseDependencyGraph.get(matchingNodeId)?.add(nodeId);
        console.log(`[BLOCK ORGANIZATION] Found dependency: "${proposal.node_json.title}" depends on "${nodeTitles.get(matchingNodeId)}"`);
      }
    });
  });
  
  // Topological sort to determine workflow order
  const visited = new Set<string>();
  const tempVisited = new Set<string>();
  const sortedNodes: string[] = [];
  
  function visit(nodeId: string) {
    if (tempVisited.has(nodeId)) {
      console.warn(`[BLOCK ORGANIZATION] Circular dependency detected involving node: ${nodeTitles.get(nodeId)}`);
      return;
    }
    if (visited.has(nodeId)) return;
    
    tempVisited.add(nodeId);
    const dependencies = dependencyGraph.get(nodeId) || new Set();
    dependencies.forEach(depId => visit(depId));
    tempVisited.delete(nodeId);
    visited.add(nodeId);
    sortedNodes.push(nodeId);
  }
  
  // Visit all nodes
  proposals.forEach(proposal => visit(proposal.id));
  
  console.log(`[BLOCK ORGANIZATION] Topological sort result: ${sortedNodes.map(id => nodeTitles.get(id)).join(' → ')}`);
  
  // Group nodes into workflow phases based on dependencies
  const workflowPhases = {
    'Preparation': new Set<string>(),
    'Execution': new Set<string>(),
    'Analysis': new Set<string>(),
    'Validation': new Set<string>()
  };
  
  // Assign nodes to phases based on dependency analysis and topological order
  const totalNodes = sortedNodes.length;
  sortedNodes.forEach((nodeId, index) => {
    const dependencies = dependencyGraph.get(nodeId) || new Set();
    const dependents = reverseDependencyGraph.get(nodeId) || new Set();
    const proposal = proposals.find(p => p.id === nodeId);
    const nodeType = proposal?.node_json.metadata?.node_type?.toLowerCase() || 'protocol';
    
    // Determine phase based on dependencies, node type, and position in workflow
    const workflowPosition = index / totalNodes; // 0 to 1
    
    if (dependencies.size === 0 || workflowPosition < 0.25) {
      // No dependencies or early in workflow - preparation phase
      workflowPhases.Preparation.add(nodeId);
    } else if (nodeType === 'analysis' || nodeType === 'data_creation' || nodeType === 'software' || (workflowPosition >= 0.5 && workflowPosition < 0.8)) {
      // Analysis, data processing, or software nodes, or middle-late workflow
      workflowPhases.Analysis.add(nodeId);
    } else if (nodeType === 'results' || dependents.size === 0 || workflowPosition >= 0.8) {
      // Results or final nodes, or late in workflow
      workflowPhases.Validation.add(nodeId);
    } else {
      // Everything else goes to execution (middle workflow)
      workflowPhases.Execution.add(nodeId);
    }
  });
  
  // Create blocks for each phase that has nodes
  // Split phases with > 15 nodes into sub-phases
  const blockInserts: any[] = [];
  const nodeBlockMapping = new Map<string, string>();
  let position = 0;
  
  const MAX_NODES_PER_BLOCK = 15;
  
  Object.entries(workflowPhases).forEach(([phaseName, nodeIds]) => {
    if (nodeIds.size > 0) {
      const nodeArray = Array.from(nodeIds);
      
      // If phase has <= 15 nodes, create single block
      if (nodeArray.length <= MAX_NODES_PER_BLOCK) {
        const blockId = crypto.randomUUID();
        blockInserts.push({
          id: blockId,
          tree_id: experimentTreeId,
          name: `${phaseName}`,
          description: `${phaseName} phase with ${nodeArray.length} node(s)`,
          position: position++,
        });
        
        // Map nodes to their block
        nodeArray.forEach(nodeId => {
          nodeBlockMapping.set(nodeId, blockId);
        });
        
        console.log(`[BLOCK ORGANIZATION] Created ${phaseName} block with ${nodeArray.length} nodes`);
      }
      // If phase has > 15 nodes, split into sub-phases
      else {
        const numSubPhases = Math.ceil(nodeArray.length / MAX_NODES_PER_BLOCK);
        console.log(`[BLOCK ORGANIZATION] Splitting ${phaseName} (${nodeArray.length} nodes) into ${numSubPhases} sub-blocks`);
        
        for (let i = 0; i < numSubPhases; i++) {
          const start = i * MAX_NODES_PER_BLOCK;
          const end = Math.min((i + 1) * MAX_NODES_PER_BLOCK, nodeArray.length);
          const subPhaseNodes = nodeArray.slice(start, end);
          
          const blockId = crypto.randomUUID();
          const subPhaseName = numSubPhases > 1 ? `${phaseName} - Part ${i + 1}` : phaseName;
          
          blockInserts.push({
            id: blockId,
            tree_id: experimentTreeId,
            name: subPhaseName,
            description: `${phaseName} phase part ${i + 1} of ${numSubPhases} with ${subPhaseNodes.length} node(s)`,
            position: position++,
          });
          
          // Map nodes to their block
          subPhaseNodes.forEach(nodeId => {
            nodeBlockMapping.set(nodeId, blockId);
          });
          
          console.log(`[BLOCK ORGANIZATION] Created ${subPhaseName} with ${subPhaseNodes.length} nodes (nodes ${start + 1}-${end})`);
        }
      }
    }
  });
  
  console.log(`[BLOCK ORGANIZATION] Created ${blockInserts.length} total blocks`);
  
  return { blockInserts, nodeBlockMapping, sortedNodes };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

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

    // Group proposals by node_type to calculate blocks
    const proposedNodes = (proposals || []).filter((p: any) => p.status === 'proposed');
    const nodeTypeGroups: Record<string, any[]> = {};
    
    proposedNodes.forEach((proposal: any) => {
      let nodeType = 'uncategorized';
      
      if (proposal.node_json?.metadata?.node_type) {
        const rawType = proposal.node_json.metadata.node_type.toLowerCase();
        if (rawType === 'protocol' || rawType === 'method' || rawType === 'procedure') {
          nodeType = 'protocol';
        } else if (rawType === 'analysis' || rawType === 'processing' || rawType === 'computation') {
          nodeType = 'analysis';
        } else if (rawType === 'results' || rawType === 'result' || rawType === 'findings' || rawType === 'conclusions') {
          nodeType = 'results';
        } else if (rawType === 'data' || rawType === 'data_creation' || rawType === 'materials' || rawType === 'equipment') {
          nodeType = 'data_creation';
        }
      }
      
      if (!nodeTypeGroups[nodeType]) {
        nodeTypeGroups[nodeType] = [];
      }
      nodeTypeGroups[nodeType].push(proposal);
    });
    
    const blocksCount = Object.keys(nodeTypeGroups).length;
    const nodesCount = proposedNodes.length;

    // Cache the results
    proposalsCache.set(cacheKey, { data: proposals || [], timestamp: now });

    return NextResponse.json({ 
      proposals: proposals || [],
      stats: {
        totalNodes: nodesCount,
        totalBlocks: blocksCount,
        blockBreakdown: Object.entries(nodeTypeGroups).map(([type, nodes]) => ({
          type,
          count: nodes.length
        }))
      }
    });

  } catch (error) {
    console.error('Get proposals API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json().catch(() => ({}));
    const { proposalIds, clearAll } = body;

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

    let deleteResult;

    if (clearAll) {
      // Delete ALL proposals for the project (including those with invalid node types)
      const { data: deletedProposals, error: deleteError } = await supabaseServer
        .from('proposed_nodes')
        .delete()
        .eq('project_id', resolvedProjectId)
        .select('id');

      if (deleteError) {
        return NextResponse.json({ error: 'Failed to delete proposals' }, { status: 500 });
      }

      deleteResult = {
        deletedCount: deletedProposals?.length || 0,
        message: `Deleted ${deletedProposals?.length || 0} proposals`
      };
    } else if (proposalIds && Array.isArray(proposalIds) && proposalIds.length > 0) {
      // Delete specific proposals
      const { data: deletedProposals, error: deleteError } = await supabaseServer
        .from('proposed_nodes')
        .delete()
        .eq('project_id', resolvedProjectId)
        .in('id', proposalIds)
        .select('id');

      if (deleteError) {
        return NextResponse.json({ error: 'Failed to delete proposals' }, { status: 500 });
      }

      deleteResult = {
        deletedCount: deletedProposals?.length || 0,
        message: `Deleted ${deletedProposals?.length || 0} proposals`
      };
    } else {
      return NextResponse.json({ error: 'No proposals specified for deletion' }, { status: 400 });
    }

    // Invalidate cache
    proposalsCache.delete(`proposals-${resolvedProjectId}`);

    return NextResponse.json(deleteResult);

  } catch (error) {
    console.error('Delete proposals API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
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
        // Generate contextual tree name from proposal content
        let treeName = 'AI Generated Experiment Tree'; // fallback
        try {
          const contentChunks = proposals.slice(0, 3).map(proposal => 
            proposal.node_json?.content?.text || proposal.node_json?.title || ''
          ).filter(Boolean);
          
          if (contentChunks.length > 0) {
            treeName = await generateTreeName(contentChunks);
          }
        } catch (error) {
          console.error('Failed to generate tree name:', error);
          // Use fallback name
        }

        const { data: tree, error: treeError } = await supabaseServer
          .from('experiment_trees')
          .insert({
            project_id: resolvedProjectId,
            name: treeName,
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

      // Analyze dependencies and create workflow-based blocks
      const { blockInserts, nodeBlockMapping, sortedNodes } = await createWorkflowBasedBlocks(proposals, experimentTreeId);

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

      // Create a mapping from our generated block IDs to actual database block IDs
      const generatedToActualBlockId = new Map<string, string>();
      blockInserts.forEach((insertBlock: any, index: number) => {
        if (blocks[index]) {
          generatedToActualBlockId.set(insertBlock.id, blocks[index].id);
        }
      });

      // Convert proposed nodes to tree nodes, organized by workflow blocks
      // Process each node to improve content structure with proper sequencing
      const treeNodes: any[] = [];
      const blockPositionCounters = new Map<string, number>();
      
      // Initialize position counters for each block
      generatedToActualBlockId.forEach((actualBlockId) => {
        blockPositionCounters.set(actualBlockId, 0);
      });
      
      // Process nodes in topological order to maintain dependency sequence
      const sortedProposals = proposals.sort((a, b) => {
        const aIndex = sortedNodes.indexOf(a.id);
        const bIndex = sortedNodes.indexOf(b.id);
        // If a node is not found in sortedNodes, put it at the end
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
      
      for (const proposal of sortedProposals) {
        const blockId = nodeBlockMapping.get(proposal.id);
        const actualBlockId = blockId ? generatedToActualBlockId.get(blockId) : null;
        
        if (!actualBlockId) {
          console.warn(`No block found for proposal ${proposal.id}, skipping`);
          continue;
        }
        
        // Get the raw content
        const rawContent = proposal.node_json?.content?.text || proposal.node_json?.title || '';
        const rawTitle = proposal.node_json?.title || proposal.node_json?.name || 'Untitled Node';
        
        // Format content and generate summary
        let formattedContent = rawContent;
        let briefSummary = proposal.node_json?.short_summary || proposal.node_json?.description || '';
        
        try {
          // Format the content for better presentation (skip if rate limited)
          if (rawContent && rawContent.length > 0) {
            formattedContent = await formatNodeContent(rawContent);
          }
          
          // Generate brief summary if not available or too long (skip if rate limited)
          if ((!briefSummary || briefSummary.length > 100) && (formattedContent || rawTitle)) {
            briefSummary = await generateBriefSummary(formattedContent || rawTitle);
          }
        } catch (error: any) {
          console.error('Failed to format node content:', error);
          // Use original content if formatting fails due to rate limits or other issues
          if (error.message?.includes('rate_limit_error') || error.status === 429) {
            console.log('Skipping content formatting due to rate limits, using original content');
          }
        }
        
        // Get the current position for this block and increment it
        const currentPosition = blockPositionCounters.get(actualBlockId) || 0;
        blockPositionCounters.set(actualBlockId, currentPosition + 1);
        
        // Map node types to valid database values
        const rawNodeType = proposal.node_json?.metadata?.node_type?.toLowerCase() || 'protocol';
        const validNodeTypes = ['protocol', 'data_creation', 'analysis', 'results'];
        let mappedNodeType = rawNodeType;
        
        // Handle common mappings
        if (rawNodeType === 'result') {
          mappedNodeType = 'results';
        } else if (rawNodeType === 'data') {
          mappedNodeType = 'data_creation';
        } else if (!validNodeTypes.includes(rawNodeType)) {
          // Default to protocol for unknown types
          mappedNodeType = 'protocol';
        }
        
        treeNodes.push({
          tree_id: experimentTreeId,
          block_id: actualBlockId,
          name: rawTitle,
          description: briefSummary,
          node_type: mappedNodeType,
          position: currentPosition, // Sequential position within the block
          provenance: proposal.provenance,
          confidence: proposal.confidence,
        });
      }

      console.log('Creating tree nodes:', treeNodes.length, 'nodes');
      console.log('Node sequencing by block:');
      const blockSequences = new Map<string, string[]>();
      treeNodes.forEach(node => {
        if (!blockSequences.has(node.block_id)) {
          blockSequences.set(node.block_id, []);
        }
        blockSequences.get(node.block_id)!.push(`${node.position}: ${node.name}`);
      });
      blockSequences.forEach((sequence, blockId) => {
        console.log(`Block ${blockId}: ${sequence.join(' → ')}`);
      });

      const { error: insertError } = await supabaseServer
        .from('tree_nodes')
        .insert(treeNodes);

      if (insertError) {
        console.error('Tree nodes creation error:', insertError);
        
        // Provide more specific error messages
        if (insertError.code === '23514') {
          return NextResponse.json({ 
            error: 'Invalid node type detected. Please regenerate proposals with updated AI model.' 
          }, { status: 400 });
        } else if (insertError.code === '23503') {
          return NextResponse.json({ 
            error: 'Invalid block or tree reference. Please try again.' 
          }, { status: 400 });
        } else {
          return NextResponse.json({ 
            error: 'Failed to create tree nodes',
            details: insertError.message 
          }, { status: 500 });
        }
      }

      console.log('Successfully created tree nodes');

      // Create node content entries with formatted content
      const nodeContentEntries: any[] = [];
      for (const proposal of proposals) {
        const blockId = nodeBlockMapping.get(proposal.id);
        const actualBlockId = blockId ? generatedToActualBlockId.get(blockId) : null;
        
        if (!actualBlockId) continue;
        
        const treeNode = treeNodes.find(n => 
          n.block_id === actualBlockId && n.name === proposal.node_json?.title
        );
        
        if (treeNode) {
          // Get the raw content
          const rawContent = proposal.node_json?.content?.text || proposal.node_json?.title || '';
          
          // Format content for better presentation
          let formattedContent = rawContent;
          try {
            if (rawContent && rawContent.length > 0) {
              formattedContent = await formatNodeContent(rawContent);
            }
          } catch (error: any) {
            console.error('Failed to format node content for storage:', error);
            // Use original content if formatting fails due to rate limits or other issues
            if (error.message?.includes('rate_limit_error') || error.status === 429) {
              console.log('Skipping content formatting for storage due to rate limits, using original content');
            }
          }
          
          nodeContentEntries.push({
            node_id: treeNode.tree_id, // This should be the node ID, but we need to get it from the insert
            content: formattedContent,
            status: 'draft'
          });
        }
      }

      // Get the created node IDs and create content entries
      if (nodeContentEntries.length > 0) {
        const { data: createdNodes, error: fetchNodesError } = await supabaseServer
          .from('tree_nodes')
          .select('id, position, block_id')
          .eq('tree_id', experimentTreeId);

        if (!fetchNodesError && createdNodes) {
          const contentEntries = createdNodes.map(node => {
            const contentEntry = nodeContentEntries.find(entry => {
              // Match by position and block_id
              const originalNode = treeNodes.find(tn => 
                tn.position === node.position && tn.block_id === node.block_id
              );
              return originalNode;
            });
            
            if (contentEntry) {
              return {
                node_id: node.id,
                content: contentEntry.content,
                status: 'draft'
              };
            }
            return null;
          }).filter(Boolean);

          if (contentEntries.length > 0) {
            const { error: contentError } = await supabaseServer
              .from('node_content')
              .insert(contentEntries);

            if (contentError) {
              console.error('Failed to create node content:', contentError);
            } else {
              console.log('Successfully created node content entries');
            }
          }
        }
      }

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