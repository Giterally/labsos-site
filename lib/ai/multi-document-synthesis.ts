import { getAIProviderInstance } from './provider';
import type { WorkflowExtractionResult } from './schemas/workflow-extraction-schema';
import { WorkflowExtractionResultSchema } from './schemas/workflow-extraction-schema';

/**
 * Merge workflows from multiple documents into a single coherent workflow
 * This handles cases where users upload Protocol PDF + Results Excel + Analysis code
 * and we want ONE tree with cross-document references, not separate trees
 */
export async function mergeMultiDocumentWorkflows(
  workflows: WorkflowExtractionResult[],
  projectContext?: { name?: string; description?: string }
): Promise<WorkflowExtractionResult> {
  if (workflows.length === 0) {
    throw new Error('No workflows to merge');
  }

  if (workflows.length === 1) {
    return workflows[0];
  }

  console.log(`[MULTI_DOC_SYNTHESIS] Merging ${workflows.length} document workflows into single tree`);

  // Build prompt for LLM
  const workflowDescriptions = workflows.map((w, i) => {
    const nodeCount = w.blocks.reduce((sum, b) => sum + b.nodes.length, 0);
    return `Document ${i + 1}: "${w.treeName}" - ${w.treeDescription}\n  Blocks: ${w.blocks.length}, Nodes: ${nodeCount}`;
  }).join('\n\n');

  const systemPrompt = `You are an expert research workflow organizer. Your job is to merge multiple documents that describe different parts of the same experiment into a single coherent workflow.

CRITICAL RULES:
1. Identify overlapping/duplicate nodes and merge them (keep the most detailed version)
2. Establish dependencies between documents (e.g., Analysis uses data from Protocol)
3. Create a unified tree name that represents the complete experiment
4. Preserve ALL unique content - don't lose any information
5. Maintain the block structure (Protocol, Data Creation, Analysis, Results)
6. Mark nodes that reference other documents clearly

Return a single merged WorkflowExtractionResult JSON object.`;

  const userPrompt = `You have ${workflows.length} documents from the same experiment:

${workflowDescriptions}

${projectContext?.name ? `Project: ${projectContext.name}` : ''}
${projectContext?.description ? `Description: ${projectContext.description}` : ''}

Merge these documents into a single coherent workflow:
1. Combine duplicate nodes (e.g., if "Sample Preparation" appears in both documents, merge them)
2. Establish cross-document dependencies (e.g., "Analysis Block" depends on "Data Creation Block" from the results document)
3. Create a unified tree name (e.g., "Complete PCR Experiment Workflow")
4. Preserve all unique content from all documents
5. Organize into logical blocks (Protocol, Data Creation, Analysis, Results, Software)

Return the merged WorkflowExtractionResult as JSON.`;

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  try {
    const aiProvider = getAIProviderInstance();
    console.log(`[MULTI_DOC_SYNTHESIS] Calling LLM to merge ${workflows.length} workflows`);
    
    const rawResult = await aiProvider.generateJSON(fullPrompt);
    
    // Validate response
    const result = WorkflowExtractionResultSchema.parse(rawResult);
    
    console.log(`[MULTI_DOC_SYNTHESIS] Merged workflow: ${result.blocks.length} blocks, ${result.blocks.reduce((sum, b) => sum + b.nodes.length, 0)} nodes`);
    
    return result;
  } catch (error: any) {
    console.error('[MULTI_DOC_SYNTHESIS] Error merging workflows:', error);
    
    // Fallback: Just concatenate all workflows (simple merge)
    console.warn('[MULTI_DOC_SYNTHESIS] Falling back to simple concatenation');
    return simpleMergeWorkflows(workflows);
  }
}

/**
 * Simple fallback merge: concatenate all workflows without AI
 * Merges blocks by type, avoiding duplicates
 */
function simpleMergeWorkflows(workflows: WorkflowExtractionResult[]): WorkflowExtractionResult {
  console.log('[MULTI_DOC_SYNTHESIS] Using fallback concatenation strategy');
  
  const mergedBlocks = new Map<string, WorkflowExtractionResult['blocks'][0]>();
  let position = 1;

  // Merge blocks by type (concatenate nodes into existing blocks)
  for (const workflow of workflows) {
    for (const block of workflow.blocks) {
      const existingBlock = mergedBlocks.get(block.blockType);
      
      if (existingBlock) {
        // Merge nodes into existing block (concatenate)
        existingBlock.nodes.push(...block.nodes);
        console.log(`[MULTI_DOC_SYNTHESIS] Merged ${block.nodes.length} nodes into existing ${block.blockType} block`);
      } else {
        // Create new block with adjusted position
        mergedBlocks.set(block.blockType, {
          ...block,
          position: position++,
        });
        console.log(`[MULTI_DOC_SYNTHESIS] Created new ${block.blockType} block`);
      }
    }
  }

  // Combine tree names
  const treeNames = workflows.map(w => w.treeName).filter(Boolean);
  const mergedTreeName = treeNames.length > 0 
    ? `${treeNames[0]} (Multi-Document)`
    : 'Merged Experiment Workflow';

  const mergedDescription = workflows
    .map(w => w.treeDescription)
    .filter(Boolean)
    .join(' | ');

  const result = {
    treeName: mergedTreeName,
    treeDescription: mergedDescription || 'Workflow merged from multiple documents (fallback concatenation)',
    blocks: Array.from(mergedBlocks.values()),
    nestedTrees: workflows.flatMap(w => w.nestedTrees || []),
  };

  console.log(`[MULTI_DOC_SYNTHESIS] Fallback merge complete: ${result.blocks.length} blocks, ${result.blocks.reduce((sum, b) => sum + b.nodes.length, 0)} nodes`);
  
  return result;
}

