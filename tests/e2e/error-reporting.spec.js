import { test, expect } from '@playwright/test';
import { signIn } from '../mocks/signIn.js';

// installGlobalErrorReporting() (main.jsx) posts uncaught errors/rejections
// to the Worker's /client-error — confirms a genuine runtime error actually
// triggers a report, not just that the wiring exists.
test('an uncaught error is reported to the Worker', async ({ page }) => {
  await signIn(page);

  // Registered after signIn() so it takes precedence over the shared
  // catch-all installBillingMocks() sets up — Playwright matches the
  // most-recently-registered handler first.
  const reports = [];
  await page.route('https://billing.test/client-error', (route) => {
    reports.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.evaluate(() => {
    setTimeout(() => { throw new Error('test-induced crash'); }, 0);
  });

  await expect.poll(() => reports.length).toBeGreaterThan(0);
  expect(reports[0].message).toContain('test-induced crash');
});
