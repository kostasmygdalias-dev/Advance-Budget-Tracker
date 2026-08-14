# ExpenseTrack

A fully static expense tracker: sign in with Google, and your data lives in
a spreadsheet in your own Google Drive. No backend, no shared database —
each user's numbers stay in their own Google account.

## Run locally

```bash
npm install
cp .env.example .env   # then fill in VITE_GOOGLE_CLIENT_ID
npm run dev
```

Open the local URL Vite prints.

## Google sign-in setup

The app needs a Google OAuth Client ID to work (for both sign-in and Sheets
access — one consent covers both). See [DEPLOY.md](DEPLOY.md) for the exact
steps to create one and deploy the built app to your own host.

## Build

```bash
npm run build
```

Produces `dist/` — a plain static site, deployable anywhere (see
[DEPLOY.md](DEPLOY.md) for uploading to shared/FTP hosting).

## Checks

```bash
npm run lint
npm run typecheck
```
