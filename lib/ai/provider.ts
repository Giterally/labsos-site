import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// AI Provider abstraction for easy swapping between providers
// 
// ARCHITECTURE:
// - OpenAI: Used exclusively for embeddings (text-embedding-3-small)
// - Claude: Used for text generation, synthesis, planning, and JSON generation
export interface AIProvider {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  generateText(prompt: string, options?: GenerateTextOptions): Promise<string>;
  generateJSON(prompt: string, schema?: any): Promise<any>;
}

export interface GenerateTextOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

/**
 * Wraps a promise with a timeout
 * If the promise doesn't resolve within the specified time, it rejects with a timeout error
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string = 'Operation'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    )
  ]);
}

// Claude implementation
export class ClaudeProvider implements AIProvider {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    this.client = new Anthropic({ apiKey });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Claude doesn't have embeddings API, so we'll use a text-based similarity approach
    // Generate a semantic summary that can be used for similarity matching
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Generate a concise semantic summary (max 50 words) that captures the key concepts and meaning of this text for similarity matching:\n\n${text}`
        }]
      });
      
      const summary = response.content[0].type === 'text' ? response.content[0].text : '';
      
      // Convert the summary to a simple vector representation
      // This is a basic approach - in production you might want to use a more sophisticated method
      const words = summary.toLowerCase().split(/\s+/).filter(word => word.length > 2);
      const vector = new Array(384).fill(0); // Standard embedding dimension
      
      // Simple hash-based vector generation
      words.forEach((word, index) => {
        const hash = this.simpleHash(word);
        const position = hash % 384;
        vector[position] += 1 / (index + 1); // Weight by position
      });
      
      // Normalize the vector
      const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
      return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
      
    } catch (error: any) {
      console.error('Claude embedding error:', error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Process embeddings in batches to avoid rate limits
    const batchSize = 5;
    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map(text => this.generateEmbedding(text));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const isLastAttempt = attempt === maxRetries;
        
        // Determine if error is retryable
        const isRateLimitError = error.status === 429 || error.message?.includes('rate_limit_error');
        const isServiceError = error.status === 503 || error.message?.includes('service unavailable');
        const isNetworkError = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message?.includes('network');
        const isRetryable = isRateLimitError || isServiceError || isNetworkError;
        
        // Log error details
        console.error(`[AI_PROVIDER] Error on attempt ${attempt + 1}/${maxRetries + 1}:`, {
          status: error.status,
          code: error.code,
          message: error.message,
          retryable: isRetryable,
        });
        
        // If not retryable or last attempt, throw immediately
        if (!isRetryable || isLastAttempt) {
          throw error;
        }
        
        // Calculate delay with exponential backoff
        let delay: number;
        if (isRateLimitError && error.headers?.['retry-after']) {
          // Use server-provided retry-after if available
          delay = parseInt(error.headers['retry-after']) * 1000;
        } else {
          // Exponential backoff: 1s, 2s, 4s, 8s...
          delay = baseDelay * Math.pow(2, attempt);
          // Add jitter to prevent thundering herd
          delay += Math.random() * 1000;
        }
        
        console.log(`[AI_PROVIDER] Retrying after ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 2}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  async generateText(prompt: string, options: GenerateTextOptions = {}): Promise<string> {
    return this.retryWithBackoff(async () => {
      const response = await this.client.messages.create({
        model: options.model || 'claude-3-haiku-20240307',
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.7,
        messages: [{ role: 'user', content: prompt }],
      });
      return response.content[0].type === 'text' ? response.content[0].text : '';
    });
  }

  async generateJSON(prompt: string, schema?: any): Promise<any> {
    return this.retryWithBackoff(async () => {
      // If schema provided, enhance the prompt with schema information
      let jsonPrompt = prompt;
      if (schema) {
        jsonPrompt = `${prompt}\n\nThe response must conform to this JSON schema:\n${JSON.stringify(schema, null, 2)}\n\nPlease respond with valid JSON that matches this schema. Do not include any markdown formatting or code blocks - just the raw JSON.`;
      } else {
        jsonPrompt = `${prompt}\n\nPlease respond with valid JSON. Do not include any markdown formatting or code blocks - just the raw JSON.`;
      }
      
      try {
        const response = await this.client.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 4096, // Maximum allowed for Claude 3 Haiku (model limit)
          temperature: 0.3, // Lower temperature for more consistent JSON
          messages: [{ role: 'user', content: jsonPrompt }],
        });
        
        // Check if response was truncated due to max_tokens limit
        const stopReason = response.stop_reason;
        if (stopReason === 'max_tokens') {
          const errorMessage = `The document is too large and the AI response was cut off. The workflow extraction requires more space than the current limit allows. This usually happens with very long documents like dissertations or research papers with many sections. Please try splitting the document into smaller parts, or contact support to increase the processing limit.`;
          console.error('[CLAUDE_PROVIDER] Response truncated due to max_tokens limit');
          throw new Error(errorMessage);
        }
        
        let content = response.content[0].type === 'text' ? response.content[0].text : '{}';
        
        // Clean up the content to extract JSON
        content = this.extractJSONFromResponse(content);
        
        try {
          return JSON.parse(content);
        } catch (parseError) {
          // Check if the JSON error suggests truncation (incomplete arrays/objects)
          const parseErrorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
          const isTruncationError = parseErrorMessage.includes('Expected') && 
                                   (parseErrorMessage.includes('after array element') || 
                                    parseErrorMessage.includes('after property') ||
                                    parseErrorMessage.includes('Unexpected end'));
          
          if (isTruncationError) {
            const errorMessage = `The document is too large and the AI response was cut off mid-way, resulting in incomplete JSON. This usually happens with very long documents like dissertations or research papers with many sections. The workflow extraction requires more space than the current limit allows. Please try splitting the document into smaller parts, or contact support to increase the processing limit.`;
            console.error('[CLAUDE_PROVIDER] JSON parsing failed - likely due to truncation:', {
              contentLength: content.length,
              error: parseErrorMessage,
            });
            throw new Error(errorMessage);
          }
          
          console.error('[CLAUDE_PROVIDER] Failed to parse JSON response:', {
            contentLength: content.length,
            contentPreview: content.substring(0, 200),
            error: parseErrorMessage,
          });
          throw new Error(`Invalid JSON response from Claude: ${parseErrorMessage}. Content preview: ${content.substring(0, 100)}...`);
        }
      } catch (error: any) {
        // Enhance error messages
        if (error.status === 429) {
          throw new Error('Rate limit exceeded: Claude API has too many requests. Please wait a few minutes and try again.');
        } else if (error.status === 401) {
          throw new Error('Authentication failed: ANTHROPIC_API_KEY is invalid or missing.');
        } else if (error.status === 500 || error.status === 529) {
          throw new Error('Claude API is experiencing issues. Please try again in a few minutes.');
        } else if (error.message?.includes('Invalid JSON')) {
          // Re-throw JSON parsing errors with context
          throw error;
        } else {
          throw new Error(`Claude API error: ${error.message || 'Unknown error'} (status: ${error.status || 'unknown'})`);
        }
      }
    });
  }

  private extractJSONFromResponse(content: string): string {
    // Remove markdown code blocks if present
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Find the first { and last } to extract JSON object
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      content = content.substring(firstBrace, lastBrace + 1);
    }
    
    // Clean up any remaining whitespace
    content = content.trim();
    
    return content;
  }
}

// OpenAI implementation
export class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    this.client = new OpenAI({ apiKey });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 384,  // Match database vector dimensions
    });
    return response.data[0].embedding;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
      dimensions: 384,  // Match database vector dimensions
    });
    return response.data.map(item => item.embedding);
  }

  async generateText(prompt: string, options: GenerateTextOptions = {}): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: options.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || 2000,
      temperature: options.temperature || 0.7,
    });
    return response.choices[0]?.message?.content || '';
  }

  async generateJSON(prompt: string, schema?: any): Promise<any> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Low temperature for consistency and exact extraction
    });
    
    const content = response.choices[0]?.message?.content || '{}';
    try {
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse JSON response:', content);
      throw new Error('Invalid JSON response from AI provider');
    }
  }
}

// Factory function to get the configured AI provider
export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER || 'claude';
  
  switch (provider) {
    case 'openai':
      return new OpenAIProvider();
    case 'claude':
      return new ClaudeProvider();
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

// Singleton instance
let aiProvider: AIProvider | null = null;

export function getAIProviderInstance(): AIProvider {
  if (!aiProvider) {
    aiProvider = getAIProvider();
  }
  return aiProvider;
}

// ============================================================================
// NEW: Workflow Extraction Provider Selection (GPT-4o/Gemini Hybrid)
// ============================================================================

import type { AIProvider as WorkflowAIProvider } from './base-provider';
import { OpenAIProvider as WorkflowOpenAIProvider } from './providers/openai-provider';
import { GeminiProvider as WorkflowGeminiProvider } from './providers/gemini-provider';
import type { StructuredDocument } from '../processing/parsers/pdf-parser';
import { estimateTokens } from './base-provider';

/**
 * Token threshold for switching from GPT-4o to Gemini
 * Lowered to 120K to account for full prompt overhead and avoid rate limits
 * GPT-4o works well up to ~150K tokens, but full prompt (doc + system + examples) can be 20-30% larger
 * Gemini handles up to 2M tokens and is cheaper for large documents
 */
