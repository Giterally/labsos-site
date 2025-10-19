import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; jobId: string }> }
) {
  try {
    const { projectId, jobId } = await params;

    console.log('[CANCEL_JOB] Cancelling job:', jobId, 'for project:', projectId);

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
      console.error('[CANCEL_JOB] Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the job belongs to a project the user has access to
    const { data: job, error: jobError } = await supabaseServer
      .from('jobs')
      .select('project_id, status, progress_current, progress_total')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      console.error('[CANCEL_JOB] Job not found:', jobError);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    console.log('[CANCEL_JOB] Job found:', { status: job.status, progress: `${job.progress_current}/${job.progress_total}` });

    // Check project access
    const { data: projectMember } = await supabaseServer
      .from('project_members')
      .select('id')
      .eq('project_id', job.project_id)
      .eq('user_id', user.id)
      .single();

    if (!projectMember) {
      console.error('[CANCEL_JOB] Access denied for user:', user.id);
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Update job status to cancelled
    const { error: updateError } = await supabaseServer
      .from('jobs')
      .update({ 
        status: 'cancelled',
        progress_stage: 'complete',
        progress_current: 100,
        progress_total: 100,
        progress_message: 'Generation cancelled by user',
        progress_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('[CANCEL_JOB] Failed to cancel job:', updateError);
      return NextResponse.json({ error: 'Failed to cancel job' }, { status: 500 });
    }

    console.log(`[CANCEL_JOB] Job ${jobId} cancelled successfully by user ${user.id}`);

    return NextResponse.json({ 
      success: true,
      message: 'Job cancelled successfully' 
    });

  } catch (error) {
    console.error('[CANCEL_JOB] Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
