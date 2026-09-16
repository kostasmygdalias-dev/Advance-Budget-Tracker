import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const CREATED = '2024-01-01T00:00:00.000Z';

const seed = {
  Expenses: [
    SHEET_HEADERS.Expenses,
    ['exp-1', 'Weekly shop', 55.5, 'EUR', '2026-06-10', '', 'card', '', '[]', '', 'single', '', '', '', CREATED, false],
  ],
  Settings: [
    SHEET_HEADERS.Settings,
    ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', ''],
  ],
};

// DateInput (src/components/ui/date-input.jsx) replaces the native
// <input type="date">, whose displayed format follows the visitor's own
// browser locale - not something a page can override (the `lang` attribute
// has no effect on it) - so it can't be guaranteed to show any particular
// format for every visitor. DateInput always displays and accepts
// DD/MM/YYYY, converting to/from the plain "YYYY-MM-DD" string every other
// date field in the app already uses for storage.
test('date field always displays and accepts DD/MM/YYYY, storing plain ISO underneath', async ({ page }) => {
  const workbook = await signIn(page, { seed });
  await page.goto('/#/transactions?month=all');
  await page.getByRole('link', { name: 'Edit "Weekly shop"' }).click();
  await expect(page).toHaveURL(/#\/expenses\/exp-1\/edit$/);

  const dateField = page.locator('#paid_date');
  await expect(dateField).toHaveValue('10/06/2026');

  await dateField.fill('');
  await dateField.pressSequentially('25122026');
  await expect(dateField).toHaveValue('25/12/2026');

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/#\/transactions/);

  const row = workbook.sheets.get('Expenses').rows.find((r) => r[0] === 'exp-1');
  expect(row[4]).toBe('2026-12-25');
});
