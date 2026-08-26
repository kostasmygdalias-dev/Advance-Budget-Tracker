import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const CREATED = '2024-01-01T00:00:00.000Z';

function inDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Dashboard's "upcoming charges" reminder — a Pro feature, since recurring
// templates are one — surfaces active templates due within the next 7 days
// and nothing else: not templates further out, and not paused ones. See
// UPCOMING_RECURRING_WINDOW_DAYS / upcomingRecurring in src/pages/Dashboard.jsx.
const seed = {
  RecurringTemplate: [
    SHEET_HEADERS.RecurringTemplate,
    ['tpl-today', 'Due Today', 10, 'EUR', 'monthly', '', inDays(0), true, CREATED, 'expense', ''],
    ['tpl-soon', 'Due Soon', 20, 'EUR', 'monthly', '', inDays(3), true, CREATED, 'expense', ''],
    ['tpl-far', 'Too Far', 30, 'EUR', 'monthly', '', inDays(10), true, CREATED, 'expense', ''],
    ['tpl-paused', 'Paused Bill', 40, 'EUR', 'monthly', '', inDays(2), false, CREATED, 'expense', ''],
  ],
  // At least one transaction, or Dashboard treats the account as brand new
  // and shows the onboarding guide instead of the widget grid + banners.
  Expenses: [
    SHEET_HEADERS.Expenses,
    ['exp-1', 'Coffee', 4.5, 'EUR', inDays(0), '', 'card', '', '', '', 'single', '', '', '', CREATED, false],
  ],
  Settings: [
    SHEET_HEADERS.Settings,
    ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', ''],
  ],
};

test('Dashboard reminds about active recurring charges due within 7 days, and nothing else', async ({ page }) => {
  await signIn(page, { seed });

  // The bell button itself carries the count as its accessible name (also
  // shown as a badge) — the item list only renders once its popover opens.
  const bellButton = page.getByRole('button', { name: '2 upcoming charges due soon' });
  await expect(bellButton).toBeVisible();
  await expect(bellButton.getByText('2', { exact: true })).toBeVisible();

  await bellButton.click();
  const popover = page.getByRole('dialog');
  await expect(popover.getByText('2 upcoming charges due soon', { exact: true })).toBeVisible();
  await expect(popover.getByText('Due Today', { exact: true })).toBeVisible();
  await expect(popover.getByText('Due today', { exact: true })).toBeVisible();
  await expect(popover.getByText('Due Soon', { exact: true })).toBeVisible();
  await expect(popover.getByText('Due in 3 days', { exact: true })).toBeVisible();

  await expect(page.getByText('Too Far', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Paused Bill', { exact: true })).toHaveCount(0);
});

test('the reminder is Pro-only — a free account never sees it, even with charges due', async ({ page }) => {
  await signIn(page, { seed, subscriptionActive: false });

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('button', { name: /upcoming charge/ })).toHaveCount(0);
});
