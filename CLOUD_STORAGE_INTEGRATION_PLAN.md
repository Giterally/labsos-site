# Cloud Storage Integration Implementation Plan

## Overview

This document outlines how to implement cloud storage integration for the import feature, allowing users to import files directly from OneDrive, SharePoint, Google Drive, Dropbox, and Google Docs without downloading and re-uploading files manually.

## Current Implementation Analysis

### Current File Upload Flow

1. **Frontend** (`app/dashboard/projects/[projectId]/import/page.tsx`):
   - Users select files via `<input type="file">` or drag-and-drop
   - Files are stored in `selectedFiles` state
   - `handleFileUpload()` sends files to `/api/import/upload` via FormData

2. **Backend** (`app/api/import/upload/route.ts`):
   - Receives `File` object from FormData
   - Validates file type and size (100MB limit)
   - Uploads to Supabase Storage (`project-uploads` bucket)
   - Creates `ingestion_sources` record
   - Triggers processing pipeline (Inngest or local)

3. **Database Schema** (`migrations/005_create_ingestion_sources_table.sql`):
   - `source_type`: Currently supports 'pdf', 'excel', 'video', 'audio', 'text', 'markdown', 'github'
   - `storage_path`: Path in Supabase Storage
   - `metadata`: JSONB field for additional metadata
   - `source_url`: Optional field (used for GitHub imports)

### Existing GitHub Integration Pattern

The codebase already has a GitHub integration that provides a good pattern:
- Separate API route: `/api/import/github/route.ts`
- Separate tab in UI for GitHub imports
- Uses OAuth token for authentication
- Creates `ingestion_sources` with `source_type: 'github'`
- Stores repository metadata in `metadata` JSONB field

## Implementation Architecture

### High-Level Approach

1. **OAuth 2.0 Authentication**: Each cloud provider requires OAuth for secure access
2. **File Picker UI**: Integrate each provider's file picker SDK or build custom browser-based pickers
3. **File Download & Processing**: Download files from cloud storage to Supabase Storage, then process through existing pipeline
4. **Token Management**: Securely store and refresh OAuth tokens per user

### Architecture Diagram

```
User → Import Page → Cloud Storage Tab → OAuth Flow → File Picker → 
Select Files → Backend API → Download from Cloud → Upload to Supabase → 
Existing Processing Pipeline
```

## Provider-Specific Implementation Details

### 1. Google Drive & Google Docs

**API**: Google Drive API v3  
**SDK**: `@google-cloud/drive` or `googleapis` npm package  
**Authentication**: OAuth 2.0  
**File Picker**: Google Picker API (JavaScript SDK)

**Implementation Steps**:

1. **Setup**:
   - Register app in Google Cloud Console
   - Enable Google Drive API
   - Create OAuth 2.0 credentials
   - Add redirect URIs

2. **Frontend Integration**:
   ```typescript
   // Load Google Picker API
   gapi.load('picker', { callback: onPickerApiLoad });
   
   // Create picker
   const picker = new google.picker.PickerBuilder()
     .addView(google.picker.ViewId.DOCS)
     .setOAuthToken(accessToken)
     .setCallback(pickerCallback)
     .build();
   picker.setVisible(true);
   ```

3. **Backend API Route**: `/api/import/googledrive/route.ts`
   - Accept file IDs from picker
   - Use Google Drive API to download files
   - Upload to Supabase Storage
   - Create ingestion source records

4. **Google Docs Special Handling**:
   - Google Docs files need export (not direct download)
   - Export as PDF, DOCX, or plain text
   - Use `files.export()` API endpoint

**Required Scopes**:
- `https://www.googleapis.com/auth/drive.readonly` (read-only access)
- `https://www.googleapis.com/auth/drive.file` (access to files created by app)

**Token Storage**: Store refresh tokens in encrypted database table `user_cloud_tokens`

### 2. OneDrive & SharePoint

**API**: Microsoft Graph API  
**SDK**: `@microsoft/microsoft-graph-client` npm package  
**Authentication**: Microsoft Identity Platform (OAuth 2.0)  
**File Picker**: Microsoft Graph File Picker (OneDrive File Picker SDK)

**Implementation Steps**:

