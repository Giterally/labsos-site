import { getAIProviderInstance, OpenAIProvider } from './provider';
import { supabaseServer } from '../supabase-server';

export interface EmbeddingResult {
  id: string;
  embedding: number[];
  tokenCount: number;
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[];
  totalTokens: number;
  processingTime: number;
}

// Generate embeddings for a single text
export async function generateEmbedding(text: string): Promise<number[]> {
  // Always use OpenAI for embeddings - fail fast if not available
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for embedding generation. Please set your OpenAI API key in environment variables.');
  }
  
  const aiProvider = new OpenAIProvider();
  return await aiProvider.generateEmbedding(text);
}

// Generate embeddings for multiple texts in batch
export async function generateBatchEmbeddings(texts: string[]): Promise<BatchEmbeddingResult> {
  const startTime = Date.now();
  
  console.log(`[EMBEDDINGS] Starting batch embedding generation for ${texts.length} texts`);
  
  // Always use OpenAI for embeddings - fail fast if not available
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for embedding generation. Please set your OpenAI API key in environment variables.');
  }
  
  const aiProvider = new OpenAIProvider();
  const batchSize = 100; // OpenAI can handle larger batches
  console.log(`[EMBEDDINGS] Using OpenAI embeddings with batch size ${batchSize}`);
  const results: EmbeddingResult[] = [];
  let totalTokens = 0;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(`[EMBEDDINGS] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(texts.length/batchSize)} (${batch.length} texts)`);
    
    try {
      // Add timeout for each batch
      const batchPromise = aiProvider.generateEmbeddings(batch);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Embedding batch ${Math.floor(i/batchSize) + 1} timed out after 2 minutes`)), 2 * 60 * 1000)
      );
      
      const embeddings = await Promise.race([batchPromise, timeoutPromise]) as number[][];
      
      for (let j = 0; j < batch.length; j++) {
        const tokenCount = countTokens(batch[j]);
        totalTokens += tokenCount;
        
        results.push({
          id: `batch_${i}_${j}`,
          embedding: embeddings[j],
          tokenCount,
        });
      }
      
      console.log(`[EMBEDDINGS] Completed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(texts.length/batchSize)}`);
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`[EMBEDDINGS] Error processing batch ${Math.floor(i/batchSize) + 1}:`, error);
      throw new Error(`Failed to generate embeddings for batch ${Math.floor(i/batchSize) + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log(`[EMBEDDINGS] Completed embedding generation for ${texts.length} texts in ${Date.now() - startTime}ms`);
  
  return {
    embeddings: results,
    totalTokens,
    processingTime: Date.now() - startTime,
  };
}

// Store embeddings in the database
export async function storeEmbeddings(
  projectId: string,
  chunks: Array<{
    id: string;
    text: string;
    sourceType: string;
    sourceRef?: any;
    metadata?: any;
  }>
): Promise<void> {
  const texts = chunks.map(chunk => chunk.text);
  const { embeddings } = await generateBatchEmbeddings(texts);

  // Prepare data for database insertion
  const chunkData = chunks.map((chunk, index) => ({
    id: chunk.id,
    project_id: projectId,
    source_type: chunk.sourceType,
    source_ref: chunk.sourceRef,
    text: chunk.text,
    embedding: embeddings[index].embedding,
    metadata: {
      ...chunk.metadata,
      tokenCount: embeddings[index].tokenCount,
      embeddingModel: 'text-embedding-3-small', // Always use OpenAI for embeddings
    },
  }));

  // Insert chunks with embeddings
  const { error } = await supabaseServer
    .from('chunks')
    .insert(chunkData);

  if (error) {
    console.error('Error storing embeddings:', error);
    throw new Error(`Failed to store embeddings: ${error.message}`);
  }
}

// Count tokens in text (approximate)
export function countTokens(text: string): number {
  // Simple approximation: ~4 characters per token for English text
  // For more accurate counting, you could use tiktoken library
  return Math.ceil(text.length / 4);
}

// Find similar chunks using vector similarity
export async function findSimilarChunks(
  projectId: string,
  queryEmbedding: number[],
  limit: number = 10,
  threshold: number = 0.7
): Promise<Array<{
  id: string;
  text: string;
  sourceType: string;
  sourceRef: any;
  metadata: any;
  similarity: number;
}>> {
  const { data, error } = await supabaseServer.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
    project_id: projectId,
  });

  if (error) {
    console.error('Error finding similar chunks:', error);
    throw new Error(`Failed to find similar chunks: ${error.message}`);
  }

  return data || [];
}

// Create a database function for vector similarity search
export async function createSimilaritySearchFunction(): Promise<void> {
  const { error } = await supabaseServer.rpc('create_match_chunks_function');
  
  if (error) {
    console.error('Error creating similarity search function:', error);
    // Function might already exist, which is fine
  }
}