import { NextRequest, NextResponse } from 'next/server';
import { progressTracker } from '@/lib/progress-tracker';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; jobId: string }> }
) {
  try {
    const { jobId } = await context.params;

    const progress = progressTracker.get(jobId);

    if (!progress) {
      // Return default initializing state if no progress found
      return NextResponse.json({
        stage: 'initializing',
        current: 0,
        total: 0,
        message: 'Starting...',
        timestamp: Date.now(),
      });
    }

    return NextResponse.json(progress);
  } catch (error: any) {
    console.error('[PROGRESS_API] Error fetching progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch progress', details: error.message },
      { status: 500 }
    );
  }
}