1. **Setup**:
   - Register app in Azure AD
   - Configure redirect URIs
   - Request API permissions:
     - `Files.Read` (OneDrive)
     - `Sites.Read.All` (SharePoint)

2. **Frontend Integration**:
   ```typescript
   // Use OneDrive File Picker SDK
   import { OneDrive } from '@onedrive-picker';
   
   OneDrive.open({
     clientId: process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID,
     action: 'query',
     multiSelect: true,
     advanced: {
       queryParameters: 'select=id,name,size,file'
     },
     success: (files) => {
       // Handle selected files
     }
   });
   ```

3. **Backend API Route**: `/api/import/onedrive/route.ts`
   - Accept file IDs from picker
   - Use Microsoft Graph API to download files
   - Upload to Supabase Storage
   - Create ingestion source records

4. **SharePoint Special Handling**:
   - SharePoint sites accessed via Graph API
   - Use `/sites/{site-id}/drive/items/{item-id}/content` endpoint
   - Requires site ID and item ID

**Required Scopes**:
- `Files.Read` (OneDrive read access)
- `Sites.Read.All` (SharePoint read access)

### 3. Dropbox

**API**: Dropbox API v2  
**SDK**: `dropbox` npm package  
**Authentication**: OAuth 2.0  
**File Picker**: Dropbox Chooser (JavaScript SDK) or custom implementation

**Implementation Steps**:

1. **Setup**:
   - Create app in Dropbox App Console
   - Configure OAuth redirect URIs
   - Set app permissions (read-only)

2. **Frontend Integration**:
   ```typescript
   // Option 1: Dropbox Chooser (simpler, but limited)
   <script type="text/javascript" src="https://www.dropbox.com/static/api/2/dropins.js" 
     id="dropboxjs" data-app-key="YOUR_APP_KEY"></script>
   
   Dropbox.choose({
     success: (files) => {
       // Handle selected files
     },
     linkType: "direct",
     multiselect: true
   });
   
   // Option 2: Custom picker using Dropbox API
   // Use Dropbox API to list folders/files
   // Build custom file browser UI
   ```

3. **Backend API Route**: `/api/import/dropbox/route.ts`
   - Accept file paths from picker
   - Use Dropbox API to download files
   - Upload to Supabase Storage
   - Create ingestion source records

**Required Scopes**:
- `files.content.read` (read file contents)

### 4. Google Docs (Special Case)

Google Docs files are stored in Google Drive but require special handling:

**Implementation**:
- Detect Google Docs files (MIME type: `application/vnd.google-apps.document`)
- Use `files.export()` instead of `files.get()`
- Export formats:
  - PDF: `application/pdf`
  - DOCX: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - Plain text: `text/plain`
- Store original Google Docs link in metadata for reference

## Database Schema Changes

### New Table: `user_cloud_tokens`

Store OAuth tokens securely for each user and provider:

```sql
CREATE TABLE user_cloud_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL, -- 'googledrive', 'onedrive', 'dropbox', 'sharepoint'
  access_token text NOT NULL, -- Encrypted
  refresh_token text, -- Encrypted (if available)
  expires_at timestamptz,
  token_metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, provider)
);

CREATE INDEX idx_user_cloud_tokens_user_id ON user_cloud_tokens(user_id);
CREATE INDEX idx_user_cloud_tokens_provider ON user_cloud_tokens(provider);
```

### Update `ingestion_sources` Table

Add optional field for cloud storage source URLs:

```sql
ALTER TABLE ingestion_sources 
ADD COLUMN IF NOT EXISTS source_url text;

-- Update source_type enum to include cloud providers
-- Note: Current implementation uses text, so no enum change needed
-- Just document new source_type values: 'googledrive', 'onedrive', 'dropbox', 'sharepoint'
```

## API Routes Structure

### New API Routes

1. **`/api/import/googledrive/auth/route.ts`**
   - Initiate OAuth flow
   - Handle OAuth callback
   - Store tokens

2. **`/api/import/googledrive/files/route.ts`**
   - List files/folders
   - Get file metadata

3. **`/api/import/googledrive/import/route.ts`**
   - Accept file IDs
   - Download files
   - Upload to Supabase
   - Create ingestion sources

