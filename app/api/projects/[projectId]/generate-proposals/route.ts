import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { generateProposals } from '@/lib/processing/ai-synthesis-pipeline';
import { randomUUID } from 'crypto';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { PermissionService } from '@/lib/permission-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    // Authenticate request and check permissions
    const authContext = await authenticateRequest(request);
    const { user, supabase } = authContext;
    
    const permissionService = new PermissionService(supabase, user.id);
    const access = await permissionService.checkProjectAccess(projectId);
    
    if (!access.canWrite) {
      return NextResponse.json({ message: 'Access denied' }, { status: 403 });
    }

    // Get the resolved project ID from the permission service
    const resolvedProjectId = access.projectId;

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

    // Generate jobId for progress tracking (server-side generation)
    const jobId = randomUUID();

    // Create job record in database BEFORE starting generation
    const { data: job, error: jobError } = await supabaseServer
      .from('jobs')
      .insert({
        id: jobId,
        type: 'proposal_generation',
        status: 'running',
        project_id: resolvedProjectId,
        created_by: user.id,
        started_at: new Date().toISOString(),
        payload: {
          sourceCount: completedSources.length,
          sourceIds: completedSources.map(s => s.id)
        }
      })
      .select()
      .single();

    if (jobError) {
      console.error('[GENERATE PROPOSALS] Failed to create job record:', jobError);
      return NextResponse.json({ error: 'Failed to initialize job tracking' }, { status: 500 });
    }

    console.log(`[GENERATE PROPOSALS] Created job record: ${jobId}`);

    // Start generation in background - don't await
    generateProposals(resolvedProjectId, jobId).catch(error => {
      console.error('[GENERATE PROPOSALS] Background error:', error);
      // Error handling is done inside generateProposals via progressTracker
    });

    // Return jobId immediately so frontend can start tracking
    return NextResponse.json({
      success: true,
      jobId: jobId,
      message: 'Proposal generation started',
      status: 'started'
    });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    
    console.error('[GENERATE_PROPOSALS_API] Error occurred:', error);
    
    // Provide detailed error information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Log detailed error for debugging
    console.error('[GENERATE_PROPOSALS_API] Error details:', {
      message: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString(),
    });
    
    // Determine user-friendly error message based on error type
    let userMessage = 'Failed to generate proposals';
    let statusCode = 500;
    
    if (errorMessage.includes('No preprocessed chunks found')) {
      userMessage = 'No processed data found. Please ensure files have been successfully uploaded and processed.';
      statusCode = 400;
    } else if (errorMessage.includes('Rate limit')) {
      userMessage = 'AI service rate limit reached. Please try again in a few minutes.';
      statusCode = 429;
    } else if (errorMessage.includes('ANTHROPIC_API_KEY') || errorMessage.includes('OPENAI_API_KEY')) {
      userMessage = 'AI service configuration error. Please contact support.';
      statusCode = 500;
    } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      userMessage = 'Request timed out. Your data may be too large or the AI service is slow. Please try again.';
      statusCode = 408;
    } else if (errorMessage.includes('Schema validation failed')) {
      userMessage = 'AI generated invalid data structure. Please try again or contact support if this persists.';
      statusCode = 500;
    } else if (errorMessage.includes('Failed to store')) {
      userMessage = 'Database error while saving proposals. Please try again.';
      statusCode = 500;
    }
    
    return NextResponse.json({ 
      error: userMessage,
      details: errorMessage,
      timestamp: new Date().toISOString(),
    }, { status: statusCode });
  }
}