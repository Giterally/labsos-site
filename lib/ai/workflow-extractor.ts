import { selectProviderForDocument } from './provider';
import { WorkflowExtractionResultSchema, type WorkflowExtractionResult } from './schemas/workflow-extraction-schema';
import { StructuredDocument } from '../processing/parsers/pdf-parser';

/**
 * Extract workflow structure from a structured document using smart provider selection
 * Uses GPT-4o for smaller documents, Gemini for large documents
 * 
 * @param complexity - Optional complexity analysis to adjust extraction strategy
 */
export async function extractWorkflow(
  structuredDoc: StructuredDocument,
  projectContext?: { name?: string; description?: string },
  complexity?: { estimatedNodeCount: number; extractionStrategy: 'simple' | 'moderate' | 'complex' | 'comprehensive' }
): Promise<WorkflowExtractionResult> {
  const startTime = Date.now();
  console.log(`[WORKFLOW_EXTRACTOR] Starting extraction from ${structuredDoc.type} document: "${structuredDoc.fileName}"`);

  // Format structured document for LLM
  const formattedDocument = formatStructuredDocumentForLLM(structuredDoc);
  console.log(`[WORKFLOW_EXTRACTOR] Formatted document: ${formattedDocument.length} chars, ${structuredDoc.sections.length} sections`);

  // Check if document has meaningful content
  if (formattedDocument.trim().length < 100) {
    throw new Error(`Document too short after formatting (${formattedDocument.length} chars). Document may be empty or all content was filtered out.`);
  }

  // Select optimal provider based on document size
  const provider = selectProviderForDocument(structuredDoc);
  const modelInfo = provider.getModelInfo();
  
  console.log(`[WORKFLOW_EXTRACTOR] Using model: ${modelInfo.name}`);
  console.log(`[WORKFLOW_EXTRACTOR] Model capacity: ${modelInfo.maxInputTokens} input tokens, ${modelInfo.maxOutputTokens} output tokens`);
  if (complexity) {
    console.log(`[WORKFLOW_EXTRACTOR] Complexity strategy: ${complexity.extractionStrategy} (estimated ${complexity.estimatedNodeCount} nodes)`);
  }

  try {
    const llmStartTime = Date.now();
    // Extract workflow using selected provider (already validated by provider)
    const result = await provider.extractWorkflowFromDocument(structuredDoc, projectContext, complexity);
    const llmDuration = Date.now() - llmStartTime;
    
    const totalDuration = Date.now() - startTime;
    const totalNodes = result.blocks.reduce((sum, b) => sum + b.nodes.length, 0);

    console.log(`[WORKFLOW_EXTRACTOR] ✓ Extraction complete: ${result.blocks.length} blocks, ${totalNodes} nodes`);
    console.log(`[WORKFLOW_EXTRACTOR] Total time: ${totalDuration}ms (LLM: ${llmDuration}ms, processing: ${totalDuration - llmDuration}ms)`);

    return result;
  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    console.error(`[WORKFLOW_EXTRACTOR] ✗ Extraction failed after ${totalDuration}ms`);
    console.error(`[WORKFLOW_EXTRACTOR] Error type: ${error?.constructor?.name || typeof error}`);
    console.error(`[WORKFLOW_EXTRACTOR] Error message: ${error instanceof Error ? error.message : String(error)}`);
    
    // If schema validation fails, provide detailed error info
    if (error.name === 'ZodError') {
      console.error(`[WORKFLOW_EXTRACTOR] Schema validation failed with ${error.errors?.length || 0} errors:`);
      const errorPreview = error.errors?.slice(0, 5).map((e: any) => 
        `  - ${e.path.join('.')}: ${e.message}`
      ).join('\n');
      console.error(`[WORKFLOW_EXTRACTOR] Validation errors:\n${errorPreview}`);
      
      // Try to log what we got
      if (error.data) {
        console.error(`[WORKFLOW_EXTRACTOR] Invalid response data:`, JSON.stringify(error.data).substring(0, 500));
      }
      
      throw new Error(`Invalid workflow extraction result: ${error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('; ')}`);
    }
    
    // Check for truncation/token limit errors (preserve user-friendly messages)
    if (error.message?.includes('too large') || error.message?.includes('cut off') || error.message?.includes('processing limit')) {
      console.error(`[WORKFLOW_EXTRACTOR] Document too large - truncation detected`);
      // Preserve the user-friendly error message from the provider
      throw error;
    }
    
    // Check for API errors
    if (error.message?.includes('API') || error.message?.includes('key') || error.message?.includes('authentication')) {
      console.error(`[WORKFLOW_EXTRACTOR] Possible API configuration issue`);
      throw new Error(`LLM API error: ${error.message}. Please check your API key configuration.`);
    }
    
    // Check for timeout errors
    if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
      console.error(`[WORKFLOW_EXTRACTOR] Request timed out`);
      throw new Error(`LLM request timed out: ${error.message}`);
    }
    
    throw new Error(`Failed to extract workflow: ${error.message || String(error)}`);
  }
}

