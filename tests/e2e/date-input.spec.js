import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const CREATED = '2024-01-01T00:00:00.000Z';

// Built fresh per test on purpose: the mock hands the app these very
// arrays and saving mutates them in place, so a shared seed would leak one
// test's edits into the next.
const makeSeed = (paidDate = '2026-09-09') => ({
  Expenses: [
    SHEET_HEADERS.Expenses,
    ['exp-1', 'Weekly shop', 55.5, 'EUR', paidDate, '', 'card', '', '[]', '', 'single', '', '', '', CREATED, false],
  ],
  Settings: [
    SHEET_HEADERS.Settings,
    ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', ''],
  ],
});

const openExpense = async (page) => {
  await page.goto('/#/transactions?month=all');
  await page.getByRole('link', { name: 'Edit "Weekly shop"' }).click();
  await expect(page).toHaveURL(/#\/expenses\/exp-1\/edit$/);
  const field = {
    day: page.getByRole('textbox', { name: 'Day' }),
    month: page.getByRole('textbox', { name: 'Month' }),
    year: page.getByRole('textbox', { name: 'Year' }),
  };
  await expect(field.year).toHaveValue('2026');
  return field;
};

// DateInput (src/components/ui/date-input.jsx) replaces the native
// <input type="date">, whose displayed format follows the visitor's own
// browser locale - not something a page can override (the `lang` attribute
// has no effect on it) - so it can't be guaranteed to show any particular
// format for every visitor. DateInput always displays and accepts
// DD/MM/YYYY, converting to/from the plain "YYYY-MM-DD" string every other
// date field in the app already uses for storage.
test('date field always displays and accepts DD/MM/YYYY, storing plain ISO underneath', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed() });
  const field = await openExpense(page);

  await expect(field.day).toHaveValue('09');
  await expect(field.month).toHaveValue('09');

  // Typing a full date walks itself through the parts.
  await field.day.click();
  await page.keyboard.type('25122026');
  await expect(field.day).toHaveValue('25');
  await expect(field.month).toHaveValue('12');
  await expect(field.year).toHaveValue('2026');

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/#\/transactions/);

  const row = workbook.sheets.get('Expenses').rows.find((r) => r[0] === 'exp-1');
  expect(row[4]).toBe('2026-12-25');
});

// Each part is its own input precisely so one can be corrected on its own —
// with a single masked box, fixing the day meant retyping the whole date.
test('one part of a date can be corrected without retyping the rest', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed() });
  const field = await openExpense(page);

  // Just the day: 09 -> 08, month and year untouched.
  await field.day.click();
  await page.keyboard.type('08');
  await expect(field.day).toHaveValue('08');
  await expect(field.month).toHaveValue('09');
  await expect(field.year).toHaveValue('2026');

  // Arrow keys step a single part too.
  await field.month.click();
  await page.keyboard.press('ArrowUp');
  await expect(field.month).toHaveValue('10');
  await expect(field.day).toHaveValue('08');

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/#\/transactions/);

  const row = workbook.sheets.get('Expenses').rows.find((r) => r[0] === 'exp-1');
  expect(row[4]).toBe('2026-10-08');
});

test('a date can be picked from the calendar instead of typed', async ({ page }) => {
  const workbook = await signIn(page, { seed: makeSeed() });
  const field = await openExpense(page);

  await page.getByRole('button', { name: 'Open calendar' }).click();
  // The calendar opens on the selected date's own month.
  await expect(page.getByText('September 2026')).toBeVisible();
  await page.getByRole('button', { name: '17', exact: true }).click();

  await expect(field.day).toHaveValue('17');
  await expect(field.month).toHaveValue('09');
  await expect(field.year).toHaveValue('2026');

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/#\/transactions/);

  const row = workbook.sheets.get('Expenses').rows.find((r) => r[0] === 'exp-1');
  expect(row[4]).toBe('2026-09-17');
});

// A day that doesn't exist in the newly-chosen month would otherwise leave
// the field looking complete while reporting nothing upward.
test('a day past the end of the chosen month is pulled back to the last one', async ({ page }) => {
  await signIn(page, { seed: makeSeed('2026-01-15') });
  const field = await openExpense(page);

  // The 31st is a real January day...
  await field.day.click();
  await page.keyboard.type('31');
  await expect(field.day).toHaveValue('31');

  // ...but not a February one.
  await field.month.click();
  await page.keyboard.type('02');
  await expect(field.month).toHaveValue('02');
  await expect(field.day).toHaveValue('28');
});
