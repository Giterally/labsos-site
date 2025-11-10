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
  try {
    const body = await request.json();
    const { filePaths, projectId } = body;

    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return NextResponse.json({ 
        error: 'File paths array is required' 
      }, { status: 400 });
    }

    if (!projectId) {
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

    // Process each file
    for (const filePath of filePaths) {
      try {
        // Get file metadata
        const fileMetadata = await getFileMetadata(user.id, filePath);
        
        // Download file
        const { buffer, mimeType, fileName } = await downloadFile(user.id, filePath);

        // Validate file size (100MB limit)
        const maxSize = 100 * 1024 * 1024;
        if (buffer.length > maxSize) {
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

        if (!allowedTypes.includes(mimeType)) {
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
        const { data: source, error: sourceError } = await supabaseServer
          .from('ingestion_sources')
          .insert({
            project_id: resolvedProjectId,
            source_type: 'dropbox',
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
              provider: 'dropbox',
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
              console.error('Preprocessing error:', error);
            });
        } else {
          // Use Inngest in production
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
        }

        results.push({
          filePath,
          fileName: fileMetadata.name,
          sourceId: source.id,
          status: 'imported',
        });
      } catch (fileError) {
        console.error(`Error processing file ${filePath}:`, fileError);
        errors.push({
          filePath,
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

