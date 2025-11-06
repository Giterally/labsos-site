import type { StructuredDocument } from '../processing/parsers/pdf-parser';
import type { WorkflowExtractionResult } from './schemas/workflow-extraction-schema';

export interface ModelInfo {
  name: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  costPerMillionInputTokens: number;
  costPerMillionOutputTokens: number;
}

export interface AIProvider {
  /**
   * Extract workflow structure from a document
   */
  extractWorkflowFromDocument(
    document: StructuredDocument,
    projectContext?: { name?: string; description?: string },
    complexity?: { estimatedNodeCount: number; extractionStrategy: 'simple' | 'moderate' | 'complex' | 'comprehensive' }
  ): Promise<WorkflowExtractionResult>;
  
  /**
   * Get model capabilities and pricing info
   */
  getModelInfo(): ModelInfo;
  
  /**
   * Estimate tokens for a document
   */
  estimateTokens(document: StructuredDocument): number;
}

/**
 * Rough token estimation: 1 token ≈ 4 characters
 */
export function estimateTokens(text: string | object): number {
  const str = typeof text === 'string' ? text : JSON.stringify(text);
  return Math.ceil(str.length / 4);
}

/**
 * Retry wrapper with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const isLastAttempt = attempt === retries;
      
      // Determine if error is retryable
      const errorMessage = (error as any)?.message || '';
      const errorStatus = (error as any)?.status;
      const isRateLimitError = errorStatus === 429 || errorMessage.includes('rate_limit') || errorMessage.includes('quota') || errorMessage.includes('Rate limit');
      const isServiceError = errorStatus === 503 || errorMessage.includes('service unavailable');
      const isNetworkError = (error as any)?.code === 'ECONNRESET' || (error as any)?.code === 'ETIMEDOUT' || errorMessage.includes('network');
      const isRetryable = isRateLimitError || isServiceError || isNetworkError;
      
      // Log error details
      console.error(`[RETRY] Error on attempt ${attempt + 1}/${retries + 1}:`, {
        status: errorStatus,
        code: (error as any)?.code,
        message: errorMessage,
        retryable: isRetryable,
      });
      
      // If not retryable or last attempt, throw immediately
      if (!isRetryable || isLastAttempt) {
        throw error;
      }
      
      // For rate limit errors, respect retry-after header if available
      let delay = baseDelay * Math.pow(2, attempt);
      if (isRateLimitError) {
        const retryAfter = (error as any)?.headers?.['retry-after'] 
          ? parseInt((error as any).headers['retry-after'], 10) * 1000
          : null;
        
        if (retryAfter) {
          // Use retry-after if it's longer than our exponential backoff
          delay = Math.max(delay, retryAfter);
          console.log(`[RETRY] Rate limit detected, using retry-after: ${retryAfter / 1000}s`);
        } else {
          // For rate limits without retry-after, use longer delays
          delay = Math.max(delay, 30000); // Minimum 30 seconds for rate limits
        }
      }
      
      // Add jitter to prevent thundering herd (10% of delay)
      const jitter = delay * 0.1 * Math.random();
      const delayWithJitter = delay + jitter;
      
      console.log(`[RETRY] Retrying after ${(delayWithJitter / 1000).toFixed(1)}s (attempt ${attempt + 2}/${retries + 1})`);
      await new Promise(resolve => setTimeout(resolve, delayWithJitter));
    }
  }
  
  throw lastError!;
}

