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
    },
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
