import type { StructuredDocument } from '../processing/parsers/pdf-parser';
import type { WorkflowExtractionResult } from './schemas/workflow-extraction-schema';
import type { DocumentComplexity } from '../processing/document-analyzer';
import { splitDocumentForHierarchicalExtraction } from '../processing/document-analyzer';
import { extractWorkflow } from './workflow-extractor';
import { distance } from 'fastest-levenshtein';
import pLimit from 'p-limit';

/**
 * Hierarchical extraction for large, complex documents
 * 
 * Strategy:
 * 1. Extract high-level structure (main sections)
 * 2. Extract details from each section (parallelized)
 * 3. Merge into coherent tree
 */
export async function extractWorkflowHierarchical(
  doc: StructuredDocument,
  projectContext?: { name?: string; description?: string },
  complexity?: DocumentComplexity
): Promise<WorkflowExtractionResult> {
  console.log(`[HIERARCHICAL_EXTRACTION] Starting for document: ${doc.fileName}`);

  // Step 1: Extract high-level overview
  console.log(`[HIERARCHICAL_EXTRACTION] Step 1: Extracting high-level structure`);

  const overviewDoc: StructuredDocument = {
    ...doc,
    sections: doc.sections.filter(s => s.level === 1) // Only top-level sections
  };

  const overviewPrompt = `
You are analyzing a large research document to extract its HIGH-LEVEL structure ONLY.

TASK: Identify the main experimental phases/sections at the top level.

DO NOT extract detailed protocols or results yet—just the main structure.

Expected output: 5-10 high-level nodes representing main sections:
- Main research questions
- Major experimental phases
- Key methodological approaches
- Main result categories

Document overview:
${JSON.stringify(overviewDoc, null, 2)}

Return a JSON object with high-level blocks and nodes.`;

  // Use a simple complexity for overview (we want minimal nodes)
  const overviewComplexity = {
    estimatedNodeCount: 10,
    extractionStrategy: 'simple' as const
  };

  const overviewResult = await extractWorkflow(overviewDoc, projectContext, overviewComplexity);

  const overviewNodeCount = overviewResult.blocks.reduce((sum, b) => sum + b.nodes.length, 0);
  console.log(`[HIERARCHICAL_EXTRACTION] Extracted ${overviewNodeCount} high-level nodes`);

  // Step 2: Split document by top-level sections
  const documentChunks = splitDocumentForHierarchicalExtraction(doc);

  console.log(`[HIERARCHICAL_EXTRACTION] Step 2: Extracting details from ${documentChunks.length} sections`);

  // Step 3: Extract detailed workflow from each chunk (parallelized)
  const limit = pLimit(3); // Max 3 concurrent extractions

  const sectionPromises = documentChunks.map((chunk, idx) =>
    limit(async () => {
      const parentSection = chunk.metadata?.chunkInfo?.parentSection || `Section ${idx + 1}`;
      console.log(`[HIERARCHICAL_EXTRACTION] Processing section ${idx + 1}/${documentChunks.length}: ${parentSection}`);

      try {
        // Use complexity-aware extraction for each section
        const sectionResult = await extractWorkflow(chunk, projectContext, complexity);
        const sectionNodeCount = sectionResult.blocks.reduce((sum, b) => sum + b.nodes.length, 0);
        console.log(`[HIERARCHICAL_EXTRACTION] ✅ Section "${parentSection}" → ${sectionNodeCount} nodes`);
        return { success: true, result: sectionResult, section: parentSection };
      } catch (error) {
        console.error(`[HIERARCHICAL_EXTRACTION] ❌ Failed section "${parentSection}":`, error);
        return { success: false, error, section: parentSection };
      }
    })
  );

  const sectionResults = await Promise.all(sectionPromises);

  // Filter successes and failures
  const successfulResults = sectionResults.filter(r => r.success).map(r => r.result!);
  const failedSections = sectionResults.filter(r => !r.success);

  // Check failure threshold (50%)
  if (failedSections.length / documentChunks.length > 0.5) {
    throw new Error(
      `Too many section failures: ${failedSections.length}/${documentChunks.length}. ` +
      `Failed sections: ${failedSections.map(f => f.section).join(', ')}`
    );
  }

  if (failedSections.length > 0) {
    console.warn(`[HIERARCHICAL_EXTRACTION] ⚠️  ${failedSections.length} section(s) failed, continuing with ${successfulResults.length} successful sections`);
  }

  // Step 4: Merge overview + detailed results
  console.log(`[HIERARCHICAL_EXTRACTION] Step 3: Merging ${successfulResults.length + 1} extraction results`);

  const mergedResult = mergeHierarchicalResults(overviewResult, successfulResults);

  const totalNodes = mergedResult.blocks.reduce((sum, b) => sum + b.nodes.length, 0);
  console.log(`[HIERARCHICAL_EXTRACTION] ✅ Complete: ${totalNodes} total nodes`);

  return mergedResult;
}

/**
 * Merges overview + detailed section results into coherent workflow
 */
function mergeHierarchicalResults(
  overview: WorkflowExtractionResult,
  detailed: WorkflowExtractionResult[]
): WorkflowExtractionResult {
  // Combine all blocks
  const allBlocks = new Map<string, typeof overview.blocks[0]>();

  // Add overview blocks
  for (const block of overview.blocks) {
    const key = `${block.blockType}-${block.blockName}`;
    allBlocks.set(key, { ...block, nodes: [...block.nodes] });
  }

  // Merge detailed blocks
  for (const result of detailed) {
    for (const block of result.blocks) {
      const key = `${block.blockType}-${block.blockName}`;

      if (allBlocks.has(key)) {
        // Merge nodes into existing block
        const existing = allBlocks.get(key)!;
        existing.nodes.push(...block.nodes);
      } else {
        // Add new block
        allBlocks.set(key, { ...block, nodes: [...block.nodes] });
      }
    }
  }

  // Deduplicate nodes by title (fuzzy matching)
  const deduplicatedBlocks = Array.from(allBlocks.values()).map(block => ({
    ...block,
    nodes: deduplicateNodes(block.nodes)
  }));

  // Reassign positions
  deduplicatedBlocks.sort((a, b) => {
    const order = ['protocol', 'data_creation', 'analysis', 'results', 'software'];
    const aIdx = order.indexOf(a.blockType);
    const bIdx = order.indexOf(b.blockType);
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.position - b.position;
  });

  deduplicatedBlocks.forEach((block, idx) => {
    block.position = idx + 1;
  });

  return {
    treeName: overview.treeName,
    treeDescription: overview.treeDescription,
    blocks: deduplicatedBlocks,
    nestedTrees: [
      ...(overview.nestedTrees || []),
      ...detailed.flatMap(r => r.nestedTrees || [])
    ]
  };
}

/**
 * Deduplicates nodes based on title similarity using fuzzy matching
 */
function deduplicateNodes(nodes: any[]): any[] {
  const unique: any[] = [];

  for (const node of nodes) {
    const isDup = unique.some(existingNode => {
      const norm1 = node.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const norm2 = existingNode.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      
      if (norm1 === norm2) return true; // Exact match
      
      const dist = distance(norm1, norm2);
      const maxLen = Math.max(norm1.length, norm2.length);
      const similarity = 1 - (dist / maxLen);
      
      return similarity > 0.8; // 80% similarity threshold
    });

    if (!isDup) {
      unique.push(node);
    } else {
      console.log(`[DEDUP] Skipping near-duplicate: "${node.title}"`);
    }
  }

  return unique;
}

