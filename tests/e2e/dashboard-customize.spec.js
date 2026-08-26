import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const CREATED = '2024-01-01T00:00:00.000Z';
const today = new Date().toISOString().slice(0, 10);

// The customize panel (widget show/hide + reorder) was pulled out of
// Dashboard.jsx into its own lazily-loaded chunk, since @hello-pangea/dnd
// is ~30KB gzipped and was previously downloaded on every Dashboard visit
// even for users who never open this panel. Confirms the lazy chunk still
// loads and works, not just that the button exists.
const seed = {
  Expenses: [
    SHEET_HEADERS.Expenses,
    ['exp-1', 'Coffee', 4.5, 'EUR', today, '', 'card', '', '', '', 'single', '', '', '', CREATED, false],
  ],
};

test('the Dashboard customize panel lazy-loads and toggling a widget persists', async ({ page }) => {
  await signIn(page, { seed });

  await page.getByRole('button', { name: 'Customize' }).click();
  await expect(page.getByText('Customize dashboard', { exact: true })).toBeVisible();

  const recentRow = page.locator('div', { hasText: 'Recent transactions' }).filter({ has: page.getByRole('switch') }).last();
  const toggle = recentRow.getByRole('switch');
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Customize dashboard', { exact: true })).toHaveCount(0);

  // Reopening confirms the change actually persisted, not just local UI state.
  await page.getByRole('button', { name: 'Customize' }).click();
  await expect(recentRow.getByRole('switch')).not.toBeChecked();
});
