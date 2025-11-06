import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { randomUUID } from 'crypto';

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

function getBlockDisplayName(nodeType: string): string {
  const displayNames: Record<string, string> = {
    'protocol': 'Protocol',
    'data_creation': 'Data Creation',
    'analysis': 'Analysis',
    'results': 'Results',
    'software': 'Software',
  };
  return displayNames[nodeType] || `${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} Block`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; proposalId: string }> }
) {
  console.log(`[NESTED_TREE_API] ====== API CALLED ======`);
  console.log(`[NESTED_TREE_API] Request URL:`, request.url);
  
  try {
    const { projectId, proposalId } = await params;
    console.log(`[NESTED_TREE_API] Parsed params:`, { projectId, proposalId });
    
    // Authenticate request - throws AuthError on failure
    const authContext = await authenticateRequest(request);
    console.log(`[NESTED_TREE_API] Auth successful for user:`, authContext.user.email);
    const { user } = authContext;

    // Get the proposal
    console.log(`[NESTED_TREE_API] Fetching proposal:`, { proposalId, projectId });
    const { data: proposal, error: proposalError } = await supabaseServer
      .from('proposed_nodes')
      .select('*')
      .eq('id', proposalId)
      .eq('project_id', projectId)
      .single();

    console.log(`[NESTED_TREE_API] Proposal fetch result:`, {
      found: !!proposal,
      error: proposalError?.message,
      proposalId: proposal?.id,
      hasNodeJson: !!proposal?.node_json,
      nodeJsonType: typeof proposal?.node_json
    });

    if (proposalError || !proposal) {
      console.error(`[NESTED_TREE_API] Proposal not found:`, proposalError);
      return NextResponse.json({ 
        error: 'Proposal not found',
        proposals: [],
        blocks: [],
        isProposed: true
      }, { status: 404 });
    }

    const nodeJson = proposal.node_json as any;
    console.log(`[NESTED_TREE_API] Raw nodeJson:`, {
      keys: Object.keys(nodeJson || {}),
      hasIsNestedTree: 'isNestedTree' in (nodeJson || {}),
      hasMetadata: 'metadata' in (nodeJson || {}),
      hasContent: 'content' in (nodeJson || {}),
      hasTitle: 'title' in (nodeJson || {}),
      nodeJsonString: JSON.stringify(nodeJson).substring(0, 500)
    });
    
    // Check for nested tree flag - handle both boolean true and string "true"
    // This matches how buildTreeInBackground checks it (truthy check)
    const isNestedTreeDirect = nodeJson?.isNestedTree;
    const isNestedTreeMetadata = nodeJson?.metadata?.isNestedTree;
    
    // Handle both boolean true and string "true", "True", "TRUE", "1"
    const isNestedTree = 
      isNestedTreeDirect === true || 
      isNestedTreeDirect === "true" ||
      isNestedTreeDirect === "True" ||
      isNestedTreeDirect === "TRUE" ||
      isNestedTreeMetadata === true || 
      isNestedTreeMetadata === "true" ||
      isNestedTreeMetadata === "True" ||
      isNestedTreeMetadata === "TRUE";

    console.log(`[NESTED_TREE_API] Checking nested tree flag:`, {
      proposalId,
      isNestedTreeDirect,
      isNestedTreeMetadata,
      isNestedTree,
      nodeJsonKeys: Object.keys(nodeJson || {})
    });

    if (!isNestedTree) {
      console.log(`[NESTED_TREE_API] Proposal ${proposalId} is not marked as nested tree`);
      return NextResponse.json({ 
        error: 'This proposal is not a nested tree',
        proposals: [],
        blocks: [],
        isProposed: true
      }, { status: 400 });
    }

    // Parse nested tree content to extract blocks and nodes (same logic as tree building)
    // Handle both object format {text: "..."} and string format
    let proposalContent = '';
    if (typeof nodeJson?.content === 'string') {
      proposalContent = nodeJson.content;
    } else if (nodeJson?.content?.text) {
      proposalContent = nodeJson.content.text;
    } else if (nodeJson?.content) {
      // If content is an object but no text property, try to stringify it
      proposalContent = JSON.stringify(nodeJson.content);
    }
    
    const proposalTitle = nodeJson?.title || nodeJson?.name || '';
    const proposalType = nodeJson?.metadata?.node_type || nodeJson?.node_type || 'protocol';
    
    console.log(`[NESTED_TREE_API] Content extraction:`, {
      hasContent: !!proposalContent,
      contentLength: proposalContent?.length || 0,
      contentPreview: proposalContent?.substring(0, 200),
      title: proposalTitle,
      nodeType: proposalType,
      contentStructure: {
        hasContentObj: !!nodeJson?.content,
        hasContentText: !!nodeJson?.content?.text,
        contentType: typeof nodeJson?.content,
        contentKeys: nodeJson?.content ? Object.keys(nodeJson.content) : [],
        rawContent: nodeJson?.content
      },
      fullNodeJsonContent: JSON.stringify(nodeJson?.content).substring(0, 500)
    });
    
    if (!proposalContent || proposalContent.trim().length === 0) {
      console.log(`[NESTED_TREE_API] ⚠️ Proposal ${proposalId} has no content - creating fallback proposal`);
      // Even if no content, create a single proposal with the title
      const fallbackProposal = {
        id: proposal.id,
        node_json: {
          title: proposalTitle || 'Nested Tree Proposal',
          content: { text: 'No content available for this nested tree proposal.' },
          metadata: {
            node_type: proposalType
          },
          short_summary: 'Nested tree proposal (no content available)'
        },
        confidence: proposal.confidence || 0.85
      };
      
      const fallbackBlock = {
        id: randomUUID(),
        name: getBlockDisplayName(proposalType),
        block_type: proposalType,
        position: 1,
        proposals: [fallbackProposal]
      };
      
      console.log(`[NESTED_TREE_API] Created fallback proposal and block`);
      const nestedTreeDescription = nodeJson?.short_summary || nodeJson?.description || '';
      return NextResponse.json({
        proposals: [fallbackProposal],
        blocks: [fallbackBlock],
        message: 'Nested tree proposal has no content - showing fallback',
        isProposed: true,
        description: nestedTreeDescription,
        title: proposalTitle
      });
    }

    // Parse nested content into steps if it has numbered structure (same as buildTreeInBackground)
    const numberedSteps = parseStepsFromContent(proposalContent);
    const hasMultipleSteps = numberedSteps.length > 1 && numberedSteps.length <= 20;
    
    console.log(`[NESTED_TREE_API] Step parsing:`, {
      numberedStepsCount: numberedSteps.length,
      hasMultipleSteps,
      firstStepPreview: numberedSteps[0]?.substring(0, 200),
      allSteps: numberedSteps.map((s, i) => ({ index: i, length: s.length, preview: s.substring(0, 100) }))
    });

    // Create proposal-like objects for each step (same as buildTreeInBackground)
    const nestedTreeProposals: any[] = [];
    
    console.log(`[NESTED_TREE_API] Creating proposals:`, {
      hasMultipleSteps,
      willCreateCount: hasMultipleSteps ? numberedSteps.length : 1,
      proposalTitle,
      proposalType,
      proposalConfidence: proposal.confidence
    });
    
    if (hasMultipleSteps) {
      // Create a proposal-like object for each step
      numberedSteps.forEach((step, idx) => {
        const proposalObj = {
          id: randomUUID(),
          node_json: {
            title: `${proposalTitle} - Step ${idx + 1}`,
            content: { text: step },
            metadata: {
              node_type: proposalType
            },
            short_summary: step.substring(0, 200).replace(/\n/g, ' ') + '...'
          },
          confidence: proposal.confidence || 0.85
        };
        console.log(`[NESTED_TREE_API] Creating proposal ${idx + 1}/${numberedSteps.length}:`, {
          id: proposalObj.id,
          title: proposalObj.node_json.title,
          nodeType: proposalObj.node_json.metadata.node_type,
          contentLength: proposalObj.node_json.content.text.length
        });
        nestedTreeProposals.push(proposalObj);
      });
    } else {
      // Single node proposal
      const proposalObj = {
        id: proposal.id,
        node_json: {
          title: proposalTitle,
          content: { text: proposalContent },
          metadata: {
            node_type: proposalType
          },
          short_summary: nodeJson?.short_summary || proposalContent.substring(0, 200) + '...'
        },
        confidence: proposal.confidence || 0.85
      };
      console.log(`[NESTED_TREE_API] Creating single proposal:`, {
        id: proposalObj.id,
        title: proposalObj.node_json.title,
        nodeType: proposalObj.node_json.metadata.node_type,
        contentLength: proposalObj.node_json.content.text.length,
        hasShortSummary: !!proposalObj.node_json.short_summary
      });
      nestedTreeProposals.push(proposalObj);
    }

    console.log(`[NESTED_TREE_API] Created ${nestedTreeProposals.length} proposals`);
    console.log(`[NESTED_TREE_API] Sample proposal structure:`, nestedTreeProposals[0] ? {
      id: nestedTreeProposals[0].id,
      title: nestedTreeProposals[0].node_json?.title,
      nodeType: nestedTreeProposals[0].node_json?.metadata?.node_type,
      hasMetadata: !!nestedTreeProposals[0].node_json?.metadata
    } : 'none');

    // Organize proposals into blocks (same logic as createBlocksFromProposals, but without DB insertion)
    const blocksByType = new Map<string, any[]>();
    
    nestedTreeProposals.forEach((proposal, idx) => {
      const nodeType = proposal.node_json?.metadata?.node_type || proposal.node_json?.node_type || 'protocol';
      const normalizedType = nodeType.toLowerCase();
      console.log(`[NESTED_TREE_API] Proposal ${idx}: nodeType="${nodeType}", normalized="${normalizedType}"`);
      if (!blocksByType.has(normalizedType)) {
        blocksByType.set(normalizedType, []);
      }
      blocksByType.get(normalizedType)!.push(proposal);
    });
    
    console.log(`[NESTED_TREE_API] Blocks by type:`, Array.from(blocksByType.entries()).map(([type, proposals]) => ({
      type,
      count: proposals.length
    })));

    // Create block structure (matching the format expected by renderNestedTree)
    const blockTypeOrder = ['protocol', 'data_creation', 'analysis', 'results', 'software'];
    const blocks: any[] = [];
    
    let blockPosition = 1;
    for (const nodeType of blockTypeOrder) {
      if (blocksByType.has(nodeType)) {
        const blockProposals = blocksByType.get(nodeType)!;
        blocks.push({
          id: randomUUID(),
          name: getBlockDisplayName(nodeType),
          block_type: nodeType,
          position: blockPosition,
          proposals: blockProposals
        });
        blockPosition++;
      }
    }
    
    // Handle any remaining types not in the ordered list
    for (const [nodeType, typeProposals] of blocksByType) {
      if (!blockTypeOrder.includes(nodeType)) {
        blocks.push({
          id: randomUUID(),
          name: getBlockDisplayName(nodeType),
          block_type: nodeType,
          position: blockPosition,
          proposals: typeProposals
        });
        blockPosition++;
      }
    }
    
    console.log(`[NESTED_TREE_API] Final summary:`, {
      proposalsCount: nestedTreeProposals.length,
      blocksCount: blocks.length,
      proposalsArray: nestedTreeProposals.map(p => ({
        id: p.id,
        title: p.node_json?.title,
        nodeType: p.node_json?.metadata?.node_type || p.node_json?.node_type
      })),
      blocksArray: blocks.map(b => ({
        id: b.id,
        name: b.name,
        block_type: b.block_type,
        proposalCount: b.proposals?.length || 0,
        proposalIds: b.proposals?.map((p: any) => p.id) || []
      }))
    });
    
    // Get the nested tree description from the original proposal
    const nestedTreeDescription = nodeJson?.short_summary || nodeJson?.description || '';
    
    const responseData = {
      proposals: nestedTreeProposals || [],
      blocks: blocks || [],
      isProposed: true,
      description: nestedTreeDescription,
      title: proposalTitle
    };
    
    console.log(`[NESTED_TREE_API] Response data structure:`, {
      hasProposals: !!responseData.proposals,
      proposalsIsArray: Array.isArray(responseData.proposals),
      proposalsLength: responseData.proposals?.length || 0,
      hasBlocks: !!responseData.blocks,
      blocksIsArray: Array.isArray(responseData.blocks),
      blocksLength: responseData.blocks?.length || 0,
      fullResponse: JSON.stringify(responseData).substring(0, 1000)
    });
    
    // Ensure we always return arrays, even if empty
    console.log(`[NESTED_TREE_API] About to return response:`, {
      responseDataType: typeof responseData,
      responseDataKeys: Object.keys(responseData),
      responseDataStringified: JSON.stringify(responseData).substring(0, 500)
    });
    
    const finalResponse = NextResponse.json(responseData);
    console.log(`[NESTED_TREE_API] Response created, status:`, finalResponse.status);
    
    return finalResponse;

  } catch (error) {
    console.error('[NESTED_TREE_API] ====== ERROR CAUGHT ======');
    console.error('[NESTED_TREE_API] Error type:', error?.constructor?.name);
    console.error('[NESTED_TREE_API] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[NESTED_TREE_API] Error stack:', error instanceof Error ? error.stack : 'No stack');
    
    if (error instanceof AuthError) {
      console.log(`[NESTED_TREE_API] Returning auth error response`);
      return NextResponse.json({ 
        error: error.message,
        proposals: [],
        blocks: [],
        isProposed: true
      }, { status: error.statusCode });
    }
    
    console.log(`[NESTED_TREE_API] Returning generic error response`);
    return NextResponse.json({ 
      error: 'Internal server error',
      proposals: [],
      blocks: [],
      isProposed: true
    }, { status: 500 });
  } finally {
    console.log(`[NESTED_TREE_API] ====== FUNCTION EXITING ======`);
  }
}

