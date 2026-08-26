import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';
import { SHEET_HEADERS } from '../mocks/googleApi.js';

// Regression test for "adding a category adds it multiple times" — caused
// by Categories.jsx's save() having no guard against re-entering while the
// first create() call was still in flight. Delays the mocked create request
// so the pending window is observable, and checks both the visible defense
// (the button disables) and the actual outcome (exactly one row created).
test('Adding a category only creates it once, and the Save button disables while pending', async ({ page }) => {
  // An empty (but pre-existing) Categories tab skips the app's own default
  // taxonomy seeding, so the new category's name can't collide with a
  // built-in default (e.g. "Health") and undercount a real duplicate.
  await signIn(page, { seed: { Categories: [SHEET_HEADERS.Categories] } });

  await page.route('**://sheets.googleapis.com/v4/spreadsheets**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.url().includes('/values/Categories') && req.url().includes(':append')) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    await route.fallback();
  });

  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New category' })).toBeVisible();
  await page.getByLabel('Name').fill('Health');

  const saveButton = page.getByRole('button', { name: 'Save', exact: true });
  await saveButton.click();
  await expect(page.getByRole('button', { name: 'Saving' })).toBeDisabled();

  await expect(page.getByRole('heading', { name: 'New category' })).toHaveCount(0);
  await expect(page.locator('span.font-medium', { hasText: 'Health' })).toHaveCount(1);
});
