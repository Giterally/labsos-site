import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { listSharePointSites } from '@/lib/cloud-storage/onedrive-service';

/**
 * GET /api/import/onedrive/sites
 * List available SharePoint sites
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    const sites = await listSharePointSites(user.id);

    return NextResponse.json({ sites });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('List SharePoint sites error:', error);
    
    // Check if it's a "not connected" error
    if (error instanceof Error && error.message.includes('not connected')) {
      return NextResponse.json({ 
        error: 'SharePoint not connected',
        message: 'Please connect your SharePoint account first',
      }, { status: 401 });
    }
    
    // Check for MSA account error
    const errorAny = error as any;
    if (errorAny.code === 'MSA_NOT_SUPPORTED' || 
        errorAny.message?.includes('MSA accounts') || 
        errorAny.body?.includes('MSA accounts')) {
      return NextResponse.json({ 
        error: 'Account type not supported',
        message: 'SharePoint sites are only available for work or school Microsoft accounts, not personal Microsoft accounts (like @gmail.com or @outlook.com). Please use a work or school account to access SharePoint.',
        code: 'MSA_NOT_SUPPORTED',
      }, { status: 400 });
    }
    
    // Check for other Graph API errors
    if (errorAny.code === 'BadRequest' || errorAny.statusCode === 400) {
      const errorMessage = errorAny.body || errorAny.message || 'Bad request';
      console.error('Graph API error details:', {
        code: errorAny.code,
        statusCode: errorAny.statusCode,
        message: errorMessage,
        requestId: errorAny.requestId,
      });
      
      if (errorMessage.includes('MSA accounts')) {
        return NextResponse.json({ 
          error: 'Account type not supported',
          message: 'SharePoint sites are only available for work or school Microsoft accounts, not personal Microsoft accounts.',
          code: 'MSA_NOT_SUPPORTED',
        }, { status: 400 });
      }
    }
    
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

