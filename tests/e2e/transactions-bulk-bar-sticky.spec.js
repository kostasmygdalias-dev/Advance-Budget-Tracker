import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const CREATED = '2024-01-01T00:00:00.000Z';
const today = new Date().toISOString().slice(0, 10);
const CAT = 'cat-groceries';

const expense = (id, description, amount) => [
  id, description, amount, 'EUR', today, CAT, 'card', '', '[]', '', 'single', '', '', '', CREATED, false,
];

// Enough rows that the list scrolls well past a phone screen — the whole
// point is picking rows that are nowhere near the top of the page.
const expenses = [];
for (let i = 1; i <= 14; i++) expenses.push(expense(`e${i}`, `Expense number ${i}`, i * 10));

const seed = {
  Categories: [SHEET_HEADERS.Categories, [CAT, 'Groceries', 'ShoppingCart', '#10b981', '', 0, CREATED]],
  Expenses: [SHEET_HEADERS.Expenses, ...expenses],
  Settings: [SHEET_HEADERS.Settings, ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', '']],
};

// The bulk-action bar used to scroll away with the page, so on a phone you
// had to scroll back to the top after every row you ticked. It's sticky now
// (see the selectMode card in src/pages/Transactions.jsx).
test('the bulk-action bar stays on screen while scrolling the list on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, { seed });

  await page.getByRole('link', { name: 'Recent transactions', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();

  await page.getByRole('button', { name: 'Select' }).click();
  const firstRow = page.locator('div.flex.items-center.gap-3', { hasText: 'Expense number 2' });
  await firstRow.locator('button[role="checkbox"]').first().click();

  const deleteButton = page.getByRole('button', { name: 'Delete', exact: true });
  await expect(deleteButton).toBeInViewport();

  // Scroll deep into the list, then tick another row from down there — the
  // actions must still be reachable without scrolling back up.
  await page.mouse.wheel(0, 1400);
  await page.waitForTimeout(300);
  await expect(deleteButton).toBeInViewport();

  const laterRow = page.locator('div.flex.items-center.gap-3', { hasText: 'Expense number 12' });
  await laterRow.locator('button[role="checkbox"]').first().click();
  await expect(page.getByText('2 selected')).toBeInViewport();
  await expect(deleteButton).toBeInViewport();
});
