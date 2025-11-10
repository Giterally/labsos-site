import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import crypto from 'crypto';

const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY;
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET;
const DROPBOX_REDIRECT_URI = process.env.DROPBOX_REDIRECT_URI || 'http://localhost:3000/api/import/dropbox/auth/callback';

/**
 * GET /api/import/dropbox/auth
 * Initiate Dropbox OAuth flow
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
      console.error('Dropbox OAuth configuration missing:', {
        hasAppKey: !!DROPBOX_APP_KEY,
        hasAppSecret: !!DROPBOX_APP_SECRET,
        hasRedirectUri: !!DROPBOX_REDIRECT_URI,
      });
      return NextResponse.json({ 
        error: 'Dropbox OAuth not configured',
        message: 'Please configure DROPBOX_APP_KEY and DROPBOX_APP_SECRET environment variables'
      }, { status: 500 });
    }

    // Generate state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    const stateWithUserId = `${state}:${user.id}`;
    const encodedState = Buffer.from(stateWithUserId).toString('base64url');

    // Build OAuth URL
    const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
    authUrl.searchParams.set('client_id', DROPBOX_APP_KEY);
    authUrl.searchParams.set('redirect_uri', DROPBOX_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('token_access_type', 'offline'); // Request refresh token
    authUrl.searchParams.set('scope', 'files.content.read');
    authUrl.searchParams.set('state', encodedState);

    return NextResponse.json({
      authUrl: authUrl.toString(),
      state: encodedState,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('Dropbox OAuth initiation error:', error);
    return NextResponse.json({ 
      error: 'Failed to initiate OAuth flow' 
    }, { status: 500 });
  }
}

/**
 * DELETE /api/import/dropbox/auth
 * Revoke and remove Dropbox tokens
 */
export async function DELETE(request: NextRequest) {
  try {
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    const { deleteTokens, getTokens } = await import('@/lib/cloud-storage/token-manager');

    // Get tokens to revoke
    const tokens = await getTokens(user.id, 'dropbox');
    
    if (tokens) {
      // Revoke token with Dropbox
      try {
        await fetch('https://api.dropbox.com/2/auth/token/revoke', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (revokeError) {
        console.error('Error revoking Dropbox token:', revokeError);
        // Continue with deletion even if revocation fails
      }
    }

    // Delete tokens from database
    await deleteTokens(user.id, 'dropbox');

    return NextResponse.json({ 
      success: true,
      message: 'Dropbox connection revoked successfully' 
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('Dropbox token revocation error:', error);
    return NextResponse.json({ 
      error: 'Failed to revoke tokens' 
    }, { status: 500 });
  }
}

