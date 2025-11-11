import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { PermissionService } from '@/lib/permission-service';
import { supabaseServer } from '@/lib/supabase-server';
import { downloadFile, getFileMetadata } from '@/lib/cloud-storage/dropbox-service';
import { sendEvent } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/import/dropbox/import
 * Import files from Dropbox
 */
export async function POST(request: NextRequest) {
  console.log('[Dropbox Import API] ========== POST request received ==========');
  try {
    const body = await request.json();
    console.log('[Dropbox Import API] Request body:', {
      hasFilePaths: !!body.filePaths,
      filePathsType: Array.isArray(body.filePaths),
      filePathsLength: body.filePaths?.length || 0,
      filePaths: body.filePaths,
      hasProjectId: !!body.projectId,
      projectId: body.projectId,
    });
    
    const { filePaths, projectId } = body;

    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      console.error('[Dropbox Import API] Validation failed: filePaths missing or empty');
      return NextResponse.json({ 
        error: 'File paths array is required' 
      }, { status: 400 });
    }

    if (!projectId) {
      console.error('[Dropbox Import API] Validation failed: projectId missing');
      return NextResponse.json({ 
        error: 'Project ID is required' 
      }, { status: 400 });
    }

    // Authenticate request and check permissions
    const authContext = await authenticateRequest(request);
    const { user, supabase } = authContext;
    
    const permissionService = new PermissionService(supabase, user.id);
    const access = await permissionService.checkProjectAccess(projectId);
    
    if (!access.canWrite) {
      return NextResponse.json({ message: 'Access denied' }, { status: 403 });
    }

    const resolvedProjectId = access.projectId;

    const results = [];
    const errors = [];

    console.log('[Dropbox Import API] Starting to process files:', {
      totalFiles: filePaths.length,
      filePaths: filePaths,
    });

    // Process each file
    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      console.log(`[Dropbox Import API] Processing file ${i + 1}/${filePaths.length}:`, {
        filePath,
        pathType: typeof filePath,
        pathLength: filePath?.length || 0,
        isEmpty: !filePath || filePath === '',
      });
      
      try {
        // Get file metadata
        console.log(`[Dropbox Import API] Getting metadata for: ${filePath}`);
        const fileMetadata = await getFileMetadata(user.id, filePath);
        console.log(`[Dropbox Import API] Metadata retrieved:`, {
          name: fileMetadata.name,
          size: fileMetadata.size,
          mimeType: fileMetadata.mimeType,
          id: fileMetadata.id,
        });
        
        // Download file
        console.log(`[Dropbox Import API] Downloading file: ${filePath}`);
        const { buffer, mimeType, fileName } = await downloadFile(user.id, filePath);
        console.log(`[Dropbox Import API] File downloaded:`, {
          fileName,
          mimeType,
          bufferSize: buffer.length,
        });

        // Validate file size (100MB limit)
        const maxSize = 100 * 1024 * 1024;
        if (buffer.length > maxSize) {
          console.warn(`[Dropbox Import API] File too large: ${fileMetadata.name} (${buffer.length} bytes)`);
          errors.push({
            filePath,
            fileName: fileMetadata.name,
            error: 'File size exceeds 100MB limit',
          });
          continue;
        }

        // Validate file type
        const allowedTypes = [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
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

        console.log(`[Dropbox Import API] Validating file type: ${mimeType}, allowed: ${allowedTypes.includes(mimeType)}`);
        if (!allowedTypes.includes(mimeType)) {
          console.warn(`[Dropbox Import API] File type not supported: ${fileMetadata.name} (${mimeType})`);
          errors.push({
            filePath,
            fileName: fileMetadata.name,
            error: `File type ${mimeType} not supported`,
          });
          continue;
        }

        // Determine source type from MIME type
        const sourceType = getSourceTypeFromMimeType(mimeType);

        // Generate unique filename
        const timestamp = Date.now();
        const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueFileName = `${timestamp}_${sanitizedName}`;
        const storagePath = `${resolvedProjectId}/${uniqueFileName}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabaseServer.storage
          .from('project-uploads')
          .upload(storagePath, buffer, {
            contentType: mimeType,
            upsert: false,
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          errors.push({
            filePath,
            fileName: fileMetadata.name,
            error: 'Failed to upload file to storage',
          });
          continue;
        }

        // Create ingestion source record
        // Use the actual file type (pdf, excel, etc.) not the provider name
        const { data: source, error: sourceError } = await supabaseServer
          .from('ingestion_sources')
          .insert({
            project_id: resolvedProjectId,
            source_type: sourceType, // Use actual file type, not 'dropbox'
            source_name: fileMetadata.name,
            source_url: `https://www.dropbox.com/home${filePath}`,
            storage_path: storagePath,
            file_size: buffer.length,
            mime_type: mimeType,
            status: 'uploaded',
            metadata: {
              originalName: fileMetadata.name,
              dropboxPath: filePath,
              dropboxFileId: fileMetadata.id,
              uploadedAt: new Date().toISOString(),
              uploadedBy: user.id,
              provider: 'dropbox', // Store provider in metadata
            },
            created_by: user.id,
          })
          .select()
          .single();

        if (sourceError) {
          console.error('Source creation error:', sourceError);
          // Clean up uploaded file
          await supabaseServer.storage
            .from('project-uploads')
            .remove([storagePath]);
          
          errors.push({
            filePath,
            fileName: fileMetadata.name,
            error: 'Failed to create source record',
          });
          continue;
        }

        // Trigger processing
        const isLocalDev = process.env.NODE_ENV === 'development' && !process.env.INNGEST_EVENT_KEY;
        
        if (isLocalDev) {
          // Use preprocessing pipeline directly in development
          const { preprocessFile } = await import('@/lib/processing/preprocessing-pipeline');
          preprocessFile(source.id, resolvedProjectId)
            .catch((error) => {
              console.error('[Dropbox Import API] Preprocessing error:', error);
            });
        } else {
          // Use Inngest in production, with fallback to direct preprocessing
          try {
            await sendEvent('ingestion/preprocess-file', {
              sourceId: source.id,
              projectId: resolvedProjectId,
              sourceType,
              storagePath,
              metadata: {
                fileName: fileMetadata.name,
                fileSize: buffer.length,
                mimeType,
                provider: 'dropbox',
              },
            });
            console.log('[Dropbox Import API] Inngest event sent successfully for source:', source.id);
          } catch (eventError) {
            console.error('[Dropbox Import API] Failed to send Inngest event:', eventError);
            console.log('[Dropbox Import API] Inngest failed, falling back to preprocessing pipeline');
            
            // Fallback to preprocessing if Inngest fails
            try {
              const { preprocessFile } = await import('@/lib/processing/preprocessing-pipeline');
              preprocessFile(source.id, resolvedProjectId)
                .catch((preprocessingError) => {
                  console.error('[Dropbox Import API] Fallback preprocessing failed:', preprocessingError);
                });
              console.log('[Dropbox Import API] Fallback preprocessing started');
            } catch (preprocessingError) {
              console.error('[Dropbox Import API] Failed to start fallback preprocessing:', preprocessingError);
              // Don't throw - we still want to mark the file as imported
            }
          }
        }

        console.log(`[Dropbox Import API] File successfully imported: ${fileMetadata.name} (sourceId: ${source.id})`);
        results.push({
          filePath,
          fileName: fileMetadata.name,
          sourceId: source.id,
          status: 'imported',
        });
      } catch (fileError) {
        console.error(`[Dropbox Import API] Error processing file ${filePath}:`, {
          error: fileError instanceof Error ? fileError.message : String(fileError),
          stack: fileError instanceof Error ? fileError.stack : undefined,
          name: fileError instanceof Error ? fileError.name : undefined,
          errorObject: fileError,
        });
        errors.push({
          filePath,
          fileName: 'Unknown',
          error: fileError instanceof Error ? fileError.message : 'Unknown error',
        });
      }
    }

    console.log('[Dropbox Import API] Processing complete:', {
      totalFiles: filePaths.length,
      successful: results.length,
      failed: errors.length,
      results: results.map(r => r.fileName),
      errors: errors.map(e => ({ filePath: e.filePath, error: e.error })),
    });

    const response = {
      success: results.length > 0,
      imported: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
      message: errors.length > 0
        ? `Imported ${results.length} file(s), ${errors.length} failed`
        : `Successfully imported ${results.length} file(s)`,
    };
    
    console.log('[Dropbox Import API] Returning response:', response);
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('Dropbox import error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

function getSourceTypeFromMimeType(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'excel';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'text/markdown') return 'markdown';
  if (mimeType === 'text/plain') return 'text';
  return 'text';
}

