import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { listFiles } from '@/lib/cloud-storage/onedrive-service';

/**
 * GET /api/import/onedrive/files
 * List files in OneDrive or SharePoint folder
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId') || 'root';
    const siteId = searchParams.get('siteId') || undefined;
    const pageToken = searchParams.get('pageToken') || undefined;

    const result = await listFiles(user.id, folderId, siteId, pageToken);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('List OneDrive files error:', error);
    
    // Check if it's a "not connected" error
    if (error instanceof Error && error.message.includes('not connected')) {
      return NextResponse.json({ 
        error: 'OneDrive not connected',
        message: 'Please connect your OneDrive account first',
      }, { status: 401 });
    }
    
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

