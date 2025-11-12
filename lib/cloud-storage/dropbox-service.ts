import { Dropbox } from 'dropbox';
import { getTokens, updateTokens } from './token-manager';
import { CloudFile } from './types';
// @ts-ignore - node-fetch@2 doesn't have TypeScript types for ESM
import fetch from 'node-fetch';

/**
 * Get authenticated Dropbox client
 * Automatically refreshes token if expired
 */
async function getDropboxClient(userId: string) {
  console.log('[Dropbox Service] getDropboxClient called for userId:', userId);
  
  const tokens = await getTokens(userId, 'dropbox');
  console.log('[Dropbox Service] Tokens retrieved:', {
    hasTokens: !!tokens,
    hasAccessToken: !!tokens?.access_token,
    hasRefreshToken: !!tokens?.refresh_token,
    expiresAt: tokens?.expires_at,
    isExpired: tokens?.expires_at ? new Date() >= tokens.expires_at : false,
  });
  
  if (!tokens) {
    console.error('[Dropbox Service] No tokens found for user');
    throw new Error('Dropbox not connected. Please connect your account first.');
  }

  // Dropbox tokens don't expire by default, but check if we have expiration
  let accessToken = tokens.access_token;
  if (tokens.expires_at && new Date() >= tokens.expires_at) {
    console.log('[Dropbox Service] Token expired, attempting refresh...');
    if (tokens.refresh_token) {
      accessToken = await refreshDropboxToken(userId, tokens.refresh_token);
      console.log('[Dropbox Service] Token refreshed successfully');
    } else {
      console.error('[Dropbox Service] Token expired but no refresh token available');
      throw new Error('Token expired and no refresh token available');
    }
  }

  console.log('[Dropbox Service] Creating Dropbox client...');
  console.log('[Dropbox Service] Access token length:', accessToken?.length || 0);

  try {
    // Use node-fetch@2 which has .buffer() method required by Dropbox SDK
    // The Dropbox SDK expects node-fetch@2.x response format
    const dbx = new Dropbox({
      accessToken,
      fetch: fetch as any, // node-fetch@2 has the .buffer() method
    });
    
    console.log('[Dropbox Service] Using node-fetch@2 for Dropbox client');

    console.log('[Dropbox Service] Dropbox client created successfully');
    return dbx;
  } catch (error) {
    console.error('[Dropbox Service] Error creating Dropbox client:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
      errorObject: error,
    });
    throw error;
  }
}

/**
 * Refresh Dropbox access token
 */
async function refreshDropboxToken(userId: string, refreshToken: string): Promise<string> {
  const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY;
  const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET;

  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
    throw new Error('Dropbox OAuth not configured');
  }

  const response = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: DROPBOX_APP_KEY,
      client_secret: DROPBOX_APP_SECRET,
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
    'dropbox',
    access_token,
    refresh_token || refreshToken,
    expiresAt,
    {}
  );

  return access_token;
}

/**
 * Get file metadata from Dropbox
 */
export async function getFileMetadata(
  userId: string,
  filePath: string
): Promise<CloudFile> {
  const dbx = await getDropboxClient(userId);

  const metadata = await dbx.filesGetMetadata({
    path: filePath,
  });

  if (metadata.result['.tag'] === 'folder') {
    throw new Error('Path is a folder, not a file');
  }

  const file = metadata.result as any;

  return {
    id: file.id,
    name: file.name,
    size: file.size || 0,
    mimeType: getMimeTypeFromPath(file.name),
    provider: 'dropbox',
    path: file.path_lower || filePath,
    modifiedTime: file.client_modified || file.server_modified,
    metadata: {
      rev: file.rev,
      contentHash: file.content_hash,
    },
  };
}

/**
 * Download file from Dropbox
 */
export async function downloadFile(
  userId: string,
  filePath: string
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const dbx = await getDropboxClient(userId);

  // Get file metadata first
  const metadata = await dbx.filesGetMetadata({
    path: filePath,
  });

  if (metadata.result['.tag'] === 'folder') {
    throw new Error('Path is a folder, not a file');
  }

  const file = metadata.result as any;
  const fileName = file.name;
  const mimeType = getMimeTypeFromPath(fileName);

  // Download file
  console.log('[Dropbox Service] Calling filesDownload for:', filePath);
  const downloadResponse = await dbx.filesDownload({
    path: filePath,
  });
  
  console.log('[Dropbox Service] Download response structure:', {
    hasResult: !!downloadResponse.result,
    resultKeys: downloadResponse.result ? Object.keys(downloadResponse.result) : [],
    hasFileBinary: !!(downloadResponse.result as any)?.fileBinary,
    fileBinaryType: typeof (downloadResponse.result as any)?.fileBinary,
    fileBinaryConstructor: (downloadResponse.result as any)?.fileBinary?.constructor?.name,
    fullResult: downloadResponse.result,
  });

  const fileBinary = (downloadResponse.result as any).fileBinary;
  if (!fileBinary) {
    console.error('[Dropbox Service] No fileBinary in response:', downloadResponse.result);
    throw new Error('No file data received');
  }

  console.log('[Dropbox Service] Converting fileBinary to Buffer:', {
    fileBinaryType: typeof fileBinary,
    isBuffer: Buffer.isBuffer(fileBinary),
    isArrayBuffer: fileBinary instanceof ArrayBuffer,
    isUint8Array: fileBinary instanceof Uint8Array,
    hasBuffer: typeof fileBinary.buffer !== 'undefined',
    constructor: fileBinary.constructor?.name,
  });

  // Handle different data types from Dropbox SDK
  let buffer: Buffer;
  if (Buffer.isBuffer(fileBinary)) {
    buffer = fileBinary;
  } else if (fileBinary instanceof ArrayBuffer) {
    buffer = Buffer.from(fileBinary);
  } else if (fileBinary instanceof Uint8Array) {
    buffer = Buffer.from(fileBinary);
  } else if (fileBinary.buffer instanceof ArrayBuffer) {
    // TypedArray with .buffer property
    buffer = Buffer.from(fileBinary.buffer, fileBinary.byteOffset, fileBinary.byteLength);
  } else {
    // Try to convert directly
    console.log('[Dropbox Service] Attempting direct Buffer.from conversion');
    buffer = Buffer.from(fileBinary);
  }
  
  console.log('[Dropbox Service] Buffer created successfully:', {
    bufferLength: buffer.length,
    bufferType: typeof buffer,
    isBuffer: Buffer.isBuffer(buffer),
  });

  return {
    buffer,
    mimeType,
    fileName,
  };
}

