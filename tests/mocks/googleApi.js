// A tiny in-memory fake of the Google Identity Services + Sheets/Drive APIs,
// so tests can drive the real app UI end-to-end without any real Google
// account, network access, or stored credentials. Mirrors exactly the
// request shapes src/lib/sheetsStore.js and src/lib/googleAuth.js issue —
// see those files if a new call shape needs a case added below.

const FAKE_SPREADSHEET_ID = 'fake-spreadsheet-id';

// One in-memory "workbook": sheet title -> { sheetId, rows } where rows[0]
// is the header row and rows[1..] are data, matching how Sheets itself
// stores a tab (this is exactly the shape sheetsStore.js's readRows()
// assumes when it fetches range "A2:...").
function makeWorkbook() {
  return { created: false, sheets: new Map(), nextGid: 1 };
}

function sheetTitleFromRange(pathname) {
  // ".../values/Expenses!A2:P" or ".../values/Expenses!A1:append" etc.
  const m = pathname.match(/\/values\/([^!]+)!/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function handleSheetsRequest(route, workbook) {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname; // e.g. /v4/spreadsheets/fake-spreadsheet-id/values/Expenses!A2:P
  const method = request.method();

  // POST /v4/spreadsheets — create a new spreadsheet with the given tabs.
  if (method === 'POST' && pathname === '/v4/spreadsheets') {
    const body = request.postDataJSON();
    workbook.created = true;
    (body.sheets || []).forEach(({ properties }) => {
      workbook.sheets.set(properties.title, { sheetId: workbook.nextGid++, rows: [] });
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ spreadsheetId: FAKE_SPREADSHEET_ID }) });
  }

  // GET /v4/spreadsheets/{id}?fields=sheets.properties — tab metadata (gids).
  if (method === 'GET' && pathname === `/v4/spreadsheets/${FAKE_SPREADSHEET_ID}` && url.searchParams.get('fields') === 'sheets.properties') {
    const sheets = [...workbook.sheets.entries()].map(([title, s]) => ({ properties: { title, sheetId: s.sheetId } }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sheets }) });
  }

  // POST /v4/spreadsheets/{id}:batchUpdate — delete a row, or add a tab.
  if (method === 'POST' && pathname === `/v4/spreadsheets/${FAKE_SPREADSHEET_ID}:batchUpdate`) {
    const body = request.postDataJSON();
    const replies = [];
    for (const req of body.requests || []) {
      if (req.deleteDimension) {
        const { sheetId, startIndex, endIndex } = req.deleteDimension.range;
        const entry = [...workbook.sheets.values()].find((s) => s.sheetId === sheetId);
        if (entry) entry.rows.splice(startIndex, endIndex - startIndex);
        replies.push({});
      } else if (req.addSheet) {
        const title = req.addSheet.properties.title;
        const sheetId = workbook.nextGid++;
        workbook.sheets.set(title, { sheetId, rows: [] });
        replies.push({ addSheet: { properties: { title, sheetId } } });
      }
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ replies }) });
  }

  // Everything below operates on a specific tab named in the URL.
  const title = sheetTitleFromRange(pathname);
  const sheet = title ? workbook.sheets.get(title) : null;

  if (method === 'GET' && pathname.startsWith(`/v4/spreadsheets/${FAKE_SPREADSHEET_ID}/values/`)) {
    const values = sheet ? sheet.rows.slice(1) : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ values }) });
  }

  if (method === 'POST' && pathname.endsWith(':append')) {
    const body = request.postDataJSON();
    if (sheet) (body.values || []).forEach((row) => sheet.rows.push(row));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  }

  if (method === 'PUT') {
    const rowMatch = pathname.match(/!A(\d+):/);
    const body = request.postDataJSON();
    if (sheet && rowMatch) {
      const rowIndex = Number(rowMatch[1]) - 1; // 1-based Sheets row -> 0-based array index
      sheet.rows[rowIndex] = body.values[0];
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  }

  return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `Unhandled mock request: ${method} ${pathname}` }) });
}

