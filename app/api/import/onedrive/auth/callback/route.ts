import { NextRequest, NextResponse } from 'next/server';
import { storeTokens } from '@/lib/cloud-storage/token-manager';
import crypto from 'crypto';

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/api/import/onedrive/auth/callback';

/**
 * GET /api/import/onedrive/auth/callback
 * Handle Microsoft OAuth callback
 */
export async function GET(request: NextRequest) {
  console.log('[OneDrive Callback] Starting callback handler');
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    console.log('[OneDrive Callback] Request params:', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
      error,
      errorDescription,
    });

    // Handle OAuth errors
    if (error) {
      console.error('[OneDrive Callback] Microsoft OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        new URL(`/dashboard/projects?error=${encodeURIComponent(`Microsoft OAuth failed: ${errorDescription || error}`)}`, request.url)
      );
    }

    if (!code || !state) {
      console.error('[OneDrive Callback] Missing code or state:', { hasCode: !!code, hasState: !!state });
      return NextResponse.redirect(
        new URL('/dashboard/projects?error=' + encodeURIComponent('Missing OAuth code or state'), request.url)
      );
    }

    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
      console.error('[OneDrive Callback] OAuth not configured');
      return NextResponse.redirect(
        new URL('/dashboard/projects?error=' + encodeURIComponent('Microsoft OAuth not configured'), request.url)
      );
    }

    // Decode and verify state (double-encoded: outer = encodedState:codeVerifier, inner = state:userId)
    let userId: string;
    let codeVerifier: string;
    try {
      console.log('[OneDrive Callback] Decoding state parameter');
      // First decode: get the outer layer (encodedState:codeVerifier)
      const outerDecoded = Buffer.from(state, 'base64url').toString('utf-8');
      const outerParts = outerDecoded.split(':');
      if (outerParts.length !== 2) {
        throw new Error('Invalid state format: expected encodedState:codeVerifier');
      }
      const [encodedState, verifier] = outerParts;
      if (!encodedState || !verifier) {
        throw new Error('Invalid state format: missing encodedState or verifier');
      }
      codeVerifier = verifier;
      console.log('[OneDrive Callback] Extracted code verifier, length:', codeVerifier.length);

      // Second decode: get the inner layer (state:userId)
      const innerDecoded = Buffer.from(encodedState, 'base64url').toString('utf-8');
      const innerParts = innerDecoded.split(':');
      if (innerParts.length !== 2) {
        throw new Error('Invalid state format: expected state:userId');
      }
      const [stateValue, user] = innerParts;
      if (!user) {
        throw new Error('Invalid state format: missing userId');
      }
      userId = user;
      console.log('[OneDrive Callback] Extracted userId:', userId);
    } catch (stateError) {
      console.error('[OneDrive Callback] Invalid state parameter:', stateError);
      return NextResponse.redirect(
        new URL('/dashboard/projects?error=' + encodeURIComponent('Invalid OAuth state'), request.url)
      );
    }

    // Exchange code for tokens
    console.log('[OneDrive Callback] Exchanging code for tokens');
    const tokenUrl = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: MICROSOFT_REDIRECT_URI,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
        scope: 'Files.Read Sites.Read.All offline_access',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[OneDrive Callback] Token exchange error:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorData,
        redirectUri: MICROSOFT_REDIRECT_URI,
        hasCodeVerifier: !!codeVerifier,
        codeVerifierLength: codeVerifier?.length,
      });
      return NextResponse.redirect(
        new URL('/dashboard/projects?error=' + encodeURIComponent(`Failed to exchange OAuth code: ${errorData}`), request.url)
      );
    }

    console.log('[OneDrive Callback] Token exchange successful');
    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    if (!access_token) {
      console.error('[OneDrive Callback] No access token in response');
      return NextResponse.redirect(
        new URL('/dashboard/projects?error=' + encodeURIComponent('No access token received'), request.url)
      );
    }

    console.log('[OneDrive Callback] Tokens received:', {
      hasAccessToken: !!access_token,
      hasRefreshToken: !!refresh_token,
      expiresIn: expires_in,
    });

    // Calculate expiration time
    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000)
      : null;

    // Store tokens for both OneDrive and SharePoint (they use the same tokens)
    console.log('[OneDrive Callback] Storing tokens for userId:', userId);
    try {
      await storeTokens(
        userId,
        'onedrive',
        access_token,
        refresh_token || null,
        expiresAt,
        {
          scope: tokenData.scope,
          token_type: tokenData.token_type,
        }
      );
      console.log('[OneDrive Callback] OneDrive tokens stored successfully');

      // Also store for SharePoint (same tokens)
      if (refresh_token) {
        await storeTokens(
          userId,
          'sharepoint',
          access_token,
          refresh_token,
          expiresAt,
          {
            scope: tokenData.scope,
            token_type: tokenData.token_type,
          }
        );
        console.log('[OneDrive Callback] SharePoint tokens stored successfully');
      }
    } catch (storeError) {
      console.error('[OneDrive Callback] Error storing tokens:', storeError);
      throw storeError;
    }

    // Redirect to success page
    console.log('[OneDrive Callback] Redirecting to success page');
    return NextResponse.redirect(
      new URL('/dashboard/projects?success=' + encodeURIComponent('OneDrive connected successfully'), request.url)
    );
  } catch (error) {
    console.error('[OneDrive Callback] Unhandled error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    return NextResponse.redirect(
      new URL('/dashboard/projects?error=' + encodeURIComponent(`OAuth callback failed: ${error instanceof Error ? error.message : String(error)}`), request.url)
    );
  }
}

