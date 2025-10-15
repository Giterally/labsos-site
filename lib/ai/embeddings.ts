import { getAIProviderInstance } from './provider';
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
  const aiProvider = getAIProviderInstance();
  return await aiProvider.generateEmbedding(text);
}

// Generate embeddings for multiple texts in batch
export async function generateBatchEmbeddings(texts: string[]): Promise<BatchEmbeddingResult> {
  const startTime = Date.now();
  const aiProvider = getAIProviderInstance();
  
  // Generate embeddings in batches to avoid rate limits
  const batchSize = 5; // Smaller batch size for Claude to avoid rate limits
  const results: EmbeddingResult[] = [];
  let totalTokens = 0;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await aiProvider.generateEmbeddings(batch);
    
    for (let j = 0; j < batch.length; j++) {
      const tokenCount = countTokens(batch[j]);
      totalTokens += tokenCount;
      
      results.push({
        id: `batch_${i}_${j}`,
        embedding: embeddings[j],
        tokenCount,
      });
    }
  }

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
      embeddingModel: 'claude-3-5-sonnet-20241022',
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