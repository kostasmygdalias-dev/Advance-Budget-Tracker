import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const CREATED = '2024-01-01T00:00:00.000Z';
const CAT = 'cat-ins';

// 100 paid in August, spread over 10 months — 10 a month, through to May.
const pad2 = (n) => String(n).padStart(2, '0');
const start = new Date(2026, 7, 1); // August 2026
const schedule = Array.from({ length: 10 }, (_, i) => {
  const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
  return { month: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, amount: 10 };
});

const makeSeed = () => ({
  Categories: [SHEET_HEADERS.Categories, [CAT, 'Insurance', 'Shield', '#0ea5e9', '', 0, CREATED]],
  Expenses: [
    SHEET_HEADERS.Expenses,
    ['e-amort', 'Car insurance', 100, 'EUR', '2026-08-15', CAT, 'card', '', '[]', '', 'amortized', 10, 'month',
      JSON.stringify(schedule), CREATED, false],
    ['e-plain', 'Groceries', 40, 'EUR', '2026-09-03', CAT, 'card', '', '[]', '', 'single', '', '', '', CREATED, false],
  ],
  Settings: [SHEET_HEADERS.Settings, ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', '']],
});

// An amortized expense used to live only in the month it was paid, while
// every total elsewhere (Dashboard, Reports, Budgets, Insights) counted its
// monthly share — so a month's transaction list disagreed with the same
// month's dashboard figure. The list now carries the installment in each
// month the schedule covers.
test('an amortized expense appears in every month it covers, at that month\'s share', async ({ page }) => {
  await signIn(page, { seed: makeSeed() });

  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();

  // September: paid back in August, but its 10 belongs to this month.
  const row = page.locator('div.flex.items-center.gap-3', { hasText: 'Car insurance' });
  await expect(row).toBeVisible();
  await expect(row.getByText('10.00 EUR')).toBeVisible();
  // ...shown as a share of the whole, so 10 doesn't read as the full price.
  await expect(row.getByText('of 100.00 EUR')).toBeVisible();

  // The month total counts the share, not the 100.
  await expect(page.getByText('2 · -50.00 EUR')).toBeVisible();

  // August, where it was actually paid, shows the same 10 — not the full 100.
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.getByText('Aug 2026')).toBeVisible();
  await expect(row.getByText('10.00 EUR')).toBeVisible();
  await expect(page.getByText('1 · -10.00 EUR')).toBeVisible();

  // July is before the schedule starts, so nothing of it belongs there.
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.getByText('Jul 2026')).toBeVisible();
  await expect(page.getByText('Car insurance')).toHaveCount(0);
});

test('the month total on Transactions agrees with the Dashboard for the same month', async ({ page }) => {
  await signIn(page, { seed: makeSeed() });

  // Dashboard's current-month expenses: the 40 one-off plus September's 10.
  await expect(page.getByText('50.00 EUR').first()).toBeVisible();

  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  await expect(page.getByText('2 · -50.00 EUR')).toBeVisible();
});
