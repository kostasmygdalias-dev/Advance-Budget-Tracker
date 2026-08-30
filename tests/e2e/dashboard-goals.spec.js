import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const CREATED = '2024-01-01T00:00:00.000Z';
const today = new Date().toISOString().slice(0, 10);

// At least one transaction, or the Dashboard shows its first-run onboarding
// guide instead of the widget grid (see isEmpty in src/pages/Dashboard.jsx)
// — not the scenario this widget is for anyway (someone who already tracks
// transactions and has also set up a goal).
const oneExpense = {
  Expenses: [
    SHEET_HEADERS.Expenses,
    ['exp-1', 'Groceries', 40, 'EUR', today, '', 'card', '', '', '', 'single', '', '', '', CREATED, false],
  ],
};

// One goal still in progress, one already reached — the widget should only
// surface the former (see goalRows in src/pages/Dashboard.jsx: reached
// goals are filtered out, closest-to-done sorts first).
const seed = {
  ...oneExpense,
  Goals: [
    SHEET_HEADERS.Goals,
    ['goal-car', 'New car', 'Target', 10000, 5000, 'EUR', '', CREATED],
    ['goal-done', 'Emergency fund', 'Target', 1000, 1000, 'EUR', '', CREATED],
  ],
  Settings: [
    SHEET_HEADERS.Settings,
    ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', ''],
  ],
};

test('Dashboard shows a savings-goals widget for goals still in progress, linking to Goals', async ({ page }) => {
  await signIn(page, { seed });

  const widget = page.locator('div.rounded-xl', { has: page.getByText('Savings goals', { exact: true }) });
  await expect(widget.getByText('New car')).toBeVisible();
  await expect(widget.getByText('5000.00 EUR / 10000.00 EUR')).toBeVisible();
  // Reached goals aren't shown — nothing left to act on.
  await expect(widget.getByText('Emergency fund')).toHaveCount(0);

  await widget.click();
  await expect(page).toHaveURL(/#\/goals$/);
});

test('Dashboard\'s goals widget congratulates when every goal is reached', async ({ page }) => {
  await signIn(page, {
    seed: {
      ...oneExpense,
      Goals: [SHEET_HEADERS.Goals, ['goal-done', 'Emergency fund', 'Target', 1000, 1000, 'EUR', '', CREATED]],
      Settings: [SHEET_HEADERS.Settings, ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', '']],
    },
  });

  const widget = page.locator('div.rounded-xl', { has: page.getByText('Savings goals', { exact: true }) });
  await expect(widget.getByText('Every goal is reached')).toBeVisible();
});
