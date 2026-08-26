import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';

// The full Google OAuth round trip startViberConnect() kicks off is a real
// navigation to accounts.google.com — out of scope for a mocked test. What
// *is* testable, and previously had zero coverage, is Settings.jsx's own
// state machine once the Worker hands control back: landing with
// ?viber_link=CODE, and the three viberStatus-driven button states. See
// installBillingMocks() in tests/mocks/googleApi.js.

test('Settings shows the link code after landing back from the Viber OAuth redirect', async ({ page }) => {
  // The status fetch this page also makes on mount races the ?viber_link
  // handling — in production both would agree by then (the Worker only
  // hands back a link code once its own OAuth step, and thus
  // hasGoogleAuth, has actually completed), so the mock must too.
  await signIn(page, { viberStatus: { connected: false, hasGoogleAuth: true } });

  await page.goto('/#/settings?viber_link=ABCDEF');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await expect(page.getByText('/link ABCDEF')).toBeVisible();
  // hasGoogleAuth flips true on landing, so the button changes from
  // "Connect Viber" to "Get new link code" without a page reload.
  await expect(page.getByRole('button', { name: 'Get new link code' })).toBeVisible();

  // The query params are stripped so a refresh doesn't re-show the code.
  await expect(page).toHaveURL(/#\/settings$/);
});

test('Settings can disconnect an already-connected Viber bot', async ({ page }) => {
  await signIn(page, { viberStatus: { connected: true, hasGoogleAuth: true } });

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const disconnectButton = page.getByRole('button', { name: 'Disconnect Viber' });
  await expect(disconnectButton).toBeVisible();

  await disconnectButton.click();
  await expect(page.getByRole('button', { name: 'Connect Viber' })).toBeVisible();
  // The toast's own text is also mirrored into an aria-live announcer
  // region, so scope to the visible toast body rather than matching both.
  await expect(page.locator('[role="status"]', { hasText: 'Viber disconnected' }).first()).toBeVisible();
});
