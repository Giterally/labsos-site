import { supabaseServer } from '../supabase-server';
import { preprocessText } from '../ingestion/preprocessors/text';
import { chunkText } from '../ingestion/chunker';
import { generateBatchEmbeddings } from '../ai/embeddings';
import { clusterChunks, storeClusteringResults } from '../ai/clustering';
import { synthesizeNode, storeSynthesizedNode, calculateConfidence } from '../ai/synthesis';

export async function processFileLocally(sourceId: string, projectId: string) {
  try {
    console.log(`[LOCAL PIPELINE] Starting processing for source: ${sourceId}`);

    // Get source information
    const { data: source, error: sourceError } = await supabaseServer
      .from('ingestion_sources')
      .select('*')
      .eq('id', sourceId)
      .single();

    if (sourceError || !source) {
      throw new Error(`Source not found: ${sourceError?.message}`);
    }

    // Update status to processing
    await supabaseServer
      .from('ingestion_sources')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', sourceId);

    // Step 1: Preprocess the file
    console.log(`[LOCAL PIPELINE] Preprocessing ${source.source_type} file`);
    let preprocessedContent: { text?: string; tables?: string[][][]; code?: string; needsTranscription?: boolean; metadata?: any } = {};

    if (source.source_type === 'text' || source.source_type === 'markdown') {
      // For text files, read from storage
      const { data: fileData, error: downloadError } = await supabaseServer.storage
        .from('project-uploads')
        .download(source.storage_path!);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file: ${downloadError?.message}`);
      }

      const text = await fileData.text();
      preprocessedContent = { text };
    } else {
      throw new Error(`Unsupported source type for local processing: ${source.source_type}`);
    }

    // Step 2: Chunk the content
    console.log(`[LOCAL PIPELINE] Chunking content`);
    const chunks = chunkText(
      preprocessedContent.text!,
      source.source_type,
      { sourceId, sourceName: source.source_name },
      { maxTokens: 800, overlapTokens: 100 }
    );

    console.log(`[LOCAL PIPELINE] Generated ${chunks.length} chunks`);

    // Step 3: Generate embeddings
    console.log(`[LOCAL PIPELINE] Generating embeddings`);
    const texts = chunks.map(chunk => chunk.text);
    const { embeddings, totalTokens } = await generateBatchEmbeddings(texts);

    // Store chunks with embeddings
    const chunkData = chunks.map((chunk, index) => ({
      id: chunk.id,
      project_id: projectId,
      source_type: chunk.metadata.sourceType,
      source_ref: chunk.metadata.sourceRef,
      text: chunk.text,
      embedding: embeddings[index].embedding,
      metadata: {
        ...chunk.metadata,
        tokenCount: embeddings[index].tokenCount,
        embeddingModel: process.env.OPENAI_API_KEY ? 'text-embedding-3-small' : 'claude-3-haiku-20240307',
      },
    }));

    const { error: insertError } = await supabaseServer
      .from('chunks')
      .insert(chunkData);

    if (insertError) {
      throw new Error(`Failed to store chunks: ${insertError.message}`);
    }

    console.log(`[LOCAL PIPELINE] Stored ${chunks.length} chunks with embeddings`);

    // Step 4: Cluster chunks
    console.log(`[LOCAL PIPELINE] Clustering chunks`);
    const clusters = await clusterChunks(projectId, {
      minClusterSize: 2,
      maxClusterSize: 10,
      similarityThreshold: 0.7,
      maxClusters: 20,
    });

    await storeClusteringResults(projectId, clusters);
    console.log(`[LOCAL PIPELINE] Generated ${clusters.length} clusters`);

    // Step 5: Synthesize nodes from clusters
    console.log(`[LOCAL PIPELINE] Synthesizing nodes`);
    const proposedNodes = [];

    // Handle single chunks that didn't get clustered
    if (chunks.length === 1 && clusters.length === 0) {
      console.log(`[LOCAL PIPELINE] Single chunk detected, creating individual node`);
      
      // Get project context
      const { data: project } = await supabaseServer
        .from('projects')
        .select('name, description')
        .eq('id', projectId)
        .single();

      // Create a mock cluster for the single chunk
      const singleChunk = chunks[0];
      const mockCluster = {
        id: `single_${singleChunk.id}`,
        chunks: [{
          id: singleChunk.id,
          text: singleChunk.text,
          sourceType: singleChunk.metadata.sourceType,
          sourceRef: singleChunk.metadata.sourceRef,
          metadata: singleChunk.metadata,
        }],
        centroid: embeddings[0].embedding,
        size: 1,
        coherence: 1.0,
      };

      // Synthesize node from single chunk
      const synthesizedNode = await synthesizeNode({
        chunks: mockCluster.chunks,
        projectContext: project ? {
          name: project.name,
          description: project.description,
        } : undefined,
      });
      
      // Calculate confidence
      const confidence = calculateConfidence(synthesizedNode);

      // Store synthesized node
      const nodeId = await storeSynthesizedNode(
        projectId,
        synthesizedNode,
        'proposed'
      );
      proposedNodes.push({ nodeId, confidence });

      console.log(`[LOCAL PIPELINE] Synthesized single-chunk node ${nodeId} with confidence ${confidence}`);
    }

    // Process regular clusters
    for (const cluster of clusters) {
      // Get chunks for this cluster
      const { data: clusterChunks, error: chunksError } = await supabaseServer
        .from('chunks')
        .select('id, text, source_type, source_ref, metadata')
        .eq('project_id', projectId)
        .in('id', cluster.chunkIds);

      if (chunksError || !clusterChunks) {
        console.error(`Failed to fetch chunks for cluster ${cluster.clusterId}:`, chunksError);
        continue;
      }

      // Get project context
      const { data: project } = await supabaseServer
        .from('projects')
        .select('name, description')
        .eq('id', projectId)
        .single();

      // Create cluster object for synthesis
      const clusterObj = {
        id: cluster.clusterId,
        chunks: clusterChunks.map(chunk => ({
          id: chunk.id,
          text: chunk.text,
          sourceType: chunk.source_type,
          sourceRef: chunk.source_ref,
          metadata: chunk.metadata,
        })),
        centroid: cluster.centroid,
        size: cluster.size,
        coherence: cluster.coherence,
      };

      // Synthesize node from chunks
      const synthesizedNode = await synthesizeNode({
        chunks: clusterObj.chunks,
        projectContext: project ? {
          name: project.name,
          description: project.description,
        } : undefined,
      });

      // Calculate confidence
      const confidence = calculateConfidence(synthesizedNode);

      // Store synthesized node
      const nodeId = await storeSynthesizedNode(
        projectId,
        synthesizedNode,
        'proposed'
      );
      proposedNodes.push({ nodeId, confidence });

      console.log(`[LOCAL PIPELINE] Synthesized node ${nodeId} with confidence ${confidence}`);
    }

    // Step 6: Update source status to completed
    await supabaseServer
      .from('ingestion_sources')
      .update({ 
        status: 'completed', 
        updated_at: new Date().toISOString(),
        metadata: { 
          ...source.metadata, 
          processed: true,
          chunksGenerated: chunks.length,
          clustersGenerated: clusters.length,
          nodesGenerated: proposedNodes.length
        }
      })
      .eq('id', sourceId);

    console.log(`[LOCAL PIPELINE] Processing completed for source ${sourceId}`);
    console.log(`[LOCAL PIPELINE] Generated ${chunks.length} chunks, ${clusters.length} clusters, ${proposedNodes.length} proposed nodes`);

    return {
      success: true,
      chunksGenerated: chunks.length,
      clustersGenerated: clusters.length,
      nodesGenerated: proposedNodes.length,
    };

  } catch (error: any) {
    console.error(`[LOCAL PIPELINE] Error processing source ${sourceId}:`, error);

    // Update source status to failed
    await supabaseServer
      .from('ingestion_sources')
      .update({ 
        status: 'failed', 
        error_message: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', sourceId);

    throw error;
  }
}
