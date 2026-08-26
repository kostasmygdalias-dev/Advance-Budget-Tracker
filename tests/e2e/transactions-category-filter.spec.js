import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const TRANSPORT_ID = 'cat-transport';
const FUEL_ID = 'cat-fuel';
const PARKING_ID = 'cat-parking';
const FOOD_ID = 'cat-food';
const CREATED = '2024-01-01T00:00:00.000Z';
const today = new Date().toISOString().slice(0, 10);

// The Transactions category filter can now select multiple categories/
// subcategories at once, mirroring the Reports drill-down picker. See
// CategoryMultiSelect / categoryFilterIds in src/pages/Transactions.jsx.
const seed = {
  Categories: [
    SHEET_HEADERS.Categories,
    [TRANSPORT_ID, 'Transport', 'Car', '#0ea5e9', '', 0, CREATED],
    [FUEL_ID, 'Fuel', 'Fuel', '#0ea5e9', TRANSPORT_ID, 0, CREATED],
    [PARKING_ID, 'Parking', 'ParkingCircle', '#0ea5e9', TRANSPORT_ID, 1, CREATED],
    [FOOD_ID, 'Food', 'Utensils', '#f59e0b', '', 1, CREATED],
  ],
  Expenses: [
    SHEET_HEADERS.Expenses,
    ['exp-fuel', 'Gas', 30, 'EUR', today, FUEL_ID, 'card', '', '', '', 'single', '', '', '', CREATED, false],
    ['exp-parking', 'Meter', 20, 'EUR', today, PARKING_ID, 'card', '', '', '', 'single', '', '', '', CREATED, false],
    ['exp-food', 'Lunch', 15, 'EUR', today, FOOD_ID, 'card', '', '', '', 'single', '', '', '', CREATED, false],
    ['exp-uncat', 'Misc', 5, 'EUR', today, '', 'card', '', '', '', 'single', '', '', '', CREATED, false],
  ],
  Settings: [
    SHEET_HEADERS.Settings,
    ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', ''],
  ],
};

test('Transactions category filter can select multiple categories, and reset clears them', async ({ page }) => {
  await signIn(page, { seed });

  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();

  // Scoped to the filters card, not `page` — the popover's own content
  // portals outside this subtree, so once closed it won't be picked up by
  // a same-named button still (briefly) present in that portal.
  const filtersCard = page.locator('div.space-y-3', { has: page.getByPlaceholder('Search description or amount') });

  await filtersCard.getByRole('button', { name: 'All categories' }).click();
  await page.getByRole('checkbox', { name: 'Fuel' }).click();
  await page.getByRole('checkbox', { name: 'Parking' }).click();
  await page.getByRole('heading', { name: 'Transactions' }).click();

  await expect(filtersCard.getByRole('button', { name: '2 categories selected' })).toBeVisible();
  await expect(page.locator('p.font-medium.truncate', { hasText: 'Gas' })).toBeVisible();
  await expect(page.locator('p.font-medium.truncate', { hasText: 'Meter' })).toBeVisible();
  await expect(page.locator('p.font-medium.truncate', { hasText: 'Lunch' })).toHaveCount(0);
  await expect(page.locator('p.font-medium.truncate', { hasText: 'Misc' })).toHaveCount(0);

  await filtersCard.getByRole('button', { name: 'Clear selection' }).click();
  await expect(filtersCard.getByRole('button', { name: 'All categories' })).toBeVisible();
  await expect(page.locator('p.font-medium.truncate', { hasText: 'Lunch' })).toBeVisible();
  await expect(page.locator('p.font-medium.truncate', { hasText: 'Misc' })).toBeVisible();
});
