import { NextRequest, NextResponse } from 'next/server';
import { storeTokens } from '@/lib/cloud-storage/token-manager';

const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY;
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET;
const DROPBOX_REDIRECT_URI = process.env.DROPBOX_REDIRECT_URI || 'http://localhost:3000/api/import/dropbox/auth/callback';

/**
 * GET /api/import/dropbox/auth/callback
 * Handle Dropbox OAuth callback
 */
export async function GET(request: NextRequest) {
  console.log('[Dropbox Callback] Starting callback handler');
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    console.log('[Dropbox Callback] Request params:', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
      error,
      errorDescription,
    });

    // Handle OAuth errors
    if (error) {
      console.error('Dropbox OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        new URL(`/dashboard/projects?error=${encodeURIComponent(`Dropbox OAuth failed: ${errorDescription || error}`)}`, request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/dashboard/projects?error=' + encodeURIComponent('Missing OAuth code or state'), request.url)
      );
    }

    if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
      return NextResponse.redirect(
        new URL('/dashboard/projects?error=' + encodeURIComponent('Dropbox OAuth not configured'), request.url)
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
    const tokenResponse = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: DROPBOX_APP_KEY,
        client_secret: DROPBOX_APP_SECRET,
        redirect_uri: DROPBOX_REDIRECT_URI,
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

    // Calculate expiration time (Dropbox tokens don't expire by default, but we'll use expires_in if provided)
    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000)
      : null;

    // Store tokens
    console.log('[Dropbox Callback] Storing tokens for userId:', userId);
    try {
      await storeTokens(
        userId,
        'dropbox',
        access_token,
        refresh_token || null,
        expiresAt,
        {
          token_type: tokenData.token_type || 'bearer',
          account_id: tokenData.account_id,
        }
      );
      console.log('[Dropbox Callback] Tokens stored successfully');
    } catch (storeError) {
      console.error('[Dropbox Callback] Error storing tokens:', storeError);
      throw storeError;
    }

    // Redirect to success page
    console.log('[Dropbox Callback] Redirecting to success page');
    return NextResponse.redirect(
      new URL('/dashboard/projects?success=' + encodeURIComponent('Dropbox connected successfully'), request.url)
    );
  } catch (error) {
    console.error('[Dropbox Callback] Unhandled error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    return NextResponse.redirect(
      new URL('/dashboard/projects?error=' + encodeURIComponent(`OAuth callback failed: ${error instanceof Error ? error.message : String(error)}`), request.url)
    );
  }
}

