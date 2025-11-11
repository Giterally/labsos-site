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
    const isSharePoint = searchParams.get('isSharePoint') === 'true';

    // For SharePoint, siteId is required
    if (isSharePoint && !siteId) {
      return NextResponse.json({ 
        error: 'SharePoint site required',
        message: 'Please select a SharePoint site first',
        requiresSiteSelection: true,
      }, { status: 400 });
    }

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
    
    // Check for specific Graph API errors
    const errorAny = error as any;
    if (errorAny.code === 'notSupported' || errorAny.statusCode === 400) {
      const errorMessage = errorAny.body || errorAny.message || 'Operation not supported';
      console.error('Graph API error details:', {
        code: errorAny.code,
        statusCode: errorAny.statusCode,
        message: errorMessage,
        requestId: errorAny.requestId,
      });
      
      // Check if it's an MSA account limitation
      if (errorMessage.includes('MSA accounts') || errorMessage.includes('personal Microsoft account')) {
        return NextResponse.json({ 
          error: 'Account type limitation',
          message: 'This feature requires a work or school Microsoft account. Personal Microsoft accounts have limited access to certain features.',
          code: 'MSA_NOT_SUPPORTED',
        }, { status: 400 });
      }
      
      return NextResponse.json({ 
        error: 'Operation not supported',
        message: errorMessage.includes('Operation not supported') 
          ? 'This operation is not supported for your account type. Please try a different folder or contact support if the issue persists.'
          : errorMessage,
        details: errorMessage,
        code: errorAny.code,
      }, { status: 400 });
    }
    
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

