import { expect, test, type Page } from '@playwright/test';

function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function openTemplate(page: Page, suffix = '') {
  await page.goto(`/template-preview/salon-v1${suffix}`);
  const iframe = page.locator('iframe[data-template-id="elane-v8"]');
  await expect(iframe).toHaveAttribute('data-template-version', '8.0.0');
  const frame = page.frameLocator('iframe[data-template-id="elane-v8"]');
  await expect(frame.locator('html')).toHaveAttribute('data-template-id', 'elane-v8');
  await expect(frame.locator('html')).toHaveAttribute('data-template-version', '8.0.0');
  await expect(frame.locator('#intro')).toHaveClass(/done/u, { timeout: 5_000 });
  return { iframe, frame };
}

test('ÉLANE v8 long fixture preserves the cinematic master template and engine config', async ({
  page,
}) => {
  const consoleErrors = captureConsoleErrors(page);
  const { iframe, frame } = await openTemplate(page);
  await expect(frame.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex,nofollow,noarchive',
  );
  await expect(frame.locator('#heroTitle h1')).toContainText('Beauty,');
  await expect(frame.locator('#heroTitle h1')).toContainText('unhurried.');
  await expect(frame.locator('#rituals')).toBeVisible();
  await expect(frame.locator('#finder')).toBeVisible();
  await expect(frame.locator('#process')).toBeVisible();
  await expect(frame.locator('#space')).toBeVisible();
  await expect(frame.locator('#stories')).toBeHidden();
  await expect(frame.locator('.faq')).toBeHidden();
  await expect(frame.locator('footer')).toContainText(
    'Concept preview prepared by Shalcon Intelligence',
  );
  await expect(frame.locator('footer')).toContainText('ÉLANE v8');
  await iframe.screenshot({ path: 'test-results/phase3-elane-desktop-hero.png' });
  await frame.locator('#rituals').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await iframe.screenshot({ path: 'test-results/phase3-elane-desktop-rituals.png' });
  expect(consoleErrors).toEqual([]);
});

test('ÉLANE finder is driven by injected config rather than hardcoded prospect facts', async ({
  page,
}) => {
  const consoleErrors = captureConsoleErrors(page);
  const { frame } = await openTemplate(page);
  await frame.locator('#finder').scrollIntoViewIfNeeded();
  await frame.getByRole('button', { name: /02 \/ Glowy/u }).click();
  await expect(frame.locator('#resultName')).toHaveText('Lit From Within');
  await expect(frame.locator('#resultPrice')).toHaveText('Fixture ₹3,400');
  expect(consoleErrors).toEqual([]);
});

test('ÉLANE short fixture hides unsupported cinematic fact sections rather than inventing data', async ({
  page,
}) => {
  const consoleErrors = captureConsoleErrors(page);
  const { frame } = await openTemplate(page, '?fixture=short');
  await expect(frame.locator('.brand').first()).toHaveText('Mora Studio');
  await expect(frame.locator('#heroTitle h1')).toContainText('considered.');
  for (const selector of ['#rituals', '#finder', '#process', '#space', '#stories', '.faq']) {
    await expect(frame.locator(selector)).toBeHidden();
  }
  await expect(frame.locator('footer')).toContainText('short-data fixture');
  expect(consoleErrors).toEqual([]);
});

test('ÉLANE minimal fixture is evidence-safe and disables booking inputs without contact data', async ({
  page,
}) => {
  const consoleErrors = captureConsoleErrors(page);
  const { frame } = await openTemplate(page, '?fixture=minimal');
  await expect(frame.locator('.brand').first()).toHaveText('Field Studio');
  for (const selector of ['#belief', '#rituals', '#interlude', '#process', '#space']) {
    await expect(frame.locator(selector)).toBeHidden();
  }
  await expect(frame.locator('#bookForm input').first()).toBeDisabled();
  await expect(frame.locator('#bookForm .submit')).toBeDisabled();
  await expect(frame.locator('.book-copy p')).toContainText('withheld until verified');
  expect(consoleErrors).toEqual([]);
});

test('ÉLANE v8 keeps its mobile choreography without horizontal overflow', async ({ page }) => {
  const consoleErrors = captureConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const { iframe, frame } = await openTemplate(page);
  await expect(frame.locator('#heroTitle h1')).toContainText('unhurried.');
  const hasHorizontalOverflow = await frame
    .locator('html')
    .evaluate((html) => html.scrollWidth > (html.ownerDocument.defaultView?.innerWidth ?? 0) + 1);
  expect(hasHorizontalOverflow).toBe(false);
  await iframe.screenshot({ path: 'test-results/phase3-elane-mobile-hero.png' });
  expect(consoleErrors).toEqual([]);
});

test('ÉLANE reduced-motion mode exposes the static final state instead of faded reveal placeholders', async ({
  page,
}) => {
  const consoleErrors = captureConsoleErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { frame } = await openTemplate(page);

  for (const selector of [
    '.belief-portrait',
    '.belief-note',
    '.interlude-lines p',
    '.process-step',
    'details',
    '.book-copy',
    '#bookForm',
  ]) {
    await expect(frame.locator(selector).first()).toHaveCSS('opacity', '1');
  }

  await frame.locator('#book').scrollIntoViewIfNeeded();
  await expect(frame.locator('.book-copy')).toBeVisible();
  await expect(frame.locator('#bookForm')).toBeVisible();
  await expect(frame.locator('.book-copy h2')).toContainText('Reserved.');
  expect(consoleErrors).toEqual([]);
});
