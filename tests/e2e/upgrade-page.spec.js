import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';

// A free account should be able to find and read a full "why Pro" pitch
// in-app before paying, not just hit a paywall on Recurring with no other
// way to see what else is included. See src/pages/Upgrade.jsx and the
// nav item in src/components/Layout.jsx (only shown when billingConfigured
// && !subActive).
test('a free account can reach the Upgrade page from the sidebar and see every Pro benefit', async ({ page }) => {
  await signIn(page, { subscriptionActive: false });

  await page.getByRole('link', { name: 'Upgrade to Pro' }).click();
  await expect(page).toHaveURL(/#\/upgrade$/);

  await expect(page.getByRole('heading', { name: 'Get more out of your money' })).toBeVisible();
  await expect(page.getByText('Recurring templates', { exact: true })).toBeVisible();
  await expect(page.getByText('Add expenses by chatting on Viber', { exact: true })).toBeVisible();
  await expect(page.getByText('Upcoming charge reminders', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upgrade to Pro' })).toBeVisible();
});

test('a Pro account visiting the Upgrade page sees a thank-you instead of a pitch', async ({ page }) => {
  await signIn(page);

  await page.goto('/#/upgrade');
  await expect(page.getByText("You're already on Pro", { exact: false })).toBeVisible();
  await expect(page.getByText('Recurring templates', { exact: true })).toHaveCount(0);
});

test('the Recurring paywall links out to the full benefits page', async ({ page }) => {
  await signIn(page, { subscriptionActive: false });

  // Not exact: the free-account sidebar link's accessible name includes the
  // "PRO" badge text too ("Recurring PRO"), unlike the Pro-account case.
  await page.getByRole('link', { name: 'Recurring' }).click();
  await expect(page.getByRole('heading', { name: 'Recurring is a Pro feature' })).toBeVisible();

  await page.getByRole('link', { name: 'See everything Pro includes' }).click();
  await expect(page).toHaveURL(/#\/upgrade$/);
});
