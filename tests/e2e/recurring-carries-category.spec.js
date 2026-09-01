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

// The other direction: a template that already has a category (whether set
// directly or backfilled) also retroactively fixes its own past
// occurrences still sitting uncategorized — those were generated before
// this feature existed, so generateOne() never had a chance to categorize
// them. See the second pass in backfillTemplateCategories().
const ENTERTAINMENT_ID = 'cat-entertainment';
const NETFLIX_TEMPLATE_ID = 'tpl-netflix';
const pastExpenseSeed = {
  Categories: [
    SHEET_HEADERS.Categories,
    [ENTERTAINMENT_ID, 'Entertainment', 'Clapperboard', '#f97316', '', 0, CREATED],
  ],
  RecurringTemplate: [
    SHEET_HEADERS.RecurringTemplate,
    // Far-future next_due_date — catchUp() generates nothing this run, so
    // the only thing under test is the retroactive fix on the old row below.
    [NETFLIX_TEMPLATE_ID, 'Netflix', 15.99, 'EUR', 'monthly', '', '2027-01-01', true, CREATED, 'expense', '', ENTERTAINMENT_ID],
  ],
  Expenses: [
    [...SHEET_HEADERS.Expenses, 'recurring_template_id'],
    // Pre-dates category_id existing on RecurringTemplate — generated with none.
    ['exp-old-netflix', 'Netflix', 15.99, 'EUR', '2026-06-01', '', 'card', '', '', '', 'single', '', '', '', CREATED, false, NETFLIX_TEMPLATE_ID],
  ],
  Settings: [
    SHEET_HEADERS.Settings,
    ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', ''],
  ],
};

test("a template's category retroactively fixes its own past uncategorized occurrences", async ({ page }) => {
  await signIn(page, { seed: pastExpenseSeed });

  await page.getByRole('link', { name: 'Recurring', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recurring' })).toBeVisible();
  await expect(page.locator('[role="status"]', { hasText: 'categorized' }).first()).toBeVisible();

  await page.goto('/#/transactions?month=all');
  const row = page.locator('div.rounded-xl', { has: page.locator('p.font-medium.truncate', { hasText: 'Netflix' }) });
  await expect(row.getByText('Entertainment', { exact: false })).toBeVisible();
  await expect(row.getByText('Uncategorized', { exact: false })).toHaveCount(0);
});
