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

    // Get selected source IDs from request body (optional - if not provided, use all user's files)
    const body = await request.json().catch(() => ({}));
    const { selectedSourceIds } = body;

    // Check if there are any completed files to generate proposals from (user-scoped)
    const { data: completedSources, error: sourcesError } = await supabaseServer
      .from('ingestion_sources')
      .select('id, source_name')
      .eq('user_id', user.id) // Files are user-scoped
      .eq('status', 'completed');

    if (sourcesError) {
      console.error('Error fetching completed sources:', sourcesError);
      return NextResponse.json({ error: 'Failed to fetch completed sources' }, { status: 500 });
    }

    if (!completedSources || completedSources.length === 0) {
      return NextResponse.json({ error: 'No completed files found. Please upload and process files first.' }, { status: 400 });
    }

    // If selectedSourceIds provided, validate they belong to the user
    let sourceIdsToUse = selectedSourceIds;
    if (selectedSourceIds && Array.isArray(selectedSourceIds) && selectedSourceIds.length > 0) {
      const validSourceIds = completedSources.map(s => s.id);
      const invalidIds = selectedSourceIds.filter(id => !validSourceIds.includes(id));
      if (invalidIds.length > 0) {
        return NextResponse.json({ 
          error: `Invalid source IDs: ${invalidIds.join(', ')}. These files do not belong to you.` 
        }, { status: 400 });
      }
      sourceIdsToUse = selectedSourceIds;
    } else {
      // Use all user's completed files if none selected
      sourceIdsToUse = completedSources.map(s => s.id);
    }

    console.log(`[GENERATE PROPOSALS] Starting proposal generation for user: ${user.id}, project: ${resolvedProjectId}`);
    console.log(`[GENERATE PROPOSALS] Using ${sourceIdsToUse.length} selected source(s) out of ${completedSources.length} total`);

    // Delete existing proposals for this user + project combination before generating new ones
    const { error: deleteError } = await supabaseServer
      .from('proposed_nodes')
      .delete()
      .eq('project_id', resolvedProjectId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('[GENERATE PROPOSALS] Failed to delete existing proposals:', deleteError);
      // Continue anyway - new proposals will be added
    } else {
      console.log('[GENERATE PROPOSALS] Cleared existing proposals for this user + project');
    }

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
          userId: user.id,
          sourceCount: sourceIdsToUse.length,
          sourceIds: sourceIdsToUse
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
    generateProposals(user.id, resolvedProjectId, sourceIdsToUse, jobId).catch(error => {
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