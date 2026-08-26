// Minimal Sheets/Drive client for the Viber bot's side of the app.
// Column layout mirrors src/lib/sheetsStore.js's SCHEMAS exactly — this
// Worker has its own build/deploy and can't import frontend code, so it's
// kept in sync by hand. If a column is ever added/reordered there, update
// EXPENSE_COLS/INCOME_COLS/CATEGORY_COLS here too.
const SPREADSHEET_TITLE = 'ExpenseTrack Data';

async function sheetsFetch(accessToken, path, init = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Sheets API error ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function driveFetch(accessToken, path) {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function findSpreadsheetId(accessToken) {
  const q = `name='${SPREADSHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const data = await driveFetch(accessToken, `/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`);
  return data.files?.[0]?.id || null;
}

const EXPENSE_COLS = [
  'id', 'description', 'amount', 'currency', 'paid_date', 'category_id', 'payment_method', 'notes',
  'tags', 'receipt_file_url', 'expense_type', 'period_value', 'period_unit', 'amortization_schedule',
  'created_date', 'reconciled', 'recurring_template_id',
];
const INCOME_COLS = [
  'id', 'description', 'amount', 'currency', 'received_date', 'source', 'notes', 'tags',
  'created_date', 'reconciled', 'recurring_template_id',
];
const CATEGORY_COLS = ['id', 'name', 'icon', 'color', 'parent_id', 'sort_order', 'created_date'];

function colLetter(index) {
  let n = index + 1, s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function readRows(accessToken, spreadsheetId, sheetName, cols) {
  const lastCol = colLetter(cols.length - 1);
  const data = await sheetsFetch(accessToken, `/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A2:${lastCol}`);
  return (data.values || [])
    .map((row, i) => {
      const obj = { _row: i + 2 };
      cols.forEach((c, idx) => { obj[c] = row[idx]; });
      return obj;
    })
    .filter((r) => r.id);
}

export async function getCategories(accessToken, spreadsheetId) {
  const rows = await readRows(accessToken, spreadsheetId, 'Categories', CATEGORY_COLS);
  return rows.map((r) => ({ id: r.id, name: r.name || '', parent_id: r.parent_id || null }));
}

export async function listExpenses(accessToken, spreadsheetId) {
  const rows = await readRows(accessToken, spreadsheetId, 'Expenses', EXPENSE_COLS);
  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount) || 0,
    tags: r.tags ? JSON.parse(r.tags) : [],
    amortization_schedule: r.amortization_schedule ? JSON.parse(r.amortization_schedule) : [],
  }));
}

export async function listIncomes(accessToken, spreadsheetId) {
  const rows = await readRows(accessToken, spreadsheetId, 'Incomes', INCOME_COLS);
  return rows.map((r) => ({ ...r, amount: Number(r.amount) || 0, tags: r.tags ? JSON.parse(r.tags) : [] }));
}

export async function appendExpense(accessToken, spreadsheetId, e) {
  const id = crypto.randomUUID();
  const row = [
    id, e.description || '', e.amount ?? 0, e.currency || 'EUR', e.paid_date || '',
    e.category_id || '', 'card', '', JSON.stringify(['viber']), '', 'single', '', '',
    JSON.stringify([]), new Date().toISOString(), false, '',
  ];
  await sheetsFetch(accessToken, `/${spreadsheetId}/values/Expenses!A1:append?valueInputOption=RAW`, {
    method: 'POST', body: JSON.stringify({ values: [row] }),
  });
  return { id, description: e.description, amount: e.amount, currency: e.currency || 'EUR', paid_date: e.paid_date };
}

export async function appendIncome(accessToken, spreadsheetId, i) {
  const id = crypto.randomUUID();
  const row = [
    id, i.description || '', i.amount ?? 0, i.currency || 'EUR', i.received_date || '',
    i.source || 'other', '', JSON.stringify(['viber']), new Date().toISOString(), false, '',
  ];
  await sheetsFetch(accessToken, `/${spreadsheetId}/values/Incomes!A1:append?valueInputOption=RAW`, {
    method: 'POST', body: JSON.stringify({ values: [row] }),
  });
  return { id, description: i.description, amount: i.amount, currency: i.currency || 'EUR', received_date: i.received_date };
}

async function getSheetGid(accessToken, spreadsheetId, sheetName) {
  const meta = await sheetsFetch(accessToken, `/${spreadsheetId}?fields=sheets.properties`);
  return meta.sheets.find((s) => s.properties.title === sheetName)?.properties.sheetId;
}

export async function deleteRow(accessToken, spreadsheetId, sheetName, rowNumber) {
  const gid = await getSheetGid(accessToken, spreadsheetId, sheetName);
  await sheetsFetch(accessToken, `/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber } } }],
    }),
  });
}
