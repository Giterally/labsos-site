import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// AI Provider abstraction for easy swapping between providers
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
        model: 'claude-3-5-sonnet-20241022',
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

  async generateText(prompt: string, options: GenerateTextOptions = {}): Promise<string> {
    const response = await this.client.messages.create({
      model: options.model || 'claude-3-5-sonnet-20241022',
      max_tokens: options.maxTokens || 2000,
      temperature: options.temperature || 0.7,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  async generateJSON(prompt: string, schema?: any): Promise<any> {
    const jsonPrompt = `${prompt}\n\nPlease respond with valid JSON${schema ? ` that matches this schema: ${JSON.stringify(schema, null, 2)}` : ''}.`;
    
    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0.3, // Lower temperature for more consistent JSON
      messages: [{ role: 'user', content: jsonPrompt }],
    });
    
    const content = response.content[0].type === 'text' ? response.content[0].text : '{}';
    try {
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse JSON response from Claude:', content);
      throw new Error('Invalid JSON response from Claude');
    }
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
    });
    return response.data[0].embedding;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
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
      temperature: 0.3, // Lower temperature for more consistent JSON
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