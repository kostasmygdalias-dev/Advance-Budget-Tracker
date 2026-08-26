import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    // Dev server, not a production build — faster to start, and this suite
    // tests app behavior, not build output (the deploy pipeline already
    // runs its own build+lint gate before anything ships).
    command: 'npx vite dev --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    env: {
      // A real-shaped but fake client ID — every actual Google call is
      // mocked in tests/mocks/googleApi.js, so this is never used to talk
      // to Google, only to satisfy googleAuth.js's "is this configured" check.
      VITE_GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
      // Also fake-but-configured, so billingConfigured is true and the
      // Pro/Viber UI in Settings.jsx and Recurring.jsx actually renders in
      // tests instead of being permanently skipped. Every call to this host
      // is mocked in tests/mocks/googleApi.js's installBillingMocks(),
      // defaulting subscription status to active — the same outcome as the
      // real "not configured" fail-open default, so existing tests are
      // unaffected unless they explicitly override it.
      VITE_SUBSCRIPTION_API_URL: 'https://billing.test',
      // Fake, never actually fetched (getUpgradeUrl() just builds a URL from
      // it client-side) — set so the real "Upgrade to Pro" CTA renders in
      // tests instead of its "not available" fallback. Tests should assert
      // its presence, not click it — clicking navigates the browser away.
      VITE_STRIPE_PAYMENT_LINK: 'https://buy.stripe.com/test_fake',
    },
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