/**
 * Format structured document for LLM consumption while preserving hierarchy
 * Exported for use in document validation before extraction
 */
export function formatStructuredDocumentForLLM(doc: StructuredDocument): string {
  let output = '';

  for (const section of doc.sections) {
    // Preserve heading hierarchy
    const headingPrefix = '#'.repeat(section.level);
    output += `\n${headingPrefix} ${section.title}\n`;
    
    if (section.sectionNumber) {
      output += `(Section ${section.sectionNumber})\n`;
    }
    
    output += `[Page ${section.pageRange[0]}-${section.pageRange[1]}]\n\n`;

    for (const block of section.content) {
      switch (block.type) {
        case 'text':
          output += `${block.content}\n\n`;
          break;
        case 'list':
          // Preserve list formatting
          if (block.formatting?.isNumberedList) {
            output += `${block.content}\n`; // Already has "1.", "2.", etc.
          } else {
            output += `- ${block.content}\n`;
          }
          break;
        case 'table':
          output += `[TABLE]\n${block.content}\n[/TABLE]\n\n`;
          break;
        case 'figure':
          output += `[FIGURE: Page ${block.pageNumber}]\n${block.content}\n\n`;
          break;
        case 'code':
          output += `\`\`\`\n${block.content}\n\`\`\`\n\n`;
          break;
      }
    }
  }

  return output;
}

/**
 * Build user prompt for workflow extraction with explicit structure
 * Exported for use by AI providers
 * 
 * @param complexity - Optional complexity analysis to adjust prompt for document scale
 */
