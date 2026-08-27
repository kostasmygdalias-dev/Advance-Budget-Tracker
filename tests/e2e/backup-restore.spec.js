import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';

// restoreBackupSnapshot() (sheetsStore.js) rewrites every collection via
// replaceAll(), then Settings.jsx reloads the page so nothing in the app is
// left showing pre-restore state. Covers the full loop: seed data, back it
// up, delete the data, restore, confirm it's back after the reload.
test('a backup can be restored, bringing back data deleted after it was taken', async ({ page }) => {
  await signIn(page);

  await page.getByRole('link', { name: 'Transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Expense' }).click();
  await expect(page).toHaveURL(/#\/expenses\/new$/);
  await page.getByLabel('Description').fill('Coffee with friends');
  await page.getByLabel('Amount').fill('4.50');
  await page.getByRole('button', { name: 'Add expense' }).click();

  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  const rowDescription = page.locator('p.font-medium.truncate', { hasText: 'Coffee with friends' });
  await expect(rowDescription).toBeVisible();

  // Back up while the expense still exists.
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect(page.locator('[role="status"]', { hasText: 'Backup created' }).first()).toBeVisible();

  // Delete it — data has now drifted from the backup.
  await page.getByRole('link', { name: 'Transactions' }).click();
  await expect(rowDescription).toBeVisible();
  await page.getByRole('button', { name: 'Delete "Coffee with friends"' }).click();
  await expect(rowDescription).toHaveCount(0);

  // Restore the backup taken before the delete. Dashboard's own auto-backup
  // (see AUTO_BACKUP_CHECK_KEY) may have already created an earlier one on
  // sign-in — snapshots sort newest-first, so the one just taken above (with
  // the expense) is always the first row.
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();

  // Restoring triggers a full page reload (every collection was rewritten,
  // not just the ones a cache invalidation could target) — the persisted
  // session token (sessionStorage) carries the signed-in state across it.
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[role="status"]', { hasText: 'Backup restored' }).first()).toBeVisible();

  await page.getByRole('link', { name: 'Transactions' }).click();
  await expect(rowDescription).toBeVisible();
});
