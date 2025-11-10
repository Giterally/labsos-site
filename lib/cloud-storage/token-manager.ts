import { supabaseServer } from '../supabase-server';
import { encryptToken, decryptToken } from './token-encryption';
import { CloudProvider, StoredToken, DecryptedToken } from './types';

/**
 * Store or update OAuth tokens for a user and provider
 */
export async function storeTokens(
  userId: string,
  provider: CloudProvider,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: Date | null,
  metadata: Record<string, any> = {}
): Promise<void> {
  console.log(`[TokenManager] Storing tokens for user ${userId}, provider ${provider}`);
  try {
    console.log(`[TokenManager] Encrypting access token (length: ${accessToken.length})`);
    const encryptedAccessToken = encryptToken(accessToken);
    console.log(`[TokenManager] Access token encrypted successfully`);
    
    const encryptedRefreshToken = refreshToken ? (() => {
      console.log(`[TokenManager] Encrypting refresh token (length: ${refreshToken.length})`);
      const encrypted = encryptToken(refreshToken);
      console.log(`[TokenManager] Refresh token encrypted successfully`);
      return encrypted;
    })() : null;

    console.log(`[TokenManager] Inserting/updating tokens in database`);
    const { error } = await supabaseServer
      .from('user_cloud_tokens')
      .upsert({
        user_id: userId,
        provider,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        expires_at: expiresAt?.toISOString() || null,
        token_metadata: metadata,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      });

    if (error) {
      console.error(`[TokenManager] Database error storing tokens:`, {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw new Error(`Failed to store tokens: ${error.message}`);
    }
    console.log(`[TokenManager] Tokens stored successfully in database`);
  } catch (error) {
    console.error(`[TokenManager] Error in storeTokens:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Get decrypted tokens for a user and provider
 * Returns null if no tokens found
 */
export async function getTokens(
  userId: string,
  provider: CloudProvider
): Promise<DecryptedToken | null> {
  const { data, error } = await supabaseServer
    .from('user_cloud_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    console.error('Error retrieving tokens:', error);
    throw new Error(`Failed to retrieve tokens: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  try {
    const accessToken = decryptToken(data.access_token);
    const refreshToken = data.refresh_token ? decryptToken(data.refresh_token) : null;
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      token_metadata: data.token_metadata || {},
    };
  } catch (decryptError) {
    console.error('Error decrypting tokens:', decryptError);
    throw new Error('Failed to decrypt tokens');
  }
}

/**
 * Check if tokens exist and are valid (not expired)
 */
export async function hasValidTokens(
  userId: string,
  provider: CloudProvider
): Promise<boolean> {
  const tokens = await getTokens(userId, provider);
  
  if (!tokens) {
    return false;
  }

  // Check if token is expired (with 5 minute buffer)
  if (tokens.expires_at) {
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    const expiresAt = new Date(tokens.expires_at.getTime() - bufferTime);
    return new Date() < expiresAt;
  }

  // If no expiration, assume valid
  return true;
}

/**
 * Update tokens (for refresh scenarios)
 */
export async function updateTokens(
  userId: string,
  provider: CloudProvider,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: Date | null,
  metadata: Record<string, any> = {}
): Promise<void> {
  await storeTokens(userId, provider, accessToken, refreshToken, expiresAt, metadata);
}

/**
 * Delete tokens for a user and provider
 */
export async function deleteTokens(
  userId: string,
  provider: CloudProvider
): Promise<void> {
  const { error } = await supabaseServer
    .from('user_cloud_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);

  if (error) {
    console.error('Error deleting tokens:', error);
    throw new Error(`Failed to delete tokens: ${error.message}`);
  }
}

/**
 * Get all connected providers for a user
 */
export async function getConnectedProviders(
  userId: string
): Promise<CloudProvider[]> {
  const { data, error } = await supabaseServer
    .from('user_cloud_tokens')
    .select('provider')
    .eq('user_id', userId);

  if (error) {
    console.error('Error getting connected providers:', error);
    return [];
  }

  return (data || []).map(row => row.provider as CloudProvider);
}

/**
 * Check if a provider is connected for a user
 */
export async function isProviderConnected(
  userId: string,
  provider: CloudProvider
): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from('user_cloud_tokens')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error checking provider connection:', error);
    return false;
  }

  return !!data;
}

