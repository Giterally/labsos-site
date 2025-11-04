import { inngest, Events } from './client';
import { supabaseServer } from '../supabase-server';
import { generateEmbeddings, countTokens } from '@/lib/ai/embeddings';
import { chunkText, chunkCode, chunkTable } from '@/lib/ingestion/chunker';
import { clusterChunks } from '@/lib/ai/clustering';
import { synthesizeNode } from '@/lib/ai/synthesis';
import { calculateConfidence } from '@/lib/ai/confidence';
import { preprocessFile as preprocessFileUnified } from '@/lib/processing/preprocessing-pipeline';

// Job status helpers
async function updateJobStatus(
  jobId: string,
  status: 'running' | 'completed' | 'failed',
  result?: any,
  error?: string
) {
  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'running') {
    updateData.started_at = new Date().toISOString();
  } else if (status === 'completed') {
    updateData.completed_at = new Date().toISOString();
    updateData.result = result;
  } else if (status === 'failed') {
    updateData.completed_at = new Date().toISOString();
    updateData.error = error;
  }

  await supabaseServer
    .from('jobs')
    .update(updateData)
    .eq('id', jobId);
}

// Preprocess file function
export const preprocessFile = inngest.createFunction(
  { id: 'preprocess-file' },
  { event: 'ingestion/preprocess-file' },
  async ({ event, step }) => {
    const { sourceId, projectId, sourceType, storagePath, metadata } = event.data;

    return await step.run('preprocess-file', async () => {
      let job: any = null;
      try {
        // Create job record
        const { data: jobData } = await supabaseServer
          .from('jobs')
          .insert({
            type: 'preprocess',
            status: 'running',
            payload: { sourceId, sourceType, storagePath, metadata },
            project_id: projectId,
          })
          .select()
          .single();

        if (!jobData) throw new Error('Failed to create job record');
        job = jobData;

        // Update source status to processing
        // Note: The unified preprocessFile function will also update status, but we do it here
        // for immediate feedback and to match the old behavior
        await supabaseServer
          .from('ingestion_sources')
          .update({ status: 'processing', updated_at: new Date().toISOString() })
          .eq('id', sourceId);

        // Use unified preprocessing pipeline (creates StructuredDocument)
        // This function handles all file types, creates StructuredDocument objects,
        // stores them in structured_documents table, and updates source status
        console.log(`[INNGEST] Starting unified preprocessing for source: ${sourceId}`);
        await preprocessFileUnified(sourceId, projectId);
        console.log(`[INNGEST] Unified preprocessing completed for source: ${sourceId}`);
        
        // Update job status
        await updateJobStatus(job.id, 'completed', { 
          message: 'Preprocessing completed successfully',
        });

        return { success: true, jobId: job.id };
      } catch (error) {
        console.error('[INNGEST] Preprocessing error:', error);
        
        // Update job status for Inngest observability
        // Note: The unified preprocessFile function already handles source status updates
        if (job) {
          await updateJobStatus(job.id, 'failed', null, error instanceof Error ? error.message : String(error));
        }

        throw error;
      }
    });
  }
);

// Placeholder functions for other pipeline steps
export const transcribeVideo = inngest.createFunction(
  { id: 'transcribe-video' },
  { event: 'ingestion/transcribe-video' },
  async ({ event, step }) => {
    return await step.run('transcribe-video', async () => {
      console.log('Video transcription not implemented yet');
      return { success: true, message: 'Placeholder' };
    });
  }
);

