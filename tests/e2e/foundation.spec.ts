import { expect, test } from '@playwright/test';

test('unauthenticated visitor receives the secure login surface', async ({ page }) => {
  await page.route('**/mock-api/api/v1/auth/session', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Demo-First Outbound Engine' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
});
