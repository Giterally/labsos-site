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
  
  // Build mandatory extraction checklist from inventory
  const mandatoryItems = buildMandatoryChecklist(contentInventory, keyTopics);
  
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

===========================================
📋 MANDATORY EXTRACTION CHECKLIST
===========================================
You MUST create nodes for ALL of the following items identified in discovery:

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
 */
function buildMandatoryChecklist(
  inventory: PhaseExtractionInput['contentInventory'],
  keyTopics: string[]
): string {
  const items: string[] = [];
  
  if (inventory.statisticalTests.length > 0) {
    items.push('STATISTICAL METHODS:');
    inventory.statisticalTests.forEach(test => {
      items.push(`  □ Create node for: ${test}`);
    });
    items.push('');
  }
  
  if (inventory.models.length > 0) {
    items.push('MODELS/ALGORITHMS:');
    inventory.models.forEach(model => {
      items.push(`  □ Create node for: ${model}`);
    });
    items.push('');
  }
  
  if (inventory.figures.length > 0) {
    items.push('FIGURES:');
    inventory.figures.forEach(fig => {
      items.push(`  □ Create node for: ${fig.title} (page ${fig.pageNumber})`);
    });
    items.push('');
  }
  
  if (inventory.tables.length > 0) {
    items.push('TABLES:');
    inventory.tables.forEach(table => {
      items.push(`  □ Create node for: ${table.title} (page ${table.pageNumber})`);
    });
    items.push('');
  }
  
  items.push('KEY TOPICS TO COVER:');
  keyTopics.forEach(topic => {
    items.push(`  □ ${topic}`);
  });
  
  return items.join('\n');
}

