import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const PARENT_ID = 'cat-transport';
const FUEL_ID = 'cat-fuel';
const PARKING_ID = 'cat-parking';
const CREATED = '2024-01-01T00:00:00.000Z';

// A parent category with two budgeted subcategories, and nothing else —
// enough to check that the parent's budget renders as their sum, not
// something independently editable. See src/pages/Budgets.jsx's
// childBudgetSum().
const seed = {
  Categories: [
    SHEET_HEADERS.Categories,
    [PARENT_ID, 'Transport', 'Car', '#0ea5e9', '', 0, CREATED],
    [FUEL_ID, 'Fuel', 'Fuel', '#0ea5e9', PARENT_ID, 0, CREATED],
    [PARKING_ID, 'Parking', 'ParkingCircle', '#0ea5e9', PARENT_ID, 1, CREATED],
  ],
  Settings: [
    SHEET_HEADERS.Settings,
    ['settings-1', 'EUR', '', JSON.stringify({ [FUEL_ID]: 100, [PARKING_ID]: 50 }), CREATED, 'monthly', ''],
  ],
};

test('a parent category\'s budget is the sum of its subcategories, and locked', async ({ page }) => {
  await signIn(page, { seed });

  await page.getByRole('link', { name: 'Budgets' }).click();
  await expect(page.getByRole('heading', { name: 'Budgets' })).toBeVisible();

  const parentRow = page.locator('div.flex.items-center.gap-3', { has: page.getByText('Transport', { exact: true }) });
  const parentInput = parentRow.locator('input');
  await expect(parentInput).toHaveValue('150');
  await expect(parentInput).toBeDisabled();

  const fuelRow = page.locator('div.flex.items-center.gap-3', { has: page.getByText('Fuel', { exact: true }) });
  await expect(fuelRow.locator('input')).toHaveValue('100');
  await expect(fuelRow.locator('input')).toBeEnabled();
});
