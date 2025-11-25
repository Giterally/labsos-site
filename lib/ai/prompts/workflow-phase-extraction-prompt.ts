import type { StructuredDocument } from '../../processing/parsers/pdf-parser';
import type { PhaseExtractionInput } from '../schemas/workflow-phase-extraction-schema';

/**
 * System prompt for Phase 2: Targeted extraction of one phase
 */
export const WORKFLOW_PHASE_EXTRACTION_SYSTEM_PROMPT = `You are an expert research workflow analyzer performing TARGETED EXTRACTION.

You are extracting nodes for ONE specific workflow phase. Focus ONLY on this phase.

CRITICAL REQUIREMENTS:

1. Extract ALL nodes for this phase as identified in the content inventory

2. Use EXACT text from source documents - do NOT paraphrase

3. Create separate nodes for each distinct item (figure, table, method, procedure)

4. Identify dependencies between nodes within this phase

OUTPUT FORMAT: Return valid JSON matching the schema provided.`;

/**
 * Build user prompt for single-phase extraction
 */
export function buildPhaseExtractionPrompt(input: PhaseExtractionInput): string {
  const { phaseName, phaseType, pageRanges, estimatedNodeCount, keyTopics, contentInventory, documents, explicitInstructions } = input;
  
  // Extract only relevant sections from documents
  const relevantSections = extractRelevantSections(documents, pageRanges);
  
  // Build page range string for checklist
  const phasePageRange = Object.entries(pageRanges)
    .map(([doc, [start, end]]) => `${doc}: pages ${start}-${end}`)
    .join(', ');
  
  // Build mandatory extraction checklist from inventory
  const mandatoryItems = buildMandatoryChecklist(contentInventory, keyTopics, phasePageRange);
  
  return `
===========================================
🎯 PHASE EXTRACTION: ${phaseName}
===========================================
PHASE DETAILS:

- Name: ${phaseName}
- Type: ${phaseType}
- Expected nodes: ${estimatedNodeCount}
- Key topics: ${keyTopics.join(', ')}

CONTENT LOCATION:

${Object.entries(pageRanges).map(([doc, [start, end]]) => 
  `- ${doc}: pages ${start}-${end}`
).join('\n')}

${mandatoryItems}

===========================================
📄 RELEVANT CONTENT
===========================================
${relevantSections}

===========================================
🔑 EXTRACTION RULES
===========================================
ONE NODE PER ITEM:

- One node per statistical test/method
- One node per figure/table
- One node per distinct procedure
- One node per model/algorithm

CONTENT REQUIREMENTS:

- Use EXACT text from source (quote directly, don't paraphrase)
- Minimum 150 characters per node
- Include relevant parameters, conditions, details

DEPENDENCIES:

- Identify which nodes must happen before others
- Use phrases like "following", "after", "requires", "uses output from"

NODE TITLES:

- Descriptive and specific (NOT "Data Analysis" or "Method 1")
- Use domain terminology (e.g., "Principal Component Analysis (PCA)")

===========================================
📊 OUTPUT FORMAT
===========================================
Return a JSON object with:

{
  "blockName": "${phaseName}",
  "blockType": "${phaseType}",
  "blockDescription": "1-2 sentences describing this phase",
  "position": 1,
  "nodes": [
    {
      "nodeId": "phase1-node1",
      "title": "Descriptive Node Title",
      "content": { "text": "EXACT text from source..." },
      "nodeType": "${phaseType}",
      "status": "draft" or "complete",
      "dependencies": [...],
      "attachments": [...],
      "metadata": {
        "extractedFrom": {
          "source": "filename.pdf",
          "pages": [4, 5]
        }
      }
    }
  ]
}

${explicitInstructions ? `\n===========================================\n⚠️ CRITICAL INSTRUCTIONS\n===========================================\n${explicitInstructions}\n` : ''}

Return ONLY valid JSON, no markdown or explanations.
`;
}

/**
 * Extract only sections relevant to this phase from documents
 */
function extractRelevantSections(
  documents: StructuredDocument[],
  pageRanges: Record<string, [number, number]>
): string {
  let output = '';
  
  for (const doc of documents) {
    const range = pageRanges[doc.fileName];
    if (!range) continue;
    
    const [startPage, endPage] = range;
    
    // Filter sections within page range
    const relevantSections = doc.sections.filter(section => 
      section.pageRange[0] <= endPage && section.pageRange[1] >= startPage
    );
    
    output += `\n## FROM: ${doc.fileName}\n\n`;
    
    for (const section of relevantSections) {
      const headingPrefix = '#'.repeat(section.level + 2); // +2 because we used ## above
      output += `${headingPrefix} ${section.title} [Pages ${section.pageRange[0]}-${section.pageRange[1]}]\n\n`;
      
      for (const block of section.content) {
        if (block.type === 'text') {
          output += `${block.content}\n\n`;
        } else if (block.type === 'figure') {
          output += `[FIGURE: Page ${block.pageNumber}]\n${block.content}\n\n`;
        } else if (block.type === 'table') {
          output += `[TABLE]\n${block.content}\n[/TABLE]\n\n`;
        }
      }
    }
  }
  
  return output;
}

