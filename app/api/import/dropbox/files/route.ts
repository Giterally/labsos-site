import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { listFiles } from '@/lib/cloud-storage/dropbox-service';

/**
 * GET /api/import/dropbox/files
 * List files in Dropbox folder
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || '';
    const cursor = searchParams.get('cursor') || undefined;

    const result = await listFiles(user.id, path, cursor);

    return NextResponse.json({
      files: result.files,
      nextPageToken: result.cursor,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('List Dropbox files error:', error);
    
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

