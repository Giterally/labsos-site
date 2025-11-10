import { NextRequest, NextResponse } from 'next/server';
import { storeTokens } from '@/lib/cloud-storage/token-manager';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/import/googledrive/auth/callback';

/**
 * GET /api/import/googledrive/auth/callback
 * Handle Google OAuth callback
 */
export async function GET(request: NextRequest) {
  console.log('[Google Drive Callback] Starting callback handler');
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    console.log('[Google Drive Callback] Request params:', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
      error,
    });

    // Handle OAuth errors
    if (error) {
      const errorDescription = searchParams.get('error_description') || 'Unknown error';
      console.error('Google OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        new URL(`/dashboard/projects?error=${encodeURIComponent(`Google OAuth failed: ${errorDescription}`)}`, request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/dashboard/projects?error=' + encodeURIComponent('Missing OAuth code or state'), request.url)
      );
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.redirect(
        new URL('/dashboard/projects?error=' + encodeURIComponent('Google OAuth not configured'), request.url)
      );
    }

    // Decode and verify state
    let userId: string;
    try {
      const decodedState = Buffer.from(state, 'base64url').toString('utf-8');
      const [stateValue, user] = decodedState.split(':');
      if (!user) {
        throw new Error('Invalid state format');
      }
      userId = user;
    } catch (stateError) {
      console.error('Invalid state parameter:', stateError);
      return NextResponse.redirect(
        new URL('/dashboard/projects?error=' + encodeURIComponent('Invalid OAuth state'), request.url)
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange error:', errorData);
      return NextResponse.redirect(
        new URL('/dashboard/projects?error=' + encodeURIComponent('Failed to exchange OAuth code'), request.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    if (!access_token) {
      return NextResponse.redirect(
        new URL('/dashboard/projects?error=' + encodeURIComponent('No access token received'), request.url)
      );
    }

    // Calculate expiration time
    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000)
      : null;

    // Store tokens
    console.log('[Google Drive Callback] Storing tokens for userId:', userId);
    try {
      await storeTokens(
        userId,
        'googledrive',
        access_token,
        refresh_token || null,
        expiresAt,
        {
          scope: tokenData.scope,
          token_type: tokenData.token_type,
        }
      );
      console.log('[Google Drive Callback] Tokens stored successfully');
    } catch (storeError) {
      console.error('[Google Drive Callback] Error storing tokens:', storeError);
      throw storeError;
    }

    // Redirect to success page or back to import page
    console.log('[Google Drive Callback] Redirecting to success page');
    return NextResponse.redirect(
      new URL('/dashboard/projects?success=' + encodeURIComponent('Google Drive connected successfully'), request.url)
    );
  } catch (error) {
    console.error('[Google Drive Callback] Unhandled error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    return NextResponse.redirect(
      new URL('/dashboard/projects?error=' + encodeURIComponent(`OAuth callback failed: ${error instanceof Error ? error.message : String(error)}`), request.url)
    );
  }
}

