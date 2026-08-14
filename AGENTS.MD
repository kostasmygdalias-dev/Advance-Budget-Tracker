# AGENTS.md

## Project Context

ExpenseTrack is a React (Vite) app, static except for one narrow exception:
auth is "Sign in with Google," and every user's actual data (expenses,
categories, recurring templates, settings) lives in a spreadsheet in that
user's own Google Drive, read/written directly from the browser via the
Sheets/Drive APIs — no database for app data, ever.

The one exception is billing: Recurring templates are a paid feature, and
`worker/` is a small Cloudflare Worker whose only job is answering "is this
Google account currently subscribed" — enforced server-side so it can't be
bypassed by editing the browser. It never sees expense/income data, only a
Google account id and Stripe subscription status. See `BILLING_SETUP.md`
for how it's wired up. Don't grow this into a general backend — if a new
feature seems to need server-side logic beyond "is this account paying,"
that's a signal to reconsider the approach, not to bolt more onto the
Worker.

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
- `worker/`: the Cloudflare Worker backing billing (see Project Context above). Separate `package.json`/deploy from the main app.
- `vite.config.js`: Vite config, including the `@` → `src/` alias.
- `.env` / `.env.example`: `VITE_GOOGLE_CLIENT_ID` — see `DEPLOY.md`. `VITE_SUBSCRIPTION_API_URL` / `VITE_STRIPE_PAYMENT_LINK` — see `BILLING_SETUP.md`, both optional.

## Working Notes

- `npm run dev` for local development; `npm run build` produces a static `dist/` deployable anywhere.
- Run `npm run lint` and `npm run typecheck` before finishing code changes.
- New data collections should follow the `makeStore(...)` pattern in `sheetsStore.js` (a sheet tab per collection, in the same "ExpenseTrack Data" spreadsheet) rather than introducing a different storage mechanism.
- Auth changes should go through `googleAuth.js`/`AuthContext.jsx`, not a new auth system — there is exactly one sign-in method (Google) by design, since it doubles as the data-access grant.
- See `DEPLOY.md` for the Google Cloud OAuth Client setup and static-host deployment steps.
