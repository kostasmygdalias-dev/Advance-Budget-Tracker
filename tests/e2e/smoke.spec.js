import { test, expect } from '@playwright/test';

test('redirects unauthenticated visitors to Login, with no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();

  expect(errors).toEqual([]);
});