export const processChunks = inngest.createFunction(
  { id: 'process-chunks' },
  { event: 'ingestion/process-chunks' },
  async ({ event, step }) => {
    const { sourceId, projectId, preprocessedContent } = event.data;

    return await step.run('process-chunks', async () => {
      let job: any = null;
      try {
        // Create job record
        const { data: jobData } = await supabaseServer
          .from('jobs')
          .insert({
            type: 'chunk',
            status: 'running',
            payload: { sourceId, preprocessedContent },
            project_id: projectId,
          })
          .select()
          .single();

        if (!jobData) throw new Error('Failed to create job record');
        job = jobData;

        console.log(`Processing chunks for source: ${sourceId}`);
        
        // Get source information
        const { data: source } = await supabaseServer
          .from('ingestion_sources')
          .select('source_type, source_name, metadata')
          .eq('id', sourceId)
          .single();

        if (!source) throw new Error('Source not found');

        // Chunk the content based on type
        const chunks = [];
        
        if (preprocessedContent.text) {
          const textChunks = chunkText(
            preprocessedContent.text,
            source.source_type,
            { sourceId, sourceName: source.source_name },
            { maxTokens: 800, overlapTokens: 100 }
          );
          chunks.push(...textChunks);
        }

        if (preprocessedContent.code) {
          const codeChunks = chunkCode(
            preprocessedContent.code,
            source.source_type,
            { sourceId, sourceName: source.source_name },
            { maxTokens: 800, overlapTokens: 100 }
          );
          chunks.push(...codeChunks);
        }

        if (preprocessedContent.tables) {
          for (const table of preprocessedContent.tables) {
            const tableChunks = chunkTable(
              table,
              source.source_type,
              { sourceId, sourceName: source.source_name },
              { maxTokens: 800, overlapTokens: 100 }
            );
            chunks.push(...tableChunks);
          }
        }
        
        // Update job status
        await updateJobStatus(job.id, 'completed', { 
          message: 'Chunk processing completed',
          chunkCount: chunks.length
        });

        // Trigger embedding generation
        await inngest.send({
          name: 'ingestion/generate-embeddings',
          data: {
            sourceId,
            projectId,
            chunks: chunks.map(chunk => ({
              id: chunk.id,
              text: chunk.text,
              sourceType: chunk.metadata.sourceType,
              sourceRef: chunk.metadata.sourceRef,
              metadata: chunk.metadata,
            })),
          },
        });

        return { success: true, jobId: job.id, chunkCount: chunks.length };
      } catch (error) {
        console.error('Chunk processing error:', error);
        throw error;
      }
    });
  }
);

export const generateEmbeddings = inngest.createFunction(
  { id: 'generate-embeddings' },
  { event: 'ingestion/generate-embeddings' },
  async ({ event, step }) => {
    const { sourceId, projectId, chunks } = event.data;

    return await step.run('generate-embeddings', async () => {
      let job: any = null;
      try {
        // Create job record
        const { data: jobData } = await supabaseServer
          .from('jobs')
          .insert({
            type: 'embed',
            status: 'running',
            payload: { sourceId, chunkCount: chunks.length },
            project_id: projectId,
          })
          .select()
          .single();

        if (!jobData) throw new Error('Failed to create job record');
        job = jobData;

        console.log(`Generating embeddings for ${chunks.length} chunks`);

        // Generate embeddings for all chunks
        const texts = chunks.map(chunk => chunk.text);
        const { embeddings, totalTokens } = await generateBatchEmbeddings(texts);

        // Store chunks with embeddings in database
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
            embeddingModel: 'text-embedding-3-small',
          },
        }));

        const { error: insertError } = await supabaseServer
          .from('chunks')
          .insert(chunkData);

        if (insertError) {
          throw new Error(`Failed to store chunks: ${insertError.message}`);
        }

        // Update job status
        await updateJobStatus(job.id, 'completed', { 
          message: 'Embedding generation completed',
          chunkCount: chunks.length,
          totalTokens
        });

        // Trigger clustering
        await inngest.send({
          name: 'ingestion/cluster-chunks',
          data: {
            sourceId,
            projectId,
            chunkIds: chunks.map(chunk => chunk.id),
          },
        });

        return { success: true, jobId: job.id, chunkCount: chunks.length };
      } catch (error) {
        console.error('Embedding generation error:', error);
        throw error;
      }
    });
  }
);

