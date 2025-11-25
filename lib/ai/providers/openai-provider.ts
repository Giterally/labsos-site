import OpenAI from 'openai';
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

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(model: string = 'gpt-4o-2024-08-06') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async extractWorkflowFromDocument(
    document: StructuredDocument,
    projectContext?: { name?: string; description?: string },
    complexity?: { estimatedNodeCount: number; extractionStrategy: 'simple' | 'moderate' | 'complex' | 'comprehensive' }
  ): Promise<WorkflowExtractionResult> {
    const formattedDoc = formatStructuredDocumentForLLM(document);
    const userPrompt = buildUserPrompt(document, formattedDoc, projectContext, complexity);
    const systemPrompt = WORKFLOW_EXTRACTION_SYSTEM_PROMPT;
    
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const estimatedInputTokens = estimateTokens(fullPrompt);
    
    console.log(`[OPENAI] Extracting workflow using ${this.model}`);
    console.log(`[OPENAI] Estimated input tokens: ${estimatedInputTokens}`);
    
    return withRetry(async () => {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 16384, // 4x Claude Haiku!
          temperature: 0.0, // Maximum determinism for consistent extraction
          response_format: { type: 'json_object' }, // Ensures valid JSON
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: userPrompt
            }
          ]
        });
        
        const content = response.choices[0]?.message?.content;
        
        if (!content) {
          throw new Error('Empty response from OpenAI');
        }
        
        const finishReason = response.choices[0]?.finish_reason;
        console.log(`[OPENAI] ✅ Generated ${content.length} characters`);
        console.log(`[OPENAI] Finish reason: ${finishReason}`);
        
        // Check if response was truncated
        // Note: finish_reason can be 'stop', 'length', 'tool_calls', 'content_filter', 'function_call'
        // 'length' indicates truncation due to max_tokens
        if (finishReason === 'length') {
          throw new Error(
            'Document too large for GPT-4o (exceeded 16K output limit). ' +
            'The workflow extraction requires more space than the current limit allows. ' +
            'This usually happens with very long documents like dissertations or research papers with many sections. ' +
            'Please try splitting the document into smaller parts, or contact support to increase the processing limit.'
          );
        }
        
        // Check if content appears truncated (doesn't end with closing brace)
        const trimmedContent = content.trim();
        const lastChar = trimmedContent[trimmedContent.length - 1];
        const isLikelyTruncated = lastChar !== '}' && lastChar !== ']';
        
        // Parse JSON response
        let result: any;
        try {
          result = JSON.parse(content);
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
          
          // Detect truncation errors
          const isTruncationError = 
            errorMessage.includes('Unterminated string') ||
            errorMessage.includes('Unexpected end') ||
            (errorMessage.includes('Expected') && errorMessage.includes('after')) ||
            isLikelyTruncated ||
            (finishReason as string) === 'length';
          
          if (isTruncationError) {
            throw new Error(
              'Document too large for GPT-4o (exceeded 16K output limit). ' +
              'The workflow extraction requires more space than the current limit allows. ' +
              'The JSON response was cut off mid-way, resulting in incomplete data. ' +
              'This usually happens with very long documents like dissertations or research papers with many sections. ' +
              'Please try splitting the document into smaller parts, or the system will automatically retry with Gemini (which has a higher output limit).'
            );
          }
          
          throw new Error(
            `Failed to parse OpenAI response as JSON: ${errorMessage}. ` +
            `This may indicate the response was truncated. Content preview: ${content.substring(0, 200)}...`
          );
        }
        
        // Validate with Zod schema
        const validatedResult = WorkflowExtractionResultSchema.parse(result);
        
        const totalNodes = validatedResult.blocks.reduce((sum, b) => sum + (b.nodes?.length || 0), 0);
        console.log(`[OPENAI] ✅ Extracted ${validatedResult.blocks.length} blocks, ${totalNodes} nodes`);
        
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
        
      } catch (error) {
        if (error instanceof OpenAI.APIError) {
          console.error(`[OPENAI] API error: ${error.status} - ${error.message}`);
          
          // Handle rate limit errors with specific guidance
          if (error.status === 429) {
            // Track the rate limit for intelligent provider selection
            trackRateLimit('openai');
            
            const retryAfter = error.headers?.['retry-after'] 
              ? parseInt(error.headers['retry-after'], 10) 
              : null;
            
            const rateLimitMessage = retryAfter
              ? `OpenAI rate limit reached (retry-after: ${retryAfter}s). Automatically falling back to Gemini...`
              : `OpenAI rate limit reached. Automatically falling back to Gemini...`;
            
            throw new Error(rateLimitMessage);
          }
          
          // Handle other API errors
          throw new Error(
            `OpenAI API error: ${error.message} (status: ${error.status}). Please check your API key and account limits.`
          );
        }
        
        // Re-throw validation errors with context
        if (error instanceof Error && error.message.includes('parse')) {
          throw error;
        }
        
        throw error;
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
    
    console.log(`[OPENAI] Discovering workflow phases from ${documents.length} document(s)`);
    
    return withRetry(async () => {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 4096,
          temperature: 0.0, // Maximum determinism for consistent extraction
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: userPrompt
            }
          ]
        });
        
        const content = response.choices[0]?.message?.content;
        
        if (!content) {
          throw new Error('Empty response from OpenAI');
        }
        
        console.log(`[OPENAI] ✅ Discovery response: ${content.length} characters`);
        
        // Parse JSON response
        let result: any;
        try {
          result = JSON.parse(content);
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
          throw new Error(
            `Failed to parse discovery response: ${errorMessage}. Content preview: ${content.substring(0, 200)}...`
          );
        }
        
        // Validate with Zod schema
        const validatedResult = WorkflowDiscoveryResultSchema.parse(result);
        
        // Log costs
        const inputTokens = response.usage?.prompt_tokens || estimateTokens(userPrompt + systemPrompt);
        const outputTokens = response.usage?.completion_tokens || estimateTokens(content);
        const modelInfo = this.getModelInfo();
        const cost = (inputTokens / 1000000) * modelInfo.costPerMillionInputTokens + (outputTokens / 1000000) * modelInfo.costPerMillionOutputTokens;
        
        console.log(`[DISCOVERY] OpenAI cost: $${cost.toFixed(4)} (${inputTokens} in, ${outputTokens} out)`);
        console.log(`[DISCOVERY] Found ${validatedResult.phases.length} phases, estimated ${validatedResult.estimatedTotalNodes} total nodes`);
        
        return validatedResult;
        
      } catch (error) {
        if (error instanceof OpenAI.APIError) {
          console.error(`[OPENAI] Discovery API error: ${error.status} - ${error.message}`);
          
          if (error.status === 429) {
            trackRateLimit('openai');
            throw new Error('OpenAI rate limit reached during discovery. Please try again later.');
          }
          
          throw new Error(
            `OpenAI API error during discovery: ${error.message} (status: ${error.status})`
          );
        }
        
        throw error;
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
    
    console.log(`[PHASE_EXTRACTOR] Extracting phase: "${input.phaseName}" (${input.estimatedNodeCount} nodes expected)`);
    
    return withRetry(async () => {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 16384,
          temperature: 0.0, // Maximum determinism for consistent extraction
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: userPrompt
            }
          ]
        });
        
        const content = response.choices[0]?.message?.content;
        
        if (!content) {
          throw new Error('No response from OpenAI');
        }
        
        let result: any;
        try {
          result = JSON.parse(content);
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
          throw new Error(
            `Failed to parse phase extraction response: ${errorMessage}. Content preview: ${content.substring(0, 200)}...`
          );
        }
        
        let validatedResult: PhaseExtractionResult;
        try {
          validatedResult = PhaseExtractionResultSchema.parse(result);
        } catch (validationError: any) {
          // Log the problematic data for debugging
          console.error(`[PHASE_EXTRACTOR] Validation error for phase "${input.phaseName}":`, validationError.message);
          if (result.nodes && Array.isArray(result.nodes)) {
            result.nodes.forEach((node: any, idx: number) => {
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
        
        // Log costs
        const inputTokens = response.usage?.prompt_tokens || estimateTokens(userPrompt + systemPrompt);
        const outputTokens = response.usage?.completion_tokens || estimateTokens(content);
        const modelInfo = this.getModelInfo();
        const cost = (inputTokens / 1000000) * modelInfo.costPerMillionInputTokens + (outputTokens / 1000000) * modelInfo.costPerMillionOutputTokens;
        
        console.log(`[PHASE_EXTRACTOR] Phase "${input.phaseName}": $${cost.toFixed(4)} (${inputTokens} in, ${outputTokens} out)`);
        console.log(`[PHASE_EXTRACTOR] Extracted ${validatedResult.nodes.length} nodes (expected ${input.estimatedNodeCount})`);
        
        return validatedResult;
        
      } catch (error) {
        if (error instanceof OpenAI.APIError) {
          console.error(`[OPENAI] Phase extraction API error: ${error.status} - ${error.message}`);
          
          if (error.status === 429) {
            trackRateLimit('openai');
            throw new Error('OpenAI rate limit reached during phase extraction. Please try again later.');
          }
          
          throw new Error(
            `OpenAI API error during phase extraction: ${error.message} (status: ${error.status})`
          );
        }
        
        throw error;
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
    
    console.log(`[VERIFICATION] Checking completeness of ${extractedBlocks.length} blocks...`);
    
    return withRetry(async () => {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 4096,
          temperature: 0.0, // Maximum determinism for consistent extraction
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: userPrompt
            }
          ]
        });
        
        const content = response.choices[0]?.message?.content;
        
        if (!content) {
          throw new Error('No response from OpenAI');
        }
        
        let result: any;
        try {
          result = JSON.parse(content);
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
          throw new Error(
            `Failed to parse verification response: ${errorMessage}. Content preview: ${content.substring(0, 200)}...`
          );
        }
        
        const validatedResult = WorkflowVerificationResultSchema.parse(result);
        
        // Log results
        const inputTokens = response.usage?.prompt_tokens || estimateTokens(userPrompt + systemPrompt);
        const outputTokens = response.usage?.completion_tokens || estimateTokens(content);
        const modelInfo = this.getModelInfo();
        const cost = (inputTokens / 1000000) * modelInfo.costPerMillionInputTokens + (outputTokens / 1000000) * modelInfo.costPerMillionOutputTokens;
        
        console.log(`[VERIFICATION] Cost: $${cost.toFixed(4)} (${inputTokens} in, ${outputTokens} out)`);
        console.log(`[VERIFICATION] Quality score: ${validatedResult.qualityScore}/10`);
        console.log(`[VERIFICATION] Missing items: ${validatedResult.missingContent.length}`);
        console.log(`[VERIFICATION] Misplaced nodes: ${validatedResult.misplacedNodes.length}`);
        console.log(`[VERIFICATION] Duplicate nodes: ${validatedResult.duplicateNodes.length}`);
        
        return validatedResult;
        
      } catch (error) {
        if (error instanceof OpenAI.APIError) {
          console.error(`[OPENAI] Verification API error: ${error.status} - ${error.message}`);
          
          if (error.status === 429) {
            trackRateLimit('openai');
            throw new Error('OpenAI rate limit reached during verification. Please try again later.');
          }
          
          throw new Error(
            `OpenAI API error during verification: ${error.message} (status: ${error.status})`
          );
        }
        
        throw error;
      }
    });
  }

  getModelInfo(): ModelInfo {
    return {
      name: this.model,
      maxInputTokens: 128000,
      maxOutputTokens: 16384,
      costPerMillionInputTokens: 2.50,
      costPerMillionOutputTokens: 10.00
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

