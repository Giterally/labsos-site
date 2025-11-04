import { supabaseServer } from '../supabase-server';
import { parsePDF } from './parsers/pdf-parser';
import { parseExcel } from './parsers/excel-parser';
import { parseVideo, parseAudio } from './parsers/video-parser';
import { parseText } from './parsers/text-parser';
import type { StructuredDocument } from './parsers/pdf-parser';

export async function preprocessFile(sourceId: string, projectId: string) {
  const startTime = Date.now();
  
  // Wrap in timeout to prevent hanging
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Preprocessing timeout after 10 minutes')), 10 * 60 * 1000);
  });
  
  const processingPromise = (async () => {
    // Declare source outside try block so it's accessible in catch
    let source: any = null;
    
    try {
      console.log(`[PREPROCESSING] ========================================`);
      console.log(`[PREPROCESSING] Starting structure-aware preprocessing for source: ${sourceId}`);
      console.log(`[PREPROCESSING] Timestamp: ${new Date().toISOString()}`);
      console.log(`[PREPROCESSING] ========================================`);

      // Get source information
      const { data: fetchedSource, error: sourceError } = await supabaseServer
        .from('ingestion_sources')
        .select('*')
        .eq('id', sourceId)
        .single();

      if (sourceError || !fetchedSource) {
        const errorMsg = `Source not found: ${sourceError?.message || 'Unknown error'}`;
        console.error(`[PREPROCESSING] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      source = fetchedSource;

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

      // Step 1: Parse file with structure-aware parser
      console.log(`[PREPROCESSING] Step 1/2: Parsing ${source.source_type} file with structure preservation`);
      
      if (!source.storage_path) {
        throw new Error('Source storage path is missing');
      }

      let structuredDoc: StructuredDocument;

      switch (source.source_type) {
        case 'pdf':
          console.log(`[PREPROCESSING] Starting PDF parsing...`);
          try {
            structuredDoc = await parsePDF(source.storage_path, sourceId, source.source_name);
            console.log(`[PREPROCESSING] PDF parsing completed successfully`);
          } catch (pdfError: any) {
            console.error(`[PREPROCESSING] PDF parsing failed:`, pdfError);
            throw new Error(`PDF parsing error: ${pdfError.message || 'Unknown error'}`);
          }
          break;
        case 'excel':
          structuredDoc = await parseExcel(source.storage_path, sourceId, source.source_name) as StructuredDocument;
          break;
        case 'video':
          structuredDoc = await parseVideo(source.storage_path, sourceId, source.source_name);
          break;
        case 'audio':
          structuredDoc = await parseAudio(source.storage_path, sourceId, source.source_name);
          break;
        case 'text':
          structuredDoc = await parseText(source.storage_path, sourceId, source.source_name, false);
          break;
        case 'markdown':
          structuredDoc = await parseText(source.storage_path, sourceId, source.source_name, true);
          break;
        default:
          throw new Error(`Unsupported source type: ${source.source_type}`);
      }

      console.log(`[PREPROCESSING] Parsed document: ${structuredDoc.sections.length} sections`);

      // Step 2: Store structured document
      console.log(`[PREPROCESSING] Step 2/2: Storing structured document`);
      
      const { error: insertError } = await supabaseServer
        .from('structured_documents')
        .insert({
          source_id: sourceId,
          project_id: projectId,
          document_json: structuredDoc,
        });

      if (insertError) {
        const errorMsg = `Failed to store structured document: ${insertError.message}`;
        console.error(`[PREPROCESSING] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      console.log(`[PREPROCESSING] Successfully stored structured document`);

      // Step 3: Update source status to completed
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
            sectionsCount: structuredDoc.sections.length,
            totalPages: structuredDoc.metadata.totalPages,
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
      console.log(`[PREPROCESSING] Summary: ${structuredDoc.sections.length} sections, ${structuredDoc.metadata.totalPages} pages, ${processingTime}s`);

      return {
        success: true,
        sectionsCount: structuredDoc.sections.length,
        totalPages: structuredDoc.metadata.totalPages,
        processingTimeSeconds: parseFloat(processingTime),
      };

    } catch (error: any) {
      const currentStage = error.message?.includes('download') ? 'download' 
        : error.message?.includes('parse') ? 'parse'
        : error.message?.includes('store') ? 'store'
        : 'unknown';
      
      console.error(`[PREPROCESSING] ✗ Error preprocessing source ${sourceId}:`, error);
      console.error(`[PREPROCESSING] Error details:`, {
        stage: currentStage,
        sourceName: source?.source_name || 'unknown',
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      });

      // Update source status to failed with actionable error message
      try {
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const baseErrorMessage = error.message || 'Unknown error occurred during preprocessing';
        const actionableAdvice = getActionableAdvice(currentStage, error);
        const fullErrorMessage = `${baseErrorMessage}${actionableAdvice ? ' ' + actionableAdvice : ''}`;
        
        const { error: updateError } = await supabaseServer
          .from('ingestion_sources')
          .update({ 
            status: 'failed', 
            error_message: fullErrorMessage,
            updated_at: new Date().toISOString(),
            metadata: {
              failedAt: new Date().toISOString(),
              processingTimeSeconds: parseFloat(processingTime),
              errorType: error.name || 'Error',
              errorStage: currentStage,
            }
          })
          .eq('id', sourceId);

        if (updateError) {
          console.error('[PREPROCESSING] Failed to update status to failed:', updateError);
        } else {
          console.log(`[PREPROCESSING] Updated source ${sourceId} status to failed with actionable message`);
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
    console.error(`[PREPROCESSING] Error:`, error);
    
    // Always update status to failed for any error (timeout or otherwise)
    try {
      const errorMessage = error.message || 'Unknown error occurred during preprocessing';
      const isTimeout = errorMessage.toLowerCase().includes('timeout');
      
      await supabaseServer
        .from('ingestion_sources')
        .update({ 
          status: 'failed', 
          error_message: errorMessage,
          updated_at: new Date().toISOString(),
          metadata: {
            failedAt: new Date().toISOString(),
            errorType: error.name || 'Error',
            isTimeout
          }
        })
        .eq('id', sourceId);
      
      console.log(`[PREPROCESSING] Updated source ${sourceId} status to failed`);
    } catch (updateError) {
      console.error('[PREPROCESSING] Failed to update error status:', updateError);
    }
    
    throw error;
  }
}

/**
 * Provides actionable advice based on the error stage and type
 */
function getActionableAdvice(stage: string, error: Error): string {
  const errorMessage = error.message.toLowerCase();
  
  // Dimension mismatch error
  if (stage === 'embed' && errorMessage.includes('dimensions')) {
    return 'Server restart required to clear webpack cache. Run: rm -rf .next && restart dev server.';
  }
  
  // File not found errors
  if (stage === 'download' && (errorMessage.includes('not found') || errorMessage.includes('does not exist'))) {
    return 'File may have been deleted from storage. Please re-upload the file.';
  }
  
  // Rate limit errors
  if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    return 'API rate limit exceeded. Please wait 2-3 minutes before retrying.';
  }
  
  // Network/connection errors
  if (errorMessage.includes('econnreset') || errorMessage.includes('network') || errorMessage.includes('timeout')) {
    return 'Network connection issue. Please check your internet and retry.';
  }
  
  // API key errors
  if (errorMessage.includes('api key') || errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
    return 'Invalid or missing API key. Please check your .env.local configuration.';
  }
  
  // Storage/database errors
  if (stage === 'store' && (errorMessage.includes('database') || errorMessage.includes('postgres'))) {
    return 'Database connection issue. Please verify Supabase configuration.';
  }
  
  // Encoding errors
  if (stage === 'parse' && (errorMessage.includes('encoding') || errorMessage.includes('utf'))) {
    return 'File encoding not supported. Please save the file as UTF-8 and re-upload.';
  }
  
  // Generic advice based on stage
  switch (stage) {
    case 'download':
      return 'Check that the file exists in storage and is accessible.';
    case 'parse':
      return 'The file may be corrupted or in an unsupported format.';
    case 'store':
      return 'Database may be temporarily unavailable. Please try again later.';
    default:
      return 'Please check the logs for more details or contact support.';
  }
}
