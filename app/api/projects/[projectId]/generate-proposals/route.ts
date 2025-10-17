import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { generateProposals } from '@/lib/processing/ai-synthesis-pipeline';

export async function POST(
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

    // Check if there are any completed files to generate proposals from
    const { data: completedSources, error: sourcesError } = await supabaseServer
      .from('ingestion_sources')
      .select('id, source_name')
      .eq('project_id', resolvedProjectId)
      .eq('status', 'completed');

    if (sourcesError) {
      console.error('Error fetching completed sources:', sourcesError);
      return NextResponse.json({ error: 'Failed to fetch completed sources' }, { status: 500 });
    }

    if (!completedSources || completedSources.length === 0) {
      return NextResponse.json({ error: 'No completed files found. Please upload and process files first.' }, { status: 400 });
    }

    console.log(`[GENERATE PROPOSALS] Starting proposal generation for project: ${resolvedProjectId}`);
    console.log(`[GENERATE PROPOSALS] Found ${completedSources.length} completed sources`);

    // Generate jobId for progress tracking
    const jobId = `proposals_${resolvedProjectId}_${Date.now()}`;

    // Generate proposals using the AI synthesis pipeline with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Proposal generation timed out after 15 minutes')), 15 * 60 * 1000);
    });

    const result = await Promise.race([
      generateProposals(resolvedProjectId, jobId),
      timeoutPromise
    ]) as any;

    console.log(`[GENERATE PROPOSALS] Generated ${result.nodesGenerated} proposals from ${result.clustersGenerated} clusters`);

    return NextResponse.json({
      success: true,
      nodesGenerated: result.nodesGenerated,
      clustersGenerated: result.clustersGenerated,
      jobId: result.jobId,
      message: `Successfully generated ${result.nodesGenerated} proposed nodes from ${result.clustersGenerated} clusters`
    });

  } catch (error) {
    console.error('Generate proposals API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}