import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import { getConnectedProviders } from '@/lib/cloud-storage/token-manager';

/**
 * GET /api/import/cloud/connections
 * Get connection status for all cloud providers
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    const providers = await getConnectedProviders(user.id);

    // SharePoint uses the same OAuth tokens as OneDrive
    const isOneDriveConnected = providers.includes('onedrive');
    
    const connections = {
      googledrive: providers.includes('googledrive'),
      onedrive: isOneDriveConnected,
      sharepoint: isOneDriveConnected, // SharePoint uses OneDrive tokens
      dropbox: providers.includes('dropbox'),
    };

    return NextResponse.json({ connections });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('Get connections error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

