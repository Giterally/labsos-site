import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { listFiles } from '@/lib/cloud-storage/dropbox-service';

/**
 * GET /api/import/dropbox/files
 * List files in Dropbox folder
 */
export async function GET(request: NextRequest) {
  console.log('[Dropbox Files API] ========== GET request received ==========');
  console.log('[Dropbox Files API] Request URL:', request.url);
  console.log('[Dropbox Files API] Request headers:', Object.fromEntries(request.headers.entries()));
  
  try {
    console.log('[Dropbox Files API] Step 1: Authenticating request...');
    const authContext = await authenticateRequest(request);
    const { user } = authContext;
    console.log('[Dropbox Files API] Step 2: User authenticated:', {
      userId: user.id,
      userEmail: user.email,
    });

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || '';
    const cursor = searchParams.get('cursor') || undefined;
    console.log('[Dropbox Files API] Step 3: Request params:', { path, cursor });

    console.log('[Dropbox Files API] Step 4: Calling listFiles...');
    const result = await listFiles(user.id, path, cursor);
    console.log('[Dropbox Files API] Step 5: Files retrieved:', {
      fileCount: result.files.length,
      hasMore: result.hasMore,
      hasCursor: !!result.cursor,
    });

    return NextResponse.json({
      files: result.files,
      nextPageToken: result.cursor,
    });
  } catch (error) {
    console.error('[Dropbox Files API] ========== ERROR ==========');
    console.error('[Dropbox Files API] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[Dropbox Files API] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[Dropbox Files API] Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('[Dropbox Files API] Error name:', error instanceof Error ? error.name : 'Unknown');
    console.error('[Dropbox Files API] Full error object:', error);
    
    if (error instanceof AuthError) {
      console.error('[Dropbox Files API] Auth error:', error.message);
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    
    // Check if it's a "not connected" error
    if (error instanceof Error && error.message.includes('not connected')) {
      return NextResponse.json({ 
        error: 'Dropbox not connected',
        message: 'Please connect your Dropbox account first',
      }, { status: 401 });
    }
    
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