/**
 * List files in a Dropbox folder
 */
export async function listFiles(
  userId: string,
  folderPath: string = '',
  cursor?: string
): Promise<{ files: CloudFile[]; hasMore: boolean; cursor?: string }> {
  console.log('[Dropbox Service] listFiles called:', { userId, folderPath, cursor });
  
  try {
    console.log('[Dropbox Service] Step 1: Getting Dropbox client...');
    const dbx = await getDropboxClient(userId);
    console.log('[Dropbox Service] Step 2: Client obtained, type:', typeof dbx);
    console.log('[Dropbox Service] Step 2: Client has filesListFolder:', typeof dbx.filesListFolder);
    console.log('[Dropbox Service] Step 2: Client has filesListFolderContinue:', typeof dbx.filesListFolderContinue);

    let response;
    if (cursor) {
      // Continue listing with cursor
      console.log('[Dropbox Service] Step 3: Continuing with cursor:', cursor);
      try {
        response = await dbx.filesListFolderContinue({
          cursor,
        });
        console.log('[Dropbox Service] Step 4: API call successful (continue)');
      } catch (apiError) {
        console.error('[Dropbox Service] API call error (continue):', {
          error: apiError instanceof Error ? apiError.message : String(apiError),
          stack: apiError instanceof Error ? apiError.stack : undefined,
          name: apiError instanceof Error ? apiError.name : undefined,
          errorObject: apiError,
        });
        throw apiError;
      }
    } else {
      // Start new listing
      // Dropbox API requires empty string for root, not 'root'
      const path = (folderPath === 'root' || folderPath === '') ? '' : folderPath;
      console.log('[Dropbox Service] Step 3: Starting new listing for path:', path);
      try {
        response = await dbx.filesListFolder({
          path,
          recursive: false,
        });
        console.log('[Dropbox Service] Step 4: API call successful (new listing)');
      } catch (apiError) {
        console.error('[Dropbox Service] API call error (new listing):', {
          error: apiError instanceof Error ? apiError.message : String(apiError),
          stack: apiError instanceof Error ? apiError.stack : undefined,
          name: apiError instanceof Error ? apiError.name : undefined,
          errorObject: apiError,
        });
        throw apiError;
      }
    }

    console.log('[Dropbox Service] Step 5: Processing response...');
    console.log('[Dropbox Service] Response structure:', {
      hasResult: !!response.result,
      hasEntries: !!response.result?.entries,
      entriesCount: response.result?.entries?.length || 0,
      hasMore: response.result?.has_more,
      hasCursor: !!response.result?.cursor,
    });

    const entries = response.result.entries || [];
    const files: CloudFile[] = [];

    for (const entry of entries) {
      if (entry['.tag'] === 'file') {
        const file = entry as any;
        files.push({
          id: file.id,
          name: file.name,
          size: file.size || 0,
          mimeType: getMimeTypeFromPath(file.name),
          provider: 'dropbox',
          path: file.path_lower || file.path_display,
          modifiedTime: file.client_modified || file.server_modified,
          isFolder: false,
          metadata: {
            rev: file.rev,
            contentHash: file.content_hash,
          },
        });
      } else if (entry['.tag'] === 'folder') {
        const folder = entry as any;
        files.push({
          id: folder.id || folder.path_lower || folder.path_display,
          name: folder.name,
          size: 0,
          mimeType: 'application/vnd.dropbox.folder',
          provider: 'dropbox',
          path: folder.path_lower || folder.path_display,
          isFolder: true,
          metadata: {},
        });
      }
    }

    console.log('[Dropbox Service] Step 6: Returning files:', files.length);
    return {
      files,
      hasMore: response.result.has_more || false,
      cursor: response.result.cursor,
    };
  } catch (error) {
    console.error('[Dropbox Service] Error in listFiles:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
      errorObject: error,
      errorKeys: error instanceof Error ? Object.keys(error) : [],
    });
    throw error;
  }
}

/**
 * Get MIME type from file path/name
 */
function getMimeTypeFromPath(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain',
    md: 'text/markdown',
    mp4: 'video/mp4',
    avi: 'video/avi',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
  };

  return mimeTypes[extension || ''] || 'application/octet-stream';
}

/**
 * Check if token is valid
 */
export async function ensureValidToken(userId: string): Promise<boolean> {
  try {
    const dbx = await getDropboxClient(userId);
    // Try a simple API call to verify token
    await dbx.usersGetCurrentAccount();
    return true;
  } catch (error: any) {
    if (error.status === 401) {
      return false;
    }
    throw error;
  }
}

