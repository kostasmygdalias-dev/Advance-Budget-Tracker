import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';

test('adding an expense shows it in Transactions, and a deleted row can be undone', async ({ page }) => {
  await signIn(page);

  await page.getByRole('link', { name: 'Transactions' }).click();
  // Wait for the page to actually land before opening its own Add menu —
  // Dashboard has an identically-labeled Add button/menu, and react-router
  // v7's default startTransition-wrapped navigation leaves a brief window
  // where Dashboard's is still the one in the DOM.
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Expense' }).click();
  await expect(page).toHaveURL(/#\/expenses\/new$/);

  await page.getByLabel('Description').fill('Coffee with friends');
  await page.getByLabel('Amount').fill('4.50');
  await page.getByRole('button', { name: 'Add expense' }).click();

  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  // Scoped to the row's own description text, not toast notifications that
  // may later repeat the same string ("... was deleted").
  const rowDescription = page.locator('p.font-medium.truncate', { hasText: 'Coffee with friends' });
  await expect(rowDescription).toBeVisible();

  // Delete is immediate (no confirm dialog) with an Undo toast, not a
  // separate confirm-then-delete flow — this exercises that whole path.
  await page.getByRole('button', { name: 'Delete "Coffee with friends"' }).click();
  await expect(rowDescription).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(rowDescription).toBeVisible();
});
