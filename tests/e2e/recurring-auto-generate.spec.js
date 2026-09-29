import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const CREATED = '2024-01-01T00:00:00.000Z';
const pad2 = (n) => String(n).padStart(2, '0');
const firstOfMonth = (offset) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
};

// A monthly rent template last run two months ago: the 1st of two months
// back, last month and this month are all due, whatever today's date is.
// Built per test, since the mock mutates the seed's own arrays.
const makeSeed = () => ({
  RecurringTemplate: [
    SHEET_HEADERS.RecurringTemplate,
    ['tpl-rent', 'Rent', 500, 'EUR', 'monthly', '', firstOfMonth(-2), true, CREATED, 'expense', '', ''],
  ],
  Expenses: [
    SHEET_HEADERS.Expenses,
    ['exp-1', 'Coffee', 4.5, 'EUR', firstOfMonth(0), '', 'card', '', '[]', '', 'single', '', '', '', CREATED, false],
  ],
  Settings: [SHEET_HEADERS.Settings, ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', '']],
});

const rentDates = (workbook) => workbook.sheets.get('Expenses').rows
  .filter((r) => r[1] === 'Rent')
  .map((r) => r[4])
  .sort();

// Due recurring entries used to be created only when the Recurring page was
// opened, so this month's rent stayed out of the Dashboard and transaction
// list until someone went there. Now opening the app at all is enough.
test('opening the app creates every recurring entry that has come due, without visiting Recurring', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed() });

  // One entry per missed month, each on its own due date.
  await expect.poll(() => rentDates(workbook)).toEqual([firstOfMonth(-2), firstOfMonth(-1), firstOfMonth(0)]);
  await expect(page.getByText('3 recurring entries added', { exact: true })).toBeVisible();

  // The template has moved on to next month.
  const template = workbook.sheets.get('RecurringTemplate').rows.find((r) => r[0] === 'tpl-rent');
  expect(template[6]).toBe(firstOfMonth(1));

  // And this month's rent is already in this month's list.
  await page.goto('/#/transactions');
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit "Rent"' })).toHaveCount(1);
});

test('visiting Recurring after the app already caught up doesn\'t create them twice', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed() });
  await expect.poll(() => rentDates(workbook).length).toBe(3);

  await page.goto('/#/recurring');
  await expect(page.getByText('Rent', { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(1000);
  expect(rentDates(workbook)).toHaveLength(3);
});

test('a free account doesn\'t get recurring entries created — it\'s a Pro feature', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed(), subscriptionActive: false });
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(rentDates(workbook)).toHaveLength(0);
});