const TOKEN_THRESHOLD_FOR_GEMINI = 120000;

/**
 * Rate limit tracking (in-memory, expires after 10 minutes)
 * Tracks when providers are rate limited to avoid selecting them proactively
 */
const rateLimitHistory = new Map<string, number>();

/**
 * Tracks when a provider is rate limited
 */
export function trackRateLimit(providerName: string): void {
  rateLimitHistory.set(providerName, Date.now());
  console.log(`[PROVIDER_TRACKING] Rate limit tracked for ${providerName}`);
}

/**
 * Checks if a provider was recently rate limited
 * @param providerName - Name of the provider ('openai', 'gemini', etc.)
 * @param windowMs - Time window in milliseconds (default: 10 minutes)
 * @returns true if provider was rate limited within the window
 */
export function isProviderRecentlyRateLimited(providerName: string, windowMs: number = 600000): boolean {
  const lastRateLimit = rateLimitHistory.get(providerName);
  if (!lastRateLimit) return false;
  const timeSinceRateLimit = Date.now() - lastRateLimit;
  const isRecent = timeSinceRateLimit < windowMs;
  if (isRecent) {
    console.log(`[PROVIDER_TRACKING] ${providerName} was rate limited ${Math.floor(timeSinceRateLimit / 1000)}s ago (within ${windowMs / 1000}s window)`);
  }
  return isRecent;
}

