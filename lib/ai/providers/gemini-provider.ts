import { GoogleGenerativeAI } from '@google/generative-ai';
import type { StructuredDocument } from '../../processing/parsers/pdf-parser';
import type { WorkflowExtractionResult } from '../schemas/workflow-extraction-schema';
import type { AIProvider, ModelInfo } from '../base-provider';
import { estimateTokens, withRetry } from '../base-provider';
import { WORKFLOW_EXTRACTION_SYSTEM_PROMPT } from '../prompts/workflow-extraction-system';
import { formatStructuredDocumentForLLM, buildUserPrompt } from '../workflow-extractor';
import { WorkflowExtractionResultSchema } from '../schemas/workflow-extraction-schema';

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;
  private model: any;
  private modelName: string;

  constructor(modelName: string = 'gemini-1.5-pro') {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY environment variable is required');
    }
    
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
    this.model = this.client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json' // JSON mode
      }
    });
  }

  async extractWorkflowFromDocument(
    document: StructuredDocument,
    projectContext?: { name?: string; description?: string },
    complexity?: { estimatedNodeCount: number; extractionStrategy: 'simple' | 'moderate' | 'complex' | 'comprehensive' }
  ): Promise<WorkflowExtractionResult> {
    const formattedDoc = formatStructuredDocumentForLLM(document);
    const userPrompt = buildUserPrompt(document, formattedDoc, projectContext, complexity);
    const systemPrompt = WORKFLOW_EXTRACTION_SYSTEM_PROMPT;
    
    // Gemini combines system and user prompts into a single content string
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const estimatedInputTokens = estimateTokens(fullPrompt);
    
    console.log(`[GEMINI] Extracting workflow using ${this.modelName}`);
    console.log(`[GEMINI] Estimated input tokens: ${estimatedInputTokens}`);
    
    return withRetry(async () => {
      try {
        const result = await this.model.generateContent(fullPrompt);
        
        const response = result.response;
        const content = response.text();
        
        if (!content) {
          throw new Error('Empty response from Gemini');
        }
        
        console.log(`[GEMINI] ✅ Generated ${content.length} characters`);
        
        // Parse JSON response
        let extracted: any;
        try {
          extracted = JSON.parse(content);
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
          throw new Error(
            `Failed to parse Gemini response as JSON: ${errorMessage}. ` +
            `The response may be malformed or truncated. Content preview: ${content.substring(0, 200)}...`
          );
        }
        
        // Validate with Zod schema
        const validatedResult = WorkflowExtractionResultSchema.parse(extracted);
        
        // Validate structure
        if (!validatedResult.blocks || !Array.isArray(validatedResult.blocks)) {
          throw new Error('Invalid response structure: missing blocks array');
        }
        
        const totalNodes = validatedResult.blocks.reduce((sum, b) => sum + (b.nodes?.length || 0), 0);
        console.log(`[GEMINI] ✅ Extracted ${validatedResult.blocks.length} blocks, ${totalNodes} nodes`);
        
        // Log cost and token usage
        const outputTokens = estimateTokens(JSON.stringify(validatedResult));
        const modelInfo = this.getModelInfo();
        const estimatedCost = (
          (estimatedInputTokens / 1000000) * modelInfo.costPerMillionInputTokens +
          (outputTokens / 1000000) * modelInfo.costPerMillionOutputTokens
        );
        
        console.log(`[COST] Estimated: $${estimatedCost.toFixed(4)} (${estimatedInputTokens} in, ${outputTokens} out)`);
        console.log(`[TOKENS] Input: ${estimatedInputTokens}, Output: ${outputTokens}`);
        
        return validatedResult;
        
      } catch (error: any) {
        console.error(`[GEMINI] Error:`, error);
        
        // Handle Gemini-specific errors
        if (error.message?.includes('quota') || error.message?.includes('Quota')) {
          throw new Error('Gemini API quota exceeded. Please try again later or contact support.');
        }
        
        if (error instanceof SyntaxError) {
          throw new Error(
            `Failed to parse Gemini response as JSON: ${error.message}. ` +
            `The response may be malformed or truncated.`
          );
        }
        
        throw new Error(`Gemini API error: ${error.message || 'Unknown error'}`);
      }
    });
  }

  getModelInfo(): ModelInfo {
    return {
      name: this.modelName,
      maxInputTokens: 2000000, // 2M context!
      maxOutputTokens: 8192,
      costPerMillionInputTokens: 1.25,
      costPerMillionOutputTokens: 5.00
    };
  }

  estimateTokens(document: StructuredDocument): number {
    const formattedDoc = formatStructuredDocumentForLLM(document);
    const userPrompt = buildUserPrompt(document, formattedDoc, undefined);
    const systemPrompt = WORKFLOW_EXTRACTION_SYSTEM_PROMPT;
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    return estimateTokens(fullPrompt);
  }
}

