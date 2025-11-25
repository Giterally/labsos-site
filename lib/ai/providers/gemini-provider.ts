import { GoogleGenerativeAI } from '@google/generative-ai';
import type { StructuredDocument } from '../../processing/parsers/pdf-parser';
import type { WorkflowExtractionResult } from '../schemas/workflow-extraction-schema';
import type { WorkflowDiscoveryResult } from '../schemas/workflow-discovery-schema';
import type { PhaseExtractionInput, PhaseExtractionResult } from '../schemas/workflow-phase-extraction-schema';
import type { WorkflowVerificationResult } from '../schemas/workflow-verification-schema';
import type { AIProvider, ModelInfo } from '../base-provider';
import { estimateTokens, withRetry } from '../base-provider';
import { WORKFLOW_EXTRACTION_SYSTEM_PROMPT } from '../prompts/workflow-extraction-system';
import { WORKFLOW_DISCOVERY_SYSTEM_PROMPT, buildDiscoveryPrompt } from '../prompts/workflow-discovery-prompt';
import { WORKFLOW_PHASE_EXTRACTION_SYSTEM_PROMPT, buildPhaseExtractionPrompt } from '../prompts/workflow-phase-extraction-prompt';
import { WORKFLOW_VERIFICATION_SYSTEM_PROMPT, buildVerificationPrompt } from '../prompts/workflow-verification-prompt';
import { formatStructuredDocumentForLLM, buildUserPrompt } from '../workflow-extractor';
import { WorkflowExtractionResultSchema } from '../schemas/workflow-extraction-schema';
import { WorkflowDiscoveryResultSchema } from '../schemas/workflow-discovery-schema';
import { PhaseExtractionResultSchema } from '../schemas/workflow-phase-extraction-schema';
import { WorkflowVerificationResultSchema } from '../schemas/workflow-verification-schema';
import { trackRateLimit } from '../provider';

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
        temperature: 0.0, // Maximum determinism for consistent extraction
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
        
        // Check for rate limit errors (429 status or quota/quota exceeded messages)
        const isRateLimit = (error as any)?.status === 429 || 
          error.message?.includes('quota') || 
          error.message?.includes('Quota') ||
          error.message?.includes('rate limit') ||
          error.message?.includes('Rate limit');
        
        if (isRateLimit) {
          // Track the rate limit for intelligent provider selection
          trackRateLimit('gemini');
        }
        
        // Handle Gemini-specific errors
        if (error.message?.includes('quota') || error.message?.includes('Quota')) {
          throw new Error('Gemini API quota exceeded. Automatically falling back to OpenAI...');
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

  /**
   * Phase 1: Discovery - Identify major workflow phases
   */
  async discoverWorkflowPhases(
    documents: StructuredDocument[]
  ): Promise<WorkflowDiscoveryResult> {
    const systemPrompt = WORKFLOW_DISCOVERY_SYSTEM_PROMPT;
    const userPrompt = buildDiscoveryPrompt(documents);
    
    // Gemini combines system and user prompts into a single content string
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    
    console.log(`[GEMINI] Discovering workflow phases from ${documents.length} document(s)`);
    
    return withRetry(async () => {
      try {
        const result = await this.model.generateContent(fullPrompt);
        
        const response = result.response;
        const content = response.text();
        
        if (!content) {
          throw new Error('Empty response from Gemini');
        }
        
        console.log(`[GEMINI] ✅ Discovery response: ${content.length} characters`);
        
        // Parse JSON response
        let extracted: any;
        try {
          extracted = JSON.parse(content);
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
          throw new Error(
            `Failed to parse discovery response: ${errorMessage}. Content preview: ${content.substring(0, 200)}...`
          );
        }
        
        // Validate with Zod schema
        const validatedResult = WorkflowDiscoveryResultSchema.parse(extracted);
        
        // Log costs (estimated)
        const estimatedInputTokens = estimateTokens(fullPrompt);
        const estimatedOutputTokens = estimateTokens(content);
        const modelInfo = this.getModelInfo();
        const cost = (estimatedInputTokens / 1000000) * modelInfo.costPerMillionInputTokens + (estimatedOutputTokens / 1000000) * modelInfo.costPerMillionOutputTokens;
        
        console.log(`[DISCOVERY] Gemini cost: $${cost.toFixed(4)} (${estimatedInputTokens} in, ${estimatedOutputTokens} out)`);
        console.log(`[DISCOVERY] Found ${validatedResult.phases.length} phases, estimated ${validatedResult.estimatedTotalNodes} total nodes`);
        
        return validatedResult;
        
      } catch (error: any) {
        console.error(`[GEMINI] Discovery error:`, error);
        
        // Check for rate limit errors
        const isRateLimit = (error as any)?.status === 429 || 
          error.message?.includes('quota') || 
          error.message?.includes('Quota') ||
          error.message?.includes('rate limit') ||
          error.message?.includes('Rate limit');
        
        if (isRateLimit) {
          trackRateLimit('gemini');
          throw new Error('Gemini API quota exceeded during discovery. Please try again later.');
        }
        
        if (error instanceof SyntaxError) {
          throw new Error(
            `Failed to parse Gemini discovery response as JSON: ${error.message}`
          );
        }
        
        throw new Error(`Gemini API error during discovery: ${error.message || 'Unknown error'}`);
      }
    });
  }

  /**
   * Phase 2: Extract nodes for a single phase
   */
  async extractPhase(
    input: PhaseExtractionInput
  ): Promise<PhaseExtractionResult> {
    const systemPrompt = WORKFLOW_PHASE_EXTRACTION_SYSTEM_PROMPT;
    const userPrompt = buildPhaseExtractionPrompt(input);
    
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    
    console.log(`[PHASE_EXTRACTOR] Extracting phase: "${input.phaseName}" (${input.estimatedNodeCount} nodes expected)`);
    
    return withRetry(async () => {
      try {
        const result = await this.model.generateContent(fullPrompt);
        
        const response = result.response;
        const content = response.text();
        
        if (!content) {
          throw new Error('No response from Gemini');
        }
        
        let extracted: any;
        try {
          extracted = JSON.parse(content);
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
          throw new Error(
            `Failed to parse phase extraction response: ${errorMessage}. Content preview: ${content.substring(0, 200)}...`
          );
        }
        
        let validatedResult: PhaseExtractionResult;
        try {
          validatedResult = PhaseExtractionResultSchema.parse(extracted);
        } catch (validationError: any) {
          // Log the problematic data for debugging
          console.error(`[PHASE_EXTRACTOR] Validation error for phase "${input.phaseName}":`, validationError.message);
          if (extracted.nodes && Array.isArray(extracted.nodes)) {
            extracted.nodes.forEach((node: any, idx: number) => {
              if (node.dependencies && Array.isArray(node.dependencies)) {
                const badDeps = node.dependencies.filter((d: any) => typeof d === 'string');
                if (badDeps.length > 0) {
                  console.error(`[PHASE_EXTRACTOR] Node ${idx} ("${node.title}") has ${badDeps.length} string dependencies:`, badDeps);
                }
              }
            });
          }
          throw validationError;
        }
        
        // Log costs (estimated)
        const estimatedInputTokens = estimateTokens(fullPrompt);
        const estimatedOutputTokens = estimateTokens(content);
        const modelInfo = this.getModelInfo();
        const cost = (estimatedInputTokens / 1000000) * modelInfo.costPerMillionInputTokens + (estimatedOutputTokens / 1000000) * modelInfo.costPerMillionOutputTokens;
        
        console.log(`[PHASE_EXTRACTOR] Phase "${input.phaseName}": $${cost.toFixed(4)} (${estimatedInputTokens} in, ${estimatedOutputTokens} out)`);
        console.log(`[PHASE_EXTRACTOR] Extracted ${validatedResult.nodes.length} nodes (expected ${input.estimatedNodeCount})`);
        
        return validatedResult;
        
      } catch (error: any) {
        console.error(`[GEMINI] Phase extraction error:`, error);
        
        // Check for rate limit errors
        const isRateLimit = (error as any)?.status === 429 || 
          error.message?.includes('quota') || 
          error.message?.includes('Quota') ||
          error.message?.includes('rate limit') ||
          error.message?.includes('Rate limit');
        
        if (isRateLimit) {
          trackRateLimit('gemini');
          throw new Error('Gemini API quota exceeded during phase extraction. Please try again later.');
        }
        
        if (error instanceof SyntaxError) {
          throw new Error(
            `Failed to parse Gemini phase extraction response as JSON: ${error.message}`
          );
        }
        
        throw new Error(`Gemini API error during phase extraction: ${error.message || 'Unknown error'}`);
      }
    });
  }

  /**
   * Phase 3: Verify completeness and identify gaps
   */
  async verifyCompleteness(
    discoveryResult: WorkflowDiscoveryResult,
    extractedBlocks: PhaseExtractionResult[]
  ): Promise<WorkflowVerificationResult> {
    const systemPrompt = WORKFLOW_VERIFICATION_SYSTEM_PROMPT;
    const userPrompt = buildVerificationPrompt(discoveryResult, extractedBlocks);
    
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    
    console.log(`[VERIFICATION] Checking completeness of ${extractedBlocks.length} blocks...`);
    
    return withRetry(async () => {
      try {
        const result = await this.model.generateContent(fullPrompt);
        
        const response = result.response;
        const content = response.text();
        
        if (!content) {
          throw new Error('No response from Gemini');
        }
        
        let extracted: any;
        try {
          extracted = JSON.parse(content);
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
          throw new Error(
            `Failed to parse verification response: ${errorMessage}. Content preview: ${content.substring(0, 200)}...`
          );
        }
        
        const validatedResult = WorkflowVerificationResultSchema.parse(extracted);
        
        // Log results
        const estimatedInputTokens = estimateTokens(fullPrompt);
        const estimatedOutputTokens = estimateTokens(content);
        const modelInfo = this.getModelInfo();
        const cost = (estimatedInputTokens / 1000000) * modelInfo.costPerMillionInputTokens + (estimatedOutputTokens / 1000000) * modelInfo.costPerMillionOutputTokens;
        
        console.log(`[VERIFICATION] Cost: $${cost.toFixed(4)} (${estimatedInputTokens} in, ${estimatedOutputTokens} out)`);
        console.log(`[VERIFICATION] Quality score: ${validatedResult.qualityScore}/10`);
        console.log(`[VERIFICATION] Missing items: ${validatedResult.missingContent.length}`);
        console.log(`[VERIFICATION] Misplaced nodes: ${validatedResult.misplacedNodes.length}`);
        console.log(`[VERIFICATION] Duplicate nodes: ${validatedResult.duplicateNodes.length}`);
        
        return validatedResult;
        
      } catch (error: any) {
        console.error(`[GEMINI] Verification error:`, error);
        
        // Check for rate limit errors
        const isRateLimit = (error as any)?.status === 429 || 
          error.message?.includes('quota') || 
          error.message?.includes('Quota') ||
          error.message?.includes('rate limit') ||
          error.message?.includes('Rate limit');
        
        if (isRateLimit) {
          trackRateLimit('gemini');
          throw new Error('Gemini API quota exceeded during verification. Please try again later.');
        }
        
        if (error instanceof SyntaxError) {
          throw new Error(
            `Failed to parse Gemini verification response as JSON: ${error.message}`
          );
        }
        
        throw new Error(`Gemini API error during verification: ${error.message || 'Unknown error'}`);
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

