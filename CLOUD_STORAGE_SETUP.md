# Cloud Storage Integration Setup Guide

## Quick Setup

To use cloud storage integration, you need to configure OAuth credentials for each provider you want to use.

## 1. Create .env file

If you don't have a `.env` file, create one in the root directory:

```bash
cp env.example .env
```

## 2. Configure Google Drive

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Drive API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Application type: Web application
6. Authorized redirect URIs: `http://localhost:3000/api/import/googledrive/auth/callback` (or your production URL)
7. Copy the Client ID and Client Secret

Add to `.env`:
```bash
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/import/googledrive/auth/callback
```

## 3. Configure Microsoft (OneDrive/SharePoint)

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to "Azure Active Directory" → "App registrations"
3. Click "New registration"
4. Name: Your app name
5. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
6. Redirect URI: `http://localhost:3000/api/import/onedrive/auth/callback` (Web platform)
7. After creation, go to "Certificates & secrets" → "New client secret"
8. Copy the Client ID and Client Secret
9. Go to "API permissions" → Add:
   - Microsoft Graph → Delegated permissions → `Files.Read`
   - Microsoft Graph → Delegated permissions → `Sites.Read.All`
10. Click "Grant admin consent" (if you have admin rights)

Add to `.env`:
```bash
MICROSOFT_CLIENT_ID=your-client-id-here
MICROSOFT_CLIENT_SECRET=your-client-secret-here
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/import/onedrive/auth/callback
MICROSOFT_TENANT_ID=common
```

## 4. Configure Dropbox

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Click "Create app"
3. Choose API: "Scoped access"
4. Access level: "Full Dropbox" or "App folder"
5. App name: Your app name
6. Copy the App key and App secret
7. Add redirect URI: `http://localhost:3000/api/import/dropbox/auth/callback`

Add to `.env`:
```bash
DROPBOX_APP_KEY=your-app-key-here
DROPBOX_APP_SECRET=your-app-secret-here
DROPBOX_REDIRECT_URI=http://localhost:3000/api/import/dropbox/auth/callback
```

## 5. Generate Token Encryption Key

Generate a secure encryption key for storing OAuth tokens:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to `.env`:
```bash
TOKEN_ENCRYPTION_KEY=your-generated-64-character-hex-string
```

## 6. Restart Development Server

After adding environment variables, restart your Next.js development server:

```bash
# Stop the current server (Ctrl+C)
# Then restart
pnpm dev
```

## Production Setup

For production, update the redirect URIs to your production domain:
- `https://yourdomain.com/api/import/googledrive/auth/callback`
- `https://yourdomain.com/api/import/onedrive/auth/callback`
- `https://yourdomain.com/api/import/dropbox/auth/callback`

Make sure to update these in both:
1. Your `.env` file
2. The OAuth app settings in each provider's console

## Troubleshooting

### "OAuth not configured" error
- Check that all required environment variables are set in `.env`
- Make sure you've restarted the development server after adding variables
- Verify the variable names match exactly (case-sensitive)

### "Failed to initiate OAuth" error
- Check that redirect URIs match exactly in both `.env` and the provider's console
- Verify the Client ID and Client Secret are correct
- Check browser console for more detailed error messages

### "Failed to load files" error
- Make sure you've connected your account first (click "Connect" button)
- Check that the account has the necessary permissions
- Verify tokens are stored correctly in the database