/**
 * Build mandatory extraction checklist from content inventory
 * Domain-agnostic version that only lists items found in discovery
 */
function buildMandatoryChecklist(
  inventory: PhaseExtractionInput['contentInventory'],
  keyTopics: string[],
  phasePageRange: string
): string {
  const items: string[] = [];
  
  items.push('Based on the discovery inventory, you MUST extract nodes for these items:');
  items.push('');
  
  if (inventory.statisticalTests.length > 0) {
    items.push('METHODS/ANALYSES found in inventory:');
    inventory.statisticalTests.forEach(test => {
      items.push(`- [ ] ${test}`);
    });
    items.push('');
  } else {
    items.push('METHODS/ANALYSES found in inventory:');
    items.push('(None found in discovery - do not create placeholder nodes)');
    items.push('');
  }
  
  if (inventory.models.length > 0) {
    items.push('MODELS found in inventory:');
    inventory.models.forEach(model => {
      items.push(`- [ ] ${model}`);
    });
    items.push('');
  } else {
    items.push('MODELS found in inventory:');
    items.push('(None found in discovery - do not create placeholder nodes)');
    items.push('');
  }
  
  if (inventory.figures.length > 0) {
    items.push('FIGURES found in inventory:');
    inventory.figures.forEach(fig => {
      items.push(`- [ ] ${fig.title} (page ${fig.pageNumber})`);
    });
    items.push('');
  } else {
    items.push('FIGURES found in inventory:');
    items.push('(None found in discovery - do not create placeholder nodes)');
    items.push('');
  }
  
  if (inventory.tables.length > 0) {
    items.push('TABLES found in inventory:');
    inventory.tables.forEach(table => {
      items.push(`- [ ] ${table.title} (page ${table.pageNumber})`);
    });
    items.push('');
  } else {
    items.push('TABLES found in inventory:');
    items.push('(None found in discovery - do not create placeholder nodes)');
    items.push('');
  }
  
  items.push('===========================================');
  items.push('⚠️ CRITICAL RULES FOR THIS CHECKLIST');
  items.push('===========================================');
  items.push('');
  items.push('1. ONLY extract nodes for items in THIS PHASE\'S content');
  items.push('   - If this is a "Results" phase, don\'t extract methodology nodes');
  items.push('   - If this is a "Methodology" phase, don\'t extract results nodes');
  items.push('');
  items.push('2. NEVER create placeholder nodes saying "X is not mentioned"');
  items.push('   - If PCA is in the inventory but not in this phase → Skip it, it\'s in another phase');
  items.push('   - If PCA is not in the inventory at all → Never create a node for it');
  items.push('');
  items.push(`3. Check inventory items against THIS PHASE'S page ranges`);
  items.push(`   - Phase page range: ${phasePageRange}`);
  items.push('   - Only extract inventory items that appear in these pages');
  items.push('');
  items.push('4. If you cannot find an inventory item in this phase:');
  items.push('   - DO NOT create a node for it');
  items.push('   - It\'s probably in a different phase');
  items.push('');
  items.push('Example - CORRECT:');
  items.push('Inventory: ["PCA", "Correlation Analysis", "t-test"]');
  items.push('This phase: "Results" (pages 10-12)');
  items.push('Phase content: Only mentions "t-test results"');
  items.push('→ Extract: ONE node for "t-test" only');
  items.push('→ Skip: PCA and Correlation (they\'re in the Methodology phase)');
  items.push('');
  items.push('Example - WRONG:');
  items.push('→ Create nodes saying "PCA is not mentioned" ✗');
  items.push('→ Create placeholder nodes for PCA ✗');
  items.push('');
  items.push('===========================================');
  items.push('🎯 WORKFLOW FOR EXTRACTION');
  items.push('===========================================');
  items.push('');
  items.push('For each inventory item:');
  items.push('1. Is it mentioned in THIS phase\'s page range?');
  items.push('   - YES → Extract it');
  items.push('   - NO → Skip it (it\'s in another phase)');
  items.push('');
  items.push('2. Can you find actual content about it in this phase?');
  items.push('   - YES → Create node with content');
  items.push('   - NO → Skip it');
  items.push('');
  items.push('Never create nodes without actual content.');
  
  return items.join('\n');
}

