import { getAIProviderInstance } from './provider';
import { WORKFLOW_EXTRACTION_SYSTEM_PROMPT } from './prompts/workflow-extraction-system';
import { WorkflowExtractionResultSchema, type WorkflowExtractionResult } from './schemas/workflow-extraction-schema';
import { StructuredDocument } from '../processing/parsers/pdf-parser';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Extract workflow structure from a structured document using a single LLM call
 */
export async function extractWorkflow(
  structuredDoc: StructuredDocument,
  projectContext?: { name?: string; description?: string }
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

  // Build user prompt
  const userPrompt = buildUserPrompt(structuredDoc, formattedDocument, projectContext);
  const fullPrompt = `${WORKFLOW_EXTRACTION_SYSTEM_PROMPT}\n\n${userPrompt}`;
  
  const promptLength = fullPrompt.length;
  console.log(`[WORKFLOW_EXTRACTOR] Full prompt length: ${promptLength} chars`);

  try {
    const aiProvider = getAIProviderInstance();
    console.log(`[WORKFLOW_EXTRACTOR] AI Provider: ${aiProvider.constructor.name}`);
    
    // Convert Zod schema to JSON Schema for the LLM
    const jsonSchema = zodToJsonSchema(WorkflowExtractionResultSchema, {
      name: 'WorkflowExtractionResult',
      $refStrategy: 'none'
    });
    
    console.log(`[WORKFLOW_EXTRACTOR] Calling LLM API with schema...`);
    
    const llmStartTime = Date.now();
    // Pass the schema to help guide the LLM
    const rawResult = await aiProvider.generateJSON(fullPrompt, jsonSchema);
    const llmDuration = Date.now() - llmStartTime;
    
    console.log(`[WORKFLOW_EXTRACTOR] LLM responded in ${llmDuration}ms`);
    console.log(`[WORKFLOW_EXTRACTOR] Response type: ${typeof rawResult}`);
    console.log(`[WORKFLOW_EXTRACTOR] Response keys: ${typeof rawResult === 'object' && rawResult !== null ? Object.keys(rawResult).join(', ') : 'N/A'}`);
    
    // Log response structure for debugging
    if (rawResult && typeof rawResult === 'object') {
      console.log(`[WORKFLOW_EXTRACTOR] Response structure: {
  treeName: ${typeof rawResult.treeName} (${rawResult.treeName ? 'present' : 'missing'}),
  treeDescription: ${typeof rawResult.treeDescription} (${rawResult.treeDescription ? 'present' : 'missing'}),
  blocks: ${Array.isArray(rawResult.blocks) ? `array[${rawResult.blocks.length}]` : typeof rawResult.blocks}
}`);
    } else {
      console.error(`[WORKFLOW_EXTRACTOR] Received null/undefined response`);
    }
    
    // Log response preview
    if (typeof rawResult === 'object' && rawResult !== null) {
      const responseStr = JSON.stringify(rawResult);
      const previewLength = Math.min(responseStr.length, 500);
      console.log(`[WORKFLOW_EXTRACTOR] Response preview (${previewLength}/${responseStr.length} chars): ${responseStr.substring(0, previewLength)}...`);
    }
    
    console.log(`[WORKFLOW_EXTRACTOR] Validating schema...`);

    // Validate with detailed error handling
    let result: WorkflowExtractionResult;
    
    try {
      result = WorkflowExtractionResultSchema.parse(rawResult);
      const totalDuration = Date.now() - startTime;
      const totalNodes = result.blocks.reduce((sum, b) => sum + b.nodes.length, 0);

      console.log(`[WORKFLOW_EXTRACTOR] ✓ Validation successful`);
      console.log(`[WORKFLOW_EXTRACTOR] ✓ Extraction complete: ${result.blocks.length} blocks, ${totalNodes} nodes`);
      console.log(`[WORKFLOW_EXTRACTOR] Total time: ${totalDuration}ms (LLM: ${llmDuration}ms, processing: ${totalDuration - llmDuration}ms)`);

      return result;
    } catch (validationError: any) {
      console.error(`[WORKFLOW_EXTRACTOR] ===== VALIDATION FAILED =====`);
      console.error(`[WORKFLOW_EXTRACTOR] Schema validation error:`, validationError.message);
      
      if (validationError.name === 'ZodError') {
        console.error(`[WORKFLOW_EXTRACTOR] Validation errors:`, JSON.stringify(validationError.errors, null, 2));
        console.error(`[WORKFLOW_EXTRACTOR] Missing/invalid fields:`, 
          validationError.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')
        );
      }
      
      console.error(`[WORKFLOW_EXTRACTOR] Received response:`, JSON.stringify(rawResult, null, 2).substring(0, 1000));
      
      // Try to recover with fallback values
      if (rawResult && typeof rawResult === 'object') {
        console.log(`[WORKFLOW_EXTRACTOR] Attempting recovery with fallback values...`);
        
        const fallbackResult = {
          treeName: rawResult.treeName || 
                    structuredDoc.fileName?.replace(/\.[^.]+$/, '') || 
                    'Extracted Workflow',
          treeDescription: rawResult.treeDescription || 
                          structuredDoc.metadata?.title || 
                          structuredDoc.metadata?.description ||
                          'Workflow extracted from document',
          blocks: Array.isArray(rawResult.blocks) ? rawResult.blocks : 
                  Array.isArray(rawResult) ? rawResult : 
                  [],
          nestedTrees: rawResult.nestedTrees || []
        };
        
        try {
          result = WorkflowExtractionResultSchema.parse(fallbackResult);
          const totalDuration = Date.now() - startTime;
          const totalNodes = result.blocks.reduce((sum, b) => sum + b.nodes.length, 0);
          console.warn(`[WORKFLOW_EXTRACTOR] ✓ Recovery successful with fallback values`);
          console.log(`[WORKFLOW_EXTRACTOR] ✓ Extraction complete: ${result.blocks.length} blocks, ${totalNodes} nodes`);
          console.log(`[WORKFLOW_EXTRACTOR] Total time: ${totalDuration}ms`);
          return result;
        } catch (fallbackError) {
          console.error(`[WORKFLOW_EXTRACTOR] Recovery failed:`, fallbackError);
          throw new Error(
            `Invalid workflow extraction result: ${validationError.message}. ` +
            `Received keys: [${Object.keys(rawResult).join(', ')}]. ` +
            `Expected: treeName, treeDescription, blocks`
          );
        }
      } else {
        throw new Error(
          `Invalid workflow extraction result: response was ${typeof rawResult}. ` +
          `Expected object with treeName, treeDescription, and blocks fields.`
        );
      }
    }
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
 */
function buildUserPrompt(
  structuredDoc: StructuredDocument,
  formattedDocument: string,
  projectContext?: { name?: string; description?: string }
): string {
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

Extract this document into an experiment tree structure and return it as structured JSON.

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

EXAMPLE OUTPUT:

{
  "treeName": "Herbivory Effects on Submerged Aquatic Vegetation",
  "treeDescription": "Study examining how oil exposure affects herbivory patterns in aquatic plants",
  "blocks": [
    {
      "blockName": "Experimental Setup",
      "blockType": "protocol",
      "position": 1,
      "nodes": [
        {
          "nodeId": "node-1",
          "title": "Sample Collection",
          "content": {
            "text": "Submerged aquatic vegetation samples were collected from field sites"
          },
          "nodeType": "protocol",
          "status": "complete",
          "dependencies": [],
          "attachments": [],
          "parameters": {}
        }
      ]
    },
    {
      "blockName": "Data Analysis",
      "blockType": "analysis",
      "position": 2,
      "nodes": [
        {
          "nodeId": "node-2",
          "title": "Statistical Analysis",
          "content": {
            "text": "Data were analyzed using ANOVA to determine significant differences"
          },
          "nodeType": "analysis",
          "status": "complete",
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

IMPORTANT:
- Your response must be valid JSON
- You MUST include treeName, treeDescription, and blocks at the top level
- Do NOT return an array - return an object with these fields
- If you cannot find clear workflow steps, still return the structure with empty blocks array

Return only the JSON, no other text or markdown formatting.
`;
}

