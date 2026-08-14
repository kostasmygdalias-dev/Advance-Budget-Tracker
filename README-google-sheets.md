# Per-user Google Sheets storage for Expenses

Expenses are stored in a Google Sheet created in **each user's own Google
Drive**, not in Base44's shared database. Categories, recurring templates,
and settings still live in Base44.

Code involved:
- [`base44/functions/expenses-sheet/entry.js`](base44/functions/expenses-sheet/entry.js) — backend function, CRUDs the Sheet via the user's Google token.
- [`src/lib/expenseSheet.js`](src/lib/expenseSheet.js) — frontend client with the same shape as `base44.entities.Expense` (`list/get/create/update/delete`).
- [`src/lib/googleConnector.js`](src/lib/googleConnector.js) — the connector ID, shared by both sides.
- [`src/pages/Settings.jsx`](src/pages/Settings.jsx) — "Connect Google Sheets" / "Disconnect" button.

## One-time setup (you need to do this — requires Base44 workspace admin)

This uses Base44's **App User Connector** feature: each signed-in user gets
their own OAuth token, as opposed to a shared connector where all users
share one token. This is different from `base44/connectors/*.jsonc` +
`base44 connectors push`, which only sets up shared, app-builder-scoped
connectors — that path is not what we want here.

1. In the Base44 dashboard, open **Workspace Settings → Connectors** (exact
   label may differ slightly — look for "App User Connectors" or similar).
2. Register a **Google** connector there with Sheets access
   (`https://www.googleapis.com/auth/spreadsheets` scope). This requires
   supplying OAuth credentials — Base44's docs describe this as "register
   OAuth credentials for the service," which may mean creating your own
   Google Cloud OAuth client (Sheets API enabled) and pasting its client
   ID/secret in, depending on what Base44's UI asks for.
3. Copy the **connector ID** it gives you (not the string `googlesheets` —
   a generated ID specific to your workspace's registration).
4. Paste that ID into **both**:
   - `CONNECTOR_ID` in [`base44/functions/expenses-sheet/entry.js`](base44/functions/expenses-sheet/entry.js)
   - `GOOGLE_SHEETS_CONNECTOR_ID` in [`src/lib/googleConnector.js`](src/lib/googleConnector.js)
5. Enable **Backend Functions** for this app in Base44 app settings (requires
   a plan that supports it).
6. Deploy the function:
   ```bash
   npx base44 functions deploy expenses-sheet
   ```
7. From the app, go to **Settings → Connect Google Sheets** as a test user
   and complete the Google OAuth consent screen.

## What happens after that

On first use, the backend function creates a spreadsheet named
"ExpenseTrack Data" in the user's Drive (sheet tab "Expenses", header row
matching the Expense fields) and stores its ID on that user's `Settings`
record (`google_sheet_id`). Every list/create/update/delete from the app
after that reads/writes that same spreadsheet through the Sheets API, using
the user's own OAuth token — nobody else, including Base44, holds a copy of
the row data itself (only the OAuth token, managed by Base44).

## What I could not verify

I don't have a live Base44 account or a registered connector to test
against, so this is built strictly to the documented SDK/CLI contracts but
**has not been exercised end-to-end**. Once you've done the setup above,
exercise the full loop (connect → add an expense → check it lands as a row
in your Google Sheet → edit → delete) and tell me if anything breaks.
