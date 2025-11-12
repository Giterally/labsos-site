import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { listFiles } from '@/lib/cloud-storage/googledrive-service';

/**
 * GET /api/import/googledrive/files
 * List files in Google Drive folder
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId') || 'root';
    const pageToken = searchParams.get('pageToken') || undefined;

    const result = await listFiles(user.id, folderId, pageToken);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Google Drive Files API] ========== ERROR ==========');
    console.error('[Google Drive Files API] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[Google Drive Files API] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[Google Drive Files API] Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('[Google Drive Files API] Full error object:', error);
    
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    
    // Check if it's a "not connected" error
    if (error instanceof Error && error.message.includes('not connected')) {
      return NextResponse.json({ 
        error: 'Google Drive not connected',
        message: 'Please connect your Google Drive account first',
      }, { status: 401 });
    }
    
    // Check for Google API-specific errors
    const errorAny = error as any;
    const errorMessage = errorAny.message || errorAny.body || errorAny.error?.message || 'Unknown error';
    const errorCode = errorAny.code || errorAny.status || errorAny.statusCode;
    
    // Check for API not enabled error
    if (errorMessage.includes('API has not been used') || errorMessage.includes('API is not enabled')) {
      console.error('[Google Drive Files API] Google Drive API not enabled error');
      return NextResponse.json({ 
        error: 'Google Drive API not enabled',
        message: 'The Google Drive API has not been enabled for this project. Please enable it in the Google Cloud Console and wait a few minutes for the changes to propagate.',
        code: 'API_NOT_ENABLED',
      }, { status: 400 });
    }
    
    // Check for authentication/authorization errors
    if (errorCode === 401 || errorCode === 403 || errorMessage.includes('invalid_grant') || errorMessage.includes('invalid_token')) {
      console.error('[Google Drive Files API] Authentication error');
      return NextResponse.json({ 
        error: 'Authentication failed',
        message: 'Your Google Drive connection has expired. Please disconnect and reconnect your Google Drive account.',
        code: 'AUTH_ERROR',
      }, { status: 401 });
    }
    
    // Check for rate limiting
    if (errorCode === 429 || errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
      console.error('[Google Drive Files API] Rate limit error');
      return NextResponse.json({ 
        error: 'Rate limit exceeded',
        message: 'Google Drive API rate limit exceeded. Please try again in a few minutes.',
        code: 'RATE_LIMIT',
      }, { status: 429 });
    }
    
    // Check for other Google API errors
    if (errorCode === 400 || errorCode === 404) {
      console.error('[Google Drive Files API] Bad request error:', errorMessage);
      return NextResponse.json({ 
        error: 'Invalid request',
        message: errorMessage,
        code: errorCode,
      }, { status: errorCode });
    }
    
    return NextResponse.json({ 
      error: 'Internal server error',
      details: errorMessage,
      code: errorCode,
    }, { status: 500 });
  }
}

