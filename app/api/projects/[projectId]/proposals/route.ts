import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { supabaseServer } from '@/lib/supabase-server';
import { generateTreeName, formatNodeContent, generateBriefSummary } from '@/lib/ai/synthesis';
import { randomUUID } from 'crypto';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { PermissionService } from '@/lib/permission-service';

// NOTE: Removed in-memory proposals cache to avoid stale data across instances

/**
 * Maps proposal node types to valid database node types
 * Handles variations from AI output (capitalized, synonyms, invalid types)
 * 
 * Valid database types: 'protocol', 'data_creation', 'analysis', 'results'
 */
function mapToValidNodeType(nodeType: string | undefined): string {
  try {
    console.log(`[MAP_NODE_TYPE] Input: "${nodeType}"`);
    
    if (!nodeType) {
      console.log(`[MAP_NODE_TYPE] No nodeType provided, returning 'protocol'`);
      return 'protocol';
    }
    
    // Normalize to lowercase for comparison
    const normalized = nodeType.toLowerCase().trim();
    console.log(`[MAP_NODE_TYPE] Normalized: "${normalized}"`);
    
    // Valid types that match database constraint
    const validTypes = ['protocol', 'data_creation', 'analysis', 'results', 'software'];
    
    // If already valid, return as-is (lowercase)
    if (validTypes.includes(normalized)) {
      console.log(`[MAP_NODE_TYPE] Already valid, returning: "${normalized}"`);
      return normalized;
    }
    
    // Map common AI-generated variations and synonyms
    console.log(`[MAP_NODE_TYPE] Checking switch cases for: "${normalized}"`);
    switch (normalized) {
      // Software/setup/configuration -> protocol (procedural steps)
      case 'software':
      case 'experiment':
      case 'setup':
      case 'configuration':
      case 'equipment':
      case 'instrument':
      case 'calibration':
        console.log(`[MAP_NODE_TYPE] Mapped "${normalized}" -> "protocol"`);
        return 'protocol';
      
      // Data-related variations -> data_creation
      case 'data':
      case 'data_collection':
      case 'data_generation':
      case 'data_acquisition':
      case 'sequencing':
      case 'measurement':
        console.log(`[MAP_NODE_TYPE] Mapped "${normalized}" -> "data_creation"`);
        return 'data_creation';
      
      // Analysis variations -> analysis
      case 'data_analysis':
      case 'statistical_analysis':
      case 'computational_analysis':
      case 'bioinformatics':
      case 'processing':
      case 'post_processing':
        console.log(`[MAP_NODE_TYPE] Mapped "${normalized}" -> "analysis"`);
        return 'analysis';
      
      // Results variations -> results
      case 'result':
      case 'findings':
      case 'outcomes':
      case 'output':
      case 'handover':
        console.log(`[MAP_NODE_TYPE] Mapped "${normalized}" -> "results"`);
        return 'results';
      
      // Default fallback
      default:
        console.warn(`[MAP_NODE_TYPE] Unknown type "${nodeType}", defaulting to 'protocol'`);
        return 'protocol';
    }
  } catch (error: any) {
    console.error(`[MAP_NODE_TYPE] ERROR in function:`, error.message);
    console.error(`[MAP_NODE_TYPE] Falling back to 'protocol' due to error`);
    return 'protocol';
  }
}

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
  
  // Handle any remaining types not in the ordered list
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
  
  console.log('[BLOCK ORGANIZATION] Created', blockInserts.length, 'blocks');
  console.log('[BLOCK ORGANIZATION] Node-block mapping:', nodeBlockMapping.size, 'mappings');
  
  return {
    blockInserts,
    nodeBlockMapping,
    sortedNodes: proposals.map(p => p.id) // Simple ordering for now
  };
}

function getBlockDisplayName(nodeType: string): string {
  const displayNames: Record<string, string> = {
    'protocol': 'Protocol Block',
    'data_creation': 'Data Creation Block',
    'analysis': 'Analysis Block',
    'results': 'Results Block',
    'software': 'Software Block',
    'general': 'General Block'
  };
  
  return displayNames[nodeType] || `${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} Block`;
}

/**
 * Parse numbered steps from content, handling multi-line steps
 * Handles patterns like "1. ", "2. ", "3.a ", "10. ", etc.
 */
