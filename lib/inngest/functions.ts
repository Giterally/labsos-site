import { inngest, Events } from './client';
import { supabaseServer } from '../supabase-server';
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
    const { sourceId, userId, sourceType, storagePath, metadata } = event.data;

    return await step.run('preprocess-file', async () => {
      let job: any = null;
      try {
        // Create job record (jobs may still reference projects, but preprocessing is user-scoped)
        const { data: jobData } = await supabaseServer
          .from('jobs')
          .insert({
            type: 'preprocess',
            status: 'running',
            payload: { sourceId, sourceType, storagePath, metadata, userId },
            project_id: null, // Preprocessing is user-scoped, not project-scoped
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
        await preprocessFileUnified(sourceId, userId);
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