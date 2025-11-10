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
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('List Google Drive files error:', error);
    
    // Check if it's a "not connected" error
    if (error instanceof Error && error.message.includes('not connected')) {
      return NextResponse.json({ 
        error: 'Google Drive not connected',
        message: 'Please connect your Google Drive account first',
      }, { status: 401 });
    }
    
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