/**
 * Gets the fallback provider for a given provider
 * @param currentProvider - The current provider instance
 * @param document - The document being processed
 * @returns The fallback provider instance
 */
export function getFallbackProvider(
  currentProvider: WorkflowAIProvider,
  document: StructuredDocument
): WorkflowAIProvider {
  const currentModel = currentProvider.getModelInfo().name;
  const fallbackProvider = process.env.AI_FALLBACK_PROVIDER || 'gemini';
  
  if (currentModel.includes('gpt-4o') || currentModel.includes('openai')) {
    // OpenAI → Gemini fallback
    console.log(`[PROVIDER_FALLBACK] Switching from OpenAI to Gemini`);
    return new WorkflowGeminiProvider();
  } else if (currentModel.includes('gemini')) {
    // Gemini → OpenAI fallback (if configured)
    console.log(`[PROVIDER_FALLBACK] Switching from Gemini to OpenAI`);
    return new WorkflowOpenAIProvider();
  }
  
  // Default fallback to Gemini
  console.log(`[PROVIDER_FALLBACK] Using default fallback: Gemini`);
  return new WorkflowGeminiProvider();
}

/**
 * Determines if fallback should be attempted
 * @param currentProvider - The current provider instance
 * @param document - The document being processed
 * @returns true if fallback should be attempted
 */
