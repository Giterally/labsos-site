import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { PermissionService } from '@/lib/permission-service';
import { supabaseServer } from '@/lib/supabase-server';
import { downloadFile, getFileMetadata } from '@/lib/cloud-storage/onedrive-service';
import { sendEvent } from '@/lib/inngest/client';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/import/onedrive/import
 * Import files from OneDrive or SharePoint
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileIds, siteId } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ 
        error: 'File IDs array is required' 
      }, { status: 400 });
    }

    // Authenticate request (files are user-scoped, no project permission check needed)
    const authContext = await authenticateRequest(request);
    const { user } = authContext;
    const provider = siteId ? 'sharepoint' : 'onedrive';

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
    const currentCount = fileCount || 0;
    const maxAllowed = MAX_FILES_PER_USER - currentCount;

    // Strict enforcement: reject entire batch if limit would be exceeded
    if (maxAllowed <= 0) {
      return NextResponse.json({ 
        error: `You have reached the maximum limit of ${MAX_FILES_PER_USER} uploaded files. Please delete some files before importing new ones.`,
        skipped: fileIds.length
      }, { status: 400 });
    }

    // Reject if the batch would exceed the limit
    if (fileIds.length > maxAllowed) {
      return NextResponse.json({ 
        error: `You can only import ${maxAllowed} more file(s), but you selected ${fileIds.length} file(s). Please delete some files or reduce your selection.`,
        skipped: fileIds.length
      }, { status: 400 });
    }

    const results = [];
    const errors = [];

    // Validate siteId is provided for SharePoint files
    // Note: siteId should be in file metadata, but we also accept it in the request body
    // If siteId is in body but not in file metadata, we'll use the body siteId

    // Process each file
    for (const fileId of fileIds) {
      try {
        // For SharePoint, ensure siteId is available
        // It should be in the request body, but we can also extract it from file metadata if needed
        const fileSiteId = siteId; // Use siteId from request body (set from file metadata in frontend)
        
        // Get file metadata
        const fileMetadata = await getFileMetadata(user.id, fileId, fileSiteId);
        
        // Download file
        const { buffer, mimeType, fileName } = await downloadFile(user.id, fileId, fileSiteId);

        // Validate file size (100MB limit)
        const maxSize = 100 * 1024 * 1024;
        if (buffer.length > maxSize) {
          errors.push({
            fileId,
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

        if (!allowedTypes.includes(mimeType)) {
          errors.push({
            fileId,
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
        const storagePath = `${user.id}/${uniqueFileName}`;

        // Upload to Supabase Storage (user-scoped)
        const { error: uploadError } = await supabaseServer.storage
          .from('user-uploads')
          .upload(storagePath, buffer, {
            contentType: mimeType,
            upsert: false,
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          errors.push({
            fileId,
            fileName: fileMetadata.name,
            error: 'Failed to upload file to storage',
          });
          continue;
        }

        // Create ingestion source record (user-scoped, no project_id)
        // Use the actual file type (pdf, excel, etc.) not the provider name
        const { data: source, error: sourceError } = await supabaseServer
          .from('ingestion_sources')
          .insert({
            user_id: user.id,
            project_id: null, // Files are user-scoped, shared across all projects
            source_type: sourceType, // Use actual file type, not provider
            source_name: fileMetadata.name,
            source_url: fileMetadata.url || fileMetadata.downloadUrl,
            storage_path: storagePath,
            file_size: buffer.length,
            mime_type: mimeType,
            status: 'uploaded',
            metadata: {
              originalName: fileMetadata.name,
              microsoftFileId: fileId,
              siteId: siteId || null,
              webUrl: fileMetadata.url,
              uploadedAt: new Date().toISOString(),
              uploadedBy: user.id,
              provider, // Store provider in metadata
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
          
          errors.push({
            fileId,
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
          preprocessFile(source.id, user.id)
            .catch((error) => {
              console.error('Preprocessing error:', error);
            });
        } else {
          // Use Inngest in production, with fallback to direct preprocessing
          try {
            await sendEvent('ingestion/preprocess-file', {
              sourceId: source.id,
              userId: user.id,
              sourceType,
              storagePath,
              metadata: {
                fileName: fileMetadata.name,
                fileSize: buffer.length,
                mimeType,
                provider,
              },
            });
            console.log('[OneDrive Import API] Inngest event sent successfully for source:', source.id);
          } catch (eventError) {
            console.error('[OneDrive Import API] Failed to send Inngest event:', eventError);
            console.log('[OneDrive Import API] Inngest failed, falling back to preprocessing pipeline');
            
            // Fallback to preprocessing if Inngest fails
            try {
              const { preprocessFile } = await import('@/lib/processing/preprocessing-pipeline');
              preprocessFile(source.id, user.id)
                .catch((preprocessingError) => {
                  console.error('[OneDrive Import API] Fallback preprocessing failed:', preprocessingError);
                });
              console.log('[OneDrive Import API] Fallback preprocessing started');
            } catch (preprocessingError) {
              console.error('[OneDrive Import API] Failed to start fallback preprocessing:', preprocessingError);
              // Don't throw - we still want to mark the file as imported
            }
          }
        }

        console.log(`[OneDrive Import API] File successfully imported: ${fileMetadata.name} (sourceId: ${source.id})`);
        results.push({
          fileId,
          fileName: fileMetadata.name,
          sourceId: source.id,
          status: 'imported',
        });
      } catch (fileError) {
        console.error(`Error processing file ${fileId}:`, fileError);
        errors.push({
          fileId,
          fileName: 'Unknown',
          error: fileError instanceof Error ? fileError.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: results.length > 0,
      imported: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
      message: errors.length > 0
        ? `Imported ${results.length} file(s), ${errors.length} failed`
        : `Successfully imported ${results.length} file(s)`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('OneDrive import error:', error);
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

