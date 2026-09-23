import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const CREATED = '2024-01-01T00:00:00.000Z';
const CAT = 'cat-groceries';
const today = new Date().toISOString().slice(0, 10);

// Regression test for a mobile layout bug: on a phone-width Transactions
// row, three always-visible action icon buttons alongside the checkbox,
// toggle and category icon left too little room for the description and
// amount, squeezing the description to near-nothing and wrapping the
// subtitle into the amount. Fix collapses the action buttons into a
// kebab menu below the `sm` breakpoint. See ExpenseRow/IncomeRow in
// src/pages/Transactions.jsx.
const seed = {
  Categories: [
    SHEET_HEADERS.Categories,
    [CAT, 'Groceries', 'ShoppingCart', '#10b981', '', 0, CREATED],
  ],
  Expenses: [
    SHEET_HEADERS.Expenses,
    ['e1', 'Supermarket weekly shop', 1234.56, 'EUR', today, CAT, 'card', '', '[]', '', 'single', '', '', '', CREATED, false],
  ],
  Incomes: [
    SHEET_HEADERS.Incomes,
    ['i1', 'Paycheck', 2100, 'EUR', today, 'salary', '', '[]', CREATED, false],
  ],
  Settings: [
    SHEET_HEADERS.Settings,
    ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', ''],
  ],
};

test('Transactions rows collapse actions into a kebab menu on mobile, and stay full-size on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, { seed });

  // The nav is behind a hamburger Sheet at this width; the Dashboard's
  // "Recent transactions" card is a plain link straight to /transactions.
  await page.getByRole('link', { name: 'Recent transactions', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();

  const expenseRow = page.locator('div.flex.items-center.gap-3', { hasText: 'Supermarket weekly shop' });
  const incomeRow = page.locator('div.flex.items-center.gap-3', { hasText: 'Paycheck' });

  // Individual action buttons are hidden on mobile; the kebab menu shows instead.
  await expect(expenseRow.getByRole('button', { name: 'Edit "Supermarket weekly shop"' })).toBeHidden();
  await expect(expenseRow.getByRole('button', { name: 'More actions for "Supermarket weekly shop"' })).toBeVisible();

  // No row overflows the phone-width viewport.
  const expenseBox = await expenseRow.boundingBox();
  expect(expenseBox.x + expenseBox.width).toBeLessThanOrEqual(390);

  // The kebab menu opens and exposes Edit/Duplicate/Delete for an expense row.
  await expenseRow.getByRole('button', { name: 'More actions for "Supermarket weekly shop"' }).click();
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Same collapse applies to income rows.
  await expect(incomeRow.getByRole('button', { name: 'Edit "Paycheck"' })).toBeHidden();
  await expect(incomeRow.getByRole('button', { name: 'More actions for "Paycheck"' })).toBeVisible();
  const incomeBox = await incomeRow.boundingBox();
  expect(incomeBox.x + incomeBox.width).toBeLessThanOrEqual(390);

  // On desktop, the individual buttons are back and the kebab menu is gone.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(expenseRow.getByRole('button', { name: 'Edit "Supermarket weekly shop"' })).toBeVisible();
  await expect(expenseRow.getByRole('button', { name: 'More actions for "Supermarket weekly shop"' })).toBeHidden();
});
