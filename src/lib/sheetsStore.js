// Client-side data layer: every collection (Expenses, Categories, Recurring
// templates, Settings) lives as a tab in one Google Sheet, created in the
// signed-in user's own Drive on first use. No backend — reads/writes go
// straight from the browser to the Sheets/Drive APIs using the user's own
// OAuth token, so nobody but that user (and Google) ever sees their data.
import { z } from 'zod';
import { getAccessToken, refreshAccessTokenSilently } from '@/lib/googleAuth';

const SPREADSHEET_TITLE = 'ExpenseTrack Data';
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];

// Sheets/Drive enforce per-minute quotas per user — a burst of calls (e.g.
// loading several collections in parallel on page load) can trip a 429.
// Retried with backoff (honoring Retry-After when Google sends one) instead
// of surfacing a hard error for what's normally a transient, self-resolving
// condition.
const MAX_RETRIES = 4;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function authedFetch(url, init = {}) {
  const doFetch = (token) => fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

  for (let attempt = 0; ; attempt++) {
    let res = await doFetch(getAccessToken());
    if (res.status === 401) {
      const fresh = await refreshAccessTokenSilently();
      res = await doFetch(fresh);
    }
    if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      const delay = retryAfter > 0 ? retryAfter * 1000 : (2 ** attempt) * 500 + Math.random() * 250;
      await sleep(delay);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Google API error ${res.status}: ${await res.text()}`);
    }
    return res.status === 204 ? null : res.json();
  }
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
  // Full-data snapshots for backup/versioning — a JSON blob per snapshot,
  // split across rows (chunk_index/chunk_total) since a single Sheets cell
  // caps out around 50,000 characters and a snapshot can exceed that.
  Backups: ['id', 'created_date', 'chunk_index', 'chunk_total', 'data'],
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
// Each top-level category carries a few common subcategories (parent_id set
// to the parent's freshly generated id below) so a fresh account starts with
// a real, usable breakdown instead of one flat bucket per area of spending.
// Names are bilingual — localName() picks the one matching whatever language
// was active at signup, read straight from the same localStorage key i18n.jsx
// uses (this file has no access to the React language context).
const DEFAULT_CATEGORIES = [
  {
    name: { en: 'Housing', el: 'Στέγαση' }, icon: 'Home', color: '#0f172a',
    subcategories: [
      { name: { en: 'Rent / Mortgage', el: 'Ενοίκιο / Δάνειο' }, icon: 'Key' },
      { name: { en: 'Electricity', el: 'Ρεύμα' }, icon: 'Zap' },
      { name: { en: 'Water', el: 'Νερό' }, icon: 'Droplet' },
      { name: { en: 'Internet', el: 'Internet' }, icon: 'Wifi' },
      { name: { en: 'Maintenance', el: 'Συντήρηση' }, icon: 'Wrench' },
    ],
  },
  {
    name: { en: 'Transport', el: 'Μετακίνηση' }, icon: 'Car', color: '#0ea5e9',
    subcategories: [
      { name: { en: 'Fuel', el: 'Καύσιμα' }, icon: 'Fuel' },
      { name: { en: 'Public Transit', el: 'Μέσα Μαζικής Μεταφοράς' }, icon: 'Bus' },
      { name: { en: 'Parking', el: 'Στάθμευση' }, icon: 'ParkingCircle' },
      { name: { en: 'Service & Repairs', el: 'Συντήρηση & Επισκευές' }, icon: 'Wrench' },
      { name: { en: 'Insurance', el: 'Ασφάλεια' }, icon: 'Shield' },
    ],
  },
  {
    name: { en: 'Groceries', el: 'Τρόφιμα' }, icon: 'ShoppingCart', color: '#10b981',
    subcategories: [
      { name: { en: 'Supermarket', el: 'Σούπερμάρκετ' }, icon: 'ShoppingCart' },
      { name: { en: 'Fresh Market', el: 'Λαϊκή Αγορά' }, icon: 'Carrot' },
    ],
  },
  {
    name: { en: 'Dining Out', el: 'Εστίαση' }, icon: 'Utensils', color: '#f59e0b',
    subcategories: [
      { name: { en: 'Restaurants', el: 'Εστιατόρια' }, icon: 'Utensils' },
      { name: { en: 'Coffee & Cafés', el: 'Καφετέριες' }, icon: 'Coffee' },
      { name: { en: 'Takeout & Delivery', el: 'Take Away & Delivery' }, icon: 'Package' },
    ],
  },
  {
    name: { en: 'Bills & Subscriptions', el: 'Λογαριασμοί & Συνδρομές' }, icon: 'Zap', color: '#ef4444',
    subcategories: [
      { name: { en: 'Phone', el: 'Τηλέφωνο' }, icon: 'Smartphone' },
      { name: { en: 'Streaming', el: 'Streaming' }, icon: 'Tv' },
      { name: { en: 'Software & Apps', el: 'Λογισμικό & Εφαρμογές' }, icon: 'Laptop' },
    ],
  },
  {
    name: { en: 'Health', el: 'Υγεία' }, icon: 'Heart', color: '#8b5cf6',
    subcategories: [
      { name: { en: 'Doctor', el: 'Γιατρός' }, icon: 'Stethoscope' },
      { name: { en: 'Pharmacy', el: 'Φαρμακείο' }, icon: 'Pill' },
      { name: { en: 'Dental', el: 'Οδοντίατρος' }, icon: 'Smile' },
      { name: { en: 'Fitness & Gym', el: 'Γυμναστήριο' }, icon: 'Dumbbell' },
    ],
  },
  {
    name: { en: 'Travel', el: 'Ταξίδια' }, icon: 'Plane', color: '#14b8a6',
    subcategories: [
      { name: { en: 'Flights', el: 'Πτήσεις' }, icon: 'Plane' },
      { name: { en: 'Accommodation', el: 'Διαμονή' }, icon: 'Hotel' },
      { name: { en: 'Car Rental', el: 'Ενοικίαση Αυτοκινήτου' }, icon: 'Car' },
    ],
  },
  {
    name: { en: 'Shopping', el: 'Ψώνια' }, icon: 'ShoppingBag', color: '#ec4899',
    subcategories: [
      { name: { en: 'Clothing', el: 'Ρούχα' }, icon: 'Shirt' },
      { name: { en: 'Electronics', el: 'Ηλεκτρονικά' }, icon: 'Monitor' },
      { name: { en: 'Personal Care', el: 'Προσωπική Φροντίδα' }, icon: 'Sparkles' },
    ],
  },
  {
    name: { en: 'Entertainment', el: 'Ψυχαγωγία' }, icon: 'Clapperboard', color: '#f97316',
    subcategories: [
      { name: { en: 'Movies & Shows', el: 'Ταινίες & Σειρές' }, icon: 'Film' },
      { name: { en: 'Hobbies & Games', el: 'Χόμπι & Παιχνίδια' }, icon: 'Gamepad2' },
      { name: { en: 'Events', el: 'Εκδηλώσεις' }, icon: 'Ticket' },
    ],
  },
  {
    name: { en: 'Education', el: 'Εκπαίδευση' }, icon: 'GraduationCap', color: '#6366f1',
    subcategories: [
      { name: { en: 'Tuition', el: 'Δίδακτρα' }, icon: 'GraduationCap' },
      { name: { en: 'Books & Supplies', el: 'Βιβλία & Υλικά' }, icon: 'BookOpen' },
    ],
  },
  {
    name: { en: 'Gifts & Donations', el: 'Δώρα & Δωρεές' }, icon: 'Gift', color: '#84cc16',
    subcategories: [
      { name: { en: 'Gifts', el: 'Δώρα' }, icon: 'Gift' },
      { name: { en: 'Charity & Donations', el: 'Φιλανθρωπία & Δωρεές' }, icon: 'HandHeart' },
    ],
  },
];

function localName(name) {
  const lang = localStorage.getItem('expensetrack_language');
  return (lang === 'el' && name.el) || name.en;
}

// Merges the default taxonomy into an account whose spreadsheet already
// existed before these categories were introduced — createSpreadsheet()
// above only seeds a brand-new one, so anyone with an existing account
// needs an explicit way to pull them in. Matches by name (case-insensitive)
// against what's already there, so it's safe to run more than once and
// never creates a duplicate "Housing" next to one the user already has —
// missing subcategories just get added under it. Returns how many rows
// (parents + subcategories) were actually created.
export async function addMissingDefaultCategories() {
  const existing = await Category.list();
  const byName = (list, parentId, name) =>
    list.find((c) => (c.parent_id || null) === parentId && c.name.trim().toLowerCase() === name.trim().toLowerCase());

  let added = 0;
  for (const cat of DEFAULT_CATEGORIES) {
    const wantedName = localName(cat.name);
    let parent = byName(existing, null, wantedName);
    if (!parent) {
      const topLevelCount = existing.filter((c) => !c.parent_id).length;
      parent = await Category.create({ name: wantedName, icon: cat.icon, color: cat.color, parent_id: null, sort_order: topLevelCount });
      existing.push(parent);
      added++;
    }
    let nextSort = existing.filter((c) => c.parent_id === parent.id).length;
    for (const sub of cat.subcategories || []) {
      const subName = localName(sub.name);
      if (byName(existing, parent.id, subName)) continue;
      const created = await Category.create({ name: subName, icon: sub.icon, color: parent.color || cat.color, parent_id: parent.id, sort_order: nextSort });
      existing.push(created);
      nextSort++;
      added++;
    }
  }
  return added;
}

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
  const defaultCategoryRows = [];
  DEFAULT_CATEGORIES.forEach((c, i) => {
    const parentId = crypto.randomUUID();
    defaultCategoryRows.push([parentId, localName(c.name), c.icon, c.color, '', i, now]);
    (c.subcategories || []).forEach((sub, j) => {
      defaultCategoryRows.push([crypto.randomUUID(), localName(sub.name), sub.icon, c.color, parentId, j, now]);
    });
  });
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

function makeStore(sheetName, toRow, fromRow, rowSchema) {
  const headers = SCHEMAS[sheetName];
  const lastCol = COLS[headers.length - 1];

  async function readRows() {
    const spreadsheetId = await getSpreadsheetId();
    const data = await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A2:${lastCol}`);
    const rows = data.values || [];
    const parsed = [];
    rows.forEach((row, i) => {
      // A single hand-edited or corrupted cell (e.g. invalid JSON in a tags
      // column) shouldn't take down the whole list — skip just that row.
      let record;
      try {
        record = { ...fromRow(row), _row: i + 2 };
      } catch (err) {
        console.warn(`Skipping unparsable ${sheetName} row ${i + 2}:`, err);
        return;
      }
      if (!record.id) return;
      if (rowSchema) {
        const result = rowSchema.safeParse(record);
        if (!result.success) {
          console.warn(`Skipping malformed ${sheetName} row ${i + 2}:`, result.error.flatten());
          return;
        }
      }
      parsed.push(record);
    });
    return parsed;
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

// Shape-validates what fromRow() produces — catches wrong types slipping
// through the naive coercion above (e.g. a formula error landing in a
// numeric cell) without hand-writing a check for every field.
const RowMeta = { _row: z.number() };
const ExpenseSchema = z.object({
  id: z.string().min(1), description: z.string(), amount: z.number(), currency: z.string(),
  paid_date: z.string(), category_id: z.string().nullable(), payment_method: z.string(),
  notes: z.string().nullable(), tags: z.array(z.string()), receipt_file_url: z.string().nullable(),
  expense_type: z.string(), period_value: z.number().nullable(), period_unit: z.string().nullable(),
  amortization_schedule: z.array(z.any()), created_date: z.string(), reconciled: z.boolean(), ...RowMeta,
});
const IncomeSchema = z.object({
  id: z.string().min(1), description: z.string(), amount: z.number(), currency: z.string(),
  received_date: z.string(), source: z.string(), notes: z.string().nullable(), tags: z.array(z.string()),
  created_date: z.string(), reconciled: z.boolean(), ...RowMeta,
});
const CategorySchema = z.object({
  id: z.string().min(1), name: z.string(), icon: z.string(), color: z.string(),
  parent_id: z.string().nullable(), sort_order: z.number(), created_date: z.string(), ...RowMeta,
});
const RecurringTemplateSchema = z.object({
  id: z.string().min(1), description: z.string(), amount: z.number(), currency: z.string(),
  frequency: z.string(), custom_interval_days: z.number().nullable(), next_due_date: z.string(),
  active: z.boolean(), created_date: z.string(), type: z.string(), source: z.string().nullable(), ...RowMeta,
});
const SettingsSchema = z.object({
  id: z.string().min(1), default_currency: z.string(), monthly_budget_total: z.number().nullable(),
  // Loosely typed on purpose: this is a single row holding every setting
  // (currency, layout, budgets) — over-validating one field (e.g. requiring
  // every value be a number) would drop the *whole* row, including
  // unrelated settings, over a shape mismatch in just this one map.
  budget_per_category: z.record(z.string(), z.any()), created_date: z.string(), budget_period: z.string(),
  dashboard_layout: z.any(), ...RowMeta,
});
const DebtSchema = z.object({
  id: z.string().min(1), person: z.string(), direction: z.string(), total_amount: z.number(),
  paid_amount: z.number(), currency: z.string(), start_date: z.string(), due_date: z.string().nullable(),
  notes: z.string().nullable(), created_date: z.string(), ...RowMeta,
});
const GoalSchema = z.object({
  id: z.string().min(1), name: z.string(), icon: z.string(), target_amount: z.number(), saved_amount: z.number(),
  currency: z.string(), deadline: z.string().nullable(), created_date: z.string(), ...RowMeta,
});

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
  ExpenseSchema,
);

