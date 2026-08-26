# AGENTS.md

## Project Context

ExpenseTrack is a React (Vite) app, static except for one narrow exception:
auth is "Sign in with Google," and every user's actual data (expenses,
categories, recurring templates, settings) lives in a spreadsheet in that
user's own Google Drive, read/written directly from the browser via the
Sheets/Drive APIs — no database for app data, ever.

The exception is `worker/`, a Cloudflare Worker — originally just a
subscription-status check (Recurring is a Pro feature, enforced
server-side so it can't be bypassed by editing the browser), now also the
backend for the Viber bot (also Pro): parses a chat message with an LLM and
acts on the user's Sheet on their behalf. See `BILLING_SETUP.md` and
`VIBER_SETUP.md` for how each is wired up.

**The Viber feature is a deliberate, explicitly-approved exception to "no
shared backend, no stored credentials"** — the Worker permanently stores a
Google refresh token per user who connects Viber, because acting from a
chat message (no browser open) requires a standing credential. This was a
real tradeoff discussion with the user, not a default to repeat casually.
Don't add another feature that stores user credentials or reads/writes
user data server-side without raising the same conversation again — most
new features should still be pure frontend + Google Sheets, exactly like
before. The Viber path is the carved-out exception, not the new norm.

This project previously ran on the Base44 platform; that dependency has
been fully removed (no `@base44/sdk`, no Base44-hosted auth or database).
Do not reintroduce Base44-specific patterns.

## Key Files

- `src/`: frontend application source (all of it — there's no separate backend).
- `src/lib/googleAuth.js`: Google Identity Services wrapper (sign-in, token management).
- `src/lib/AuthContext.jsx`: React auth state, built on `googleAuth.js`.
- `src/lib/sheetsStore.js`: the data layer — CRUD against the user's Google
  Sheet for Expenses/Incomes/Categories/RecurringTemplate/Settings, plus
  Drive upload for receipts. This is the equivalent of what would normally
  be a database layer.
- `src/lib/finance.js`: pure calculation helpers (amortization schedules, monthly rollups).
- `src/lib/subscription.js` / `src/hooks/use-subscription.js`: client for the billing Worker — fails open (full access) when billing env vars aren't set, so this stays inert until `BILLING_SETUP.md` is followed.
- `worker/`: the Cloudflare Worker backing billing and the Viber bot (see Project Context above). Separate `package.json`/deploy from the main app. `sheetsClient.js`'s column layout must be kept in sync by hand with `src/lib/sheetsStore.js`'s `SCHEMAS` — the Worker can't import frontend code.
- `vite.config.js`: Vite config, including the `@` → `src/` alias.
- `.env` / `.env.example`: `VITE_GOOGLE_CLIENT_ID` — see `DEPLOY.md`. `VITE_SUBSCRIPTION_API_URL` / `VITE_STRIPE_PAYMENT_LINK` — see `BILLING_SETUP.md`, both optional.

## Working Notes

- `npm run dev` for local development; `npm run build` produces a static `dist/` deployable anywhere.
- Run `npm run lint` and `npm run typecheck` before finishing code changes.
- New data collections should follow the `makeStore(...)` pattern in `sheetsStore.js` (a sheet tab per collection, in the same "ExpenseTrack Data" spreadsheet) rather than introducing a different storage mechanism.
- Auth changes should go through `googleAuth.js`/`AuthContext.jsx`, not a new auth system — there is exactly one sign-in method (Google) by design, since it doubles as the data-access grant.
- See `DEPLOY.md` for the Google Cloud OAuth Client setup and static-host deployment steps.
