import { expect } from '@playwright/test';
import { installGoogleApiMocks } from './googleApi.js';

// Signs in through the real UI (mocked Google underneath) and waits for the
// Dashboard to render — the one flow every other authenticated test builds on.
export async function signIn(page, options) {
  const workbook = await installGoogleApiMocks(page, options);
  await page.goto('/#/login');
  await page.getByRole('button', { name: /continue with google/i }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
  return workbook;
}
