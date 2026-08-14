# AGENTS.md

## Project Context

ExpenseTrack is a fully static React (Vite) app. There is no backend and no
shared database: auth is "Sign in with Google," and every user's data
(expenses, categories, recurring templates, settings) lives in a
spreadsheet in that user's own Google Drive, read/written directly from the
browser via the Sheets/Drive APIs.

This project previously ran on the Base44 platform; that dependency has
been fully removed (no `@base44/sdk`, no Base44-hosted auth or database).
Do not reintroduce Base44-specific patterns.

## Key Files

- `src/`: frontend application source (all of it — there's no separate backend).
- `src/lib/googleAuth.js`: Google Identity Services wrapper (sign-in, token management).
- `src/lib/AuthContext.jsx`: React auth state, built on `googleAuth.js`.
- `src/lib/sheetsStore.js`: the data layer — CRUD against the user's Google
  Sheet for Expenses/Categories/RecurringTemplate/Settings, plus Drive
  upload for receipts. This is the equivalent of what would normally be a
  database layer.
- `src/lib/finance.js`: pure calculation helpers (amortization schedules, monthly rollups).
- `vite.config.js`: Vite config, including the `@` → `src/` alias.
- `.env` / `.env.example`: `VITE_GOOGLE_CLIENT_ID` — see `DEPLOY.md`.

## Working Notes

- `npm run dev` for local development; `npm run build` produces a static `dist/` deployable anywhere.
- Run `npm run lint` and `npm run typecheck` before finishing code changes.
- New data collections should follow the `makeStore(...)` pattern in `sheetsStore.js` (a sheet tab per collection, in the same "ExpenseTrack Data" spreadsheet) rather than introducing a different storage mechanism.
- Auth changes should go through `googleAuth.js`/`AuthContext.jsx`, not a new auth system — there is exactly one sign-in method (Google) by design, since it doubles as the data-access grant.
- See `DEPLOY.md` for the Google Cloud OAuth Client setup and static-host deployment steps.
