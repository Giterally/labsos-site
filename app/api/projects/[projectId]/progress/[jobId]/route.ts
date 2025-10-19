import { NextRequest, NextResponse } from 'next/server';
import { progressTracker } from '@/lib/progress-tracker';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; jobId: string }> }
) {
  try {
    const { jobId } = await context.params;

    console.log('[PROGRESS_API] Fetching progress for job:', jobId);

    // Use getWithFallback to check database when cache is empty
    const progress = await progressTracker.getWithFallback(jobId);

    console.log('[PROGRESS_API] Progress data:', progress);

    if (!progress) {
      console.log('[PROGRESS_API] No progress found for job:', jobId);
      // Return default initializing state if no progress found
      return NextResponse.json({
        stage: 'initializing',
        current: 0,
        total: 0,
        message: 'Starting...',
        timestamp: Date.now(),
      });
    }

    console.log('[PROGRESS_API] Returning progress:', {
      stage: progress.stage,
      current: progress.current,
      total: progress.total,
      percentage: progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0,
    });

    return NextResponse.json(progress);
  } catch (error: any) {
    console.error('[PROGRESS_API] Error fetching progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch progress', details: error.message },
      { status: 500 }
    );
  }
}

