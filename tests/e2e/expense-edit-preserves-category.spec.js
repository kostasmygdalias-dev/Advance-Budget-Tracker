import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const CAT_ID = 'cat-groceries';
const CREATED = '2024-01-01T00:00:00.000Z';

const seed = {
  Categories: [
    SHEET_HEADERS.Categories,
    [CAT_ID, 'Groceries', 'ShoppingCart', '#10b981', '', 0, CREATED],
  ],
  Expenses: [
    SHEET_HEADERS.Expenses,
    ['exp-1', 'Weekly shop', 55.5, 'EUR', '2026-06-10', CAT_ID, 'card', 'some notes', '["tag1"]', '', 'single', '', '', '', CREATED, false],
  ],
  Settings: [
    SHEET_HEADERS.Settings,
    ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', ''],
  ],
};

// ExpenseForm did its own uncached entities.Category.list() fetch, unlike
// every other page (which use the shared useCategoriesQuery()). Mounting
// the category <Select> with a category_id that doesn't yet match any
// SelectItem (because that fetch hadn't resolved) made Radix Select itself
// fire onValueChange('') to resync - silently clearing the category before
// the user had touched anything, so saving *any* edit (even just the
// amount) wiped it. Fixed by sourcing categories from the shared cached
// query directly (no local-state lag) and not mounting the interactive
// Select until it's loaded.
test("editing an expense's amount doesn't clear its category, date, or other fields", async ({ page }) => {
  const workbook = await signIn(page, { seed });
  await page.goto('/#/transactions?month=all');
  await page.getByRole('link', { name: 'Edit "Weekly shop"' }).click();
  await expect(page).toHaveURL(/#\/expenses\/exp-1\/edit$/);

  // The category is correctly pre-selected on open, not blank.
  await expect(page.getByRole('combobox').filter({ hasText: 'Groceries' })).toBeVisible();

  await page.getByLabel('Amount').fill('99.99');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/#\/transactions/);

  const row = workbook.sheets.get('Expenses').rows.find((r) => r[0] === 'exp-1');
  expect(row[2]).toBe(99.99); // amount changed
  expect(row[4]).toBe('2026-06-10'); // paid_date untouched
  expect(row[5]).toBe(CAT_ID); // category_id untouched
  expect(row[7]).toBe('some notes'); // notes untouched
  expect(row[8]).toBe('["tag1"]'); // tags untouched

  // Also reflected back in the list.
  const listRow = page.locator('div.rounded-xl', { has: page.locator('p.font-medium.truncate', { hasText: 'Weekly shop' }) });
  await expect(listRow.getByText('Groceries', { exact: false })).toBeVisible();
});
