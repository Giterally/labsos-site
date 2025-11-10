/**
 * Cloud storage provider types
 */
export type CloudProvider = 'googledrive' | 'onedrive' | 'dropbox' | 'sharepoint';

/**
 * Cloud file metadata
 */
export interface CloudFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  provider: CloudProvider;
  url?: string;
  path?: string; // For Dropbox
  isFolder?: boolean;
  modifiedTime?: string;
  webViewLink?: string; // For Google Drive
  downloadUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * Stored token data (encrypted in database)
 */
export interface StoredToken {
  id: string;
  user_id: string;
  provider: CloudProvider;
  access_token: string; // Encrypted
  refresh_token?: string | null; // Encrypted
  expires_at: string | null;
  token_metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Decrypted token data (for API use)
 */
export interface DecryptedToken {
  access_token: string;
  refresh_token?: string | null;
  expires_at: Date | null;
  token_metadata: Record<string, any>;
}

/**
 * OAuth callback data
 */
export interface OAuthCallbackData {
  code: string;
  state: string;
  error?: string;
  error_description?: string;
}

/**
 * File import request
 */
export interface FileImportRequest {
  fileIds: string[];
  projectId: string;
  provider: CloudProvider;
  siteId?: string; // For SharePoint
}