const Category = makeStore(
  'Categories',
  (c) => [c.id, c.name || '', c.icon || '', c.color || '', c.parent_id || '', c.sort_order ?? 0, c.created_date || new Date().toISOString()],
  ([id, name, icon, color, parent_id, sort_order, created_date]) => ({
    id, name: name || '', icon: icon || '', color: color || '', parent_id: parent_id || null,
    sort_order: sort_order !== '' && sort_order != null ? Number(sort_order) : 0, created_date: created_date || '',
  }),
  CategorySchema,
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
  RecurringTemplateSchema,
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
  SettingsSchema,
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
  IncomeSchema,
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
  DebtSchema,
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
  GoalSchema,
);

export const entities = { Expense, Income, Category, RecurringTemplate, Settings, Debt, Goal };

// --- Backups: point-in-time snapshots of everything, written into the same
// spreadsheet (no extra OAuth scope needed). A snapshot's JSON is chunked
// across rows since one Sheets cell tops out around 50,000 characters.
const BACKUP_CHUNK_SIZE = 40000;
const BACKUP_KEEP = 10;

async function readBackupRows(spreadsheetId) {
  const data = await sheetsFetch(`/${spreadsheetId}/values/Backups!A2:E`);
  return (data.values || []).map((row, i) => ({ row, _row: i + 2 }));
}