export function buildUserPrompt(
  structuredDoc: StructuredDocument,
  formattedDocument: string,
  projectContext?: { name?: string; description?: string },
  complexity?: { estimatedNodeCount: number; extractionStrategy: 'simple' | 'moderate' | 'complex' | 'comprehensive' }
): string {
  // Base instructions
  const baseInstructions = `You are analyzing a research document to extract its experimental workflow.
Your goal is to create a comprehensive experiment tree with nodes representing protocols, data collection, analyses, and results.
CRITICAL: Extract ALL experiments, methods, analyses, and results from the document.
Do not summarize or condense—create separate nodes for each distinct:
- Protocol or procedure
- Data collection method
- Analysis technique
- Result or finding
Each node should be atomic and specific.`;

  // Scale-specific guidance
  let scaleGuidance = '';
  let exampleAdjustment = '';

  if (complexity) {
    switch (complexity.extractionStrategy) {
      case 'simple':
        scaleGuidance = `
This is a simple document with ${complexity.estimatedNodeCount} estimated nodes.
Extract 5-15 nodes covering the main workflow.
Focus on: main protocol → data collection → analysis → results.`;
        exampleAdjustment = `
EXAMPLE OUTPUT STRUCTURE (for simple documents):
{
  "blocks": [
    {
      "blockName": "Protocol Block",
      "nodes": [
        {
          "nodeId": "node-1",
          "title": "Sample Collection",
          "dependencies": []
        }
        // 1-3 protocol nodes total
      ]
    },
    {
      "blockName": "Data Creation Block",
      "nodes": [
        {
          "nodeId": "node-2",
          "title": "Data Collection",
          "dependencies": [
            {
              "referencedNodeTitle": "Sample Collection",
              "dependencyType": "requires",
              "extractedPhrase": "after sample collection",
              "confidence": 0.9
            }
          ]
        }
        // 1-2 data collection nodes total
      ]
    },
    {
      "blockName": "Analysis Block",
      "nodes": [
        {
          "nodeId": "node-3",
          "title": "Statistical Analysis",
          "dependencies": [
            {
              "referencedNodeTitle": "Data Collection",
              "dependencyType": "uses_output",
              "extractedPhrase": "using collected data",
              "confidence": 0.9
            }
          ]
        }
        // 1-2 analysis nodes total
      ]
    },
    {
      "blockName": "Results Block",
      "nodes": [
        {
          "nodeId": "node-4",
          "title": "Analysis Results",
          "dependencies": [
            {
              "referencedNodeTitle": "Statistical Analysis",
              "dependencyType": "uses_output",
              "extractedPhrase": "based on statistical analysis",
              "confidence": 0.95
            }
          ]
        }
        // 2-5 result nodes total
      ]
    }
  ]
}

REMEMBER: Dependencies must be objects with referencedNodeTitle, dependencyType, extractedPhrase, and optionally confidence.`;
        break;

      case 'moderate':
        scaleGuidance = `
This is a moderate-complexity document with ${complexity.estimatedNodeCount} estimated nodes.
Extract 15-30 nodes covering all experiments.
Include:
- All distinct protocols (even variations)
- All data collection methods
- All analysis techniques
- All major results with their figures/tables`;
        exampleAdjustment = `
EXAMPLE OUTPUT STRUCTURE (for moderate documents):
{
  "blocks": [
    {
      "blockName": "Protocol Block",
      "nodes": [
        // 3-8 protocol nodes
      ]
    },
    {
      "blockName": "Data Creation Block",
      "nodes": [
        // 3-6 data collection nodes
      ]
    },
    {
      "blockName": "Analysis Block",
      "nodes": [
        // 4-8 analysis nodes
      ]
    },
    {
      "blockName": "Results Block",
      "nodes": [
        // 5-10 result nodes
      ]
    }
  ]
}`;
        break;

      case 'complex':
        scaleGuidance = `
This is a complex document with ${complexity.estimatedNodeCount} estimated nodes.
Extract 30-50 nodes covering the complete workflow.
Be thorough:
- Extract EVERY protocol mentioned (including sub-protocols)
- Create separate nodes for each experiment
- Include all data processing steps
- Create nodes for each analysis method
- Include all results (even supporting/negative results)`;
        exampleAdjustment = `
EXAMPLE OUTPUT STRUCTURE (for complex documents):
{
  "blocks": [
    {
      "blockName": "Protocol Block",
      "nodes": [
        // 8-15 protocol nodes (one per distinct method)
      ]
    },
    {
      "blockName": "Data Creation Block",
      "nodes": [
        // 8-15 data collection nodes
      ]
    },
    {
      "blockName": "Analysis Block",
      "nodes": [
        // 10-20 analysis nodes (one per technique/test)
      ]
    },
    {
      "blockName": "Results Block",
      "nodes": [
        // 10-20 result nodes (one per major finding/figure)
      ]
    }
  ]
}`;
        break;

      case 'comprehensive':
        scaleGuidance = `
This is a comprehensive document (dissertation/thesis) with ${complexity.estimatedNodeCount}+ estimated nodes.
Extract 50-100+ nodes covering the entire research.
Maximum detail:
- Extract EVERY protocol, even minor variations
- Create nodes for each experimental condition
- Include all data collection and processing steps
- Create separate nodes for each statistical test
- Include ALL results, even preliminary or supplementary
- Create nodes for methodological validations
- Include literature review protocols if detailed`;
        exampleAdjustment = `
EXAMPLE OUTPUT STRUCTURE (for comprehensive documents):
{
  "blocks": [
    {
      "blockName": "Protocol Block",
      "nodes": [
        // 15-25 protocol nodes (one per distinct method)
      ]
    },
    {
      "blockName": "Data Creation Block",
      "nodes": [
        // 15-25 data collection nodes
      ]
    },
    {
      "blockName": "Analysis Block",
      "nodes": [
        // 20-35 analysis nodes (one per technique/test)
      ]
    },
    {
      "blockName": "Results Block",
      "nodes": [
        // 20-40 result nodes (one per major finding/figure)
      ]
    }
  ]
}`;
        break;
    }
  } else {
    // Default guidance for backward compatibility
    scaleGuidance = `
Extract this document into an experiment tree structure and return it as structured JSON.
`;
        exampleAdjustment = `
EXAMPLE OUTPUT (with proper dependency format):
{
  "treeName": "Plant Growth Under Stress Conditions Study",
  "treeDescription": "Experimental workflow for studying plant responses to environmental stress",
  "blocks": [
    {
      "blockName": "Protocol Block",
      "blockType": "protocol",
      "position": 1,
      "nodes": [
        {
          "nodeId": "proto-001",
          "title": "Seed Preparation Protocol",
          "content": {
            "text": "Seeds were sterilized using 70% ethanol for 2 minutes, followed by 10% bleach solution for 10 minutes, then rinsed three times with sterile water."
          },
          "nodeType": "protocol",
          "status": "draft",
          "dependencies": [],
          "attachments": [],
          "parameters": {
            "ethanol_concentration": "70%",
            "sterilization_time": "2 minutes"
          }
        }
      ]
    },
    {
      "blockName": "Data Creation Block",
      "blockType": "data_creation",
      "position": 2,
      "nodes": [
        {
          "nodeId": "data-001",
          "title": "Growth Measurements",
          "content": {
            "text": "Plant height and leaf count were measured daily using the Seed Preparation Protocol. Measurements were taken at the same time each day under controlled conditions."
          },
          "nodeType": "data_creation",
          "status": "draft",
          "dependencies": [
            {
              "referencedNodeTitle": "Seed Preparation Protocol",
              "dependencyType": "requires",
              "extractedPhrase": "using the Seed Preparation Protocol",
              "confidence": 0.95
            }
          ],
          "attachments": [],
          "parameters": {
            "measurement_frequency": "daily",
            "metrics": ["height", "leaf_count"]
          }
        }
      ]
    },
    {
      "blockName": "Analysis Block",
      "blockType": "analysis",
      "position": 3,
      "nodes": [
        {
          "nodeId": "analysis-001",
          "title": "Statistical Analysis of Growth Data",
          "content": {
            "text": "Growth data collected from daily measurements were analyzed using ANOVA to determine significant differences between treatment groups. Post-hoc Tukey tests were performed for pairwise comparisons."
          },
          "nodeType": "analysis",
          "status": "draft",
          "dependencies": [
            {
              "referencedNodeTitle": "Growth Measurements",
              "dependencyType": "uses_output",
              "extractedPhrase": "Growth data collected from daily measurements",
              "confidence": 0.9
            }
          ],
          "attachments": [],
          "parameters": {
            "statistical_test": "ANOVA",
            "post_hoc": "Tukey"
          }
        }
      ]
    },
    {
      "blockName": "Results Block",
      "blockType": "results",
      "position": 4,
      "nodes": [
        {
          "nodeId": "results-001",
          "title": "Treatment Effects on Plant Growth",
          "content": {
            "text": "ANOVA revealed significant differences in plant height between treatment groups (F=12.4, p<0.001). Stress-treated plants showed 30% reduced growth compared to controls."
          },
          "nodeType": "results",
          "status": "draft",
          "dependencies": [
            {
              "referencedNodeTitle": "Statistical Analysis of Growth Data",
              "dependencyType": "uses_output",
              "extractedPhrase": "ANOVA revealed significant differences",
              "confidence": 0.95
            }
          ],
          "attachments": [],
          "parameters": {}
        }
      ]
    }
  ],
  "nestedTrees": []
}`;
  }

  const structureGuidance = `
IMPORTANT NODE GRANULARITY RULES:

1. One node = one distinct method/procedure/analysis/result
2. If a section describes multiple experiments → create multiple nodes
3. If a protocol has sub-steps → create main node + nested tree reference
4. Each figure/table → usually indicates a separate result node
5. Methods section → often 5-10+ protocol nodes
6. Results section → often 10-20+ result nodes

${complexity && complexity.estimatedNodeCount > 20 ? `
EXAMPLE from a dissertation:
Methods section "Statistical Analysis" might contain:
- Node: "Normality Testing" (protocol)
- Node: "Variance Testing" (protocol)
- Node: "ANOVA Implementation" (analysis)
- Node: "Post-hoc Pairwise Comparisons" (analysis)
Do NOT combine these into one "Statistical Analysis" node.` : ''}

## DEPENDENCY FORMAT (CRITICAL):

For EVERY node, you must extract dependencies as OBJECTS, not strings.

**Dependency Object Structure:**
{
  "referencedNodeTitle": "Exact title of the referenced node",
  "dependencyType": "requires" | "uses_output" | "follows" | "validates",
  "extractedPhrase": "The exact text from the document showing this dependency",
  "confidence": 0.7-1.0
}

**Dependency Types:**
- "requires": Node A requires Node B to be completed first (prerequisite)
- "uses_output": Node A uses the output/results from Node B
- "follows": Node A follows Node B sequentially (temporal relationship)
- "validates": Node A validates or verifies Node B's results

**How to Extract Dependencies:**
1. Read each node's content carefully
2. Look for phrases indicating relationships:
   - "using data from X" → uses_output
   - "based on X" → uses_output
   - "after X was completed" → follows
   - "requires X" → requires
   - "validates X" → validates
3. Record the EXACT phrase showing the dependency
4. Create a dependency object with all fields

**Example Dependency Extraction:**
If node content says: "The statistical analysis was performed using data from the Sample Collection protocol"
Extract:
{
  "referencedNodeTitle": "Sample Collection",
  "dependencyType": "uses_output",
  "extractedPhrase": "using data from the Sample Collection protocol",
  "confidence": 0.9
}

NEVER use string arrays like ["Node 1", "Node 2"] - always use objects!`;

  return `
PROJECT CONTEXT:
${projectContext ?
    `Project: ${projectContext.name || 'Unnamed Project'}${projectContext.description ? `\nDescription: ${projectContext.description}` : ''}`
    : 'No additional context provided'}

SOURCE DOCUMENT:
File: ${structuredDoc.fileName}
Type: ${structuredDoc.type}
${structuredDoc.metadata ? `Metadata: ${JSON.stringify(structuredDoc.metadata, null, 2)}` : ''}

DOCUMENT CONTENT WITH PRESERVED STRUCTURE:

${formattedDocument}

TASK:

${baseInstructions}
${scaleGuidance}
${structureGuidance}
${exampleAdjustment}

CRITICAL - REQUIRED JSON STRUCTURE:

You MUST return a JSON object with these exact top-level fields:

{
  "treeName": "string - The experiment or study title from the document",
  "treeDescription": "string - One sentence describing what this experiment does",
  "blocks": [
    {
      "blockName": "string - Name of this workflow phase (e.g., 'Protocol', 'Data Collection')",
      "blockType": "string - Type: 'protocol', 'data_creation', 'analysis', 'results', or 'software'",
      "position": number - Order in workflow (1, 2, 3...),
      "nodes": [
        {
          "nodeId": "string - Unique ID like 'node-1', 'node-2'",
          "title": "string - Short title for this step",
          "content": {
            "text": "string - The exact relevant text from the source document"
          },
          "nodeType": "string - Same as blockType",
          "status": "complete" or "draft",
          "dependencies": [],
          "attachments": [],
          "parameters": {}
        }
      ]
    }
  ],
  "nestedTrees": []
}

EXTRACTION GUIDELINES:

1. treeName: Extract from document title, abstract, or first heading
2. treeDescription: Write ONE sentence summarizing the experiment
3. blocks: Group related steps into workflow phases (Protocol, Data Creation, Analysis, Results, Software)
4. nodes: Each step/procedure/analysis should be a separate node
5. Extract content: Use exact text from the document, don't paraphrase
6. dependencies: Link nodes that must happen in sequence (use empty array if none)

## CRITICAL REMINDERS:

1. **Dependencies MUST be objects**, not strings
2. **Every node** should have dependencies (except root protocols)
3. **Extract the exact phrase** that shows the dependency
4. **Use appropriate dependency types** (requires/uses_output/follows/validates)
5. **Be comprehensive** - don't skip dependencies just because they're obvious

Common dependency patterns:
- "using X" → uses_output dependency on X
- "after X" → follows dependency on X
- "based on X" → uses_output dependency on X
- "requires X" → requires dependency on X
- Analysis nodes → always depend on data creation nodes
- Result nodes → always depend on analysis nodes

IMPORTANT:
- Your response must be valid JSON
- You MUST include treeName, treeDescription, and blocks at the top level
- Do NOT return an array - return an object with these fields
- If you cannot find clear workflow steps, still return the structure with empty blocks array
- **Dependencies must be objects with all required fields: referencedNodeTitle, dependencyType, extractedPhrase, and optionally confidence**

Return only the JSON, no other text or markdown formatting.
`;
}

