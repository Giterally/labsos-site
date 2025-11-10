import { google } from 'googleapis';
import { getTokens, updateTokens } from './token-manager';
import { CloudFile } from './types';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/import/googledrive/auth/callback';

/**
 * Get authenticated Google Drive client
 * Automatically refreshes token if expired
 */
async function getDriveClient(userId: string) {
  const tokens = await getTokens(userId, 'googledrive');
  
  if (!tokens) {
    throw new Error('Google Drive not connected. Please connect your account first.');
  }

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || undefined,
    expiry_date: tokens.expires_at ? tokens.expires_at.getTime() : undefined,
  });

  // Handle token refresh
  oauth2Client.on('tokens', async (newTokens) => {
    if (newTokens.access_token) {
      const expiresAt = newTokens.expiry_date
        ? new Date(newTokens.expiry_date)
        : null;

      await updateTokens(
        userId,
        'googledrive',
        newTokens.access_token,
        newTokens.refresh_token || tokens.refresh_token || null,
        expiresAt,
        tokens.token_metadata
      );
    }
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  return drive;
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  userId: string,
  fileId: string
): Promise<CloudFile> {
  const drive = await getDriveClient(userId);

  const response = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType,size,modifiedTime,webViewLink,exportLinks',
  });

  const file = response.data;

  return {
    id: file.id!,
    name: file.name!,
    size: parseInt(file.size || '0', 10),
    mimeType: file.mimeType!,
    provider: 'googledrive',
    webViewLink: file.webViewLink || undefined,
    metadata: {
      modifiedTime: file.modifiedTime,
      exportLinks: file.exportLinks,
    },
  };
}

/**
 * Download file from Google Drive
 * Handles Google Docs export automatically
 */
export async function downloadFile(
  userId: string,
  fileId: string
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const drive = await getDriveClient(userId);

  // Get file metadata first
  const fileMetadata = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType,exportLinks',
  });

  const file = fileMetadata.data;
  const mimeType = file.mimeType!;
  const fileName = file.name!;

  let buffer: Buffer;

  // Check if it's a Google Docs file (needs export)
  if (mimeType.startsWith('application/vnd.google-apps.')) {
    // Determine export format
    let exportMimeType: string;
    let exportExtension: string;

    if (mimeType === 'application/vnd.google-apps.document') {
      // Google Docs -> PDF or DOCX
      exportMimeType = 'application/pdf';
      exportExtension = '.pdf';
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      // Google Sheets -> XLSX
      exportMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      exportExtension = '.xlsx';
    } else if (mimeType === 'application/vnd.google-apps.presentation') {
      // Google Slides -> PDF
      exportMimeType = 'application/pdf';
      exportExtension = '.pdf';
    } else {
      // Default to PDF
      exportMimeType = 'application/pdf';
      exportExtension = '.pdf';
    }

    // Export the file
    const exportResponse = await drive.files.export(
      {
        fileId,
        mimeType: exportMimeType,
      },
      {
        responseType: 'arraybuffer',
      }
    );

    buffer = Buffer.from(exportResponse.data as ArrayBuffer);
  } else {
    // Regular file - download directly
    const downloadResponse = await drive.files.get(
      {
        fileId,
        alt: 'media',
      },
      {
        responseType: 'arraybuffer',
      }
    );

    buffer = Buffer.from(downloadResponse.data as ArrayBuffer);
  }

  return {
    buffer,
    mimeType: mimeType.startsWith('application/vnd.google-apps.')
      ? (mimeType === 'application/vnd.google-apps.document' ? 'application/pdf' : mimeType)
      : mimeType,
    fileName: fileName.endsWith('.pdf') || fileName.endsWith('.xlsx') || fileName.endsWith('.docx')
      ? fileName
      : `${fileName}${fileName.includes('.') ? '' : '.pdf'}`,
  };
}

/**
 * List files in a folder (or root)
 */
export async function listFiles(
  userId: string,
  folderId: string = 'root',
  pageToken?: string
): Promise<{ files: CloudFile[]; nextPageToken?: string }> {
  const drive = await getDriveClient(userId);

  const response = await drive.files.list({
    q: folderId === 'root'
      ? "trashed=false and mimeType!='application/vnd.google-apps.folder'"
      : `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
    fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink)',
    pageSize: 100,
    pageToken,
  });

  const files: CloudFile[] = (response.data.files || []).map((file) => ({
    id: file.id!,
    name: file.name!,
    size: parseInt(file.size || '0', 10),
    mimeType: file.mimeType!,
    provider: 'googledrive',
    webViewLink: file.webViewLink || undefined,
    modifiedTime: file.modifiedTime || undefined,
    metadata: {
      modifiedTime: file.modifiedTime,
    },
  }));

  return {
    files,
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Check if token is valid and refresh if needed
 */
export async function ensureValidToken(userId: string): Promise<boolean> {
  try {
    const drive = await getDriveClient(userId);
    // Try a simple API call to verify token
    await drive.about.get({ fields: 'user' });
    return true;
  } catch (error: any) {
    if (error.code === 401) {
      // Token expired or invalid
      return false;
    }
    throw error;
  }
}