function parseStepsFromContent(content: string): string[] {
  const lines = content.split('\n');
  const steps: string[] = [];
  let currentStep = '';

  for (const line of lines) {
    // Matches: "1. ", "2. ", "3.a ", "10. ", etc. (number followed by period and space or letter)
    if (/^\d+\.(\s|\w\.?\s)/.test(line)) {
      // If we have a previous step, save it
      if (currentStep.trim()) {
        steps.push(currentStep.trim());
      }
      // Start new step
      currentStep = line;
    } else if (currentStep) {
      // Continue accumulating multi-line step (non-empty line or continuation)
      if (line.trim() || currentStep.trim()) {
        currentStep += '\n' + line;
      }
    }
  }

  // Don't forget the last step
  if (currentStep.trim()) {
    steps.push(currentStep.trim());
  }

  // Filter out empty steps
  const filteredSteps = steps.filter(s => s.length > 0);

  // If no numbered steps found, return the whole content as a single step
  if (filteredSteps.length === 0) {
    return [content];
  }

  return filteredSteps;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    // Try to authenticate, but allow unauthenticated access (return empty proposals)
    let user = null;
    let actualProjectId = projectId;
    
    try {
      const authContext = await authenticateRequest(request);
      user = authContext.user;
      
      const permissionService = new PermissionService(authContext.supabase, user.id);
      const access = await permissionService.checkProjectAccess(projectId);
      
      if (!access.canRead) {
        return NextResponse.json({ proposals: [] });
      }
      
      actualProjectId = access.projectId;
    } catch (authError) {
      // If authentication fails, return empty proposals (public access)
      return NextResponse.json({ proposals: [] });
    }

    // Check if user is a member of the project
    const { data: projectMember, error: memberError } = await supabaseServer
      .from('project_members')
      .select('role')
      .eq('project_id', actualProjectId)
      .eq('user_id', user.id)
      .single();

    // If not a member, check if they're the project creator
    if (memberError || !projectMember) {
      const { data: project, error: projectError } = await supabaseServer
        .from('projects')
        .select('created_by')
        .eq('id', actualProjectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      // If user is the project creator, automatically add them as a member
      if (project.created_by === user.id) {
        console.log('[PROPOSALS] Project creator not in members table, adding automatically');
        
        const { error: addMemberError } = await supabaseServer
          .from('project_members')
          .insert({
            project_id: actualProjectId,
            user_id: user.id,
            role: 'Admin',
            initials: user.user_metadata?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U',
            joined_at: new Date().toISOString()
          });

        if (addMemberError && !addMemberError.message?.includes('duplicate key')) {
          console.error('[PROPOSALS] Failed to add project creator as member:', addMemberError);
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
        
        // Continue - user is now a member
      } else {
        // User is neither a member nor the creator
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // Fetch proposed nodes
    const { data: proposals, error: fetchError } = await supabaseServer
      .from('proposed_nodes')
      .select('*')
      .eq('project_id', actualProjectId)
      .eq('status', 'proposed')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Failed to fetch proposals:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch proposals' }, { status: 500 });
    }

    return NextResponse.json({ proposals: proposals || [] });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('Proposals API error:', error);
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
    const { action, proposalIds, treeId, jobId } = body;

    if (!action || !proposalIds || !Array.isArray(proposalIds)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Authenticate request and check permissions
    const authContext = await authenticateRequest(request);
    const { user, supabase } = authContext;
    
    const permissionService = new PermissionService(supabase, user.id);
    const access = await permissionService.checkProjectAccess(projectId);
    
    if (!access.canWrite) {
      return NextResponse.json({ message: 'Access denied' }, { status: 403 });
    }

    // Get the resolved project ID from the permission service
    const actualProjectId = access.projectId;

    if (action === 'accept') {
      console.log('[BUILD_TREE_API] ===== ACCEPT ACTION CALLED =====');
      console.log('[BUILD_TREE_API] Request details:', {
        projectId: actualProjectId,
        proposalCount: proposalIds.length,
        hasTreeId: !!treeId,
        hasJobId: !!jobId,
        userId: user.id
      });
      
      // Import progress tracker at function scope
      const { progressTracker } = await import('@/lib/progress-tracker');
      
      // Initialize tracking variables at function scope
      const trackingJobId = jobId || `tree_build_${actualProjectId}_${Date.now()}`;
      console.log('[BUILD_TREE_API] Using tracking job ID:', trackingJobId);
      
      try {
        console.log('[BUILD_TREE_API] Creating job record in database...');
        const { error: jobInsertError } = await supabaseServer.from('jobs').insert({
          id: trackingJobId,
          type: 'tree_build',
          status: 'running',
          project_id: actualProjectId,
          payload: { proposalIds, treeId },
        });
        
        if (jobInsertError) {
          console.error('[BUILD_TREE_API] Failed to create job record:', jobInsertError);
          throw jobInsertError;
        }
        console.log('[BUILD_TREE_API] Job record created successfully');

        console.log('[BUILD_TREE_API] Initializing progress tracking...');
        await progressTracker.updateWithPersistence(trackingJobId, {
          stage: 'initializing',
          current: 0,
          total: 100,
          message: 'Starting tree build...',
        });
        console.log('[BUILD_TREE_API] Progress initialized');

        console.log('[BUILD_TREE_API] Preparing response with jobId...');
        const response = NextResponse.json({ 
          jobId: trackingJobId,
          message: 'Tree building started' 
        });
        console.log('[BUILD_TREE_API] Response prepared, starting background process...');

        // Run tree building in background (don't await)
        buildTreeInBackground(actualProjectId, proposalIds, treeId, trackingJobId, user.id)
          .catch(error => {
            console.error('[BUILD_TREE_API] Background process error:', error);
          });

        console.log('[BUILD_TREE_API] Returning response to client');
        return response;
        
      } catch (treeBuildError: any) {
        console.error('[BUILD_TREE_API] ===== ERROR IN TREE BUILDING =====');
        console.error('[BUILD_TREE_API] Error type:', treeBuildError.constructor.name);
        console.error('[BUILD_TREE_API] Error message:', treeBuildError.message);
        console.error('[BUILD_TREE_API] Error stack:', treeBuildError.stack);
        console.error('[BUILD_TREE_API] Error details:', {
          code: treeBuildError.code,
          projectId: actualProjectId,
          proposalCount: proposalIds.length,
          timestamp: new Date().toISOString(),
        });
        
        // Mark progress as error
        try {
          await progressTracker.errorWithPersistence(trackingJobId, `Tree building failed: ${treeBuildError.message}`);
        } catch (progressError) {
          console.error('[BUILD_TREE_API] Failed to update error progress:', progressError);
        }
        
        // Return detailed error
        return NextResponse.json({ 
          error: treeBuildError.message || 'Failed to start tree building',
          details: treeBuildError.code,
          jobId: trackingJobId
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
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('Proposal action API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// Background tree building function
async function buildTreeInBackground(
  projectId: string, 
  proposalIds: string[], 
  treeId: string | null, 
  trackingJobId: string, 
  userId: string
) {
  console.log('[BUILD_TREE_BG] ===== BACKGROUND PROCESS STARTED =====');
  console.log('[BUILD_TREE_BG] Parameters:', {
    projectId,
    proposalCount: proposalIds.length,
    treeId,
    trackingJobId,
    userId
  });
  
      const { progressTracker } = await import('@/lib/progress-tracker');
  const { supabaseServer } = await import('@/lib/supabase-server');
  
  try {
    console.log('[BUILD_TREE_BG] Starting tree building process for', proposalIds.length, 'proposals');
    
    // Fetch proposals
    console.log('[BUILD_TREE_BG] Fetching proposals from database...');
    await progressTracker.updateWithPersistence(trackingJobId, {
          stage: 'initializing',
      current: 15,
      total: 100,
          message: 'Fetching proposals...',
        });
        
        const { data: proposals, error: fetchError } = await supabaseServer
          .from('proposed_nodes')
          .select('*')
      .eq('project_id', projectId)
          .in('id', proposalIds);

        if (fetchError || !proposals) {
      console.error('[BUILD_TREE_BG] Failed to fetch proposals:', fetchError);
      await progressTracker.errorWithPersistence(trackingJobId, 'Failed to fetch proposals');
      return;
    }

    console.log('[BUILD_TREE_BG] Successfully fetched', proposals.length, 'proposals');

    // Sort proposals by the order in proposalIds array to preserve frontend display order
    const proposalOrderMap = new Map(proposalIds.map((id, index) => [id, index]));
    const sortedProposals = (proposals || []).sort((a, b) => {
      const aIndex = proposalOrderMap.get(a.id) ?? 999;
      const bIndex = proposalOrderMap.get(b.id) ?? 999;
      return aIndex - bIndex;
    });

    console.log('[BUILD_TREE_BG] Sorted proposals by frontend order:', sortedProposals.map(p => p.id.substring(0, 8)));

        // Create or get experiment tree
    console.log('[BUILD_TREE_BG] Creating or getting experiment tree...');
    await progressTracker.updateWithPersistence(trackingJobId, {
          stage: 'initializing',
      current: 25,
      total: 100,
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
            project_id: projectId,
            name: treeName,
            description: 'Experiment tree generated from uploaded files',
            created_by: userId,
          })
          .select('id')
          .single();

        if (treeError || !tree) {
          console.error('[BUILD_TREE_BG] Failed to create experiment tree:', treeError);
          await progressTracker.errorWithPersistence(
            trackingJobId, 
            `Failed to create experiment tree: ${treeError?.message || 'Unknown error'}`
          );
          return;
        }
        experimentTreeId = tree.id;
      }

      // Validate: Check if all proposals are nested (would create empty tree)
      const nonNestedProposals = sortedProposals.filter(p => 
        !p.node_json?.metadata?.isNestedTree && !p.node_json?.isNestedTree
      );

      if (nonNestedProposals.length === 0) {
        const nestedCount = sortedProposals.filter(p => 
          p.node_json?.metadata?.isNestedTree || p.node_json?.isNestedTree
        ).length;
        
        await progressTracker.errorWithPersistence(
          trackingJobId, 
          `Cannot build tree: all ${nestedCount} selected proposals are nested procedures. Please select at least one main node.`
        );
        return;
      }

      // Analyze dependencies and create workflow-based blocks
    await progressTracker.updateWithPersistence(trackingJobId, {
          stage: 'building_blocks',
      current: 35,
      total: 100,
          message: 'Analyzing dependencies and organizing nodes...',
        });
        
      const { blockInserts, nodeBlockMapping, sortedNodes } = await createBlocksFromProposals(sortedProposals, experimentTreeId);

      console.log('Creating blocks:', blockInserts);
      
    await progressTracker.updateWithPersistence(trackingJobId, {
          stage: 'building_blocks',
      current: 45,
      total: 100,
          message: `Creating ${blockInserts.length} workflow blocks...`,
        });

      const { data: blocks, error: blockInsertError } = await supabaseServer
        .from('tree_blocks')
        .insert(blockInserts)
        .select('id, name');

      if (blockInsertError || !blocks) {
        console.error('Block creation error:', blockInsertError);
      await progressTracker.errorWithPersistence(trackingJobId, 'Failed to create tree blocks');
      return;
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
      const treeNodes: any[] = [];
      
      // Use the proposals already sorted by frontend display order
      // (sortedProposals was created earlier to preserve frontend order)
      
      // Helper: chunk array into batches for parallel processing
      const chunk = <T,>(arr: T[], size: number): T[][] => {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
          arr.slice(i * size, i * size + size)
        );
      };

      // Process nodes in batches of 10 for parallel AI calls (10x speedup)
      const BATCH_SIZE = 10;
      const nodeBatches = chunk(sortedProposals, BATCH_SIZE);
      
      console.log(`[BUILD_TREE] Processing ${sortedProposals.length} nodes in ${nodeBatches.length} batches of ${BATCH_SIZE}`);
      
      for (let batchIndex = 0; batchIndex < nodeBatches.length; batchIndex++) {
        const batch = nodeBatches[batchIndex];
        const batchStartTime = Date.now();
        
        console.log(`[BUILD_TREE] === Batch ${batchIndex + 1}/${nodeBatches.length} START === (${batch.length} nodes)`);
        
        // Process entire batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (proposal, nodeIndex) => {
            const nodeStartTime = Date.now();
            const nodeId = proposal.id.substring(0, 8); // Short ID for logging
            
            console.log(`[BUILD_TREE] [Batch ${batchIndex + 1}] [Node ${nodeIndex + 1}/${batch.length}] Processing ${nodeId}...`);
            
            const blockId = nodeBlockMapping.get(proposal.id);
            const actualBlockId = blockId ? generatedToActualBlockId.get(blockId) : null;
            
            if (!actualBlockId) {
              console.warn(`[BUILD_TREE] [${nodeId}] No block found, skipping`);
              return null;
            }
            
            // Get the raw content
            const rawContent = proposal.node_json?.content?.text || proposal.node_json?.title || '';
            const rawTitle = proposal.node_json?.title || proposal.node_json?.name || 'Untitled Node';
            
            console.log(`[BUILD_TREE] [${nodeId}] Raw content length: ${rawContent.length}, title: "${rawTitle.substring(0, 50)}..."`);
            
            // Use exact text from source (no AI formatting/summarization)
            const formattedContent = rawContent; // Exact text, no modifications
            const briefSummary = proposal.node_json?.short_summary || proposal.node_json?.description || rawTitle.substring(0, 100);
            
            console.log(`[BUILD_TREE] [${nodeId}] Using exact text from source (${rawContent.length} chars)`);
            
            // Get position based on original order in sortedProposals array
            const originalIndex = sortedProposals.findIndex(p => p.id === proposal.id);
            const currentPosition = originalIndex;
            
            const nodeElapsed = Date.now() - nodeStartTime;
            console.log(`[BUILD_TREE] [${nodeId}] Node complete in ${nodeElapsed}ms (position: ${currentPosition})`);
            
            const originalNodeType = proposal.node_json?.node_type;
            const mappedNodeType = mapToValidNodeType(originalNodeType);
            
            console.log(`[BUILD_TREE] [${nodeId}] Node type mapping: "${originalNodeType}" -> "${mappedNodeType}"`);
            
            // INLINE VALIDATION: Double-check the mapped type is valid
            const validTypes = ['protocol', 'data_creation', 'analysis', 'results'];
            let finalNodeType = mappedNodeType;
            if (!validTypes.includes(mappedNodeType)) {
              console.error(`[BUILD_TREE] [${nodeId}] CRITICAL: mapToValidNodeType returned invalid type "${mappedNodeType}"!`);
              console.error(`[BUILD_TREE] [${nodeId}] Force-correcting to 'protocol'`);
              finalNodeType = 'protocol'; // Force override
            }
            
            return {
              id: randomUUID(),
              tree_id: experimentTreeId,
              block_id: actualBlockId,
              name: rawTitle,
              description: briefSummary,
              position: currentPosition,
              node_type: finalNodeType,
              status: 'draft',
              created_by: userId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              provenance: {
                ...proposal.provenance,
                proposal_id: proposal.id,  // Store the original proposal ID
                confidence: proposal.confidence || 0.95
              },
              confidence: proposal.confidence || 0.95
            };
          })
        );
        
        const batchElapsed = Date.now() - batchStartTime;
        console.log(`[BUILD_TREE] === Batch ${batchIndex + 1}/${nodeBatches.length} COMPLETE === in ${batchElapsed}ms`);
        
        // Filter out null results and add to treeNodes
        const validResults = batchResults.filter(Boolean);
        treeNodes.push(...validResults);
        
        console.log(`[BUILD_TREE] Added ${validResults.length} nodes to tree (total: ${treeNodes.length})`);
        
        // Update progress after each batch
        const progressPercent = Math.round(((batchIndex + 1) / nodeBatches.length) * 20) + 60; // 60-80%
        await progressTracker.updateWithPersistence(trackingJobId, {
          stage: 'building_nodes',
          current: progressPercent,
          total: 100,
          message: `Processing nodes: ${batchIndex + 1}/${nodeBatches.length} batches complete`,
        });
        
        console.log(`[BUILD_TREE] Progress updated to ${progressPercent}%`);
      }

      console.log(`[BUILD_TREE] All batches complete. Created ${treeNodes.length} tree nodes`);

      // VALIDATE node types before insertion (AGGRESSIVE MODE)
      console.log(`[BUILD_TREE] ========================================`);
      console.log(`[BUILD_TREE] FINAL VALIDATION BEFORE DATABASE INSERT`);
      console.log(`[BUILD_TREE] ========================================`);
      console.log(`[BUILD_TREE] Total nodes to insert: ${treeNodes.length}`);

      const validNodeTypes = ['protocol', 'data_creation', 'analysis', 'results'];
      let correctionsMade = 0;

      // Check EVERY node and force-correct ANY invalid type
      for (let i = 0; i < treeNodes.length; i++) {
        const node = treeNodes[i];
        const isValid = validNodeTypes.includes(node.node_type);
        
        if (!isValid) {
          correctionsMade++;
          const originalType = node.node_type;
          treeNodes[i].node_type = 'protocol'; // Force correction
          
          console.error(`[BUILD_TREE] [${i}] CORRECTED: "${originalType}" -> "protocol" (node: "${node.name.substring(0, 40)}")`);
        }
      }

      if (correctionsMade > 0) {
        console.warn(`[BUILD_TREE] Made ${correctionsMade} corrections out of ${treeNodes.length} nodes`);
      } else {
        console.log(`[BUILD_TREE] ✓ All ${treeNodes.length} nodes have valid types`);
      }

      // Log first 5 node types as sample
      console.log(`[BUILD_TREE] Sample node types (first 5):`, treeNodes.slice(0, 5).map((n, i) => ({
        index: i,
        name: n.name.substring(0, 30),
        type: n.node_type
      })));

      console.log(`[BUILD_TREE] ========================================`);

    // FINAL TYPE ASSERTION: Ensure TypeScript knows these are valid
    const treeNodesToInsert = treeNodes.map(node => ({
      ...node,
      node_type: node.node_type as 'protocol' | 'data_creation' | 'analysis' | 'results'
    }));

    console.log(`[BUILD_TREE] Inserting ${treeNodesToInsert.length} type-safe nodes into database...`);
    const insertStartTime = Date.now();

    const { data: createdTreeNodes, error: nodeInsertError } = await supabaseServer
        .from('tree_nodes')
        .insert(treeNodesToInsert)  // Use type-asserted array
      .select('id, name, block_id, position, provenance');

    const insertElapsed = Date.now() - insertStartTime;

    if (nodeInsertError || !createdTreeNodes) {
      console.error(`[BUILD_TREE] Database insertion failed after ${insertElapsed}ms`);
      console.error('[BUILD_TREE] Error code:', nodeInsertError?.code);
      console.error('[BUILD_TREE] Error message:', nodeInsertError?.message);
      console.error('[BUILD_TREE] Error details:', nodeInsertError?.details);
      console.error('[BUILD_TREE] Error hint:', nodeInsertError?.hint);
      
      // Log the first few nodes that were attempted to insert
      console.error('[BUILD_TREE] First 3 nodes attempted:', treeNodes.slice(0, 3).map(n => ({
        name: n.name,
        type: n.node_type,
        block_id: n.block_id
      })));
      
      await progressTracker.errorWithPersistence(trackingJobId, 'Failed to create tree nodes');
      return;
    }

    console.log(`[BUILD_TREE] Successfully inserted ${createdTreeNodes.length} nodes in ${insertElapsed}ms`);

    console.log('Created tree nodes:', createdTreeNodes.length);
    
    // Debug: Verify fields are present
    if (createdTreeNodes.length > 0) {
      console.log('[BUILD_TREE] Sample created node fields:', {
        id: createdTreeNodes[0].id,
        name: createdTreeNodes[0].name,
        block_id: createdTreeNodes[0].block_id,
        position: createdTreeNodes[0].position,
        provenance: createdTreeNodes[0].provenance
      });
    }

    // Update progress
    await progressTracker.updateWithPersistence(trackingJobId, {
          stage: 'building_nodes',
      current: 85,
          total: 100,
      message: 'Creating node content entries...',
        });

    // Create content entries for each node
      const contentEntries: any[] = [];
      for (const createdNode of createdTreeNodes) {
        // Strategy 1: Match by provenance (most reliable)
        let proposal = createdNode.provenance?.proposal_id 
          ? sortedProposals.find(p => p.id === createdNode.provenance.proposal_id)
          : null;
        
        // Strategy 2: Match by position within block (fallback)
        if (!proposal) {
          proposal = sortedProposals.find(p => {
            const blockId = nodeBlockMapping.get(p.id);
            const actualBlockId = blockId ? generatedToActualBlockId.get(blockId) : null;
            const proposalPosition = sortedProposals.findIndex(sp => sp.id === p.id);
            return actualBlockId === createdNode.block_id && 
                   proposalPosition === createdNode.position;
          });
        }
        
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

      // Update progress
      await progressTracker.updateWithPersistence(trackingJobId, {
        stage: 'building_nodes',
        current: 90,
        total: 100,
        message: 'Creating node links and attachments...',
      });

      // Create link entries for each node
      const linkEntries: any[] = [];
      let matchedCount = 0;
      let unmatchedCount = 0;

      for (const createdNode of createdTreeNodes) {
        // Strategy 1: Match by provenance (most reliable)
        let proposal = createdNode.provenance?.proposal_id 
          ? sortedProposals.find(p => p.id === createdNode.provenance.proposal_id)
          : null;
        
        // Strategy 2: Match by position within block (fallback)
        if (!proposal) {
          proposal = sortedProposals.find(p => {
            const blockId = nodeBlockMapping.get(p.id);
            const actualBlockId = blockId ? generatedToActualBlockId.get(blockId) : null;
            const proposalPosition = sortedProposals.findIndex(sp => sp.id === p.id);
            return actualBlockId === createdNode.block_id && 
                   proposalPosition === createdNode.position;
          });
        }
        
        if (proposal) {
          matchedCount++;
          console.log(`[BUILD_TREE] Matched node "${createdNode.name}" to proposal ${proposal.id.substring(0, 8)}`);
          
          if (proposal.node_json?.links && Array.isArray(proposal.node_json.links)) {
            proposal.node_json.links.forEach((link: any, index: number) => {
              linkEntries.push({
                node_id: createdNode.id,
                name: link.name || 'Untitled Link',
                url: link.url || '',
                description: link.description || '',
                link_type: link.link_type || 'other',
                position: index
              });
            });
          }
        } else {
          unmatchedCount++;
          console.warn(`[BUILD_TREE] Failed to match node "${createdNode.name}" (position: ${createdNode.position}, block: ${createdNode.block_id})`);
        }
      }

      console.log(`[BUILD_TREE] Link matching complete: ${matchedCount} matched, ${unmatchedCount} unmatched`);

      // Insert node link entries
      if (linkEntries.length > 0) {
        console.log('[BUILD_TREE] Inserting', linkEntries.length, 'link entries');
        const { error: linkError } = await supabaseServer
          .from('node_links')
          .insert(linkEntries);

        if (linkError) {
          console.error('[BUILD_TREE] Failed to create node links:', linkError);
          console.warn('[BUILD_TREE] Continuing despite link creation failure');
        } else {
          console.log('[BUILD_TREE] Successfully created node link entries');
        }
      }

      // Store node dependencies
      await progressTracker.updateWithPersistence(trackingJobId, {
        stage: 'building_nodes',
        current: 95,
        total: 100,
        message: 'Storing node dependencies...',
      });

      const dependencyEntries: any[] = [];
      const nodeTitleToIdMap = new Map<string, string>();
      
      // Build map of node titles to IDs
      for (const createdNode of createdTreeNodes) {
        const proposal = createdNode.provenance?.proposal_id 
          ? sortedProposals.find(p => p.id === createdNode.provenance.proposal_id)
          : null;
        
        if (proposal && proposal.node_json?.title) {
          nodeTitleToIdMap.set(proposal.node_json.title.toLowerCase(), createdNode.id);
        }
        // Also map by node name
        nodeTitleToIdMap.set(createdNode.name.toLowerCase(), createdNode.id);
      }

      // Extract dependencies from proposals
      for (const createdNode of createdTreeNodes) {
        const proposal = createdNode.provenance?.proposal_id 
          ? sortedProposals.find(p => p.id === createdNode.provenance.proposal_id)
          : null;

        if (proposal && proposal.node_json?.dependencies && Array.isArray(proposal.node_json.dependencies)) {
          for (const dep of proposal.node_json.dependencies) {
            const referencedTitle = dep.referenced_title || dep.referencedNodeTitle;
            if (!referencedTitle) continue;

            // Find referenced node by title
            const referencedNodeId = nodeTitleToIdMap.get(referencedTitle.toLowerCase());
            
            if (referencedNodeId && referencedNodeId !== createdNode.id) {
              dependencyEntries.push({
                from_node_id: createdNode.id,
                to_node_id: referencedNodeId,
                dependency_type: dep.dependency_type || dep.dependencyType || 'requires',
                evidence_text: dep.extractedPhrase || dep.evidence || '',
                confidence: dep.confidence || 0.8,
              });
            }
          }
        }
      }

       // Validate dependencies before inserting (remove orphaned references)
       const allNodeIds = new Set(createdTreeNodes.map(n => n.id));
       const nodeTitleMap = new Map(createdTreeNodes.map(n => [n.id, n.name]));
       
       const unresolvedDependencies: any[] = [];
       const validDependencies = dependencyEntries.filter(dep => {
         const targetExists = allNodeIds.has(dep.to_node_id);
         if (!targetExists) {
           unresolvedDependencies.push({
             fromNode: nodeTitleMap.get(dep.from_node_id) || 'Unknown',
             toNode: dep.evidence_text || 'Unknown',
             evidence: dep.evidence_text || '',
           });
           console.warn(`[BUILD_TREE] Removing orphaned dependency to non-existent node: ${dep.to_node_id}`);
         }
         return targetExists;
       });

       // Store unresolved dependencies in tree metadata for later resolution
       if (unresolvedDependencies.length > 0) {
         const { data: existingTree } = await supabaseServer
           .from('experiment_trees')
           .select('metadata')
           .eq('id', experimentTreeId)
           .single();

         const updatedMetadata = {
           ...(existingTree?.metadata || {}),
           unresolvedDependencies: unresolvedDependencies,
           unresolvedDependencyCount: unresolvedDependencies.length,
         };

         await supabaseServer
           .from('experiment_trees')
           .update({ metadata: updatedMetadata })
           .eq('id', experimentTreeId);

         console.log(`[BUILD_TREE] Stored ${unresolvedDependencies.length} unresolved dependencies in tree metadata`);
       }

       // Insert valid dependencies
       if (validDependencies.length > 0) {
         console.log(`[BUILD_TREE] Inserting ${validDependencies.length} dependency entries (${dependencyEntries.length - validDependencies.length} unresolved)`);
         const { error: depError } = await supabaseServer
           .from('node_dependencies')
           .insert(validDependencies);

         if (depError) {
           console.error('[BUILD_TREE] Failed to create node dependencies:', depError);
           console.warn('[BUILD_TREE] Continuing despite dependency creation failure');
         } else {
           console.log('[BUILD_TREE] Successfully created node dependency entries');
         }
       } else if (dependencyEntries.length > 0) {
         console.warn(`[BUILD_TREE] All ${dependencyEntries.length} dependencies were unresolved`);
       }

      // Create attachment entries for each node
      const attachmentEntries: any[] = [];
      let attachmentMatchedCount = 0;
      let attachmentUnmatchedCount = 0;

      for (const createdNode of createdTreeNodes) {
        // Strategy 1: Match by provenance (most reliable)
        let proposal = createdNode.provenance?.proposal_id 
          ? sortedProposals.find(p => p.id === createdNode.provenance.proposal_id)
          : null;
        
        // Strategy 2: Match by position within block (fallback)
        if (!proposal) {
          proposal = sortedProposals.find(p => {
            const blockId = nodeBlockMapping.get(p.id);
            const actualBlockId = blockId ? generatedToActualBlockId.get(blockId) : null;
            const proposalPosition = sortedProposals.findIndex(sp => sp.id === p.id);
            return actualBlockId === createdNode.block_id && 
                   proposalPosition === createdNode.position;
          });
        }
        
        if (proposal) {
          attachmentMatchedCount++;
          console.log(`[BUILD_TREE] Matched node "${createdNode.name}" to proposal ${proposal.id.substring(0, 8)} for attachments`);
          
          if (proposal.node_json?.attachments && Array.isArray(proposal.node_json.attachments)) {
            proposal.node_json.attachments.forEach((attachment: any, index: number) => {
              attachmentEntries.push({
                node_id: createdNode.id,
                name: attachment.name || 'Untitled Attachment',
                file_type: attachment.file_type || '',
                file_size: attachment.file_size || 0,
                file_url: attachment.file_url || '',
                description: attachment.description || '',
                position: index
              });
            });
          }
        } else {
          attachmentUnmatchedCount++;
          console.warn(`[BUILD_TREE] Failed to match node "${createdNode.name}" (position: ${createdNode.position}, block: ${createdNode.block_id}) for attachments`);
        }
      }

      console.log(`[BUILD_TREE] Attachment matching complete: ${attachmentMatchedCount} matched, ${attachmentUnmatchedCount} unmatched`);

      // Insert node attachment entries
      if (attachmentEntries.length > 0) {
        console.log('[BUILD_TREE] Inserting', attachmentEntries.length, 'attachment entries');
        const { error: attachmentError } = await supabaseServer
          .from('node_attachments')
          .insert(attachmentEntries);

        if (attachmentError) {
          console.error('[BUILD_TREE] Failed to create node attachments:', attachmentError);
          console.warn('[BUILD_TREE] Continuing despite attachment creation failure');
        } else {
          console.log('[BUILD_TREE] Successfully created node attachment entries');
        }
      }

      // Handle nested trees: Create separate trees for nodes marked as nested
      await progressTracker.updateWithPersistence(trackingJobId, {
        stage: 'building_nodes',
        current: 97,
        total: 100,
        message: 'Creating nested trees for reusable procedures...',
      });

      const nestedTreeReferences: any[] = [];
      let nestedTreeCount = 0;

      for (const createdNode of createdTreeNodes) {
        // Match node back to proposal
        const proposal = createdNode.provenance?.proposal_id 
          ? sortedProposals.find(p => p.id === createdNode.provenance.proposal_id)
          : null;

        if (!proposal) continue;

        // Check if this node should be a nested tree
        const isNestedTree = proposal.node_json?.metadata?.isNestedTree || 
                            proposal.node_json?.isNestedTree;

        if (isNestedTree) {
          console.log(`[BUILD_TREE] Creating nested tree for node: ${createdNode.name}`);
          
          try {
            // Get main tree name for unique nested tree naming
            const { data: mainTree } = await supabaseServer
              .from('experiment_trees')
              .select('name')
              .eq('id', experimentTreeId)
              .single();
            
            const mainTreeName = mainTree?.name || 'experiment';
            const baseTreeName = proposal.node_json?.title || `${createdNode.name} Protocol`;
            const nestedTreeName = `${baseTreeName} (from ${mainTreeName})`;
            const { data: nestedTree, error: nestedTreeError } = await supabaseServer
              .from('experiment_trees')
              .insert({
                project_id: projectId,
                name: nestedTreeName,
                description: `Reusable protocol extracted from ${experimentTreeId ? 'main experiment' : 'uploaded files'}`,
                created_by: userId,
                is_template: true,
                template_category: proposal.node_json?.metadata?.node_type || 'protocol',
              })
              .select('id')
              .single();

            if (nestedTreeError || !nestedTree || !nestedTree.id) {
              console.error(`[BUILD_TREE] Failed to create nested tree for ${createdNode.name}:`, nestedTreeError);
              // Fallback: Don't nest, just create regular node with full content
              console.warn(`[BUILD_TREE] Continuing with regular node creation for ${createdNode.name}`);
              continue;
            }

            // Create nodes for the nested tree (using the full content from the proposal)
            const nestedContent = proposal.node_json?.content?.text || '';
            
            if (!nestedContent || nestedContent.trim().length === 0) {
              console.error(`[BUILD_TREE] No content available for nested tree ${nestedTree.id}`);
              // Clean up the nested tree we just created
              await supabaseServer
                .from('experiment_trees')
                .delete()
                .eq('id', nestedTree.id);
              continue;
            }

            // Parse nested content into steps if it has numbered structure
            const numberedSteps = parseStepsFromContent(nestedContent);
            const hasMultipleSteps = numberedSteps.length > 1 && numberedSteps.length <= 20;

            if (hasMultipleSteps) {
              // Create multiple nodes for each step
              const stepNodes = numberedSteps.map((step, idx) => ({
                tree_id: nestedTree.id,
                name: `${nestedTreeName} - Step ${idx + 1}`,
                description: step.substring(0, 200).replace(/\n/g, ' '),
                node_type: mapToValidNodeType(proposal.node_json?.metadata?.node_type || 'protocol'),
                position: idx + 1,
                status: 'draft',
                created_by: userId,
              }));
              
              const { data: createdStepNodes, error: stepNodesError } = await supabaseServer
                .from('tree_nodes')
                .insert(stepNodes)
                .select('id');
              
              if (stepNodesError || !createdStepNodes || createdStepNodes.length === 0) {
                console.error(`[BUILD_TREE] Failed to create step nodes for nested tree ${nestedTree.id}:`, stepNodesError);
                // Fallback to single node
                await supabaseServer
                  .from('experiment_trees')
                  .delete()
                  .eq('id', nestedTree.id);
                continue;
              }

              // Store content for each step node
              for (let i = 0; i < createdStepNodes.length; i++) {
                const { error: contentError } = await supabaseServer
                  .from('node_content')
                  .insert({
                    node_id: createdStepNodes[i].id,
                    content: numberedSteps[i],
                    status: 'draft',
                  });

                if (contentError) {
                  console.error(`[BUILD_TREE] Failed to store content for step node ${createdStepNodes[i].id}:`, contentError);
                }
              }

              // Use first step node for reference
              const firstStepNodeId = createdStepNodes[0].id;
              
              // Update parent node to reference nested tree
              await supabaseServer
                .from('tree_nodes')
                .update({
                  is_nested_tree_ref: true,
                  nested_tree_id: nestedTree.id,
                })
                .eq('id', createdNode.id);

              // Update node content to reference text
              const referenceText = `Perform ${createdNode.name} using standard protocol. [View nested protocol →]`;
              const { error: contentUpdateError } = await supabaseServer
                .from('node_content')
                .upsert({
                  node_id: createdNode.id,
                  content: referenceText,
                  status: 'draft',
                }, {
                  onConflict: 'node_id',
                });

              if (contentUpdateError) {
                console.error(`[BUILD_TREE] Failed to update node content for nested tree reference:`, contentUpdateError);
                // Try update as fallback
                await supabaseServer
                  .from('node_content')
                  .update({
                    content: referenceText,
                  })
                  .eq('node_id', createdNode.id);
              }

              // Store nested tree reference
              nestedTreeReferences.push({
                parent_node_id: createdNode.id,
                nested_tree_id: nestedTree.id,
              });

              nestedTreeCount++;
              console.log(`[BUILD_TREE] Created nested tree ${nestedTree.id} with ${createdStepNodes.length} steps for node ${createdNode.name}`);
              continue;
            }

            // Create a single node in the nested tree with full content
            const { data: nestedNode, error: nestedNodeError } = await supabaseServer
              .from('tree_nodes')
              .insert({
                tree_id: nestedTree.id,
                name: nestedTreeName,
                description: nestedContent.substring(0, 200),
                node_type: mapToValidNodeType(proposal.node_json?.metadata?.node_type || 'protocol'),
                position: 1,
                status: 'draft',
                created_by: userId,
              })
              .select('id')
              .single();

            if (nestedNodeError || !nestedNode || !nestedNode.id) {
              console.error(`[BUILD_TREE] Failed to create nested node for nested tree ${nestedTree.id}:`, nestedNodeError);
              // Clean up the nested tree we just created
              await supabaseServer
                .from('experiment_trees')
                .delete()
                .eq('id', nestedTree.id);
              continue;
            }

            if (nestedNode) {
              // Store node content
              await supabaseServer
                .from('node_content')
                .insert({
                  node_id: nestedNode.id,
                  content: nestedContent,
                  status: 'draft',
                });

              // Update parent node to reference nested tree instead of containing full content
              const referenceText = `Perform ${createdNode.name} using standard protocol. [View nested protocol →]`;
              
              await supabaseServer
                .from('tree_nodes')
                .update({
                  is_nested_tree_ref: true,
                  nested_tree_id: nestedTree.id,
                })
                .eq('id', createdNode.id);

              // Update node content to reference text (use upsert to handle edge cases)
              const { error: contentUpdateError } = await supabaseServer
                .from('node_content')
                .upsert({
                  node_id: createdNode.id,
                  content: referenceText,
                  status: 'draft',
                }, {
                  onConflict: 'node_id',
                });

              if (contentUpdateError) {
                console.error(`[BUILD_TREE] Failed to update node content for nested tree reference:`, contentUpdateError);
                // Try update as fallback
                await supabaseServer
                  .from('node_content')
                  .update({
                    content: referenceText,
                  })
                  .eq('node_id', createdNode.id);
              }

              // Store nested tree reference
              nestedTreeReferences.push({
                parent_node_id: createdNode.id,
                nested_tree_id: nestedTree.id,
              });

              nestedTreeCount++;
              console.log(`[BUILD_TREE] Created nested tree ${nestedTree.id} for node ${createdNode.name}`);
            }
          } catch (error: any) {
            console.error(`[BUILD_TREE] Error creating nested tree for ${createdNode.name}:`, error);
            // Continue with other nodes
          }
        }
      }

      // Insert nested tree references
      if (nestedTreeReferences.length > 0) {
        console.log(`[BUILD_TREE] Inserting ${nestedTreeReferences.length} nested tree references`);
        const { error: nestedRefError } = await supabaseServer
          .from('nested_tree_references')
          .insert(nestedTreeReferences);

        if (nestedRefError) {
          console.error('[BUILD_TREE] Failed to create nested tree references:', nestedRefError);
        } else {
          console.log(`[BUILD_TREE] Successfully created ${nestedTreeCount} nested trees`);
        }
      }

      // Mark as complete
    console.log('[BUILD_TREE_BG] Marking tree building as complete...');
    await progressTracker.completeWithPersistence(trackingJobId, `Tree built successfully! Tree ID: ${experimentTreeId}, Nested trees: ${nestedTreeCount}`);
    
    // Also update job result field
    console.log('[BUILD_TREE_BG] Updating job result with tree ID...');
    await supabaseServer.from('jobs')
      .update({ 
        result: { 
          treeId: experimentTreeId, 
          nodesCreated: createdTreeNodes.length,
          nestedTreesCreated: nestedTreeCount,
        },
        status: 'completed'
      })
      .eq('id', trackingJobId);
    
    console.log('[BUILD_TREE_BG] ===== TREE BUILDING COMPLETE =====');
    console.log('[BUILD_TREE_BG] Tree ID:', experimentTreeId);
    console.log('[BUILD_TREE_BG] Nodes created:', createdTreeNodes.length);
        
      } catch (treeBuildError: any) {
    console.error('[BUILD_TREE_BG] ===== TREE BUILDING ERROR =====');
    console.error('[BUILD_TREE_BG] Error type:', treeBuildError.constructor.name);
    console.error('[BUILD_TREE_BG] Error message:', treeBuildError.message);
    console.error('[BUILD_TREE_BG] Error stack:', treeBuildError.stack);
    console.error('[BUILD_TREE_BG] Error details:', {
          code: treeBuildError.code,
      projectId: projectId,
          proposalCount: proposalIds.length,
          timestamp: new Date().toISOString(),
        });
        
        // Mark progress as error
    await progressTracker.errorWithPersistence(trackingJobId, `Tree building failed: ${treeBuildError.message}`);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const { proposalIds, clearAll } = body;

    // Authenticate request and check permissions
    const authContext = await authenticateRequest(request);
    const { user, supabase } = authContext;
    
    const permissionService = new PermissionService(supabase, user.id);
    const access = await permissionService.checkProjectAccess(projectId);
    
    if (!access.canWrite) {
      return NextResponse.json({ message: 'Access denied' }, { status: 403 });
    }

    // Get the resolved project ID from the permission service
    const actualProjectId = access.projectId;

    if (clearAll) {
      // Delete all proposals for this project
      const { error: deleteError } = await supabaseServer
        .from('proposed_nodes')
        .delete()
        .eq('project_id', actualProjectId);

      if (deleteError) {
        console.error('Error deleting all proposals:', deleteError);
        return NextResponse.json({ 
          error: 'Failed to delete proposals' 
        }, { status: 500 });
      }

      console.log(`Cleared all proposals for project ${actualProjectId}`);
      return NextResponse.json({ 
        success: true, 
        message: 'All proposals cleared successfully'
      });

    } else if (proposalIds && Array.isArray(proposalIds) && proposalIds.length > 0) {
      // Delete specific proposals
      const { error: deleteError } = await supabaseServer
        .from('proposed_nodes')
        .delete()
        .eq('project_id', actualProjectId)
        .in('id', proposalIds);

      if (deleteError) {
        console.error('Error deleting proposals:', deleteError);
        return NextResponse.json({ 
          error: 'Failed to delete proposals' 
        }, { status: 500 });
      }

      console.log(`Deleted ${proposalIds.length} proposals for project ${actualProjectId}`);
      return NextResponse.json({ 
        success: true, 
        message: 'Proposals deleted successfully',
        deletedCount: proposalIds.length
      });

    } else {
      return NextResponse.json({ 
        error: 'No proposal IDs provided or clearAll not specified' 
      }, { status: 400 });
    }

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('Delete proposals error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
