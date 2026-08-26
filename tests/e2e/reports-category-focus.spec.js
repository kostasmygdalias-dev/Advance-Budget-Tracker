import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const PARENT_ID = 'cat-transport';
const FUEL_ID = 'cat-fuel';
const PARKING_ID = 'cat-parking';
const CREATED = '2024-01-01T00:00:00.000Z';
const today = new Date().toISOString().slice(0, 10);

// Selecting a parent category AND one of its own children in the Reports
// "Spending by category" focus picker must combine into one total without
// double-counting the child (Transport's rollup already includes Fuel) —
// and must still pull in Parking, which wasn't checked directly but is
// covered by its parent. See focusIdSet / CategoryMultiSelect in
// src/pages/Reports.jsx.
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

test('Reports category focus combines a parent and its own child without double-counting', async ({ page }) => {
  await signIn(page, { seed });

  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();

  await page.getByRole('button', { name: 'All categories' }).click();
  await page.getByRole('checkbox', { name: 'Transport' }).click();
  await page.getByRole('checkbox', { name: 'Fuel' }).click();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('button', { name: '2 categories selected' })).toBeVisible();
  const spendingCard = page.locator('div.rounded-xl', { has: page.getByText('Spending by category', { exact: true }) });
  await expect(spendingCard.getByText('50.00 EUR', { exact: true })).toBeVisible();

  const fuelRow = spendingCard.locator('div.flex.items-center.gap-3', { has: page.getByText('Fuel', { exact: true }) });
  await expect(fuelRow.getByText('30.00 EUR')).toBeVisible();
  const parkingRow = spendingCard.locator('div.flex.items-center.gap-3', { has: page.getByText('Parking', { exact: true }) });
  await expect(parkingRow.getByText('20.00 EUR')).toBeVisible();
});
