import { Client } from '@microsoft/microsoft-graph-client';
import { getTokens, updateTokens } from './token-manager';
import { CloudFile } from './types';

/**
 * Get authenticated Microsoft Graph client
 * Automatically refreshes token if expired
 */
async function getGraphClient(userId: string, provider: 'onedrive' | 'sharepoint' = 'onedrive') {
  const tokens = await getTokens(userId, provider);
  
  if (!tokens) {
    throw new Error(`${provider === 'onedrive' ? 'OneDrive' : 'SharePoint'} not connected. Please connect your account first.`);
  }

  // Check if token is expired and refresh if needed
  let accessToken = tokens.access_token;
  if (tokens.expires_at && new Date() >= tokens.expires_at) {
    if (tokens.refresh_token) {
      accessToken = await refreshMicrosoftToken(userId, tokens.refresh_token, provider);
    } else {
      throw new Error('Token expired and no refresh token available');
    }
  }

  const client = Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });

  return client;
}

/**
 * Refresh Microsoft access token
 */
async function refreshMicrosoftToken(
  userId: string,
  refreshToken: string,
  provider: 'onedrive' | 'sharepoint'
): Promise<string> {
  const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
  const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
  const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';

  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    throw new Error('Microsoft OAuth not configured');
  }

  const tokenUrl = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'Files.Read Sites.Read.All offline_access',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh token: ${errorText}`);
  }

  const tokenData = await response.json();
  const { access_token, refresh_token, expires_in } = tokenData;

  const expiresAt = expires_in
    ? new Date(Date.now() + expires_in * 1000)
    : null;

  // Update tokens
  await updateTokens(
    userId,
    provider,
    access_token,
    refresh_token || refreshToken,
    expiresAt,
    {}
  );

  // Also update SharePoint if it's OneDrive (they share tokens)
  if (provider === 'onedrive') {
    await updateTokens(
      userId,
      'sharepoint',
      access_token,
      refresh_token || refreshToken,
      expiresAt,
      {}
    );
  }

  return access_token;
}

/**
 * Get file metadata from OneDrive or SharePoint
 */
export async function getFileMetadata(
  userId: string,
  fileId: string,
  siteId?: string
): Promise<CloudFile> {
  const provider = siteId ? 'sharepoint' : 'onedrive';
  const client = await getGraphClient(userId, provider);

  let file;
  if (siteId) {
    // SharePoint file
    file = await client
      .api(`/sites/${siteId}/drive/items/${fileId}`)
      .get();
  } else {
    // OneDrive file
    file = await client
      .api(`/me/drive/items/${fileId}`)
      .get();
  }

  return {
    id: file.id,
    name: file.name,
    size: file.size || 0,
    mimeType: file.file?.mimeType || 'application/octet-stream',
    provider: siteId ? 'sharepoint' : 'onedrive',
    url: file.webUrl,
    downloadUrl: file['@microsoft.graph.downloadUrl'],
    metadata: {
      modifiedTime: file.lastModifiedDateTime,
      createdBy: file.createdBy,
    },
  };
}

/**
 * Download file from OneDrive or SharePoint
 */
export async function downloadFile(
  userId: string,
  fileId: string,
  siteId?: string
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const provider = siteId ? 'sharepoint' : 'onedrive';
  const client = await getGraphClient(userId, provider);

  // Get file metadata first
  let fileMetadata;
  if (siteId) {
    fileMetadata = await client
      .api(`/sites/${siteId}/drive/items/${fileId}`)
      .get();
  } else {
    fileMetadata = await client
      .api(`/me/drive/items/${fileId}`)
      .get();
  }

  const fileName = fileMetadata.name;
  const mimeType = fileMetadata.file?.mimeType || 'application/octet-stream';

  // Get download URL
  const downloadUrl = fileMetadata['@microsoft.graph.downloadUrl'];
  
  if (!downloadUrl) {
    throw new Error('No download URL available for file');
  }

  // Download file
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    mimeType,
    fileName,
  };
}

/**
 * List files in OneDrive or SharePoint folder
 */
export async function listFiles(
  userId: string,
  folderId: string = 'root',
  siteId?: string,
  pageToken?: string
): Promise<{ files: CloudFile[]; nextPageToken?: string }> {
  const provider = siteId ? 'sharepoint' : 'onedrive';
  const client = await getGraphClient(userId, provider);

  let apiPath;
  if (siteId) {
    // SharePoint
    apiPath = folderId === 'root'
      ? `/sites/${siteId}/drive/root/children`
      : `/sites/${siteId}/drive/items/${folderId}/children`;
  } else {
    // OneDrive
    apiPath = folderId === 'root'
      ? '/me/drive/root/children'
      : `/me/drive/items/${folderId}/children`;
  }

  console.log(`[OneDrive Service] Listing files:`, {
    apiPath,
    folderId,
    siteId,
    provider,
    hasPageToken: !!pageToken,
  });

  const request = client.api(apiPath);
  
  if (pageToken) {
    request.skipToken(pageToken);
  }

  let response;
  try {
    // Try with filter first (files only)
    console.log(`[OneDrive Service] Attempting to fetch with file filter`);
    response = await request
      .filter("file ne null") // Only files, not folders
      .top(100)
      .get();
    console.log(`[OneDrive Service] Successfully fetched with filter, found ${response.value?.length || 0} items`);
  } catch (filterError: any) {
    console.log(`[OneDrive Service] Filter failed, trying without filter:`, {
      error: filterError.message,
      code: filterError.code,
      statusCode: filterError.statusCode,
      body: filterError.body,
    });
    
    // If filter fails, try without filter and filter in code
    // Create a fresh request object for the retry
    try {
      const retryRequest = client.api(apiPath);
      if (pageToken) {
        retryRequest.skipToken(pageToken);
      }
      
      response = await retryRequest
        .top(100)
        .get();
      console.log(`[OneDrive Service] Successfully fetched without filter, found ${response.value?.length || 0} items`);
      
      // Filter out folders in code
      if (response.value) {
        response.value = response.value.filter((item: any) => item.file !== null && item.file !== undefined);
        console.log(`[OneDrive Service] Filtered to ${response.value.length} files`);
      }
    } catch (noFilterError: any) {
      console.error(`[OneDrive Service] Both filtered and unfiltered requests failed:`, {
        filterError: filterError.message,
        noFilterError: noFilterError.message,
        filterCode: filterError.code,
        noFilterCode: noFilterError.code,
        filterStatusCode: filterError.statusCode,
        noFilterStatusCode: noFilterError.statusCode,
        filterBody: filterError.body,
        noFilterBody: noFilterError.body,
      });
      throw noFilterError;
    }
  }

  const files: CloudFile[] = (response.value || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    size: item.size || 0,
    mimeType: item.file?.mimeType || 'application/octet-stream',
    provider: siteId ? 'sharepoint' : 'onedrive',
    url: item.webUrl,
    downloadUrl: item['@microsoft.graph.downloadUrl'],
    modifiedTime: item.lastModifiedDateTime,
    metadata: {
      modifiedTime: item.lastModifiedDateTime,
      createdBy: item.createdBy,
      ...(siteId ? { siteId } : {}), // Include siteId for SharePoint files
    },
  }));

  console.log(`[OneDrive Service] Returning ${files.length} files`);
  return {
    files,
    nextPageToken: response['@odata.nextLink'] ? response['@odata.nextLink'].split('$skiptoken=')[1] : undefined,
  };
}

/**
 * List SharePoint sites
 */
export async function listSharePointSites(userId: string): Promise<Array<{ id: string; name: string; webUrl: string }>> {
  console.log(`[OneDrive Service] Listing SharePoint sites for user ${userId}`);
  const client = await getGraphClient(userId, 'sharepoint');

  try {
    console.log(`[OneDrive Service] Calling /sites?search=*`);
    const response = await client
      .api('/sites?search=*')
      .get();

    console.log(`[OneDrive Service] Found ${response.value?.length || 0} SharePoint sites`);
    return (response.value || []).map((site: any) => ({
      id: site.id,
      name: site.displayName,
      webUrl: site.webUrl,
    }));
  } catch (error: any) {
    console.error(`[OneDrive Service] Error listing SharePoint sites:`, {
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      body: error.body,
    });
    
    // Check if it's the MSA account error
    if (error.message?.includes('MSA accounts') || error.body?.includes('MSA accounts')) {
      const msaError = new Error('SharePoint sites are only available for work or school accounts, not personal Microsoft accounts');
      (msaError as any).code = 'MSA_NOT_SUPPORTED';
      (msaError as any).statusCode = 400;
      throw msaError;
    }
    
    throw error;
  }
}

/**
 * Check if token is valid
 */
export async function ensureValidToken(userId: string, provider: 'onedrive' | 'sharepoint' = 'onedrive'): Promise<boolean> {
  try {
    const client = await getGraphClient(userId, provider);
    // Try a simple API call to verify token
    await client.api('/me').get();
    return true;
  } catch (error: any) {
    if (error.statusCode === 401) {
      return false;
    }
    throw error;
  }
}

