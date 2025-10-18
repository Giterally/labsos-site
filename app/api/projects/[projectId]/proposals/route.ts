import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { supabaseServer } from '@/lib/supabase-server';
import { generateTreeName, formatNodeContent, generateBriefSummary } from '@/lib/ai/synthesis';
import { randomUUID } from 'crypto';

// NOTE: Removed in-memory proposals cache to avoid stale data across instances

// Build tree blocks directly from proposals (preserving structure)
async function createBlocksFromProposals(proposals: any[], experimentTreeId: string) {
  console.log('[BLOCK ORGANIZATION] Creating blocks directly from proposals to preserve structure');
  
  // Group proposals by node_type to create logical blocks
  const blocksByType = new Map<string, any[]>();
  
  proposals.forEach(proposal => {
    const nodeType = proposal.node_json?.metadata?.node_type || 'general';
    if (!blocksByType.has(nodeType)) {
      blocksByType.set(nodeType, []);
    }
    blocksByType.get(nodeType)!.push(proposal);
  });
  
  console.log('[BLOCK ORGANIZATION] Grouped proposals by type:', Array.from(blocksByType.keys()));
  
  // Create block inserts with logical ordering
  const blockTypeOrder = ['protocol', 'data_creation', 'analysis', 'results', 'software'];
  const blockInserts = [];
  const nodeBlockMapping = new Map<string, string>();
  
  let blockPosition = 1;
  
  // Create blocks in logical order
  for (const nodeType of blockTypeOrder) {
    if (blocksByType.has(nodeType)) {
      const blockName = getBlockDisplayName(nodeType);
      const blockId = randomUUID();
      
      blockInserts.push({
        id: blockId,
        tree_id: experimentTreeId,
        name: blockName,
        position: blockPosition,
        description: `Block containing ${nodeType} nodes`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      // Map all proposals of this type to this block
      blocksByType.get(nodeType)!.forEach(proposal => {
        nodeBlockMapping.set(proposal.id, blockId);
      });
      
      blockPosition++;
    }
  }
  
  // Handle any remaining types not in the predefined order
  for (const [nodeType, typeProposals] of blocksByType) {
    if (!blockTypeOrder.includes(nodeType)) {
      const blockName = getBlockDisplayName(nodeType);
      const blockId = randomUUID();
      
      blockInserts.push({
        id: blockId,
        tree_id: experimentTreeId,
        name: blockName,
        position: blockPosition,
        description: `Block containing ${nodeType} nodes`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      typeProposals.forEach(proposal => {
        nodeBlockMapping.set(proposal.id, blockId);
      });
      
      blockPosition++;
    }
  }
  
  // Sort nodes within each block by title for consistent ordering
  const sortedNodes = proposals.sort((a, b) => {
    const aTitle = a.node_json?.title || '';
    const bTitle = b.node_json?.title || '';
    return aTitle.localeCompare(bTitle);
  });
  
  console.log('[BLOCK ORGANIZATION] Created', blockInserts.length, 'blocks from proposals');
  
  return { blockInserts, nodeBlockMapping, sortedNodes };
}

// Helper function to get display names for block types
function getBlockDisplayName(nodeType: string): string {
  const displayNames: Record<string, string> = {
    'protocol': 'Protocol',
    'data_creation': 'Data Creation', 
    'analysis': 'Analysis',
    'results': 'Results',
    'software': 'Software',
    'general': 'General'
  };
  
  return displayNames[nodeType] || nodeType.charAt(0).toUpperCase() + nodeType.slice(1);
}

// Legacy function - keeping for reference but not used
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
        const blockId = randomUUID();
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
          
          const blockId = randomUUID();
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
      .limit(500); // Allow larger responses; UI can paginate if needed

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
    const { action, proposalIds, treeId, blockId, jobId } = body; // Extract jobId for progress tracking

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
      // Import progress tracker at function scope (accessible in catch block)
      const { progressTracker } = await import('@/lib/progress-tracker');
      
      // Initialize tracking variables at function scope (accessible in catch block)
      const trackingJobId = jobId || `tree_build_${resolvedProjectId}_${Date.now()}`;
      
      try {
        progressTracker.update(trackingJobId, {
          stage: 'initializing',
          current: 0,
          total: 7,
          message: 'Starting tree build...',
        });
        
        console.log('[BUILD_TREE] Starting tree building process for', proposalIds.length, 'proposals');
        
        // Accept proposed nodes and add to experiment tree
        progressTracker.update(trackingJobId, {
          stage: 'initializing',
          current: 1,
          total: 7,
          message: 'Fetching proposals...',
        });
        
        const { data: proposals, error: fetchError } = await supabaseServer
          .from('proposed_nodes')
          .select('*')
          .eq('project_id', resolvedProjectId)
          .in('id', proposalIds);

        if (fetchError || !proposals) {
          console.error('[BUILD_TREE] Failed to fetch proposals:', fetchError);
          progressTracker.error(trackingJobId, 'Failed to fetch proposals');
          return NextResponse.json({ 
            error: 'Failed to fetch proposals',
            details: fetchError?.message 
          }, { status: 500 });
        }

        console.log('[BUILD_TREE] Fetched', proposals.length, 'proposals');

        // Create or get experiment tree
        progressTracker.update(trackingJobId, {
          stage: 'initializing',
          current: 2,
          total: 7,
          message: 'Creating experiment tree...',
        });
        
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
        progressTracker.update(trackingJobId, {
          stage: 'building_blocks',
          current: 3,
          total: 7,
          message: 'Analyzing dependencies and organizing nodes...',
        });
        
      const { blockInserts, nodeBlockMapping, sortedNodes } = await createBlocksFromProposals(proposals, experimentTreeId);

      console.log('Creating blocks:', blockInserts);
      
        progressTracker.update(trackingJobId, {
          stage: 'building_blocks',
          current: 4,
          total: 7,
          message: `Creating ${blockInserts.length} workflow blocks...`,
        });

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
      
      // Helper: chunk array into batches for parallel processing
      const chunk = <T,>(arr: T[], size: number): T[][] => {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
          arr.slice(i * size, i * size + size)
        );
      };

      // Process nodes in batches of 10 for parallel AI calls (10x speedup)
      const BATCH_SIZE = 10;
      const nodeBatches = chunk(sortedProposals, BATCH_SIZE);
      
      console.log(`Processing ${sortedProposals.length} nodes in ${nodeBatches.length} batches of ${BATCH_SIZE}`);
      
      for (let batchIndex = 0; batchIndex < nodeBatches.length; batchIndex++) {
        const batch = nodeBatches[batchIndex];
        console.log(`Processing batch ${batchIndex + 1}/${nodeBatches.length} (${batch.length} nodes)`);
        
        // Process entire batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (proposal) => {
            const blockId = nodeBlockMapping.get(proposal.id);
            const actualBlockId = blockId ? generatedToActualBlockId.get(blockId) : null;
            
            if (!actualBlockId) {
              console.warn(`No block found for proposal ${proposal.id}, skipping`);
              return null;
            }
            
            // Get the raw content
            const rawContent = proposal.node_json?.content?.text || proposal.node_json?.title || '';
            const rawTitle = proposal.node_json?.title || proposal.node_json?.name || 'Untitled Node';
            
            // Format content and generate summary
            let formattedContent = rawContent;
            let briefSummary = proposal.node_json?.short_summary || proposal.node_json?.description || '';
            
            try {
              // Run both AI calls in parallel for each node (2x speedup per node)
              const [formatted, summary] = await Promise.all([
                // Format the content for better presentation
                (rawContent && rawContent.length > 0) 
                  ? formatNodeContent(rawContent).catch(err => {
                      console.error('Format error:', err.message);
                      return rawContent;
                    })
                  : rawContent,
                // Generate brief summary if not available or too long
                ((!briefSummary || briefSummary.length > 100) && (rawContent || rawTitle))
                  ? generateBriefSummary(rawContent || rawTitle).catch(err => {
                      console.error('Summary error:', err.message);
                      return briefSummary;
                    })
                  : briefSummary
              ]);
              
              formattedContent = formatted;
              briefSummary = summary;
            } catch (error: any) {
              console.error('Failed to format node content:', error);
              // Use original content if formatting fails
              if (error.message?.includes('rate_limit_error') || error.status === 429) {
                console.log('Skipping content formatting due to rate limits, using original content');
              }
            }
            
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
            
            return {
              proposal,
              actualBlockId,
              rawTitle,
              briefSummary,
              mappedNodeType,
            };
          })
        );
        
        // Filter out failed nodes and assign positions sequentially within each block
        const validResults = batchResults.filter(Boolean);
        validResults.forEach(result => {
          if (!result) return;
          
          // Get the current position for this block and increment it
          const currentPosition = blockPositionCounters.get(result.actualBlockId) || 0;
          blockPositionCounters.set(result.actualBlockId, currentPosition + 1);
          
          treeNodes.push({
            tree_id: experimentTreeId,
            block_id: result.actualBlockId,
            name: result.rawTitle,
            description: result.briefSummary,
            node_type: result.mappedNodeType,
            position: currentPosition,
            provenance: result.proposal.provenance,
            confidence: result.proposal.confidence,
          });
        });
        
        console.log(`Completed batch ${batchIndex + 1}/${nodeBatches.length}, processed ${validResults.length} nodes`);
        
        // Update progress after each batch
        const batchProgress = Math.round(30 + ((batchIndex + 1) / nodeBatches.length) * 30); // 30-60%
        progressTracker.update(trackingJobId, {
          stage: 'building_nodes',
          current: batchProgress,
          total: 100,
          message: `Processed batch ${batchIndex + 1}/${nodeBatches.length} (${validResults.length} nodes)...`,
        });
      }

        progressTracker.update(trackingJobId, {
          stage: 'building_nodes',
          current: 65,
          total: 100,
          message: `Creating ${treeNodes.length} tree nodes...`,
        });
        
      console.log('[BUILD_TREE] Creating tree nodes:', treeNodes.length, 'nodes');
      console.log('[BUILD_TREE] Node sequencing by block:');
      const blockSequences = new Map<string, string[]>();
      treeNodes.forEach(node => {
        if (!blockSequences.has(node.block_id)) {
          blockSequences.set(node.block_id, []);
        }
        blockSequences.get(node.block_id)!.push(`${node.position}: ${node.name}`);
      });
      blockSequences.forEach((sequence, blockId) => {
        console.log(`[BUILD_TREE] Block ${blockId}: ${sequence.join(' → ')}`);
      });

      // Insert tree nodes and get the created node IDs
      const { data: createdTreeNodes, error: insertError } = await supabaseServer
        .from('tree_nodes')
        .insert(treeNodes)
        .select('id, name, position, block_id');

      if (insertError || !createdTreeNodes || createdTreeNodes.length === 0) {
        console.error('[BUILD_TREE] Tree nodes creation error:', insertError);
        
        // Provide more specific error messages
        if (insertError?.code === '23514') {
          return NextResponse.json({ 
            error: 'Invalid node type detected. Please regenerate proposals with updated AI model.',
            details: insertError.message
          }, { status: 400 });
        } else if (insertError?.code === '23503') {
          return NextResponse.json({ 
            error: 'Invalid block or tree reference. Please try again.',
            details: insertError.message
          }, { status: 400 });
        } else {
          return NextResponse.json({ 
            error: 'Failed to create tree nodes',
            details: insertError?.message || 'Unknown error'
          }, { status: 500 });
        }
      }

      console.log('[BUILD_TREE] Successfully created', createdTreeNodes.length, 'tree nodes');

        progressTracker.update(trackingJobId, {
          stage: 'building_nodes',
          current: 80,
          total: 100,
          message: `Creating content for ${createdTreeNodes.length} nodes...`,
        });

      // Create node content entries using the created node IDs
      console.log('[BUILD_TREE] Creating node content for', createdTreeNodes.length, 'nodes');
      
      const contentEntries: any[] = [];
      for (const createdNode of createdTreeNodes) {
        // Find the corresponding proposal by matching name, position, and block_id
        const matchingTreeNode = treeNodes.find(tn => 
          tn.name === createdNode.name && 
          tn.position === createdNode.position && 
          tn.block_id === createdNode.block_id
        );
        
        if (!matchingTreeNode) {
          console.warn('[BUILD_TREE] Could not find matching tree node for created node:', createdNode.name);
          continue;
        }
        
        // Find the proposal that created this node
        const proposal = proposals.find(p => {
          const blockId = nodeBlockMapping.get(p.id);
          const actualBlockId = blockId ? generatedToActualBlockId.get(blockId) : null;
          return actualBlockId === matchingTreeNode.block_id && 
                 p.node_json?.title === matchingTreeNode.name;
        });
        
        if (!proposal) {
          console.warn('[BUILD_TREE] Could not find matching proposal for node:', createdNode.name);
          continue;
        }
        
        // Get the formatted content from the proposal (already formatted during batch processing)
        const formattedContent = proposal.node_json?.content?.text || proposal.node_json?.title || '';
        
        contentEntries.push({
          node_id: createdNode.id, // Use the actual created node ID
          content: formattedContent,
          status: 'draft'
        });
      }

      // Insert node content entries
      if (contentEntries.length > 0) {
        console.log('[BUILD_TREE] Inserting', contentEntries.length, 'content entries');
        const { error: contentError } = await supabaseServer
          .from('node_content')
          .insert(contentEntries);

        if (contentError) {
          console.error('[BUILD_TREE] Failed to create node content:', contentError);
          // Don't fail the entire request - nodes were created successfully
          console.warn('[BUILD_TREE] Continuing despite content creation failure');
        } else {
          console.log('[BUILD_TREE] Successfully created node content entries');
        }
      }

      // Invalidate cache (REMOVED - cache no longer exists)
      // proposalsCache.delete(`proposals-${resolvedProjectId}`);

      // Mark as complete
      progressTracker.complete(trackingJobId, 'Tree built successfully!');
      
      console.log('[BUILD_TREE] Tree building complete! Tree ID:', experimentTreeId);

      // Proposals remain as 'proposed' status - user can build multiple trees or manually clear
      
      return NextResponse.json({ 
        success: true, 
        treeId: experimentTreeId,
        acceptedCount: proposals.length,
        nodesCreated: createdTreeNodes.length,
        blocksCreated: blocks.length
      });
        
      } catch (treeBuildError: any) {
        console.error('[BUILD_TREE] Tree building failed:', treeBuildError);
        console.error('[BUILD_TREE] Stack trace:', treeBuildError.stack);
        console.error('[BUILD_TREE] Error details:', {
          message: treeBuildError.message,
          code: treeBuildError.code,
          projectId: resolvedProjectId,
          proposalCount: proposalIds.length,
          timestamp: new Date().toISOString(),
        });
        
        // Mark progress as error
        progressTracker.error(trackingJobId, `Tree building failed: ${treeBuildError.message}`);
        
        // Return detailed error - proposals should NOT be marked as accepted
        return NextResponse.json({ 
          error: 'Failed to build tree from proposals',
          details: treeBuildError.message || 'Unknown error occurred during tree building',
          stage: 'tree_building',
          timestamp: new Date().toISOString(),
        }, { status: 500 });
      }

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