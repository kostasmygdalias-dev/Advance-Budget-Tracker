import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const CREATED = '2024-01-01T00:00:00.000Z';
const pad2 = (n) => String(n).padStart(2, '0');
const fifthOf = (offset) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 5);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-05`;
};
const loanEntry = (id, date) => [id, 'Loan', 300, 'EUR', date, '', 'card', '', '["recurring"]', '', 'single', '', '', '[]', CREATED, false, 'tpl-loan'];
const TEMPLATE_COLS = { next_due_date: 6, start_date: 13, skipped_dates: 14 };

// A monthly loan on the 5th, already run up to this month (next due is next
// month), with last month's entry gone. The mock's headers lag the real
// schema, so trailing fields (recurring_template_id, start_date,
// skipped_dates) are appended positionally.
// Built per test, since the mock mutates the seed's own arrays.
const makeSeed = ({ startDate = '', skipped = [] } = {}) => ({
  RecurringTemplate: [
    SHEET_HEADERS.RecurringTemplate,
    ['tpl-loan', 'Loan', 300, 'EUR', 'monthly', '', fifthOf(1), true, CREATED, 'expense', '', '', 5, startDate, JSON.stringify(skipped)],
  ],
  Expenses: [
    [...SHEET_HEADERS.Expenses, 'recurring_template_id'],
    loanEntry('exp-m3', fifthOf(-3)),
    loanEntry('exp-m2', fifthOf(-2)),
    loanEntry('exp-m0', fifthOf(0)),
    ['exp-coffee', 'Coffee', 4.5, 'EUR', fifthOf(0), '', 'card', '', '[]', '', 'single', '', '', '[]', CREATED, false, ''],
  ],
  Settings: [SHEET_HEADERS.Settings, ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', '']],
});

const loanDates = (workbook) => workbook.sheets.get('Expenses').rows
  .filter((r) => r[1] === 'Loan')
  .map((r) => r[4])
  .sort();
const template = (workbook) => workbook.sheets.get('RecurringTemplate').rows.find((r) => r[0] === 'tpl-loan');

test('opening the app puts back a recurring entry that went missing, on its own date', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed() });

  await expect.poll(() => loanDates(workbook)).toEqual([fifthOf(-3), fifthOf(-2), fifthOf(-1), fifthOf(0)]);
  const restored = workbook.sheets.get('Expenses').rows.find((r) => r[1] === 'Loan' && r[4] === fifthOf(-1));
  expect(restored[16]).toBe('tpl-loan');
  // The schedule is untouched, and the oldest entry is kept as the start so
  // the check still reaches back there if that entry goes later.
  expect(template(workbook)[TEMPLATE_COLS.next_due_date]).toBe(fifthOf(1));
  expect(template(workbook)[TEMPLATE_COLS.start_date]).toBe(fifthOf(-3));
});

test('the check reaches back to the template\'s start date, before its oldest entry left', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed({ startDate: fifthOf(-5) }) });
  await expect.poll(() => loanDates(workbook)).toEqual([-5, -4, -3, -2, -1, 0].map(fifthOf));
});

test('an occurrence deleted on purpose stays deleted', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed({ skipped: [fifthOf(-1)] }) });
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(loanDates(workbook)).toEqual([fifthOf(-3), fifthOf(-2), fifthOf(0)]);
});

test('an entry typed back in by hand counts as present, so it isn\'t doubled', async ({ page }) => {
  const seed = makeSeed();
  seed.Expenses.push(['exp-manual', 'loan ', 300, 'EUR', fifthOf(-1), '', 'card', '', '[]', '', 'single', '', '', '[]', CREATED, false, '']);
  const workbook = await signIn(page, { seed });
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(loanDates(workbook)).toEqual([fifthOf(-3), fifthOf(-2), fifthOf(0)]);
});

test('deleting one recurring entry asks first, isn\'t put back, and can be restored from Deleted', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed({ skipped: [fifthOf(-1)] }) });
  await page.goto('/#/transactions');
  await page.getByRole('button', { name: 'Delete "Loan"' }).first().click();

  await expect(page.getByRole('alertdialog')).toContainText('has 3 entries across your months');
  await page.getByRole('button', { name: 'Delete only this one' }).click();
  await expect.poll(() => loanDates(workbook)).toEqual([fifthOf(-3), fifthOf(-2)]);
  expect(JSON.parse(template(workbook)[TEMPLATE_COLS.skipped_dates])).toEqual([fifthOf(-1), fifthOf(0)]);

  // A fresh open doesn't bring it back.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(loanDates(workbook)).toEqual([fifthOf(-3), fifthOf(-2)]);

  await page.getByRole('link', { name: 'Deleted' }).first().click();
  await expect(page.getByRole('heading', { name: 'Deleted' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore "Loan"' }).click();
  await expect(page.getByText('Nothing deleted in the last 24 hours.')).toBeVisible();

  await expect.poll(() => loanDates(workbook)).toEqual([fifthOf(-3), fifthOf(-2), fifthOf(0)]);
  // Back as the same record, still linked, and no longer skipped.
  const back = workbook.sheets.get('Expenses').rows.find((r) => r[4] === fifthOf(0) && r[1] === 'Loan');
  expect(back[0]).toBe('exp-m0');
  expect(back[16]).toBe('tpl-loan');
  expect(JSON.parse(template(workbook)[TEMPLATE_COLS.skipped_dates])).toEqual([fifthOf(-1)]);
});

test('deleting a recurring entry can take every month with it, and Undo brings them all back', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed({ skipped: [fifthOf(-1)] }) });
  await page.goto('/#/transactions');
  await page.getByRole('button', { name: 'Delete "Loan"' }).first().click();
  await page.getByRole('button', { name: 'Delete all 3 entries' }).click();

  await expect.poll(() => loanDates(workbook)).toEqual([]);
  // Unrelated entries and the template itself stay.
  expect(workbook.sheets.get('Expenses').rows.some((r) => r[1] === 'Coffee')).toBe(true);
  expect(template(workbook)).toBeTruthy();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => loanDates(workbook)).toEqual([fifthOf(-3), fifthOf(-2), fifthOf(0)]);
});

test('a one-off expense deletes straight away and waits in Deleted', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed({ skipped: [fifthOf(-1)] }) });
  await page.goto('/#/transactions');
  await page.getByRole('button', { name: 'Delete "Coffee"' }).first().click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect.poll(() => workbook.sheets.get('Expenses').rows.some((r) => r[1] === 'Coffee')).toBe(false);

  await page.goto('/#/trash');
  await expect(page.getByText('Coffee', { exact: true })).toBeVisible();
  await expect(page.getByText(/2[34] hours left/)).toBeVisible();
});

test('anything deleted more than a day ago is gone from Deleted for good', async ({ page }) => {
  const seed = makeSeed({ skipped: [fifthOf(-1)] });
  const old = new Date(Date.now() - 25 * 3600000).toISOString();
  const recent = new Date(Date.now() - 2 * 3600000).toISOString();
  seed.Trash = [
    ['id', 'entity', 'record', 'created_date'],
    ['trash-old', 'expense', JSON.stringify({ id: 'e-old', description: 'Old taxi', amount: 12, currency: 'EUR', paid_date: fifthOf(-1) }), old],
    ['trash-new', 'income', JSON.stringify({ id: 'i-new', description: 'Refund', amount: 30, currency: 'EUR', received_date: fifthOf(0) }), recent],
  ];
  const workbook = await signIn(page, { seed });
  await page.goto('/#/trash');

  await expect(page.getByText('Refund', { exact: true })).toBeVisible();
  await expect(page.getByText('Old taxi')).toHaveCount(0);
  await expect.poll(() => workbook.sheets.get('Trash').rows.map((r) => r[0]).filter((id) => id !== 'id')).toEqual(['trash-new']);
});

test('"Check all" fills every template in from the date picked, leaving deliberate deletions alone', async ({ page }) => {
  const seed = makeSeed({ startDate: fifthOf(-1) });
  // Loan already has -3, -2 and 0, from its own start at -1; Gym started
  // this month and had the month two back deleted on purpose.
  seed.RecurringTemplate.push(['tpl-gym', 'Gym', 40, 'EUR', 'monthly', '', fifthOf(1), true, CREATED, 'expense', '', '', 5, fifthOf(0), JSON.stringify([fifthOf(-2)])]);
  seed.Expenses.push(['exp-gym0', 'Gym', 40, 'EUR', fifthOf(0), '', 'card', '', '["recurring"]', '', 'single', '', '', '[]', CREATED, false, 'tpl-gym']);
  const workbook = await signIn(page, { seed });
  await page.goto('/#/recurring');

  await page.getByRole('button', { name: 'Check all' }).click();
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  await page.getByRole('textbox', { name: 'Day' }).click();
  await page.keyboard.type(`01${pad2(from.getMonth() + 1)}${from.getFullYear()}`);
  await page.getByRole('button', { name: 'Check and fill in' }).click();

  await expect.poll(() => loanDates(workbook)).toEqual([-3, -2, -1, 0].map(fifthOf));
  const gymDates = () => workbook.sheets.get('Expenses').rows.filter((r) => r[1] === 'Gym').map((r) => r[4]).sort();
  await expect.poll(gymDates).toEqual([-3, -1, 0].map(fifthOf));

  // Running it again finds nothing more to add.
  await page.getByRole('button', { name: 'Check all' }).click();
  await page.getByRole('textbox', { name: 'Day' }).click();
  await page.keyboard.type(`01${pad2(from.getMonth() + 1)}${from.getFullYear()}`);
  await page.getByRole('button', { name: 'Check and fill in' }).click();
  await expect(page.getByText(/^Nothing missing since/)).toBeVisible();
  expect(loanDates(workbook)).toHaveLength(4);
});
