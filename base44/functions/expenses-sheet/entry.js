// Backend function: stores each app user's expenses in a Google Sheet that
// lives in THEIR OWN Google Drive (an "app user connector" token, not a
// shared service account) — so there is no central database of everyone's
// expenses, only per-user OAuth tokens minted by Base44.
//
// Setup required before this works (see README-google-sheets.md at the repo root):
//   1. Register a Google Sheets app-user connector in Base44 Workspace Settings.
//   2. Paste its connector ID below (and in src/lib/googleConnector.js on the frontend).
//   3. Enable Backend Functions for this app in Base44 app settings.
import { createClientFromRequest } from "npm:@base44/sdk";

// TODO: replace with the connector ID from Workspace Settings → Connectors
// (must match GOOGLE_SHEETS_CONNECTOR_ID in src/lib/googleConnector.js).
const CONNECTOR_ID = "REPLACE_WITH_YOUR_CONNECTOR_ID";

const SHEET_TITLE = "Expenses";
const SPREADSHEET_TITLE = "ExpenseTrack Data";
const HEADERS = [
  "id", "description", "amount", "currency", "paid_date", "category_id",
  "payment_method", "notes", "tags", "receipt_file_url", "expense_type",
  "period_value", "period_unit", "amortization_schedule", "created_date",
];
const LAST_COL = "O"; // one column per HEADERS entry (A..O)

async function sheetsFetch(token, path, init = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Google Sheets API error ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

async function getOrCreateSpreadsheet(base44, token) {
  const settingsList = await base44.entities.Settings.list();
  const settings = settingsList[0];
  if (settings?.google_sheet_id) return { spreadsheetId: settings.google_sheet_id, settings };

  const created = await sheetsFetch(token, "", {
    method: "POST",
    body: JSON.stringify({
      properties: { title: SPREADSHEET_TITLE },
      sheets: [{ properties: { title: SHEET_TITLE } }],
    }),
  });
  await sheetsFetch(
    token,
    `/${created.spreadsheetId}/values/${SHEET_TITLE}!A1:append?valueInputOption=RAW`,
    { method: "POST", body: JSON.stringify({ values: [HEADERS] }) },
  );

  if (settings) {
    await base44.entities.Settings.update(settings.id, { google_sheet_id: created.spreadsheetId });
  } else {
    await base44.entities.Settings.create({ default_currency: "EUR", google_sheet_id: created.spreadsheetId });
  }
  return { spreadsheetId: created.spreadsheetId, settings };
}

function rowToExpense(row, sheetRow) {
  const [
    id, description, amount, currency, paid_date, category_id, payment_method,
    notes, tags, receipt_file_url, expense_type, period_value, period_unit,
    amortization_schedule, created_date,
  ] = row;
  return {
    id,
    description: description || "",
    amount: Number(amount) || 0,
    currency: currency || "EUR",
    paid_date: paid_date || "",
    category_id: category_id || null,
    payment_method: payment_method || "card",
    notes: notes || null,
    tags: tags ? JSON.parse(tags) : [],
    receipt_file_url: receipt_file_url || null,
    expense_type: expense_type || "single",
    period_value: period_value ? Number(period_value) : null,
    period_unit: period_unit || null,
    amortization_schedule: amortization_schedule ? JSON.parse(amortization_schedule) : [],
    created_date: created_date || "",
    _row: sheetRow, // 1-based row number in the sheet, used internally for update/delete
  };
}

function expenseToRow(e) {
  return [
    e.id,
    e.description || "",
    e.amount ?? 0,
    e.currency || "EUR",
    e.paid_date || "",
    e.category_id || "",
    e.payment_method || "card",
    e.notes || "",
    JSON.stringify(e.tags || []),
    e.receipt_file_url || "",
    e.expense_type || "single",
    e.period_value ?? "",
    e.period_unit || "",
    JSON.stringify(e.amortization_schedule || []),
    e.created_date || new Date().toISOString(),
  ];
}

async function listAll(token, spreadsheetId) {
  const data = await sheetsFetch(token, `/${spreadsheetId}/values/${SHEET_TITLE}!A2:${LAST_COL}`);
  const rows = data.values || [];
  return rows
    .map((row, i) => rowToExpense(row, i + 2)) // +2: 1-based, plus header row
    .filter((e) => e.id);
}

async function findSheetId(token, spreadsheetId) {
  const meta = await sheetsFetch(token, `/${spreadsheetId}?fields=sheets.properties`);
  return meta.sheets.find((s) => s.properties.title === SHEET_TITLE).properties.sheetId;
}

export default async function (req) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let token;
  try {
    const connection = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);
    token = connection.accessToken;
  } catch {
    // User hasn't completed the Google OAuth flow yet (connectAppUser()).
    return Response.json({ error: "not_connected" }, { status: 412 });
  }

  const { action, id, data } = await req.json();
  const { spreadsheetId } = await getOrCreateSpreadsheet(base44, token);

  try {
    if (action === "list") {
      return Response.json({ expenses: await listAll(token, spreadsheetId) });
    }

    if (action === "get") {
      const found = (await listAll(token, spreadsheetId)).find((e) => e.id === id);
      if (!found) return Response.json({ error: "Not found" }, { status: 404 });
      return Response.json({ expense: found });
    }

    if (action === "create") {
      const expense = { ...data, id: crypto.randomUUID(), created_date: new Date().toISOString() };
      await sheetsFetch(
        token,
        `/${spreadsheetId}/values/${SHEET_TITLE}!A1:append?valueInputOption=RAW`,
        { method: "POST", body: JSON.stringify({ values: [expenseToRow(expense)] }) },
      );
      return Response.json({ expense });
    }

    if (action === "update") {
      const existing = (await listAll(token, spreadsheetId)).find((e) => e.id === id);
      if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
      const updated = { ...existing, ...data, id };
      await sheetsFetch(
        token,
        `/${spreadsheetId}/values/${SHEET_TITLE}!A${existing._row}:${LAST_COL}${existing._row}?valueInputOption=RAW`,
        { method: "PUT", body: JSON.stringify({ values: [expenseToRow(updated)] }) },
      );
      return Response.json({ expense: updated });
    }

    if (action === "delete") {
      const existing = (await listAll(token, spreadsheetId)).find((e) => e.id === id);
      if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
      const sheetId = await findSheetId(token, spreadsheetId);
      await sheetsFetch(token, `/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          requests: [{
            deleteDimension: {
              range: { sheetId, dimension: "ROWS", startIndex: existing._row - 1, endIndex: existing._row },
            },
          }],
        }),
      });
      return Response.json({ success: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
