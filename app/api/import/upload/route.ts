import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase-client';
import { supabaseServer } from '../../../../lib/supabase-server'; // Server-side client with service role key
import { sendEvent } from '../../../../lib/inngest/client';
import { preprocessFile } from '../../../../lib/processing/preprocessing-pipeline';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const projectId = formData.get('projectId') as string;
    
    console.log('Upload request received for project:', projectId);

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json({ error: 'No project ID provided' }, { status: 400 });
    }

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve project ID - handle both UUID and slug
    let resolvedProjectId = projectId;
    
    // Check if projectId is a slug (not a UUID format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      // Look up project by slug
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      
      resolvedProjectId = project.id;
    }

    const { data: projectMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', resolvedProjectId)
      .eq('user_id', user.id)
      .single();

    if (!projectMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Validate file type and size
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

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: `File type ${file.type} not supported` 
      }, { status: 400 });
    }

    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: 'File size exceeds 100MB limit' 
      }, { status: 400 });
    }

    // Determine source type from file type
    const sourceType = getSourceTypeFromMimeType(file.type);

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${sanitizedName}`;
    const storagePath = `${resolvedProjectId}/${fileName}`;

            // Upload file to Supabase Storage
            const fileBuffer = await file.arrayBuffer();
            const { data: uploadData, error: uploadError } = await supabaseServer.storage
              .from('project-uploads')
              .upload(storagePath, fileBuffer, {
                contentType: file.type,
                upsert: false,
              });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ 
        error: 'Failed to upload file' 
      }, { status: 500 });
    }
    
    console.log('File uploaded to storage:', storagePath);

    // Create ingestion source record
    const { data: source, error: sourceError } = await supabaseServer
      .from('ingestion_sources')
      .insert({
        project_id: resolvedProjectId,
        source_type: sourceType,
        source_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
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
                .from('project-uploads')
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
      console.log('[UPLOAD] Using preprocessing pipeline for development');
      try {
        const result = await preprocessFile(source.id, resolvedProjectId);
        console.log('[UPLOAD] Preprocessing completed successfully:', result);
        processingStarted = true;
      } catch (preprocessingError) {
        console.error('[UPLOAD] Preprocessing failed:', preprocessingError);
        processingError = preprocessingError instanceof Error ? preprocessingError.message : 'Unknown preprocessing error';
        // Source status will be updated to 'failed' by the preprocessing pipeline
      }
    } else {
      // Use Inngest in production
      try {
        await sendEvent('ingestion/preprocess-file', {
          sourceId: source.id,
          projectId: resolvedProjectId,
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
          const result = await preprocessFile(source.id, resolvedProjectId);
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
    console.error('Upload error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
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
  return 'text'; // Default fallback
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'No project ID provided' }, { status: 400 });
    }

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve project ID - handle both UUID and slug
    let resolvedProjectId = projectId;
    
    // Check if projectId is a slug (not a UUID format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      // Look up project by slug
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      
      resolvedProjectId = project.id;
    }

    const { data: projectMember } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', resolvedProjectId)
      .eq('user_id', user.id)
      .single();

    if (!projectMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get ingestion sources for project
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
      .eq('project_id', resolvedProjectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sources:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch sources' 
      }, { status: 500 });
    }

    return NextResponse.json({ sources });

  } catch (error) {
    console.error('Get sources error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const sourceId = searchParams.get('sourceId');
    
    if (!projectId) {
      return NextResponse.json({ error: 'No project ID provided' }, { status: 400 });
    }

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve project ID - handle both UUID and slug
    let resolvedProjectId = projectId;
    
    // Check if projectId is a slug (not a UUID format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      // Look up project by slug
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      resolvedProjectId = project.id;
    }

    // Check if user has access to the project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, created_by')
      .eq('id', resolvedProjectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.created_by !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (sourceId) {
      // Delete specific source
      const { data: source, error: sourceError } = await supabaseServer
        .from('ingestion_sources')
        .select('storage_path')
        .eq('id', sourceId)
        .eq('project_id', resolvedProjectId)
        .single();

      if (sourceError || !source) {
        return NextResponse.json({ error: 'Source not found' }, { status: 404 });
      }

      // Delete from storage if path exists
      if (source.storage_path) {
        const { error: storageError } = await supabaseServer.storage
          .from('project-uploads')
          .remove([source.storage_path]);
        
        if (storageError) {
          console.error('Storage deletion error:', storageError);
          // Continue with database deletion even if storage fails
        }
      }

      // Delete from database
      const { error: deleteError } = await supabaseServer
        .from('ingestion_sources')
        .delete()
        .eq('id', sourceId)
        .eq('project_id', resolvedProjectId);

      if (deleteError) {
        return NextResponse.json({ error: 'Failed to delete source' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Source deleted successfully' });
    } else {
      // Delete all sources for the project
      const { data: sources, error: sourcesError } = await supabaseServer
        .from('ingestion_sources')
        .select('storage_path')
        .eq('project_id', resolvedProjectId);

      if (sourcesError) {
        return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 });
      }

      // Delete from storage
      const storagePaths = sources?.map(s => s.storage_path).filter(Boolean) || [];
      if (storagePaths.length > 0) {
        const { error: storageError } = await supabaseServer.storage
          .from('project-uploads')
          .remove(storagePaths);
        
        if (storageError) {
          console.error('Storage deletion error:', storageError);
          // Continue with database deletion even if storage fails
        }
      }

      // Delete from database
      const { error: deleteError } = await supabaseServer
        .from('ingestion_sources')
        .delete()
        .eq('project_id', resolvedProjectId);

      if (deleteError) {
        return NextResponse.json({ error: 'Failed to delete sources' }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        message: `Deleted ${sources?.length || 0} sources successfully` 
      });
    }

  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ 
      error: 'Delete failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
