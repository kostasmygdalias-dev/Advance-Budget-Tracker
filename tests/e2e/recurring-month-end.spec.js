import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const CREATED = '2024-01-01T00:00:00.000Z';
// RecurringTemplate's anchor_day is the 13th column (see SCHEMAS in
// src/lib/sheetsStore.js); the mock's header list predates it.
const ANCHOR = 12;
const NEXT_DUE = 6;

const settings = [SHEET_HEADERS.Settings, ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', '']];
const coffee = ['exp-1', 'Coffee', 4.5, 'EUR', '2025-01-02', '', 'card', '', '[]', '', 'single', '', '', '', CREATED, false];

const rentDates = (workbook) => workbook.sheets.get('Expenses').rows
  .filter((r) => r[1] === 'Rent')
  .map((r) => r[4])
  .sort();

// Stepping a monthly date on with plain "add a month" turned the 31st into
// the 28th after February and left it there for good. The template now
// remembers the day it's meant to fall on.
test('a monthly template on the 31st goes back to the 31st after a short month', async ({ page }) => {
  // Saved before anchor_day existed — no 13th column at all.
  const workbook = await signIn(page, {
    seed: {
      RecurringTemplate: [
        SHEET_HEADERS.RecurringTemplate,
        ['tpl-rent', 'Rent', 500, 'EUR', 'monthly', '', '2025-01-31', true, CREATED, 'expense', '', ''],
      ],
      Expenses: [SHEET_HEADERS.Expenses, [...coffee]],
      Settings: settings.map((r) => [...r]),
    },
  });

  await expect.poll(() => rentDates(workbook).length).toBeGreaterThan(4);
  expect(rentDates(workbook).slice(0, 5)).toEqual([
    '2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30', '2025-05-31',
  ]);

  // The intended day was captured from the due date on the first run, so
  // it survives however many short months come later.
  const template = workbook.sheets.get('RecurringTemplate').rows.find((r) => r[0] === 'tpl-rent');
  expect(Number(template[ANCHOR])).toBe(31);
});

test('editing a month-end template in a short month without touching its date keeps the 31st', async ({ page }) => {
  // Due 28 Feb 2099 only because February is short — it's a 31st template.
  const workbook = await signIn(page, {
    seed: {
      RecurringTemplate: [
        SHEET_HEADERS.RecurringTemplate,
        ['tpl-rent', 'Rent', 500, 'EUR', 'monthly', '', '2099-02-28', true, CREATED, 'expense', '', '', 31],
      ],
      Expenses: [SHEET_HEADERS.Expenses, [...coffee]],
      Settings: settings.map((r) => [...r]),
    },
  });

  await page.getByRole('link', { name: 'Recurring', exact: true }).click();
  await page.getByRole('button', { name: 'Edit "Rent"' }).click();
  await page.locator('#r-amount').fill('550');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect.poll(() => workbook.sheets.get('RecurringTemplate').rows.find((r) => r[0] === 'tpl-rent')[2])
    .toBe(550);
  const template = workbook.sheets.get('RecurringTemplate').rows.find((r) => r[0] === 'tpl-rent');
  expect(Number(template[ANCHOR])).toBe(31);
  expect(template[NEXT_DUE]).toBe('2099-02-28');
});

test('picking a new date resets the day the template falls on', async ({ page }) => {
  const workbook = await signIn(page, {
    seed: {
      RecurringTemplate: [
        SHEET_HEADERS.RecurringTemplate,
        ['tpl-rent', 'Rent', 500, 'EUR', 'monthly', '', '2099-02-28', true, CREATED, 'expense', '', '', 31],
      ],
      Expenses: [SHEET_HEADERS.Expenses, [...coffee]],
      Settings: settings.map((r) => [...r]),
    },
  });

  await page.getByRole('link', { name: 'Recurring', exact: true }).click();
  await page.getByRole('button', { name: 'Edit "Rent"' }).click();
  await page.getByRole('textbox', { name: 'Day' }).click();
  await page.keyboard.type('05');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect.poll(() => workbook.sheets.get('RecurringTemplate').rows.find((r) => r[0] === 'tpl-rent')[NEXT_DUE])
    .toBe('2099-02-05');
  const template = workbook.sheets.get('RecurringTemplate').rows.find((r) => r[0] === 'tpl-rent');
  expect(Number(template[ANCHOR])).toBe(5);
});
