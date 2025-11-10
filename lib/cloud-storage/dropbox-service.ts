import { Dropbox } from 'dropbox';
import { getTokens, updateTokens } from './token-manager';
import { CloudFile } from './types';

/**
 * Get authenticated Dropbox client
 * Automatically refreshes token if expired
 */
async function getDropboxClient(userId: string) {
  const tokens = await getTokens(userId, 'dropbox');
  
  if (!tokens) {
    throw new Error('Dropbox not connected. Please connect your account first.');
  }

  // Dropbox tokens don't expire by default, but check if we have expiration
  let accessToken = tokens.access_token;
  if (tokens.expires_at && new Date() >= tokens.expires_at) {
    if (tokens.refresh_token) {
      accessToken = await refreshDropboxToken(userId, tokens.refresh_token);
    } else {
      throw new Error('Token expired and no refresh token available');
    }
  }

  const dbx = new Dropbox({
    accessToken,
  });

  return dbx;
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
  const downloadResponse = await dbx.filesDownload({
    path: filePath,
  });

  const fileBinary = downloadResponse.result.fileBinary;
  if (!fileBinary) {
    throw new Error('No file data received');
  }

  const buffer = Buffer.from(fileBinary);

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
  const dbx = await getDropboxClient(userId);

  let response;
  if (cursor) {
    // Continue listing with cursor
    response = await dbx.filesListFolderContinue({
      cursor,
    });
  } else {
    // Start new listing
    response = await dbx.filesListFolder({
      path: folderPath || '',
      recursive: false,
    });
  }

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
        metadata: {
          rev: file.rev,
          contentHash: file.content_hash,
        },
      });
    }
  }

  return {
    files,
    hasMore: response.result.has_more || false,
    cursor: response.result.cursor,
  };
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

