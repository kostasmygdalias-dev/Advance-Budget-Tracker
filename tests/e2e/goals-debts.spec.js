import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';

// Basic create/delete coverage for Goals and Debts — both live on the same
// page (src/pages/Goals.jsx, tab-switched) and previously had zero
// automated coverage.
test('a savings goal can be added and deleted, and a debt can be added', async ({ page }) => {
  await signIn(page);

  await page.getByRole('link', { name: 'Goals', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Goals' })).toBeVisible();

  await page.getByRole('button', { name: 'Add goal' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Vacation Fund');
  await page.getByLabel('Target amount').fill('1000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const goalRow = page.locator('p.font-medium.truncate', { hasText: 'Vacation Fund' });
  await expect(goalRow).toBeVisible();

  await page.getByRole('tab', { name: 'Debts & IOUs' }).click();
  await page.getByRole('button', { name: 'Add debt' }).click();
  await page.getByLabel('Person').fill('Alex');
  await page.getByLabel('Total amount').fill('200');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.locator('p.font-medium.truncate', { hasText: 'Alex' })).toBeVisible();

  // Back to Goals — delete the one just created.
  await page.getByRole('tab', { name: 'Savings goals' }).click();
  await expect(goalRow).toBeVisible();
  const goalCard = page.locator('div.rounded-xl', { has: goalRow });
  await goalCard.getByRole('button').nth(1).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(goalRow).toHaveCount(0);
});
