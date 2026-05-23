# Setting Up Google Drive & Sign-In

Application Pal can use Google OAuth for two things:
- **Sign in with Google** — no separate password needed
- **Google Drive / Docs** — manage application documents directly in your Drive

Both features are configured in a single OAuth consent dialog.

---

## Step 1 — Google Cloud Console

1. Open [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. "Application Pal")
3. Enable the following APIs:
   - **Google Drive API**
   - **Google Docs API**
   - **Google Identity** (for Sign in with Google — enabled automatically via the OAuth consent screen)

## Step 2 — OAuth Consent Screen

1. Navigate to **APIs & Services → OAuth consent screen**
2. Select **External**
3. Fill in:
   - App name: `Application Pal`
   - User support email: your Gmail address
4. Add scopes:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/documents`

   > ⚠️ **Important**: You must use `drive` (full access), **not** `drive.file`. The restricted `drive.file` scope only allows access to files created by the app itself — templates from your master folder cannot be copied with it.
5. Add test users: your own Gmail address
6. Save

## Step 3 — Create an OAuth Client

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**
2. Application type: **Web application**
3. Name: `Application Pal Local`
4. Authorised redirect URIs:
   ```
   http://localhost:8070/api/google/callback
   ```
   For a server deployment, also add:
   ```
   https://your-domain.com/api/google/callback
   ```
5. Click **Create** → copy the Client ID and Client Secret

## Step 4 — Configure .env

```env
GOOGLE_CLIENT_ID=647153348459-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
GOOGLE_REDIRECT_URI=http://localhost:8070/api/google/callback
GOOGLE_FRONTEND_URL=http://localhost:8070
GOOGLE_SCOPES=openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents
```

## Step 5 — Restart the Container

```bash
docker compose up -d backend
```

Then, in Application Pal: **Settings → Integrations → Connect with Google**.

---

## Optional: Template Folder (Master Folder)

If you have document templates in Drive (e.g. a formatted CV, cover letter template) that you want automatically available when creating an application folder:

1. Create a folder in Google Drive, e.g. "Application Templates"
2. Place your formatted Google Docs inside it
3. Copy the folder ID from the URL: `drive.google.com/drive/folders/**FOLDER-ID**`
4. Add it to `.env`:

```env
GOOGLE_MASTER_FOLDER_ID=your-folder-id-here
```

The templates will then appear in the Documents tab under "Assign from library" and can be copied into any application folder with one click.

---

## Optional: Default Storage Folder

All newly created application folders are placed in "My Drive" by default. To use a different target folder:

**Settings → Integrations → Google Drive Folder** → enter the folder ID or select it via the picker.

Alternatively, in `.env`:
```env
GOOGLE_APPLICATIONS_FOLDER_ID=your-folder-id-here
```
