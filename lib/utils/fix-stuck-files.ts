import { supabaseServer } from '../supabase-server';

/**
 * Utility function to fix files that are stuck in 'processing' status
 * This can be called manually or through an API endpoint to recover stuck files
 */
export async function fixStuckFiles(projectId: string, maxAgeMinutes: number = 30) {
  try {
    console.log(`[FIX STUCK FILES] Looking for files stuck in processing for more than ${maxAgeMinutes} minutes`);
    
    // Find files that have been in 'processing' status for more than maxAgeMinutes
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
    
    const { data: stuckFiles, error: fetchError } = await supabaseServer
      .from('ingestion_sources')
      .select('id, source_name, status, updated_at, created_at')
      .eq('project_id', projectId)
      .eq('status', 'processing')
      .lt('updated_at', cutoffTime);

    if (fetchError) {
      console.error('[FIX STUCK FILES] Error fetching stuck files:', fetchError);
      throw new Error(`Failed to fetch stuck files: ${fetchError.message}`);
    }

    if (!stuckFiles || stuckFiles.length === 0) {
      console.log('[FIX STUCK FILES] No stuck files found');
      return { fixedCount: 0, message: 'No stuck files found' };
    }

    console.log(`[FIX STUCK FILES] Found ${stuckFiles.length} stuck files:`, stuckFiles.map(f => f.source_name));

    // Update stuck files to 'failed' status with appropriate error message
    const { data: updatedFiles, error: updateError } = await supabaseServer
      .from('ingestion_sources')
      .update({ 
        status: 'failed',
        error_message: `Processing timed out after ${maxAgeMinutes} minutes. File may have been stuck due to network issues or API timeouts.`,
        updated_at: new Date().toISOString()
      })
      .eq('project_id', projectId)
      .eq('status', 'processing')
      .lt('updated_at', cutoffTime)
      .select('id, source_name');

    if (updateError) {
      console.error('[FIX STUCK FILES] Error updating stuck files:', updateError);
      throw new Error(`Failed to update stuck files: ${updateError.message}`);
    }

    console.log(`[FIX STUCK FILES] Successfully fixed ${updatedFiles?.length || 0} stuck files`);
    
    return {
      fixedCount: updatedFiles?.length || 0,
      fixedFiles: updatedFiles?.map(f => f.source_name) || [],
      message: `Fixed ${updatedFiles?.length || 0} stuck files`
    };

  } catch (error) {
    console.error('[FIX STUCK FILES] Error fixing stuck files:', error);
    throw error;
  }
}

/**
 * Get statistics about file processing status for a project
 */
export async function getFileProcessingStats(projectId: string) {
  try {
    const { data: stats, error } = await supabaseServer
      .from('ingestion_sources')
      .select('status, count(*)')
      .eq('project_id', projectId)
      .group('status');

    if (error) {
      console.error('[FILE STATS] Error fetching file stats:', error);
      throw new Error(`Failed to fetch file stats: ${error.message}`);
    }

    return stats || [];
  } catch (error) {
    console.error('[FILE STATS] Error getting file processing stats:', error);
    throw error;
  }
}
