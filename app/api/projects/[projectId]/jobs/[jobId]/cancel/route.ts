import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { PermissionService } from '@/lib/permission-service';
import { progressTracker } from '@/lib/progress-tracker';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; jobId: string }> }
) {
  try {
    const { projectId, jobId } = await params;

    console.log('[CANCEL_JOB] Cancelling job:', jobId, 'for project:', projectId);

    // Authenticate request and check permissions
    const authContext = await authenticateRequest(request);
    const { user, supabase } = authContext;
    
    const permissionService = new PermissionService(supabase, user.id);
    const access = await permissionService.checkProjectAccess(projectId);
    
    if (!access.canWrite) {
      return NextResponse.json({ message: 'Access denied' }, { status: 403 });
    }

    // Verify the job belongs to the project
    const { data: job, error: jobError } = await supabaseServer
      .from('jobs')
      .select('project_id, status, progress_current, progress_total')
      .eq('id', jobId)
      .eq('project_id', access.projectId) // Ensure job belongs to the project
      .single();

    if (jobError || !job) {
      console.error('[CANCEL_JOB] Job not found or does not belong to project:', jobError);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    console.log('[CANCEL_JOB] Job found:', { status: job.status, progress: `${job.progress_current}/${job.progress_total}` });

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

    // Also update progress tracker cache so frontend sees it immediately
    await progressTracker.updateWithPersistence(jobId, {
      stage: 'complete',
      current: 100,
      total: 100,
      message: 'Generation cancelled by user',
    });

    console.log(`[CANCEL_JOB] Job ${jobId} cancelled successfully by user ${user.id}`);

    return NextResponse.json({ 
      success: true,
      message: 'Job cancelled successfully' 
    });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('[CANCEL_JOB] Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