export function shouldAttemptFallback(
  currentProvider: WorkflowAIProvider,
  document: StructuredDocument
): boolean {
  // Always attempt fallback for rate limits
  // Could add additional logic here (e.g., check document size, provider availability)
  return true;
}

/**
 * Estimate full prompt size including system prompt, user prompt structure, and examples
 * This is more accurate than just document size for provider selection
 */
function estimateFullPromptTokens(document: StructuredDocument): { documentTokens: number; estimatedFullPrompt: number } {
  // Document tokens
  const docSize = JSON.stringify(document).length;
  const documentTokens = Math.ceil(docSize / 4);
  
  // Prompt overhead:
  // - System prompt: ~500 tokens
  // - User prompt structure (examples, guidance, formatting): ~2000-3000 tokens
  // - Complexity-aware guidance (if applicable): ~500-1000 tokens
  // - Safety margin: 20% to account for variations
  const promptOverhead = 3500; // Conservative estimate
  const safetyMargin = 1.2; // 20% buffer
  
  const estimatedFullPrompt = Math.ceil((documentTokens + promptOverhead) * safetyMargin);
  
  return {
    documentTokens,
    estimatedFullPrompt
  };
}

/**
 * Select optimal AI provider based on document size for workflow extraction
 * Uses conservative token estimation to avoid rate limits and optimize cost
 */
export function selectProviderForDocument(
  document: StructuredDocument
): WorkflowAIProvider {
  const provider = process.env.AI_PRIMARY_PROVIDER || 'openai';
  const fallbackProvider = process.env.AI_FALLBACK_PROVIDER || 'gemini';
  
  // Estimate full prompt size (document + overhead)
  const { documentTokens, estimatedFullPrompt } = estimateFullPromptTokens(document);
  
  console.log(`[PROVIDER_SELECTION] Document tokens: ${documentTokens}, Estimated full prompt: ${estimatedFullPrompt} tokens`);
  
  // Decision logic: Use conservative threshold to avoid rate limits
  if (estimatedFullPrompt < TOKEN_THRESHOLD_FOR_GEMINI) {
    console.log(`[PROVIDER_SELECTION] Using ${provider} (estimated prompt < ${TOKEN_THRESHOLD_FOR_GEMINI} tokens)`);
    
    // Check if primary provider was recently rate limited
    if (provider === 'openai' && isProviderRecentlyRateLimited('openai')) {
      console.log(`[PROVIDER_SELECTION] OpenAI recently rate limited, using Gemini instead`);
      return new WorkflowGeminiProvider();
    }
    
    switch (provider.toLowerCase()) {
      case 'openai':
        return new WorkflowOpenAIProvider();
      case 'gemini':
        return new WorkflowGeminiProvider();
      default:
        console.warn(`[PROVIDER_SELECTION] Unknown provider "${provider}", defaulting to OpenAI`);
        return new WorkflowOpenAIProvider();
    }
  } else {
    console.log(`[PROVIDER_SELECTION] Document is large (${estimatedFullPrompt} tokens), using ${fallbackProvider} to avoid rate limits`);
    
    switch (fallbackProvider.toLowerCase()) {
      case 'gemini':
        return new WorkflowGeminiProvider();
      case 'openai':
        return new WorkflowOpenAIProvider();
      default:
        console.warn(`[PROVIDER_SELECTION] Unknown fallback provider "${fallbackProvider}", defaulting to Gemini`);
        return new WorkflowGeminiProvider();
    }
  }
}