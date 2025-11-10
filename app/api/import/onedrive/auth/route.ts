import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth-middleware';
import crypto from 'crypto';

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/api/import/onedrive/auth/callback';

const SCOPES = [
  'Files.Read',
  'Sites.Read.All',
  'offline_access',
].join(' ');

/**
 * GET /api/import/onedrive/auth
 * Initiate Microsoft OAuth flow
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
      console.error('Microsoft OAuth configuration missing:', {
        hasClientId: !!MICROSOFT_CLIENT_ID,
        hasClientSecret: !!MICROSOFT_CLIENT_SECRET,
        hasRedirectUri: !!MICROSOFT_REDIRECT_URI,
      });
      return NextResponse.json({ 
        error: 'Microsoft OAuth not configured',
        message: 'Please configure MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET environment variables'
      }, { status: 500 });
    }

    // Generate state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    const stateWithUserId = `${state}:${user.id}`;
    const encodedState = Buffer.from(stateWithUserId).toString('base64url');

    // Generate PKCE code verifier and challenge
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // Store code verifier in state (in production, use secure session storage)
    const stateWithVerifier = `${encodedState}:${codeVerifier}`;
    const finalState = Buffer.from(stateWithVerifier).toString('base64url');

    // Build OAuth URL
    const authUrl = new URL(`https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set('client_id', MICROSOFT_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', MICROSOFT_REDIRECT_URI);
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('state', finalState);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return NextResponse.json({
      authUrl: authUrl.toString(),
      state: finalState,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('OneDrive OAuth initiation error:', error);
    return NextResponse.json({ 
      error: 'Failed to initiate OAuth flow' 
    }, { status: 500 });
  }
}

/**
 * DELETE /api/import/onedrive/auth
 * Revoke and remove OneDrive tokens
 */
export async function DELETE(request: NextRequest) {
  try {
    const authContext = await authenticateRequest(request);
    const { user } = authContext;

    const { deleteTokens, getTokens } = await import('@/lib/cloud-storage/token-manager');

    // Get tokens to revoke
    const tokens = await getTokens(user.id, 'onedrive');
    
    if (tokens) {
      // Revoke token with Microsoft
      try {
        await fetch(`https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000')}`);
      } catch (revokeError) {
        console.error('Error revoking Microsoft token:', revokeError);
        // Continue with deletion even if revocation fails
      }
    }

    // Delete tokens from database
    await deleteTokens(user.id, 'onedrive');
    await deleteTokens(user.id, 'sharepoint'); // SharePoint uses same tokens

    return NextResponse.json({ 
      success: true,
      message: 'OneDrive connection revoked successfully' 
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error('OneDrive token revocation error:', error);
    return NextResponse.json({ 
      error: 'Failed to revoke tokens' 
    }, { status: 500 });
  }
}