4. **Similar routes for OneDrive, Dropbox, SharePoint**

### Unified Import Route (Alternative)

Alternatively, create a unified route:

**`/api/import/cloud/route.ts`**
```typescript
POST /api/import/cloud
{
  "provider": "googledrive" | "onedrive" | "dropbox" | "sharepoint",
  "fileIds": ["file-id-1", "file-id-2"],
  "projectId": "project-uuid"
}
```

## Frontend Implementation

### New UI Components

1. **Cloud Storage Tab** in import page:
   ```typescript
   <TabsContent value="cloud" className="space-y-6">
     <Card>
       <CardHeader>
         <CardTitle>Import from Cloud Storage</CardTitle>
       </CardHeader>
       <CardContent>
         {/* Provider selection */}
         <ProviderSelector />
         
         {/* OAuth connection status */}
         <ConnectionStatus />
         
         {/* File picker */}
         <CloudFilePicker />
         
         {/* Selected files list */}
         <SelectedFilesList />
         
         {/* Import button */}
         <ImportButton />
       </CardContent>
     </Card>
   </TabsContent>
   ```

2. **Provider Selector Component**:
   - Buttons for each provider (Google Drive, OneDrive, Dropbox, SharePoint)
   - Show connection status (connected/disconnected)
   - "Connect" button to initiate OAuth

3. **Cloud File Picker Component**:
   - Provider-specific file picker UI
   - Folder navigation
   - File selection (multi-select)
   - File preview/metadata

4. **Connection Status Component**:
   - Show which providers are connected
   - "Disconnect" functionality
   - Token expiration warnings

### State Management

```typescript
// Cloud storage state
const [cloudProviders, setCloudProviders] = useState<{
  googledrive: { connected: boolean; token?: string };
  onedrive: { connected: boolean; token?: string };
  dropbox: { connected: boolean; token?: string };
  sharepoint: { connected: boolean; token?: string };
}>({
  googledrive: { connected: false },
  onedrive: { connected: false },
  dropbox: { connected: false },
  sharepoint: { connected: false }
});

const [selectedCloudFiles, setSelectedCloudFiles] = useState<CloudFile[]>([]);
const [cloudImporting, setCloudImporting] = useState(false);
```

## Security Considerations

### Token Storage

1. **Encryption**: Encrypt tokens at rest in database
2. **Refresh Tokens**: Store refresh tokens securely for automatic token renewal
3. **Token Expiration**: Check and refresh tokens before API calls
4. **Scope Limitation**: Request minimum required scopes (read-only)

### OAuth Flow Security

1. **State Parameter**: Use state parameter to prevent CSRF attacks
2. **PKCE**: Use PKCE (Proof Key for Code Exchange) for public clients
3. **Redirect URI Validation**: Strictly validate redirect URIs
4. **Token Storage**: Never store tokens in localStorage (use httpOnly cookies or encrypted database)

### API Security

1. **User Verification**: Verify user owns the tokens before using them
2. **Rate Limiting**: Implement rate limiting on import endpoints
3. **File Size Limits**: Enforce same 100MB limit as local uploads
4. **File Type Validation**: Validate file types before processing

## Error Handling

### Common Error Scenarios

1. **OAuth Errors**:
   - User denies access
   - Token expired
   - Invalid credentials

2. **API Errors**:
   - Rate limiting
   - File not found
   - Permission denied
   - Network errors

3. **Processing Errors**:
   - File too large
   - Unsupported file type
   - Download failure

### Error Recovery

- Automatic token refresh on 401 errors
- Retry logic for transient failures
- Clear error messages for users
- Fallback to manual upload option

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
1. Create `user_cloud_tokens` table
2. Implement OAuth flow infrastructure
3. Create base API routes structure
4. Build provider selector UI

### Phase 2: Google Drive (Week 3-4)
1. Implement Google Drive OAuth
2. Integrate Google Picker API
3. Create Google Drive import route
4. Test with various file types including Google Docs

### Phase 3: OneDrive & SharePoint (Week 5-6)
1. Implement Microsoft Graph OAuth
2. Integrate OneDrive File Picker
3. Create OneDrive/SharePoint import routes
4. Test SharePoint site access

