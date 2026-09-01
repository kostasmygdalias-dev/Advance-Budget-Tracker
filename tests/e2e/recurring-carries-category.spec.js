import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const CATEGORY_ID = 'cat-groceries';
const TEMPLATE_ID = 'tpl-groceries';
const CREATED = '2024-01-01T00:00:00.000Z';
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// A recurring template's own category (RecurringTemplate.category_id) is
// copied onto every expense it auto-generates (see generateOne() in
// Recurring.jsx) — previously the schema had no category field at all, so
// every auto-generated occurrence landed as Uncategorized regardless of
// what category past occurrences had been manually given.
const seed = {
  Categories: [
    SHEET_HEADERS.Categories,
    [CATEGORY_ID, 'Groceries', 'ShoppingCart', '#10b981', '', 0, CREATED],
  ],
  RecurringTemplate: [
    SHEET_HEADERS.RecurringTemplate,
    // next_due_date in the past — catchUp() generates it on page load.
    [TEMPLATE_ID, 'Weekly shop', 45, 'EUR', 'monthly', '', yesterday, true, CREATED, 'expense', '', CATEGORY_ID],
  ],
  Settings: [
    SHEET_HEADERS.Settings,
    ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', ''],
  ],
};

test("a recurring template's category carries onto the expense it auto-generates", async ({ page }) => {
  await signIn(page, { seed });

  await page.getByRole('link', { name: 'Recurring', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recurring' })).toBeVisible();
  // Generation happens on mount (catchUp) — wait for the toast confirming it.
  await expect(page.locator('[role="status"]', { hasText: /added/i }).first()).toBeVisible();

  await page.goto('/#/transactions?month=all');
  const row = page.locator('div.rounded-xl', { has: page.locator('p.font-medium.truncate', { hasText: 'Weekly shop' }) });
  await expect(row.getByText('Groceries', { exact: false })).toBeVisible();
  await expect(row.getByText('Uncategorized', { exact: false })).toHaveCount(0);
});
