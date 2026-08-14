# Deploying ExpenseTrack

This is now a fully static app: no backend, no database. Auth is "Sign in
with Google," and every user's data lives in a spreadsheet in *their own*
Google Drive. Your host only ever serves the compiled HTML/CSS/JS — around
1MB total — to anyone who visits.

## 1. Create a Google OAuth Client (one-time, you as the app owner)

The app needs its own OAuth client so Google shows *your app's name* on the
consent screen (not a generic warning), and so it only works from domains
you control.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and
   create a project (or reuse one).
2. **APIs & Services → Library**: enable the **Google Sheets API** and the
   **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: set it up (External user
   type is fine for personal use; add your own Google account as a test
   user if the app stays in "Testing" mode, or publish it if you want
   anyone to be able to sign in).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: add your host's URL, e.g.
     `https://yourdomain.com` (and `http://localhost:5173` if you also want
     to test locally with `npm run dev`)
   - You do **not** need a redirect URI — this app uses the token-based
     flow, not a redirect-based one.
5. Copy the generated **Client ID** (ends in `.apps.googleusercontent.com`).

## 2. Configure the build

Create a `.env` file in the project root (copy `.env.example`):

```bash
VITE_GOOGLE_CLIENT_ID=xxxxxxxxxx.apps.googleusercontent.com
```

## 3. Build

```bash
npm install
npm run build
```

This produces a `dist/` folder — that's the entire deployable app.

## 4. Upload to your host (FTP / cPanel)

Upload the **contents** of `dist/` (not the folder itself) into your host's
web root (usually `public_html/` or `www/`):

```
dist/
  index.html
  .htaccess          ← keep this, see below
  assets/
    index-xxxx.js
    index-xxxx.css
```

Any FTP client (FileZilla, WinSCP) or the cPanel File Manager's upload/zip-extract
works. No Node.js needs to run on the host — it's just files.

### Why `.htaccess` matters

This app uses client-side routing (`/expenses`, `/settings`, etc. are all
handled by React in the browser, not real files on the server). Without the
included `.htaccess`, refreshing the page on any route other than `/` will
404. It's already in `dist/` after building (Vite copies everything from
`public/`) — just make sure it actually uploads (some FTP clients hide
dot-files by default; enable "show hidden files").

If your host isn't Apache (no `.htaccess` support), you need the equivalent
"rewrite all routes to index.html" rule for your server instead.

## 5. Test

Visit your domain, click "Continue with Google," and go through the
consent screen. On first sign-in the app creates a spreadsheet named
"ExpenseTrack Data" in your Drive automatically. Add an expense and confirm
it shows up as a row there.

## Updating the app later

Whenever you make changes: `npm run build` again, then re-upload the new
contents of `dist/` (the filenames inside `assets/` change on every build,
so it's safest to replace the whole folder rather than merge files).