### Phase 4: Dropbox (Week 7)
1. Implement Dropbox OAuth
2. Create Dropbox file picker (custom or Chooser)
3. Create Dropbox import route
4. Test file selection and import

### Phase 5: Polish & Testing (Week 8)
1. Error handling improvements
2. Token refresh automation
3. UI/UX improvements
4. Comprehensive testing
5. Documentation

## Required Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "googleapis": "^144.0.0",
    "@microsoft/microsoft-graph-client": "^3.0.7",
    "dropbox": "^11.0.0",
    "@azure/msal-browser": "^3.0.0",
    "@azure/msal-node": "^2.0.0"
  }
}
```

## Environment Variables

Add to `.env`:

```bash
# Google Drive
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/import/googledrive/auth/callback

# Microsoft (OneDrive/SharePoint)
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/import/onedrive/auth/callback
MICROSOFT_TENANT_ID=your-tenant-id

# Dropbox
DROPBOX_APP_KEY=your-dropbox-app-key
DROPBOX_APP_SECRET=your-dropbox-app-secret
DROPBOX_REDIRECT_URI=http://localhost:3000/api/import/dropbox/auth/callback

# Encryption key for tokens
TOKEN_ENCRYPTION_KEY=your-encryption-key
```

## Testing Strategy

### Unit Tests
- OAuth flow handlers
- Token encryption/decryption
- File download utilities
- API route handlers

### Integration Tests
- End-to-end OAuth flows
- File import from each provider
- Token refresh scenarios
- Error handling

### Manual Testing Checklist
- [ ] Google Drive file import
- [ ] Google Docs export and import
- [ ] OneDrive file import
- [ ] SharePoint file import
- [ ] Dropbox file import
- [ ] Multi-file selection
- [ ] Large file handling
- [ ] Token expiration and refresh
- [ ] Disconnect/reconnect flows
- [ ] Error scenarios

## Alternative Approaches

### Option 1: Third-Party Integration Service

Use services like:
- **CloudRail**: Unified API for multiple cloud providers
- **Cloud Elements**: Cloud storage integration platform
- **Zapier/Make**: Workflow automation (not suitable for direct integration)

**Pros**: Faster implementation, unified API  
**Cons**: Additional cost, dependency on third party, less control

### Option 2: Browser File System Access API

For some providers, use the File System Access API:
- Limited browser support
- Only works for files user has locally synced
- Not suitable for true cloud access

### Option 3: OAuth + Custom File Browser

Instead of using provider file pickers, build custom file browsers:
- More control over UI/UX
- Consistent experience across providers
- More development effort

## Migration Path

### For Existing Users
- No breaking changes to existing local file upload
- Cloud storage is additive feature
- Existing ingestion sources remain unchanged

### For New Source Types
- Add new `source_type` values: 'googledrive', 'onedrive', 'dropbox', 'sharepoint'
- Update processing pipeline to handle cloud-sourced files (should work transparently)
- Update UI to show cloud storage icons/badges

## Performance Considerations

1. **Parallel Downloads**: Download multiple files in parallel from cloud storage
2. **Streaming**: Stream large files directly to Supabase Storage (avoid memory issues)
3. **Caching**: Cache file metadata to reduce API calls
4. **Rate Limiting**: Respect provider rate limits
5. **Background Processing**: Use existing Inngest pipeline for async processing

## Monitoring & Analytics

Track:
- Number of imports per provider
- Success/failure rates
- Average file sizes
- Token refresh frequency
- Error types and frequencies

## Future Enhancements

1. **Incremental Sync**: Sync changes from cloud storage
2. **Folder Import**: Import entire folders recursively
3. **Auto-Import**: Scheduled imports from cloud storage
4. **File Sharing**: Export back to cloud storage
5. **Collaboration**: Share imported files with team members

## Conclusion

This implementation plan provides a comprehensive approach to adding cloud storage integration. The phased approach allows for incremental development and testing. The architecture follows existing patterns (similar to GitHub integration) while adding necessary infrastructure for OAuth and token management.

Key success factors:
- Secure token storage and management
- Robust error handling
- User-friendly OAuth flows
- Seamless integration with existing processing pipeline
- Clear UI for selecting and importing files

