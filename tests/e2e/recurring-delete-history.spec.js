import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

const TEMPLATE_ONLY_ID = 'tpl-only';
const TEMPLATE_HISTORY_ID = 'tpl-history';
const CREATED = '2024-01-01T00:00:00.000Z';

// Two templates, each with generated history, so the two delete options in
// Recurring's confirm dialog can be exercised independently in one seed:
// "delete template only" must keep past entries, "delete template and
// history" must remove them — leaving an unrelated expense untouched
// either way. See removeTemplateOnly/removeTemplateAndHistory and
// deleteRecurringTemplateWithHistory in src/lib/sheetsStore.js.
const seed = {
  RecurringTemplate: [
    SHEET_HEADERS.RecurringTemplate,
    [TEMPLATE_ONLY_ID, 'Only Template', 12, 'EUR', 'monthly', '', '2026-09-01', true, CREATED, 'expense', ''],
    [TEMPLATE_HISTORY_ID, 'History Template', 8, 'EUR', 'monthly', '', '2026-09-01', true, CREATED, 'expense', ''],
  ],
  Expenses: [
    [...SHEET_HEADERS.Expenses, 'recurring_template_id'],
    ['exp-a1', 'Old A1', 12, 'EUR', '2026-06-01', '', 'card', '', '', '', 'single', '', '', '', CREATED, false, TEMPLATE_ONLY_ID],
    ['exp-a2', 'Old A2', 12, 'EUR', '2026-07-01', '', 'card', '', '', '', 'single', '', '', '', CREATED, false, TEMPLATE_ONLY_ID],
    ['exp-b1', 'Old B1', 8, 'EUR', '2026-06-01', '', 'card', '', '', '', 'single', '', '', '', CREATED, false, TEMPLATE_HISTORY_ID],
    ['exp-unrelated', 'Unrelated', 5, 'EUR', '2026-06-01', '', 'card', '', '', '', 'single', '', '', '', CREATED, false, ''],
  ],
  Settings: [
    SHEET_HEADERS.Settings,
    ['settings-1', 'EUR', '', '{}', CREATED, 'monthly', ''],
  ],
};

test('Recurring delete can keep or remove generated history', async ({ page }) => {
  await signIn(page, { seed });

  await page.getByRole('link', { name: 'Recurring', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recurring' })).toBeVisible();

  // "Delete template only" — the template goes away, its past entries stay.
  const onlyRow = page.locator('div.rounded-xl', { has: page.getByText('Only Template', { exact: true }) });
  await onlyRow.locator('button').nth(2).click();
  await expect(page.getByRole('heading', { name: 'Delete "Only Template"?' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete template only (keep past entries)' }).click();
  await expect(page.getByText('Only Template', { exact: true })).toHaveCount(0);

  // month=all — the seeded dates are outside the current month, which
  // Transactions filters to by default.
  await page.goto('/#/transactions?month=all');
  await expect(page.locator('p.font-medium.truncate', { hasText: 'Old A1' })).toBeVisible();
  await expect(page.locator('p.font-medium.truncate', { hasText: 'Old A2' })).toBeVisible();

  // "Delete template and history" — both the template and its generated
  // entries go away; an unrelated expense is untouched.
  await page.getByRole('link', { name: 'Recurring', exact: true }).click();
  const historyRow = page.locator('div.rounded-xl', { has: page.getByText('History Template', { exact: true }) });
  await historyRow.locator('button').nth(2).click();
  await expect(page.getByRole('heading', { name: 'Delete "History Template"?' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete template and everything it generated' }).click();
  await expect(page.getByText('History Template', { exact: true })).toHaveCount(0);

  // month=all — the seeded dates are outside the current month, which
  // Transactions filters to by default.
  await page.goto('/#/transactions?month=all');
  await expect(page.locator('p.font-medium.truncate', { hasText: 'Old B1' })).toHaveCount(0);
  await expect(page.locator('p.font-medium.truncate', { hasText: 'Unrelated' })).toBeVisible();
});
