import { expect, test } from '@playwright/test';

function captureConsoleErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('salon template long fixture renders the complete sellable asset', async ({ page }) => {
  const consoleErrors = captureConsoleErrors(page);
  await page.goto('/template-preview/salon-v1');

  await expect(page.getByRole('heading', { name: 'Beauty, edited with restraint.' })).toBeVisible();
  await expect(page.getByText('Fictional QA fixture — not a real business')).toBeVisible();
  await expect(page.locator('[data-template-id="salon-editorial"]')).toHaveAttribute(
    'data-template-version',
    '1.0.0',
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex,nofollow,noarchive',
  );
  await expect(page.getByRole('heading', { name: 'A menu that reads like a point of view.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Less noise. Better attention.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A visual system before real photography arrives.' })).toBeVisible();
  await expect(page.getByText('Shalcon Intelligence concept preview.', { exact: false })).toBeVisible();

  await page.screenshot({ path: 'test-results/phase3-salon-desktop.png', fullPage: true });
  expect(consoleErrors).toEqual([]);
});

test('salon template short fixture stays intentional with sparse data', async ({ page }) => {
  const consoleErrors = captureConsoleErrors(page);
  await page.goto('/template-preview/salon-v1?fixture=short');

  await expect(page.getByRole('heading', { name: 'A quieter way to book beauty.' })).toBeVisible();
  await expect(page.getByText('Signature appointment')).toBeVisible();
  await expect(page.getByText('Fictional short-data QA fixture')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Less noise. Better attention.' })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('salon template minimal fixture uses safe fallback sections', async ({ page }) => {
  const consoleErrors = captureConsoleErrors(page);
  await page.goto('/template-preview/salon-v1?fixture=minimal');

  await expect(page.getByRole('heading', { name: 'Considered care, without the clutter.' })).toBeVisible();
  await expect(page.getByText('Verified service list pending')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ready when the verified details are.' })).toBeVisible();
  await expect(page.getByText('Contact information is intentionally withheld', { exact: false })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('salon template is mobile-complete without horizontal overflow', async ({ page }) => {
  const consoleErrors = captureConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/template-preview/salon-v1');

  await expect(page.getByRole('heading', { name: 'Beauty, edited with restraint.' })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.screenshot({ path: 'test-results/phase3-salon-mobile.png', fullPage: true });
  expect(consoleErrors).toEqual([]);
});
