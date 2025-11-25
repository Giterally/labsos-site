import type { WorkflowDiscoveryResult } from '../schemas/workflow-discovery-schema';
import type { PhaseExtractionResult } from '../schemas/workflow-phase-extraction-schema';

/**
 * System prompt for Phase 3: Verification
 */
export const WORKFLOW_VERIFICATION_SYSTEM_PROMPT = `You are an expert quality assurance analyst for research workflow extraction.

Your task is to VERIFY that all content identified in the discovery phase was properly extracted.

CRITICAL: You are checking for COMPLETENESS and CORRECTNESS, not extracting new content.

OUTPUT: Return a JSON object identifying gaps, misplacements, and duplicates.`;

/**
 * Build verification prompt
 */
export function buildVerificationPrompt(
  discoveryResult: WorkflowDiscoveryResult,
  extractedBlocks: PhaseExtractionResult[]
): string {
  
  const inventorySummary = buildInventorySummary(discoveryResult.contentInventory);
  const extractedSummary = buildExtractedSummary(extractedBlocks);
  
  return `
===========================================
🔍 VERIFICATION PHASE - CHECK COMPLETENESS
===========================================

DISCOVERY PHASE identified these items to extract:

${inventorySummary}

EXTRACTION PHASE created these blocks and nodes:

${extractedSummary}

===========================================
🎯 YOUR TASK
===========================================

1. CHECK FOR MISSING CONTENT
   Compare the discovery inventory with extracted nodes:
   - Which statistical tests from inventory are missing nodes?
   - Which models from inventory are missing nodes?
   - Which figures from inventory are missing nodes?
   - Which tables from inventory are missing nodes?

2. CHECK FOR MISPLACED NODES
   Verify nodes are in correct blocks:
   - Are methodology nodes in methodology blocks?
   - Are results nodes in results blocks?
   - Are any nodes in obviously wrong blocks?

3. CHECK FOR DUPLICATES
   Identify nodes with very similar titles or content:
   - Are there multiple nodes covering the same topic?
   - Should any nodes be merged?
   
   CRITICAL: If you find duplicates, you MUST provide ALL fields for each duplicate pair:
   - nodeTitle1: The title of the first node
   - nodeTitle2: The title of the second node
   - similarity: A number between 0 and 1 (e.g., 0.85 for 85% similar)
   - recommendation: What to do (e.g., "Merge into nodeTitle1", "Keep both", "Remove nodeTitle2")
   
   If you cannot provide complete information for a duplicate pair, DO NOT include it.
   Use an empty array [] if you find no duplicates or cannot provide complete duplicate information.

4. QUALITY ASSESSMENT
   Rate the overall extraction quality (0-10):
   - 10/10: All content extracted correctly, no issues
   - 7-9/10: Minor issues (1-2 missing items or misplacements)
   - 4-6/10: Moderate issues (several missing items)
   - 0-3/10: Major issues (many missing items or wrong structure)

===========================================
⚠️ CRITICAL INSTRUCTIONS
===========================================

- BE STRICT: If something from inventory is missing, report it
- BE SPECIFIC: Name exactly what is missing and where it should be
- BE HELPFUL: Suggest which block misplaced nodes should move to

If extraction is perfect (everything present and correct), return:

{
  "isComplete": true,
  "missingContent": [],
  "misplacedNodes": [],
  "duplicateNodes": [],
  "suggestions": [],
  "qualityScore": 10
}

===========================================
📊 OUTPUT FORMAT
===========================================

Return a JSON object:

{
  "isComplete": true/false,
  "missingContent": [
    {
      "itemType": "statistical_test",
      "itemName": "Principal Component Analysis",
      "expectedLocation": "Methodology block, pages 6-7",
      "reason": "Discovery found PCA mentioned but no extraction node created"
    }
  ],
  "misplacedNodes": [
    {
      "nodeTitle": "Extended Kalman Filter Implementation",
      "currentBlock": "Data Collection & Feature Engineering",
      "shouldBe": "Model Development",
      "reason": "EKF is a model implementation, not data preparation"
    }
  ],
  "duplicateNodes": [
    {
      "nodeTitle1": "Performance Analysis",
      "nodeTitle2": "Performance Metrics Analysis",
      "similarity": 0.92,
      "recommendation": "Merge into 'Performance Analysis' as they cover the same topic"
    }
  ],
  "suggestions": ["Consider merging 'Performance Analysis' and 'Performance Metrics Analysis' nodes"],
  "qualityScore": 8
}

IMPORTANT FOR duplicateNodes:
- Each entry MUST have all 4 fields: nodeTitle1, nodeTitle2, similarity, recommendation
- If you cannot provide complete information, use an empty array []
- Do NOT include partial or incomplete duplicate entries

Return ONLY valid JSON, no markdown or explanations.
`;
}

/**
 * Build summary of discovery inventory
 */
function buildInventorySummary(inventory: WorkflowDiscoveryResult['contentInventory']): string {
  const lines: string[] = [];
  
  if (inventory.statisticalTests.length > 0) {
    lines.push('STATISTICAL TESTS/METHODS:');
    inventory.statisticalTests.forEach(test => lines.push(`  - ${test}`));
    lines.push('');
  }
  
  if (inventory.models.length > 0) {
    lines.push('MODELS/ALGORITHMS:');
    inventory.models.forEach(model => lines.push(`  - ${model}`));
    lines.push('');
  }
  
  if (inventory.figures.length > 0) {
    lines.push(`FIGURES: ${inventory.figures.length} total`);
    inventory.figures.slice(0, 5).forEach(fig => 
      lines.push(`  - ${fig.title} (${fig.source}, page ${fig.pageNumber})`)
    );
    if (inventory.figures.length > 5) {
      lines.push(`  ... and ${inventory.figures.length - 5} more`);
    }
    lines.push('');
  }
  
  if (inventory.tables.length > 0) {
    lines.push(`TABLES: ${inventory.tables.length} total`);
    inventory.tables.slice(0, 5).forEach(table => 
      lines.push(`  - ${table.title} (${table.source}, page ${table.pageNumber})`)
    );
    if (inventory.tables.length > 5) {
      lines.push(`  ... and ${inventory.tables.length - 5} more`);
    }
    lines.push('');
  }
  
  lines.push(`TOTAL ITEMS TO EXTRACT: ${
    inventory.statisticalTests.length + 
    inventory.models.length + 
    inventory.figures.length + 
    inventory.tables.length
  }`);
  
  return lines.join('\n');
}

/**
 * Build summary of extracted blocks and nodes
 */
function buildExtractedSummary(blocks: PhaseExtractionResult[]): string {
  const lines: string[] = [];
  
  let totalNodes = 0;
  
  for (const block of blocks) {
    lines.push(`BLOCK: ${block.blockName} (${block.nodes.length} nodes)`);
    block.nodes.forEach(node => {
      lines.push(`  - ${node.title}`);
    });
    lines.push('');
    totalNodes += block.nodes.length;
  }
  
  lines.push(`TOTAL: ${blocks.length} blocks, ${totalNodes} nodes`);
  
  return lines.join('\n');
}

