import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';

// The Stripe Payment Link's "after payment" redirect lands on /?upgraded=1
// (see BILLING_SETUP.md). Stripe redirects the instant payment succeeds,
// but the subscription only flips to active when its webhook reaches the
// Worker moments later - so PostCheckoutGate waits for that, then reloads
// to a clean home URL instead of leaving the user on a Free-looking app.
test('returning from Stripe waits for the webhook, then lands on the Dashboard with a welcome toast', async ({ page }) => {
  await signIn(page, { subscriptionActive: false });

  // Registered after signIn() so it overrides the shared billing mock
  // (Playwright matches the most recently registered route first).
  let active = false;
  await page.route('https://billing.test/subscription-status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ active, status: active ? 'active' : 'inactive' }),
  }));
  setTimeout(() => { active = true; }, 3000); // the "webhook" lands 3s after checkout

  // A real full navigation, exactly like Stripe's redirect.
  await page.goto('/?upgraded=1');
  await expect(page.getByText('activating your Pro plan')).toBeVisible();

  await expect(page).toHaveURL(/\/#\/$/, { timeout: 20000 });
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.locator('[role="status"]', { hasText: 'Welcome to Pro' }).first()).toBeVisible();
});
