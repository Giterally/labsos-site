import { supabaseServer } from '../supabase-server';

export interface ClusterResult {
  clusterId: string;
  chunkIds: string[];
  centroid: number[];
  size: number;
  avgSimilarity: number;
}

export interface ClusteringOptions {
  minClusterSize?: number;
  maxClusterSize?: number;
  similarityThreshold?: number;
  maxClusters?: number;
}

// Simple clustering algorithm using cosine similarity
export async function clusterChunks(
  projectId: string,
  options: ClusteringOptions = {}
): Promise<ClusterResult[]> {
  const {
    minClusterSize = 2,
    maxClusterSize = 10,
    similarityThreshold = 0.7,
    maxClusters = 20,
  } = options;

  // Get all chunks with embeddings for the project
  const { data: chunks, error } = await supabaseServer
    .from('chunks')
    .select('id, embedding, text, source_type, metadata')
    .eq('project_id', projectId)
    .not('embedding', 'is', null);

  if (error) {
    console.error('Error fetching chunks for clustering:', error);
    throw new Error(`Failed to fetch chunks: ${error.message}`);
  }

  if (!chunks || chunks.length === 0) {
    return [];
  }

  // Convert to array of embeddings with IDs
  const embeddings = chunks.map(chunk => ({
    id: chunk.id,
    embedding: chunk.embedding,
    text: chunk.text,
    sourceType: chunk.source_type,
    metadata: chunk.metadata,
  }));

  // Perform clustering
  const clusters = performClustering(embeddings, {
    minClusterSize,
    maxClusterSize,
    similarityThreshold,
    maxClusters,
  });

  return clusters;
}

// Simple agglomerative clustering implementation
function performClustering(
  embeddings: Array<{
    id: string;
    embedding: number[];
    text: string;
    sourceType: string;
    metadata: any;
  }>,
  options: ClusteringOptions
): ClusterResult[] {
  const { minClusterSize, maxClusterSize, similarityThreshold, maxClusters } = options;
  
  // Start with each embedding as its own cluster
  let clusters: Array<{
    id: string;
    chunkIds: string[];
    centroid: number[];
    embeddings: typeof embeddings;
  }> = embeddings.map((emb, index) => ({
    id: `cluster_${index}`,
    chunkIds: [emb.id],
    centroid: [...emb.embedding],
    embeddings: [emb],
  }));

  // Merge clusters until we can't find similar enough pairs
  while (clusters.length > 1 && clusters.length > maxClusters) {
    let bestMerge = null;
    let bestSimilarity = 0;

    // Find the most similar pair of clusters
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const similarity = cosineSimilarity(clusters[i].centroid, clusters[j].centroid);
        
        if (similarity > bestSimilarity && similarity >= similarityThreshold) {
          // Check if merge would exceed max cluster size
          const mergedSize = clusters[i].chunkIds.length + clusters[j].chunkIds.length;
          if (mergedSize <= maxClusterSize) {
            bestSimilarity = similarity;
            bestMerge = { i, j, similarity };
          }
        }
      }
    }

    if (!bestMerge) {
      break; // No more merges possible
    }

    // Merge the two clusters
    const { i, j, similarity } = bestMerge;
    const cluster1 = clusters[i];
    const cluster2 = clusters[j];

    // Calculate new centroid (weighted average)
    const newCentroid = cluster1.centroid.map((val, idx) => {
      const weight1 = cluster1.chunkIds.length;
      const weight2 = cluster2.chunkIds.length;
      return (val * weight1 + cluster2.centroid[idx] * weight2) / (weight1 + weight2);
    });

    const mergedCluster = {
      id: `cluster_${Date.now()}`,
      chunkIds: [...cluster1.chunkIds, ...cluster2.chunkIds],
      centroid: newCentroid,
      embeddings: [...cluster1.embeddings, ...cluster2.embeddings],
    };

    // Remove the two original clusters and add the merged one
    clusters = clusters.filter((_, index) => index !== i && index !== j);
    clusters.push(mergedCluster);
  }

  // Filter out clusters that are too small
  const validClusters = clusters.filter(cluster => cluster.chunkIds.length >= minClusterSize);

  // Convert to ClusterResult format
  return validClusters.map(cluster => ({
    clusterId: cluster.id,
    chunkIds: cluster.chunkIds,
    centroid: cluster.centroid,
    size: cluster.chunkIds.length,
    avgSimilarity: calculateAvgSimilarity(cluster.embeddings, cluster.centroid),
  }));
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

// Calculate average similarity within a cluster
function calculateAvgSimilarity(
  embeddings: Array<{ embedding: number[] }>,
  centroid: number[]
): number {
  if (embeddings.length === 0) return 0;

  const similarities = embeddings.map(emb => cosineSimilarity(emb.embedding, centroid));
  return similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
}

// Store clustering results in the database
export async function storeClusteringResults(
  projectId: string,
  clusters: ClusterResult[]
): Promise<void> {
  // Store cluster metadata in a jobs result or separate table
  const { error } = await supabaseServer
    .from('jobs')
    .insert({
      type: 'cluster',
      status: 'completed',
      project_id: projectId,
      result: {
        clusters: clusters.map(cluster => ({
          clusterId: cluster.clusterId,
          chunkIds: cluster.chunkIds,
          size: cluster.size,
          avgSimilarity: cluster.avgSimilarity,
        })),
        totalClusters: clusters.length,
        totalChunks: clusters.reduce((sum, cluster) => sum + cluster.size, 0),
      },
    });

  if (error) {
    console.error('Error storing clustering results:', error);
    throw new Error(`Failed to store clustering results: ${error.message}`);
  }
}

// Get chunks for a specific cluster
export async function getClusterChunks(
  projectId: string,
  clusterId: string
): Promise<Array<{
  id: string;
  text: string;
  sourceType: string;
  sourceRef: any;
  metadata: any;
}>> {
  // This would typically be stored in a separate table or retrieved from job results
  // For now, we'll implement a simple lookup
  const { data: job, error } = await supabaseServer
    .from('jobs')
    .select('result')
    .eq('project_id', projectId)
    .eq('type', 'cluster')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !job?.result?.clusters) {
    throw new Error('No clustering results found');
  }

  const cluster = job.result.clusters.find((c: any) => c.clusterId === clusterId);
  if (!cluster) {
    throw new Error(`Cluster ${clusterId} not found`);
  }

  // Get the actual chunk data
  const { data: chunks, error: chunksError } = await supabaseServer
    .from('chunks')
    .select('id, text, source_type, source_ref, metadata')
    .eq('project_id', projectId)
    .in('id', cluster.chunkIds);

  if (chunksError) {
    throw new Error(`Failed to fetch cluster chunks: ${chunksError.message}`);
  }

  return chunks || [];
}