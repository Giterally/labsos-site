import { supabaseServer } from '../supabase-server';
import { preprocessText } from '../ingestion/preprocessors/text';
import { chunkText } from '../ingestion/chunker';
import { generateBatchEmbeddings } from '../ai/embeddings';

export async function preprocessFile(sourceId: string, projectId: string) {
  const startTime = Date.now();
  
  // Wrap in timeout to prevent hanging
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Preprocessing timeout after 5 minutes')), 5 * 60 * 1000);
  });
  
  const processingPromise = (async () => {
    try {
      console.log(`[PREPROCESSING] Starting preprocessing for source: ${sourceId}`);

      // Get source information
      const { data: source, error: sourceError } = await supabaseServer
        .from('ingestion_sources')
        .select('*')
        .eq('id', sourceId)
        .single();

      if (sourceError || !source) {
        const errorMsg = `Source not found: ${sourceError?.message || 'Unknown error'}`;
        console.error(`[PREPROCESSING] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      console.log(`[PREPROCESSING] Found source: ${source.source_name} (${source.source_type})`);

      // Update status to processing
      const { error: updateError } = await supabaseServer
        .from('ingestion_sources')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', sourceId);

      if (updateError) {
        console.error('[PREPROCESSING] Failed to update status to processing:', updateError);
        throw new Error(`Failed to update status: ${updateError.message}`);
      }

      console.log(`[PREPROCESSING] Status updated to 'processing'`);

      // Step 1: Preprocess the file
      console.log(`[PREPROCESSING] Step 1/4: Preprocessing ${source.source_type} file`);
      let preprocessedContent: { text?: string; tables?: string[][][]; code?: string; needsTranscription?: boolean; metadata?: any } = {};

      if (source.source_type === 'text' || source.source_type === 'markdown') {
        // For text files, read from storage
        console.log(`[PREPROCESSING] Downloading file from storage: ${source.storage_path}`);
        const { data: fileData, error: downloadError } = await supabaseServer.storage
          .from('project-uploads')
          .download(source.storage_path!);

        if (downloadError || !fileData) {
          const errorMsg = `Failed to download file from storage: ${downloadError?.message || 'Unknown error'}`;
          console.error(`[PREPROCESSING] ${errorMsg}`);
          throw new Error(errorMsg);
        }

        const text = await fileData.text();
        console.log(`[PREPROCESSING] File downloaded successfully, size: ${text.length} characters`);
        preprocessedContent = { text };
      } else {
        const errorMsg = `Unsupported source type for preprocessing: ${source.source_type}`;
        console.error(`[PREPROCESSING] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // Step 2: Chunk the content
      console.log(`[PREPROCESSING] Step 2/4: Chunking content`);
      const chunks = chunkText(
        preprocessedContent.text!,
        source.source_type,
        { sourceId, sourceName: source.source_name },
        { maxTokens: 800, overlapTokens: 100 }
      );

      console.log(`[PREPROCESSING] Generated ${chunks.length} chunks successfully`);

      // Step 3: Generate embeddings with timeout protection
      console.log(`[PREPROCESSING] Step 3/4: Generating embeddings for ${chunks.length} chunks`);
      const texts = chunks.map(chunk => chunk.text);
      
      // Add timeout protection for embeddings generation
      const embeddingsTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Embeddings generation timed out after 5 minutes')), 5 * 60 * 1000)
      );
      
      const { embeddings, totalTokens } = await Promise.race([
        generateBatchEmbeddings(texts),
        embeddingsTimeoutPromise
      ]) as any;
      
      console.log(`[PREPROCESSING] Generated ${embeddings.length} embeddings, total tokens: ${totalTokens}`);

      // Step 4: Store chunks with embeddings
      console.log(`[PREPROCESSING] Step 4/4: Storing ${chunks.length} chunks with embeddings`);
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
        const errorMsg = `Failed to store chunks in database: ${insertError.message}`;
        console.error(`[PREPROCESSING] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      console.log(`[PREPROCESSING] Successfully stored ${chunks.length} chunks with embeddings`);

      // Step 5: Update source status to completed
      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[PREPROCESSING] Updating source status to completed (processing time: ${processingTime}s)`);
      
      const { error: finalUpdateError } = await supabaseServer
        .from('ingestion_sources')
        .update({ 
          status: 'completed', 
          updated_at: new Date().toISOString(),
          metadata: { 
            ...source.metadata, 
            preprocessed: true,
            chunksGenerated: chunks.length,
            totalTokens: totalTokens,
            processingTimeSeconds: parseFloat(processingTime)
          }
        })
        .eq('id', sourceId);

      if (finalUpdateError) {
        const errorMsg = `Failed to update source status to completed: ${finalUpdateError.message}`;
        console.error(`[PREPROCESSING] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      console.log(`[PREPROCESSING] ✓ Preprocessing completed successfully for source ${sourceId}`);
      console.log(`[PREPROCESSING] Summary: ${chunks.length} chunks, ${totalTokens} tokens, ${processingTime}s`);

      return {
        success: true,
        chunksGenerated: chunks.length,
        totalTokens: totalTokens,
        processingTimeSeconds: parseFloat(processingTime),
      };

    } catch (error: any) {
      console.error(`[PREPROCESSING] ✗ Error preprocessing source ${sourceId}:`, error);
      console.error(`[PREPROCESSING] Error details:`, {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      });

      // Update source status to failed - ensure this always happens
      try {
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const errorMessage = error.message || 'Unknown error occurred during preprocessing';
        
        const { error: updateError } = await supabaseServer
          .from('ingestion_sources')
          .update({ 
            status: 'failed', 
            error_message: errorMessage,
            updated_at: new Date().toISOString(),
            metadata: {
              failedAt: new Date().toISOString(),
              processingTimeSeconds: parseFloat(processingTime),
              errorType: error.name || 'Error',
            }
          })
          .eq('id', sourceId);

        if (updateError) {
          console.error('[PREPROCESSING] Failed to update status to failed:', updateError);
        } else {
          console.log(`[PREPROCESSING] Updated source ${sourceId} status to failed`);
        }
      } catch (statusUpdateError) {
        console.error('[PREPROCESSING] Critical error updating status to failed:', statusUpdateError);
      }

      throw error;
    }
  })();
  
  // Race between processing and timeout
  try {
    return await Promise.race([processingPromise, timeoutPromise]) as any;
  } catch (error: any) {
    // If timeout or other error, ensure status is updated
    console.error(`[PREPROCESSING] Preprocessing failed or timed out for source ${sourceId}`);
    
    // Update status to failed if timeout
    if (error.message?.includes('timeout')) {
      try {
        await supabaseServer
          .from('ingestion_sources')
          .update({ 
            status: 'failed', 
            error_message: error.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', sourceId);
      } catch (updateError) {
        console.error('[PREPROCESSING] Failed to update timeout status:', updateError);
      }
    }
    
    throw error;
  }
}
