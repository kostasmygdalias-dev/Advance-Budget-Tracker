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
`VIBER_SETUP.md` for how each is wired up. It also fronts a `/client-error`
endpoint the frontend reports uncaught errors to, and applies basic
per-IP/per-user rate limiting (`worker/src/rateLimit.js`) across its
endpoints — none of that needs any extra setup.

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
  Sheet for Expenses/Incomes/Categories/RecurringTemplate/Settings/Debts/Goals,
  Drive upload for receipts, and point-in-time backup/restore
  (`createBackupSnapshot`/`restoreBackupSnapshot`, stored as chunked JSON in a
  hidden `Backups` tab of the same spreadsheet). This is the equivalent of
  what would normally be a database layer.
- `src/lib/finance.js`: pure calculation helpers (amortization schedules,
  monthly rollups) plus `formatDateDMY` for turning a stored `YYYY-MM-DD`
  string into the DD-MM-YYYY this app always displays dates as.
- `src/hooks/useEntities.js`: the shared React Query cache for
  Categories/Settings (`useCategoriesQuery`/`useSettingsQuery`) — any
  component that needs categories should use this, not its own
  `entities.Category.list()` call. A form that fetched categories itself once
  mounted its category `<Select>` before that fetch resolved, and Radix
  Select silently cleared the selection to resync against the not-yet-loaded
  item list — wiping a saved expense's category on every edit. Not just a
  performance nicety; genuinely correctness-critical for any Select whose
  options load asynchronously.
- `src/components/ui/date-input.jsx`: the `DateInput` component — use this for
  any date field, never a native `<input type="date">`. That native input's
  displayed format follows the visitor's own browser locale (confirmed: the
  `lang` attribute has no effect on it), which can't be forced to match this
  app's DD/MM/YYYY convention. `DateInput` always displays/types DD/MM/YYYY
  while still storing and emitting the plain `YYYY-MM-DD` string every other
  date field uses.
- `src/lib/subscription.js` / `src/hooks/use-subscription.js`: client for the billing Worker — fails open (full access) when billing env vars aren't set, so this stays inert until `BILLING_SETUP.md` is followed.
- `worker/`: the Cloudflare Worker backing billing, the Viber bot, error
  reporting, and rate limiting (see Project Context above). Separate
  `package.json`/deploy from the main app. `sheetsClient.js`'s column layout
  must be kept in sync by hand with `src/lib/sheetsStore.js`'s `SCHEMAS` — the
  Worker can't import frontend code.
- `tests/e2e/`: Playwright end-to-end suite (`npx playwright test`), against
  a mocked Google Sheets/Drive/Identity backend (`tests/mocks/`) — no real
  Google account or network access needed. This is the actual regression
  safety net for this app; run it before pushing anything that touches
  behavior, not just `npm run lint`.
- `vite.config.js`: Vite config, including the `@` → `src/` alias.
- `.env` / `.env.example`: `VITE_GOOGLE_CLIENT_ID` — see `DEPLOY.md`. `VITE_SUBSCRIPTION_API_URL` / `VITE_STRIPE_PAYMENT_LINK` — see `BILLING_SETUP.md`, both optional.

## Working Notes

- `npm run dev` for local development; `npm run build` produces a static `dist/` deployable anywhere.
- Run `npm run lint` and the Playwright suite (`npx playwright test`) before finishing code changes — `npm run typecheck` too if present.
- **Pushing to `master` is a live-deploy action**, not just a save point: GitHub Actions deploys the frontend on every push, and separately deploys `worker/` whenever a push touches `worker/**`. Always build + lint + run the E2E suite locally first (for `worker/**` changes, also `npx wrangler deploy --dry-run` — there's no Worker test suite), push without asking each time once that's clean, then confirm the relevant workflow(s) actually succeeded (GitHub Actions REST API) before calling something done.
- New data collections should follow the `makeStore(...)` pattern in `sheetsStore.js` (a sheet tab per collection, in the same "ExpenseTrack Data" spreadsheet) rather than introducing a different storage mechanism. Adding a column to an existing collection is safe to do by just appending it to that collection's `SCHEMAS` entry and its `toRow`/`fromRow` pair — existing rows read back with a sensible default for the new field, no migration needed.
- Auth changes should go through `googleAuth.js`/`AuthContext.jsx`, not a new auth system — there is exactly one sign-in method (Google) by design, since it doubles as the data-access grant.
- See `DEPLOY.md` for the Google Cloud OAuth Client setup and static-host deployment steps.
