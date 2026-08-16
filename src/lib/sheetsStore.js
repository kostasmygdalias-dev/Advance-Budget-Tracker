// Client-side data layer: every collection (Expenses, Categories, Recurring
// templates, Settings) lives as a tab in one Google Sheet, created in the
// signed-in user's own Drive on first use. No backend — reads/writes go
// straight from the browser to the Sheets/Drive APIs using the user's own
// OAuth token, so nobody but that user (and Google) ever sees their data.
import { getAccessToken, refreshAccessTokenSilently } from '@/lib/googleAuth';

const SPREADSHEET_TITLE = 'ExpenseTrack Data';
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];

async function authedFetch(url, init = {}) {
  const doFetch = (token) => fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

  let res = await doFetch(getAccessToken());
  if (res.status === 401) {
    const fresh = await refreshAccessTokenSilently();
    res = await doFetch(fresh);
  }
  if (!res.ok) {
    throw new Error(`Google API error ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

const sheetsFetch = (path, init) => authedFetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, init);
const driveFetch = (path, init) => authedFetch(`https://www.googleapis.com/drive/v3${path}`, init);

const SCHEMAS = {
  Expenses: ['id', 'description', 'amount', 'currency', 'paid_date', 'category_id', 'payment_method', 'notes', 'tags', 'receipt_file_url', 'expense_type', 'period_value', 'period_unit', 'amortization_schedule', 'created_date', 'reconciled'],
  Incomes: ['id', 'description', 'amount', 'currency', 'received_date', 'source', 'notes', 'tags', 'created_date', 'reconciled'],
  Categories: ['id', 'name', 'icon', 'color', 'parent_id', 'sort_order', 'created_date'],
  RecurringTemplate: ['id', 'description', 'amount', 'currency', 'frequency', 'custom_interval_days', 'next_due_date', 'active', 'created_date', 'type', 'source'],
  Settings: ['id', 'default_currency', 'monthly_budget_total', 'budget_per_category', 'created_date', 'budget_period', 'dashboard_layout'],
  Debts: ['id', 'person', 'direction', 'total_amount', 'paid_amount', 'currency', 'start_date', 'due_date', 'notes', 'created_date'],
  Goals: ['id', 'name', 'icon', 'target_amount', 'saved_amount', 'currency', 'deadline', 'created_date'],
};

let spreadsheetIdPromise = null;
const sheetGidCache = new Map();

async function findSpreadsheetId() {
  const q = `name='${SPREADSHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const data = await driveFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`);
  return data.files?.[0]?.id || null;
}

// Seeded once, only into a brand-new spreadsheet — never re-added later, so
// a user who deletes all of them (to build their own set) stays that way.
const DEFAULT_CATEGORIES = [
  { name: 'Groceries', icon: 'ShoppingCart', color: '#10b981' },
  { name: 'Housing', icon: 'Home', color: '#0f172a' },
  { name: 'Transport', icon: 'Car', color: '#0ea5e9' },
  { name: 'Dining Out', icon: 'Utensils', color: '#f59e0b' },
  { name: 'Bills & Utilities', icon: 'Zap', color: '#ef4444' },
  { name: 'Health', icon: 'Heart', color: '#8b5cf6' },
  { name: 'Travel', icon: 'Plane', color: '#14b8a6' },
  { name: 'Gifts', icon: 'Gift', color: '#ec4899' },
];

async function createSpreadsheet() {
  const created = await sheetsFetch('', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: SPREADSHEET_TITLE },
      sheets: Object.keys(SCHEMAS).map((title) => ({ properties: { title } })),
    }),
  });
  const spreadsheetId = created.spreadsheetId;
  const now = new Date().toISOString();
  // Row shape must match Category's toRow encoding below: id, name, icon, color, parent_id, sort_order, created_date.
  const defaultCategoryRows = DEFAULT_CATEGORIES.map((c, i) => [crypto.randomUUID(), c.name, c.icon, c.color, '', i, now]);
  await Promise.all(Object.entries(SCHEMAS).map(([title, headers]) =>
    sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(title)}!A1:append?valueInputOption=RAW`, {
      method: 'POST',
      body: JSON.stringify({ values: title === 'Categories' ? [headers, ...defaultCategoryRows] : [headers] }),
    }),
  ));
  return spreadsheetId;
}

// Adds any sheet tab (e.g. a newly introduced collection) that's missing from
// a spreadsheet created by an older version of the app, so existing users
// self-heal to the current schema instead of hitting a "range not found" error.
async function ensureAllSheetsExist(spreadsheetId) {
  const meta = await sheetsFetch(`/${spreadsheetId}?fields=sheets.properties`);
  const existingTitles = new Set();
  meta.sheets.forEach((s) => {
    existingTitles.add(s.properties.title);
    sheetGidCache.set(`${spreadsheetId}:${s.properties.title}`, s.properties.sheetId);
  });
  const missing = Object.keys(SCHEMAS).filter((title) => !existingTitles.has(title));
  if (!missing.length) return;
  const created = await sheetsFetch(`/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }),
  });
  created.replies.forEach((r) => sheetGidCache.set(`${spreadsheetId}:${r.addSheet.properties.title}`, r.addSheet.properties.sheetId));
  await Promise.all(missing.map((title) =>
    sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(title)}!A1:append?valueInputOption=RAW`, {
      method: 'POST',
      body: JSON.stringify({ values: [SCHEMAS[title]] }),
    }),
  ));
}

function getSpreadsheetId() {
  if (!spreadsheetIdPromise) {
    spreadsheetIdPromise = (async () => {
      const existing = await findSpreadsheetId();
      if (existing) {
        await ensureAllSheetsExist(existing);
        return existing;
      }
      return createSpreadsheet();
    })();
  }
  return spreadsheetIdPromise;
}

async function getSheetGid(spreadsheetId, sheetName) {
  const cacheKey = `${spreadsheetId}:${sheetName}`;
  if (sheetGidCache.has(cacheKey)) return sheetGidCache.get(cacheKey);
  const meta = await sheetsFetch(`/${spreadsheetId}?fields=sheets.properties`);
  meta.sheets.forEach((s) => sheetGidCache.set(`${spreadsheetId}:${s.properties.title}`, s.properties.sheetId));
  return sheetGidCache.get(cacheKey);
}

function sortBy(list, sort) {
  if (!sort) return list;
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  return [...list].sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    if (av < bv) return desc ? 1 : -1;
    if (av > bv) return desc ? -1 : 1;
    return 0;
  });
}

function makeStore(sheetName, toRow, fromRow) {
  const headers = SCHEMAS[sheetName];
  const lastCol = COLS[headers.length - 1];

  async function readRows() {
    const spreadsheetId = await getSpreadsheetId();
    const data = await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A2:${lastCol}`);
    const rows = data.values || [];
    return rows
      .map((row, i) => ({ ...fromRow(row), _row: i + 2 }))
      .filter((r) => r.id);
  }

  return {
    async list(sort, limit) {
      const rows = await readRows();
      const sorted = sortBy(rows, sort);
      return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
    },
    async get(id) {
      const rows = await readRows();
      return rows.find((r) => r.id === id) || null;
    },
    async create(data) {
      const spreadsheetId = await getSpreadsheetId();
      const record = { ...data, id: crypto.randomUUID(), created_date: new Date().toISOString() };
      await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=RAW`, {
        method: 'POST',
        body: JSON.stringify({ values: [toRow(record)] }),
      });
      return record;
    },
    async update(id, data) {
      const spreadsheetId = await getSpreadsheetId();
      const rows = await readRows();
      const existing = rows.find((r) => r.id === id);
      if (!existing) throw new Error('Record not found');
      const updated = { ...existing, ...data, id };
      await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A${existing._row}:${lastCol}${existing._row}?valueInputOption=RAW`, {
        method: 'PUT',
        body: JSON.stringify({ values: [toRow(updated)] }),
      });
      return updated;
    },
    async delete(id) {
      const spreadsheetId = await getSpreadsheetId();
      const rows = await readRows();
      const existing = rows.find((r) => r.id === id);
      if (!existing) return;
      const gid = await getSheetGid(spreadsheetId, sheetName);
      await sheetsFetch(`/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
          requests: [{
            deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: existing._row - 1, endIndex: existing._row } },
          }],
        }),
      });
    },
  };
}

const Expense = makeStore(
  'Expenses',
  (e) => [
    e.id, e.description || '', e.amount ?? 0, e.currency || 'EUR', e.paid_date || '',
    e.category_id || '', e.payment_method || 'card', e.notes || '', JSON.stringify(e.tags || []),
    e.receipt_file_url || '', e.expense_type || 'single', e.period_value ?? '', e.period_unit || '',
    JSON.stringify(e.amortization_schedule || []), e.created_date || new Date().toISOString(), e.reconciled === true,
  ],
  ([id, description, amount, currency, paid_date, category_id, payment_method, notes, tags, receipt_file_url, expense_type, period_value, period_unit, amortization_schedule, created_date, reconciled]) => ({
    id, description: description || '', amount: Number(amount) || 0, currency: currency || 'EUR', paid_date: paid_date || '',
    category_id: category_id || null, payment_method: payment_method || 'card', notes: notes || null,
    tags: tags ? JSON.parse(tags) : [], receipt_file_url: receipt_file_url || null, expense_type: expense_type || 'single',
    period_value: period_value !== '' && period_value != null ? Number(period_value) : null, period_unit: period_unit || null,
    amortization_schedule: amortization_schedule ? JSON.parse(amortization_schedule) : [], created_date: created_date || '',
    reconciled: reconciled === true || reconciled === 'TRUE',
  }),
);

const Category = makeStore(
  'Categories',
  (c) => [c.id, c.name || '', c.icon || '', c.color || '', c.parent_id || '', c.sort_order ?? 0, c.created_date || new Date().toISOString()],
  ([id, name, icon, color, parent_id, sort_order, created_date]) => ({
    id, name: name || '', icon: icon || '', color: color || '', parent_id: parent_id || null,
    sort_order: sort_order !== '' && sort_order != null ? Number(sort_order) : 0, created_date: created_date || '',
  }),
);

const RecurringTemplate = makeStore(
  'RecurringTemplate',
  (t) => [
    t.id, t.description || '', t.amount ?? 0, t.currency || 'EUR', t.frequency || 'monthly', t.custom_interval_days ?? '',
    t.next_due_date || '', t.active !== false, t.created_date || new Date().toISOString(), t.type || 'expense', t.source || '',
  ],
  ([id, description, amount, currency, frequency, custom_interval_days, next_due_date, active, created_date, type, source]) => ({
    id, description: description || '', amount: Number(amount) || 0, currency: currency || 'EUR', frequency: frequency || 'monthly',
    custom_interval_days: custom_interval_days !== '' && custom_interval_days != null ? Number(custom_interval_days) : null,
    next_due_date: next_due_date || '', active: active === true || active === 'TRUE', created_date: created_date || '',
    // `type` is missing (empty string) on rows written before recurring income existed — those were all expense templates.
    type: type || 'expense', source: source || null,
  }),
);

const Settings = makeStore(
  'Settings',
  (s) => [
    s.id, s.default_currency || 'EUR', s.monthly_budget_total ?? '', JSON.stringify(s.budget_per_category || {}),
    s.created_date || new Date().toISOString(), s.budget_period || 'monthly',
    s.dashboard_layout ? JSON.stringify(s.dashboard_layout) : '',
  ],
  ([id, default_currency, monthly_budget_total, budget_per_category, created_date, budget_period, dashboard_layout]) => ({
    id, default_currency: default_currency || 'EUR',
    monthly_budget_total: monthly_budget_total !== '' && monthly_budget_total != null ? Number(monthly_budget_total) : null,
    budget_per_category: budget_per_category ? JSON.parse(budget_per_category) : {}, created_date: created_date || '',
    budget_period: budget_period || 'monthly',
    dashboard_layout: dashboard_layout ? JSON.parse(dashboard_layout) : null,
  }),
);

const Income = makeStore(
  'Incomes',
  (i) => [
    i.id, i.description || '', i.amount ?? 0, i.currency || 'EUR', i.received_date || '',
    i.source || 'other', i.notes || '', JSON.stringify(i.tags || []), i.created_date || new Date().toISOString(), i.reconciled === true,
  ],
  ([id, description, amount, currency, received_date, source, notes, tags, created_date, reconciled]) => ({
    id, description: description || '', amount: Number(amount) || 0, currency: currency || 'EUR', received_date: received_date || '',
    source: source || 'other', notes: notes || null, tags: tags ? JSON.parse(tags) : [], created_date: created_date || '',
    reconciled: reconciled === true || reconciled === 'TRUE',
  }),
);

const Debt = makeStore(
  'Debts',
  (d) => [
    d.id, d.person || '', d.direction || 'they_owe', d.total_amount ?? 0, d.paid_amount ?? 0,
    d.currency || 'EUR', d.start_date || '', d.due_date || '', d.notes || '', d.created_date || new Date().toISOString(),
  ],
  ([id, person, direction, total_amount, paid_amount, currency, start_date, due_date, notes, created_date]) => ({
    id, person: person || '', direction: direction || 'they_owe',
    total_amount: Number(total_amount) || 0, paid_amount: Number(paid_amount) || 0,
    currency: currency || 'EUR', start_date: start_date || '', due_date: due_date || null,
    notes: notes || null, created_date: created_date || '',
  }),
);

const Goal = makeStore(
  'Goals',
  (g) => [
    g.id, g.name || '', g.icon || 'Target', g.target_amount ?? 0, g.saved_amount ?? 0,
    g.currency || 'EUR', g.deadline || '', g.created_date || new Date().toISOString(),
  ],
  ([id, name, icon, target_amount, saved_amount, currency, deadline, created_date]) => ({
    id, name: name || '', icon: icon || 'Target',
    target_amount: Number(target_amount) || 0, saved_amount: Number(saved_amount) || 0,
    currency: currency || 'EUR', deadline: deadline || null, created_date: created_date || '',
  }),
);

export const entities = { Expense, Income, Category, RecurringTemplate, Settings, Debt, Goal };

// Multipart upload to the user's Drive (drive.file scope: the app can only
// see files it creates, not the rest of their Drive).
export async function uploadReceipt(file) {
  const token = getAccessToken();
  const boundary = 'expensetrack-boundary';
  const metadata = { name: file.name, mimeType: file.type || 'application/octet-stream' };
  const fileBuffer = await file.arrayBuffer();
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`,
    fileBuffer,
    `\r\n--${boundary}--`,
  ]);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`;
}