async function pruneOldBackups(spreadsheetId) {
  const withIndex = await readBackupRows(spreadsheetId);
  const byId = new Map();
  withIndex.forEach(({ row: [id, created_date] }) => {
    if (id && !byId.has(id)) byId.set(id, created_date || '');
  });
  const newestFirst = [...byId.entries()].sort((a, b) => b[1].localeCompare(a[1]));
  const idsToDelete = new Set(newestFirst.slice(BACKUP_KEEP).map(([id]) => id));
  if (!idsToDelete.size) return;
  const gid = await getSheetGid(spreadsheetId, 'Backups');
  const rowsToDelete = withIndex.filter(({ row }) => idsToDelete.has(row[0])).sort((a, b) => b._row - a._row);
  await sheetsFetch(`/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: rowsToDelete.map(({ _row }) => ({
        deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: _row - 1, endIndex: _row } },
      })),
    }),
  });
}

// Snapshots every collection as one JSON document. Keeps only the newest
// BACKUP_KEEP snapshots — older ones are pruned right after writing the new one.
export async function createBackupSnapshot() {
  const spreadsheetId = await getSpreadsheetId();
  const [expenses, incomes, categories, recurring, settings, debts, goals] = await Promise.all([
    Expense.list(), Income.list(), Category.list(), RecurringTemplate.list(), Settings.list(), Debt.list(), Goal.list(),
  ]);
  const json = JSON.stringify({ version: 1, expenses, incomes, categories, recurring, settings, debts, goals });
  const id = crypto.randomUUID();
  const created_date = new Date().toISOString();
  const chunks = [];
  for (let i = 0; i < json.length; i += BACKUP_CHUNK_SIZE) chunks.push(json.slice(i, i + BACKUP_CHUNK_SIZE));
  if (!chunks.length) chunks.push('{}');
  await sheetsFetch(`/${spreadsheetId}/values/Backups!A1:append?valueInputOption=RAW`, {
    method: 'POST',
    body: JSON.stringify({ values: chunks.map((chunk, idx) => [id, created_date, idx, chunks.length, chunk]) }),
  });
  await pruneOldBackups(spreadsheetId);
  return { id, created_date };
}

export async function listBackupSnapshots() {
  const spreadsheetId = await getSpreadsheetId();
  const withIndex = await readBackupRows(spreadsheetId);
  const byId = new Map();
  withIndex.forEach(({ row: [id, created_date] }) => {
    if (id && !byId.has(id)) byId.set(id, { id, created_date: created_date || '' });
  });
  return [...byId.values()].sort((a, b) => b.created_date.localeCompare(a.created_date));
}

// Reassembles one snapshot's JSON from its chunks, for the caller to trigger
// a file download of (kept out of this module — no DOM/Blob access here).
export async function getBackupSnapshotJson(id) {
  const spreadsheetId = await getSpreadsheetId();
  const withIndex = await readBackupRows(spreadsheetId);
  const chunks = withIndex
    .filter(({ row }) => row[0] === id)
    .sort((a, b) => Number(a.row[2]) - Number(b.row[2]));
  return chunks.map(({ row }) => row[4] || '').join('');
}

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
