# ExpenseTrack

An expense tracker with no database: sign in with Google, and your data
lives in a spreadsheet in your own Google Drive — each user's numbers stay
in their own Google account.

The app itself is a static site. A small Cloudflare Worker sits alongside
it (`worker/`) for the things a static page can't do on its own —
subscription checks for the Pro features, the Viber bot, and error
reporting. It keeps no copy of your expenses — though connecting the Viber
bot does store a Google token for it, since acting on a chat message means
reaching your sheet with no browser open. See
[BILLING_SETUP.md](BILLING_SETUP.md) and [VIBER_SETUP.md](VIBER_SETUP.md).

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
npm run test:e2e     # Playwright, against a mocked Google backend
```

The end-to-end suite needs no Google account or network access — it runs
the real UI against mocked Sheets/Drive/Identity APIs, and is the check
worth running before shipping anything behavioural.

`npm run typecheck` also exists, but it has never passed: the UI components
are plain `.jsx` with no prop types, so it reports hundreds of "children
does not exist" errors across the whole codebase. It's not a gate, and a
clean run would mean typing the entire UI layer.
