import { test, expect } from '@playwright/test';

// Privacy/Terms must be reachable with no sign-in at all — Google's OAuth
// review needs to read them, and so does anyone deciding whether to sign
// up. No mocks/signIn() here on purpose: this is exercising the public,
// unauthenticated route path in App.jsx.
test('Privacy and Terms pages are reachable without signing in', async ({ page }) => {
  await page.goto('/#/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  await expect(page.getByText('kostas_mygdalias@hotmail.com').first()).toBeVisible();

  await page.goto('/#/terms');
  await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
});

test('Login page links out to both', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('link', { name: 'Privacy Policy' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();

  await page.goto('/#/login');
  await page.getByRole('link', { name: 'Terms of Service' }).click();
  await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
});
