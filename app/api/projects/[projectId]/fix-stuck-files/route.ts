import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { fixStuckFiles, getFileProcessingStats } from '@/lib/utils/fix-stuck-files';
import { preprocessFile } from '@/lib/processing/preprocessing-pipeline';

// Ensure Node.js runtime for PDF processing (requires Buffer)
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json().catch(() => ({}));
    const { maxAgeMinutes = 30 } = body;

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve project ID
    let resolvedProjectId = projectId;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      const { data: project, error: projectError } = await supabaseServer
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      
      resolvedProjectId = project.id;
    }

    // Check project access
    const { data: projectMember } = await supabaseServer
      .from('project_members')
      .select('id')
      .eq('project_id', resolvedProjectId)
      .eq('user_id', user.id)
      .single();

    if (!projectMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if this is a retry request
    const { retry = false, sourceIds } = body;
    
    if (retry && sourceIds && Array.isArray(sourceIds) && sourceIds.length > 0) {
      // Retry processing for specific sources
      console.log(`[RETRY] Retrying processing for ${sourceIds.length} sources`);
      
      const results = await Promise.allSettled(
        sourceIds.map(async (sourceId: string) => {
          try {
            // Verify the source belongs to this project
            const { data: source, error: sourceError } = await supabaseServer
              .from('ingestion_sources')
              .select('id, source_name, project_id, status')
              .eq('id', sourceId)
              .eq('project_id', resolvedProjectId)
              .single();

            if (sourceError || !source) {
              throw new Error(`Source ${sourceId} not found or access denied`);
            }

            // Reset status to uploaded if it's failed or stuck in processing
            if (source.status === 'failed' || source.status === 'processing') {
              await supabaseServer
                .from('ingestion_sources')
                .update({ 
                  status: 'uploaded',
                  error_message: null,
                  updated_at: new Date().toISOString()
                })
                .eq('id', sourceId);
            }

            // Trigger preprocessing
            await preprocessFile(sourceId, resolvedProjectId);
            
            return { sourceId, sourceName: source.source_name, success: true };
          } catch (error: any) {
            console.error(`[RETRY] Failed to retry source ${sourceId}:`, error);
            return { 
              sourceId, 
              success: false, 
              error: error.message || 'Unknown error' 
            };
          }
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.length - successful;

      return NextResponse.json({
        success: true,
        retriedCount: sourceIds.length,
        successfulCount: successful,
        failedCount: failed,
        results: results.map(r => 
          r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message || 'Unknown error' }
        )
      });
    }

    // Fix stuck files
    const result = await fixStuckFiles(resolvedProjectId, maxAgeMinutes);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Fix stuck files API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve project ID
    let resolvedProjectId = projectId;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      const { data: project, error: projectError } = await supabaseServer
        .from('projects')
        .select('id')
        .eq('slug', projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      
      resolvedProjectId = project.id;
    }

    // Check project access
    const { data: projectMember } = await supabaseServer
      .from('project_members')
      .select('id')
      .eq('project_id', resolvedProjectId)
      .eq('user_id', user.id)
      .single();

    if (!projectMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get file processing stats
    const stats = await getFileProcessingStats(resolvedProjectId);

    return NextResponse.json({ stats });

  } catch (error) {
    console.error('Get file stats API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
