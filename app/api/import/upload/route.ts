import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '../../../../lib/supabase-server'; // Server-side client with service role key
import { sendEvent } from '../../../../lib/inngest/client';
import { preprocessFile } from '../../../../lib/processing/preprocessing-pipeline';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { PermissionService } from '@/lib/permission-service';

// Ensure Node.js runtime for PDF processing (requires Buffer)
export const runtime = 'nodejs';
// Allow up to 5 minutes for PDF processing (PDF parsing can be slow)
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    console.log('Upload request received');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Authenticate request (files are user-scoped, no project permission check needed)
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    // Check file count limit (10 files per user)
    const { count: fileCount, error: countError } = await supabaseServer
      .from('ingestion_sources')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (countError) {
      console.error('Error counting files:', countError);
      return NextResponse.json({ 
        error: 'Failed to check file limit' 
      }, { status: 500 });
    }

    const MAX_FILES_PER_USER = 10;
    if ((fileCount || 0) >= MAX_FILES_PER_USER) {
      return NextResponse.json({ 
        error: `You have reached the maximum limit of ${MAX_FILES_PER_USER} uploaded files. Please delete some files before uploading new ones.` 
      }, { status: 400 });
    }

    // Validate file type and size
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown',
      'video/mp4',
      'video/avi',
      'video/mov',
      'video/quicktime',
      'audio/mp3',
      'audio/wav',
      'audio/mpeg',
    ];

    // Also check file extension as fallback (browsers may send incorrect MIME types)
    const fileExtension = file.name.toLowerCase().split('.').pop();
    const allowedExtensions = ['pdf', 'xlsx', 'xls', 'docx', 'doc', 'txt', 'md', 'mp4', 'avi', 'mov', 'mp3', 'wav', 'mpeg'];
    
    const isValidMimeType = allowedTypes.includes(file.type);
    const isValidExtension = fileExtension && allowedExtensions.includes(fileExtension);
    
    if (!isValidMimeType && !isValidExtension) {
      console.log(`[UPLOAD] File type validation failed: MIME type="${file.type}", extension="${fileExtension}", filename="${file.name}"`);
      return NextResponse.json({ 
        error: `File type not supported. MIME type: ${file.type}, extension: ${fileExtension || 'none'}` 
      }, { status: 400 });
    }
    
    // Use MIME type if valid, otherwise infer from extension
    let actualMimeType = file.type;
    if (!isValidMimeType && isValidExtension) {
      // Infer MIME type from extension
      const mimeTypeMap: Record<string, string> = {
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'doc': 'application/msword',
        'pdf': 'application/pdf',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls': 'application/vnd.ms-excel',
        'txt': 'text/plain',
        'md': 'text/markdown',
        'mp4': 'video/mp4',
        'avi': 'video/avi',
        'mov': 'video/quicktime',
        'mp3': 'audio/mp3',
        'wav': 'audio/wav',
        'mpeg': 'audio/mpeg',
      };
      actualMimeType = mimeTypeMap[fileExtension] || file.type;
      console.log(`[UPLOAD] Inferred MIME type from extension: ${actualMimeType} for file ${file.name}`);
    }

    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: 'File size exceeds 100MB limit' 
      }, { status: 400 });
    }

    // Determine source type from file type (use actual MIME type)
    const sourceType = getSourceTypeFromMimeType(actualMimeType);

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${sanitizedName}`;
    const storagePath = `${user.id}/${fileName}`;

            // Upload file to Supabase Storage (user-scoped)
            const fileBuffer = await file.arrayBuffer();
            console.log(`[UPLOAD] Uploading file: ${file.name}, size: ${fileBuffer.byteLength}, mimeType: ${actualMimeType}, storagePath: ${storagePath}`);
            const { data: uploadData, error: uploadError } = await supabaseServer.storage
              .from('user-uploads')
              .upload(storagePath, fileBuffer, {
                contentType: actualMimeType,
                upsert: false,
              });

    if (uploadError) {
      console.error('[UPLOAD] Upload error details:', {
        error: uploadError,
        message: uploadError.message,
        statusCode: uploadError.statusCode,
        fileName: file.name,
        fileSize: fileBuffer.byteLength,
        mimeType: actualMimeType,
        storagePath: storagePath,
      });
      return NextResponse.json({ 
        error: `Failed to upload file: ${uploadError.message || 'Unknown error'}` 
      }, { status: 500 });
    }
    
    console.log('File uploaded to storage:', storagePath);

    // Create ingestion source record (user-scoped, no project_id)
    const { data: source, error: sourceError } = await supabaseServer
      .from('ingestion_sources')
      .insert({
        user_id: user.id,
        project_id: null, // Files are user-scoped, shared across all projects
        source_type: sourceType,
        source_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: actualMimeType,
        status: 'uploaded', // Explicitly set initial status
        metadata: {
          originalName: file.name,
          uploadedAt: new Date().toISOString(),
          uploadedBy: user.id,
        },
        created_by: user.id,
      })
      .select()
      .single();

    if (sourceError) {
      console.error('Source creation error:', sourceError);
              // Clean up uploaded file
              await supabaseServer.storage
                .from('user-uploads')
                .remove([storagePath]);
      
      return NextResponse.json({ 
        error: 'Failed to create source record' 
      }, { status: 500 });
    }
    
    console.log('Source record created:', source.id);

    // Check if we should use local processing (development without Inngest)
    const isLocalDev = process.env.NODE_ENV === 'development' && !process.env.INNGEST_EVENT_KEY;
    
    let processingStarted = false;
    let processingError: string | null = null;
    
    if (isLocalDev) {
      // Use preprocessing pipeline directly in development
      // Run preprocessing in background to avoid blocking the upload response
      console.log('[UPLOAD] Using preprocessing pipeline for development');
      console.log('[UPLOAD] Starting preprocessFile in background for:', { sourceId: source.id, sourceType, fileName: file.name });
      
      // Don't await - let it run in background
      // Add a safety timeout to ensure status is always updated
      const safetyTimeout = setTimeout(async () => {
        // Check if file is still processing after 3 minutes - mark as failed
        const { data: checkSource } = await supabaseServer
          .from('ingestion_sources')
          .select('status')
          .eq('id', source.id)
          .single();
        
        if (checkSource?.status === 'processing') {
          console.error(`[UPLOAD] Safety timeout: File ${source.id} still processing after 3 minutes, marking as failed`);
          await supabaseServer
            .from('ingestion_sources')
            .update({ 
              status: 'failed', 
              error_message: 'Processing timed out after 3 minutes. The file may be too large or corrupted.',
              updated_at: new Date().toISOString()
            })
            .eq('id', source.id);
        }
      }, 3 * 60 * 1000); // 3 minutes safety timeout
      
      preprocessFile(source.id, user.id)
        .then((result) => {
          clearTimeout(safetyTimeout);
          console.log('[UPLOAD] Preprocessing completed successfully:', result);
        })
        .catch(async (preprocessingError) => {
          clearTimeout(safetyTimeout);
          console.error('[UPLOAD] Preprocessing failed:', preprocessingError);
          console.error('[UPLOAD] Error details:', {
            message: preprocessingError instanceof Error ? preprocessingError.message : 'Unknown error',
            stack: preprocessingError instanceof Error ? preprocessingError.stack : 'No stack trace',
            name: preprocessingError instanceof Error ? preprocessingError.name : 'Unknown'
          });
          
          // Double-check status is updated - if preprocessing pipeline didn't update it, do it here
          try {
            const { data: currentSource } = await supabaseServer
              .from('ingestion_sources')
              .select('status')
              .eq('id', source.id)
              .single();
            
            if (currentSource?.status === 'processing') {
              const errorMessage = preprocessingError instanceof Error 
                ? preprocessingError.message 
                : 'Unknown preprocessing error';
              
              await supabaseServer
                .from('ingestion_sources')
                .update({ 
                  status: 'failed', 
                  error_message: errorMessage,
                  updated_at: new Date().toISOString()
                })
                .eq('id', source.id);
              
              console.log(`[UPLOAD] Updated source ${source.id} status to failed (fallback)`);
            }
          } catch (updateError) {
            console.error('[UPLOAD] Failed to update status in catch block:', updateError);
          }
        });
      
      // Mark as processing started (we don't wait for completion)
      processingStarted = true;
    } else {
      // Use Inngest in production
      try {
        await sendEvent('ingestion/preprocess-file', {
          sourceId: source.id,
          userId: user.id,
          sourceType,
          storagePath,
          metadata: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
          },
        });
        console.log('[UPLOAD] Inngest event sent successfully for source:', source.id);
        processingStarted = true;
      } catch (eventError) {
        console.error('[UPLOAD] Failed to send Inngest event:', eventError);
        console.log('[UPLOAD] Inngest failed, falling back to preprocessing pipeline');
        
        // Fallback to preprocessing if Inngest fails
        try {
          const result = await preprocessFile(source.id, user.id);
          console.log('[UPLOAD] Fallback preprocessing completed:', result);
          processingStarted = true;
        } catch (preprocessingError) {
          console.error('[UPLOAD] Fallback preprocessing failed:', preprocessingError);
          processingError = preprocessingError instanceof Error ? preprocessingError.message : 'Unknown preprocessing error';
          // Source status will be updated to 'failed' by the preprocessing pipeline
        }
      }
    }

    // Get the current status from the database to return accurate status
    const { data: updatedSource } = await supabaseServer
      .from('ingestion_sources')
      .select('status, error_message')
      .eq('id', source.id)
      .single();

    return NextResponse.json({
      sourceId: source.id,
      fileName: file.name,
      fileSize: file.size,
      sourceType,
      status: updatedSource?.status || 'processing',
      processingStarted,
      error: processingError || updatedSource?.error_message,
      message: processingError 
        ? `File uploaded but processing failed: ${processingError}`
        : processingStarted
          ? 'File uploaded and processing started successfully'
          : 'File uploaded successfully',
    });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('Upload error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

function getSourceTypeFromMimeType(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'excel';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
      mimeType === 'application/msword') return 'word';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'text/markdown') return 'markdown';
  if (mimeType === 'text/plain') return 'text';
  return 'text'; // Default fallback
}

export async function GET(request: NextRequest) {
  try {
    // Authenticate request (files are user-scoped)
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    // Get ingestion sources for user (all user's files across all projects)
    const { data: sources, error } = await supabaseServer
      .from('ingestion_sources')
      .select(`
        id,
        source_type,
        source_name,
        file_size,
        mime_type,
        status,
        error_message,
        created_at,
        updated_at
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sources:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch sources' 
      }, { status: 500 });
    }

    return NextResponse.json({ sources });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('Get sources error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get('sourceId');
    
    // Authenticate request (files are user-scoped)
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    if (sourceId) {
      // Delete specific source (must belong to user)
      const { data: source, error: sourceError } = await supabaseServer
        .from('ingestion_sources')
        .select('storage_path')
        .eq('id', sourceId)
        .eq('user_id', user.id)
        .single();

      if (sourceError || !source) {
        return NextResponse.json({ error: 'Source not found' }, { status: 404 });
      }

      // Delete from storage if path exists
      if (source.storage_path) {
        const { error: storageError } = await supabaseServer.storage
          .from('user-uploads')
          .remove([source.storage_path]);
        
        if (storageError) {
          console.error('Storage deletion error:', storageError);
          // Continue with database deletion even if storage fails
        }
      }

      // Delete from database (cascades to chunks)
      const { error: deleteError } = await supabaseServer
        .from('ingestion_sources')
        .delete()
        .eq('id', sourceId)
        .eq('user_id', user.id);

      if (deleteError) {
        return NextResponse.json({ error: 'Failed to delete source' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Source deleted successfully' });
    } else {
      // Delete all sources for the user (removes from all projects)
      const { data: sources, error: sourcesError } = await supabaseServer
        .from('ingestion_sources')
        .select('storage_path')
        .eq('user_id', user.id);

      if (sourcesError) {
        return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 });
      }

      // Delete from storage
      const storagePaths = sources?.map(s => s.storage_path).filter(Boolean) || [];
      if (storagePaths.length > 0) {
        const { error: storageError } = await supabaseServer.storage
          .from('user-uploads')
          .remove(storagePaths);
        
        if (storageError) {
          console.error('Storage deletion error:', storageError);
          // Continue with database deletion even if storage fails
        }
      }

      // Delete from database (cascades to chunks)
      const { error: deleteError } = await supabaseServer
        .from('ingestion_sources')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        return NextResponse.json({ error: 'Failed to delete sources' }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        message: `Deleted ${sources?.length || 0} sources successfully` 
      });
    }

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('Delete error:', error);
    return NextResponse.json({ 
      error: 'Delete failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