export const clusterChunks = inngest.createFunction(
  { id: 'cluster-chunks' },
  { event: 'ingestion/cluster-chunks' },
  async ({ event, step }) => {
    const { sourceId, projectId, chunkIds } = event.data;

    return await step.run('cluster-chunks', async () => {
      let job: any = null;
      try {
        // Create job record
        const { data: jobData } = await supabaseServer
          .from('jobs')
          .insert({
            type: 'cluster',
            status: 'running',
            payload: { sourceId, chunkIds },
            project_id: projectId,
          })
          .select()
          .single();

        if (!jobData) throw new Error('Failed to create job record');
        job = jobData;

        console.log(`Clustering chunks for project: ${projectId}`);

        // Perform clustering
        const clusters = await clusterChunks(projectId, {
          minClusterSize: 2,
          maxClusterSize: 10,
          similarityThreshold: 0.7,
          maxClusters: 20,
        });

        // Store clustering results
        await storeClusteringResults(projectId, clusters);

        // Update job status
        await updateJobStatus(job.id, 'completed', { 
          message: 'Clustering completed',
          clusterCount: clusters.length,
          totalChunks: clusters.reduce((sum, cluster) => sum + cluster.size, 0)
        });

        // Trigger node synthesis for each cluster
        for (const cluster of clusters) {
          await inngest.send({
            name: 'ingestion/synthesize-nodes',
            data: {
              sourceId,
              projectId,
              clusterId: cluster.clusterId,
              chunkIds: cluster.chunkIds,
            },
          });
        }

        return { success: true, jobId: job.id, clusterCount: clusters.length };
      } catch (error) {
        console.error('Clustering error:', error);
        throw error;
      }
    });
  }
);

export const synthesizeNodes = inngest.createFunction(
  { id: 'synthesize-nodes' },
  { event: 'ingestion/synthesize-nodes' },
  async ({ event, step }) => {
    const { sourceId, projectId, clusterId, chunkIds } = event.data;

    return await step.run('synthesize-nodes', async () => {
      let job: any = null;
      try {
        // Create job record
        const { data: jobData } = await supabaseServer
          .from('jobs')
          .insert({
            type: 'synthesize',
            status: 'running',
            payload: { sourceId, clusterId, chunkIds },
            project_id: projectId,
          })
          .select()
          .single();

        if (!jobData) throw new Error('Failed to create job record');
        job = jobData;

        console.log(`Synthesizing nodes for cluster: ${clusterId}`);

        // Get chunks for this cluster
        const { data: chunks, error: chunksError } = await supabaseServer
          .from('chunks')
          .select('id, text, source_type, source_ref, metadata')
          .eq('project_id', projectId)
          .in('id', chunkIds);

        if (chunksError || !chunks) {
          throw new Error(`Failed to fetch chunks: ${chunksError?.message}`);
        }

        // Get project context
        const { data: project } = await supabaseServer
          .from('projects')
          .select('name, description')
          .eq('id', projectId)
          .single();

        // Synthesize node from chunks
        const synthesizedNode = await synthesizeNode({
          chunks: chunks.map(chunk => ({
            id: chunk.id,
            text: chunk.text,
            sourceType: chunk.source_type,
            sourceRef: chunk.source_ref,
            metadata: chunk.metadata,
          })),
          projectContext: project ? {
            name: project.name,
            description: project.description,
          } : undefined,
        });

        // Calculate confidence
        const confidence = calculateConfidence(synthesizedNode);

        // Store synthesized node
        const nodeId = await storeSynthesizedNode(projectId, synthesizedNode, 'proposed');

        // Update job status
        await updateJobStatus(job.id, 'completed', { 
          message: 'Node synthesis completed',
          nodeId,
          confidence
        });

        return { success: true, jobId: job.id, nodeId, confidence };
      } catch (error) {
        console.error('Node synthesis error:', error);
        throw error;
      }
    });
  }
);