// Fakes the billing Worker at VITE_SUBSCRIPTION_API_URL (see
// playwright.config.js — https://billing.test in tests). Defaults to an
// active subscription and a disconnected Viber bot, the least surprising
// starting point; pass `viberStatus` to test the other states (see
// src/lib/subscription.js's getViberStatus() for the {connected,
// hasGoogleAuth} shape), or `subscriptionActive: false` to test a free
// (non-Pro) account instead. `startViberConnect()`'s actual OAuth redirect
// is never exercised here — it's a real navigation to accounts.google.com,
// out of scope for this mock; tests instead jump straight to the
// post-redirect state via a `?viber_link=CODE` URL, same as the real
// Worker callback would land the browser on.
function installBillingMocks(page, { viberStatus = { connected: false, hasGoogleAuth: false }, subscriptionActive = true } = {}) {
  return page.route('https://billing.test/**', (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/subscription-status') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: subscriptionActive, status: subscriptionActive ? 'active' : 'inactive' }) });
    }
    if (pathname === '/viber/status') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(viberStatus) });
    }
    if (pathname === '/viber/relink' && request.method() === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'ABC123' }) });
    }
    if (pathname === '/viber/unlink' && request.method() === 'POST') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `Unhandled billing mock request: ${request.method()} ${pathname}` }) });
  });
}

// Installs every route mock needed for a fully signed-in session. Call
// before navigating. `seed` optionally pre-populates tabs as if the
// spreadsheet already existed (e.g. { Categories: [header, ...rows] }) —
// otherwise the app creates a fresh one on first load, exactly like a
// brand-new account (including the real default category taxonomy, since
// that seeding logic lives in the app itself and isn't reproduced here).
// `viberStatus` and `subscriptionActive` are passed straight through to
// installBillingMocks().
export async function installGoogleApiMocks(page, { seed, viberStatus, subscriptionActive } = {}) {
  await installBillingMocks(page, { viberStatus, subscriptionActive });
  const workbook = makeWorkbook();
  if (seed) {
    workbook.created = true;
    Object.entries(seed).forEach(([title, rows]) => {
      workbook.sheets.set(title, { sheetId: workbook.nextGid++, rows });
    });
  }

  await page.route('**/gsi/client', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      window.google = window.google || {};
      window.google.accounts = window.google.accounts || {};
      window.google.accounts.oauth2 = {
        initTokenClient(config) {
          // googleAuth.js reassigns client.callback per-call (initTokenClient
          // itself is only called once and cached) — read it off the client
          // at call time, not the placeholder captured in this closure.
          const client = {
            callback: config.callback,
            requestAccessToken() {
              setTimeout(() => client.callback({ access_token: 'fake-access-token', expires_in: 3600 }), 10);
            },
          };
          return client;
        },
        revoke(token, cb) { if (cb) cb(); },
      };
    `,
  }));

  await page.route('**/oauth2/v3/userinfo', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ sub: 'test-user-id', email: 'test@example.com', name: 'Test User', picture: '' }),
  }));

  await page.route('**://www.googleapis.com/drive/v3/files**', (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const files = workbook.created ? [{ id: FAKE_SPREADSHEET_ID, name: 'ExpenseTrack Data' }] : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files }) });
  });

  await page.route('**://www.googleapis.com/upload/drive/v3/files**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'fake-file-id', webViewLink: 'https://drive.google.com/file/d/fake-file-id/view' }),
  }));

  await page.route('**://sheets.googleapis.com/v4/spreadsheets**', (route) => handleSheetsRequest(route, workbook));

  return workbook;
}

// Default headers per sheet, for tests that want to seed a pre-existing
// spreadsheet directly instead of exercising the "brand new account"
// creation flow. Must match SCHEMAS in src/lib/sheetsStore.js.
export const SHEET_HEADERS = {
  Expenses: ['id', 'description', 'amount', 'currency', 'paid_date', 'category_id', 'payment_method', 'notes', 'tags', 'receipt_file_url', 'expense_type', 'period_value', 'period_unit', 'amortization_schedule', 'created_date', 'reconciled'],
  Incomes: ['id', 'description', 'amount', 'currency', 'received_date', 'source', 'notes', 'tags', 'created_date', 'reconciled'],
  Categories: ['id', 'name', 'icon', 'color', 'parent_id', 'sort_order', 'created_date'],
  RecurringTemplate: ['id', 'description', 'amount', 'currency', 'frequency', 'custom_interval_days', 'next_due_date', 'active', 'created_date', 'type', 'source'],
  Settings: ['id', 'default_currency', 'monthly_budget_total', 'budget_per_category', 'created_date', 'budget_period', 'dashboard_layout'],
  Debts: ['id', 'person', 'direction', 'total_amount', 'paid_amount', 'currency', 'start_date', 'due_date', 'notes', 'created_date'],
  Goals: ['id', 'name', 'icon', 'target_amount', 'saved_amount', 'currency', 'deadline', 'created_date'],
  Backups: ['id', 'created_date', 'chunk_index', 'chunk_total', 'data'],
};
