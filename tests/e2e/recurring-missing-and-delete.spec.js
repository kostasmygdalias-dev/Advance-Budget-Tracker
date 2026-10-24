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
const dmy = (iso) => iso.split('-').reverse().join('-');
const loanEntry = (id, date) => ['' + id, 'Loan', 300, 'EUR', date, '', 'card', '', '["recurring"]', '', 'single', '', '', '[]', CREATED, false, 'tpl-loan'];

// A monthly loan on the 5th, already run up to this month (next due is next
// month), with last month's entry deleted. The mock's Expenses header lags a
// column, so recurring_template_id is appended to it by hand.
// Built per test, since the mock mutates the seed's own arrays.
const makeSeed = () => ({
  RecurringTemplate: [
    SHEET_HEADERS.RecurringTemplate,
    ['tpl-loan', 'Loan', 300, 'EUR', 'monthly', '', fifthOf(1), true, CREATED, 'expense', '', '', 5],
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

test('the Recurring page flags a deleted past occurrence and puts it back on its own date', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed() });
  await page.goto('/#/recurring');

  await expect(page.getByText('1 recurring entry is missing from a month it was due in')).toBeVisible();
  await page.getByRole('button', { name: '1 missing' }).click();

  await expect(page.getByRole('heading', { name: 'Missing entries — "Loan"' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: dmy(fifthOf(-1)) })).toBeChecked();
  await page.getByRole('button', { name: 'Restore selected (1)' }).click();

  await expect.poll(() => loanDates(workbook)).toEqual([fifthOf(-3), fifthOf(-2), fifthOf(-1), fifthOf(0)]);
  const restored = workbook.sheets.get('Expenses').rows.find((r) => r[1] === 'Loan' && r[4] === fifthOf(-1));
  expect(restored[16]).toBe('tpl-loan');
  // Restoring a past occurrence leaves the template's schedule alone.
  const template = workbook.sheets.get('RecurringTemplate').rows.find((r) => r[0] === 'tpl-loan');
  expect(template[6]).toBe(fifthOf(1));
  await expect(page.getByText(/recurring entr(y is|ies are) missing/)).toHaveCount(0);
});

test('an earlier start date finds occurrences deleted before the oldest one left', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed() });
  await page.goto('/#/recurring');
  await page.getByRole('button', { name: 'Check "Loan" for missing entries' }).click();

  const from = fifthOf(-5);
  await page.getByRole('textbox', { name: 'Day' }).click();
  await page.keyboard.type(dmy(from).replaceAll('-', ''));

  for (const offset of [-5, -4, -1]) {
    await expect(page.getByRole('checkbox', { name: dmy(fifthOf(offset)) })).toBeChecked();
  }
  // Leave one out: only the ticked ones come back.
  await page.getByRole('checkbox', { name: dmy(fifthOf(-4)) }).click();
  await page.getByRole('button', { name: 'Restore selected (2)' }).click();

  await expect.poll(() => loanDates(workbook)).toEqual([fifthOf(-5), fifthOf(-3), fifthOf(-2), fifthOf(-1), fifthOf(0)]);
});

test('an entry typed back in by hand after a deletion counts as present, not missing', async ({ page }) => {
  const seed = makeSeed();
  seed.Expenses.push(['exp-manual', 'loan ', 300, 'EUR', fifthOf(-1), '', 'card', '', '[]', '', 'single', '', '', '[]', CREATED, false, '']);
  await signIn(page, { seed });
  await page.goto('/#/recurring');
  await expect(page.getByText('Loan', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /missing$/ })).toHaveCount(0);
});

test('deleting a recurring entry asks first, and "only this one" leaves the other months alone', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed() });
  await page.goto('/#/transactions');
  await page.getByRole('button', { name: 'Delete "Loan"' }).first().click();

  await expect(page.getByRole('alertdialog')).toContainText('has 3 entries across your months');
  await page.getByRole('button', { name: 'Delete only this one' }).click();

  await expect.poll(() => loanDates(workbook)).toEqual([fifthOf(-3), fifthOf(-2)]);
});

test('deleting a recurring entry can take every month with it, and Undo brings them all back', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed() });
  await page.goto('/#/transactions');
  await page.getByRole('button', { name: 'Delete "Loan"' }).first().click();
  await page.getByRole('button', { name: 'Delete all 3 entries' }).click();

  await expect.poll(() => loanDates(workbook)).toEqual([]);
  // Unrelated entries and the template itself stay.
  expect(workbook.sheets.get('Expenses').rows.some((r) => r[1] === 'Coffee')).toBe(true);
  expect(workbook.sheets.get('RecurringTemplate').rows.some((r) => r[0] === 'tpl-loan')).toBe(true);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => loanDates(workbook)).toEqual([fifthOf(-3), fifthOf(-2), fifthOf(0)]);
});

test('a one-off expense still deletes straight away with no question', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed() });
  await page.goto('/#/transactions');
  await page.getByRole('button', { name: 'Delete "Coffee"' }).first().click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect.poll(() => workbook.sheets.get('Expenses').rows.some((r) => r[1] === 'Coffee')).toBe(false);
});
