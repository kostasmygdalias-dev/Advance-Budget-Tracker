import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const PARENT_ID = 'cat-transport';
const FUEL_ID = 'cat-fuel';
const PARKING_ID = 'cat-parking';
const CREATED = '2024-01-01T00:00:00.000Z';
const today = new Date().toISOString().slice(0, 10);

// The Dashboard's "Spending by category" widget now shares the same
// checkbox multi-select drill-down as Reports' equivalent card (see
// CategoryMultiSelect), including the parent+child double-count guard —
// scoped to this month only rather than a date range. See
// categoryReport/categoryFocusEntry in src/pages/Dashboard.jsx.
const seed = {
  Categories: [
    SHEET_HEADERS.Categories,
    [PARENT_ID, 'Transport', 'Car', '#0ea5e9', '', 0, CREATED],
    [FUEL_ID, 'Fuel', 'Fuel', '#0ea5e9', PARENT_ID, 0, CREATED],
    [PARKING_ID, 'Parking', 'ParkingCircle', '#0ea5e9', PARENT_ID, 1, CREATED],
  ],
  Expenses: [
    SHEET_HEADERS.Expenses,
    ['exp-fuel', 'Gas', 30, 'EUR', today, FUEL_ID, 'card', '', '', '', 'single', '', '', '', CREATED, false],
    ['exp-parking', 'Meter', 20, 'EUR', today, PARKING_ID, 'card', '', '', '', 'single', '', '', '', CREATED, false],
  ],
  Settings: [
    SHEET_HEADERS.Settings,
    ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', ''],
  ],
};

test('Dashboard spending-by-category widget combines a parent and its own child without double-counting', async ({ page }) => {
  await signIn(page, { seed });

  const widget = page.locator('div.rounded-xl', { has: page.getByText('Spending by category', { exact: false }) });
  await widget.getByRole('button', { name: 'All categories' }).click();
  await page.getByRole('checkbox', { name: 'Transport' }).click();
  await page.getByRole('checkbox', { name: 'Fuel' }).click();
  await page.getByRole('heading', { name: 'Dashboard' }).click();

  await expect(widget.getByText('50.00 EUR', { exact: true })).toBeVisible();
  const fuelRow = widget.locator('div.flex.items-center.gap-3', { has: page.getByText('Fuel', { exact: true }) });
  await expect(fuelRow.getByText('30.00 EUR')).toBeVisible();
  const parkingRow = widget.locator('div.flex.items-center.gap-3', { has: page.getByText('Parking', { exact: true }) });
  await expect(parkingRow.getByText('20.00 EUR')).toBeVisible();
});
