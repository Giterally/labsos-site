import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import crypto from 'crypto';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/import/googledrive/auth/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

/**
 * GET /api/import/googledrive/auth
 * Initiate Google Drive OAuth flow
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('Google OAuth configuration missing:', {
        hasClientId: !!GOOGLE_CLIENT_ID,
        hasClientSecret: !!GOOGLE_CLIENT_SECRET,
        hasRedirectUri: !!GOOGLE_REDIRECT_URI,
      });
      return NextResponse.json({ 
        error: 'Google OAuth not configured',
        message: 'Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables'
      }, { status: 500 });
    }

    // Generate state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state in session/cookie (simplified - in production use secure session storage)
    // For now, we'll include user ID in state and verify on callback
    const stateWithUserId = `${state}:${user.id}`;
    const encodedState = Buffer.from(stateWithUserId).toString('base64url');

    // Build OAuth URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('access_type', 'offline'); // Request refresh token
    authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token
    authUrl.searchParams.set('state', encodedState);

    return NextResponse.json({
      authUrl: authUrl.toString(),
      state: encodedState,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('Google Drive OAuth initiation error:', error);
    return NextResponse.json({ 
      error: 'Failed to initiate OAuth flow' 
    }, { status: 500 });
  }
}

/**
 * DELETE /api/import/googledrive/auth
 * Revoke and remove Google Drive tokens
 */
export async function DELETE(request: NextRequest) {
  try {
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    const { deleteTokens } = await import('@/lib/cloud-storage/token-manager');
    const { getTokens } = await import('@/lib/cloud-storage/token-manager');

    // Get tokens to revoke
    const tokens = await getTokens(user.id, 'googledrive');
    
    if (tokens) {
      // Revoke token with Google
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.access_token}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });
      } catch (revokeError) {
        console.error('Error revoking Google token:', revokeError);
        // Continue with deletion even if revocation fails
      }
    }

    // Delete tokens from database
    await deleteTokens(user.id, 'googledrive');

    return NextResponse.json({ 
      success: true,
      message: 'Google Drive connection revoked successfully' 
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('Google Drive token revocation error:', error);
    return NextResponse.json({ 
      error: 'Failed to revoke tokens' 
    }, { status: 500 });
  }
}

