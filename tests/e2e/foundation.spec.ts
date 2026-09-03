import { expect, test } from '@playwright/test';

test('phase zero foundation page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Demo-First Outbound Engine' })).toBeVisible();
  await expect(page.getByText('Foundation workspace active')).toBeVisible();
});
