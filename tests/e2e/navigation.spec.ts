import { expect, test, type Page } from '@playwright/test';

const fixtureUser = {
  id: 'fixture-user',
  email: 'operator@example.invalid',
  name: 'Shalcon Operator',
};

async function authenticate(page: Page) {
  await page.route('**/mock-api/api/v1/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: fixtureUser }),
    });
  });
  await page.route('**/mock-api/api/v1/auth/logout', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/mock-api/api/v1/prospects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prospects: [] }),
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/mock-api/api/v1/automated-demo/phase19/review-queue', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ issues: [] }),
    });
  });
  await page.route('**/mock-api/api/v1/brand-template/registry', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        templates: [{
          id: 'elane-v8', version: '8.0.0', niche: 'salon-and-spa',
          archetype: 'premium-cinematic-salon-spa', requiredFields: ['identity.businessName'],
          defaultTheme: {
            paletteId: 'elane-paper', typographyId: 'instrument-editorial', radius: 'soft',
            density: 'airy', heroVariant: 'editorial', imageTreatment: 'collage', motionPreset: 'luxury',
          },
        }],
        themeOptions: {
          paletteId: ['elane-paper', 'warm-stone'], typographyId: ['instrument-editorial', 'modern-contrast'],
          radius: ['sharp', 'soft', 'rounded'], density: ['airy', 'balanced', 'dense'],
          heroVariant: ['editorial', 'split', 'immersive'], imageTreatment: ['full-bleed', 'framed', 'collage'],
          motionPreset: ['subtle', 'editorial', 'luxury'],
        },
      }),
    });
  });
}

test('authenticated operator can navigate every dashboard route and logout', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await authenticate(page);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Revenue mechanism first.' })).toBeVisible();

  const routes = [
    ['Campaigns', '/campaigns'],
    ['Prospects', '/prospects'],
    ['Research', '/research'],
    ['Scoring', '/scoring'],
    ['Templates', '/templates'],
    ['Demos', '/demos'],
    ['QA Queue', '/qa'],
    ['Outreach', '/outreach'],
    ['Inbox', '/inbox'],
    ['Pipeline', '/pipeline'],
    ['Analytics', '/analytics'],
  ] as const;

  for (const [label, path] of routes) {
    await page.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    if (label === 'Prospects') {
      await expect(page.getByRole('heading', { name: 'One business. One identity.' })).toBeVisible();
    } else if (label === 'Research') {
      await expect(page.getByRole('heading', { name: 'Evidence before claims.' })).toBeVisible();
    } else if (label === 'Scoring') {
      await expect(page.getByRole('heading', { name: 'Evidence becomes a decision.' })).toBeVisible();
    } else if (label === 'Templates') {
      await expect(page.getByRole('heading', { name: 'Brand evidence becomes controlled design.' })).toBeVisible();
    } else if (label === 'Demos') {
      await expect(page.getByRole('heading', { name: 'Verified facts in. Private demo out.' })).toBeVisible();
    } else if (label === 'QA Queue') {
      await expect(page.getByRole('heading', { name: 'Nothing becomes ready on vibes.' })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    }
  }

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('mobile navigation opens, changes route, and closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page);
  await page.goto('/dashboard');
  const menu = page.getByRole('button', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('link', { name: 'Prospects', exact: true }).click();
  await expect(page).toHaveURL(/\/prospects$/u);
  await expect(page.getByRole('heading', { name: 'One business. One identity.' })).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});
