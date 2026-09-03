import { expect, test } from '@playwright/test';

test('prospect workspace shows conflicts, proof, provenance, and manual entry', async ({ page }) => {
  const prospects = [{
    id: 'pro_one', canonicalName: 'ÉLANE Fixture', normalizedName: 'élane fixture',
    domain: 'elane.example', phoneNormalized: '+919876543210', city: 'mumbai',
    addressNormalized: 'andheri west', currentState: 'DISCOVERED', updatedAt: '2026-09-03T10:00:00Z',
  }];

  await page.route('**/mock-api/api/v1/auth/session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'operator', email: 'operator@example.invalid', name: 'Operator' } }) });
  });
  await page.route('**/mock-api/api/v1/prospects', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { businessName: string; city?: string };
      const prospect = { ...prospects[0], id: 'pro_created', canonicalName: body.businessName, normalizedName: body.businessName.toLowerCase(), city: body.city ?? null, domain: null, phoneNormalized: null, addressNormalized: null };
      prospects.unshift(prospect);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ prospect }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prospects }) });
  });
  await page.route('**/mock-api/api/v1/prospects/pro_one/evidence-bundle', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prospect: prospects[0],
        sources: [{ id: 'src_1', provider: 'manual', sourceType: 'OFFICIAL_WEBSITE', sourceUrl: 'https://elane.example/contact', capturedAt: '2026-09-03T10:00:00Z' }],
        evidence: [
          { id: 'ev_1', field: 'phone', value: '+919876543210', sourceRecordId: 'src_1', sourceUrl: 'https://elane.example/contact', sourceQuality: 1, confidence: 0.99, verificationStatus: 'VERIFIED', excerpt: 'Call +91 98765 43210' },
          { id: 'ev_2', field: 'phone', value: '+919111111111', sourceRecordId: 'src_1', sourceUrl: 'https://elane.example/contact', sourceQuality: 0.7, confidence: 0.65, verificationStatus: 'PROBABLE', excerpt: 'Alternate listing' },
        ],
        facts: [{ id: 'fact_1', field: 'phone', value: '+919876543210', verificationStatus: 'VERIFIED', confidence: 0.99, evidenceId: 'ev_1' }],
        conflicts: [{ field: 'phone', conflicted: true, candidates: [
          { value: '+919876543210', evidenceIds: ['ev_1'], bestConfidence: 0.99, bestSourceQuality: 1 },
          { value: '+919111111111', evidenceIds: ['ev_2'], bestConfidence: 0.65, bestSourceQuality: 0.7 },
        ] }],
      }),
    });
  });
  await page.route('**/mock-api/api/v1/prospects/pro_created/evidence-bundle', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prospect: prospects[0], sources: [], evidence: [], facts: [], conflicts: [] }) });
  });

  await page.goto('/prospects');
  await expect(page.getByRole('heading', { name: 'Facts earn their way in.' })).toBeVisible();
  await expect(page.getByText('1 conflict', { exact: true })).toBeVisible();
  await expect(page.getByText('+919876543210', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Source ↗' }).first()).toHaveAttribute('href', 'https://elane.example/contact');
  await expect(page.getByText('OFFICIAL_WEBSITE')).toBeVisible();

  await page.getByRole('button', { name: 'Add prospect' }).click();
  await page.getByLabel('Business name').fill('New Salon');
  await page.getByLabel('City').fill('Mumbai');
  await page.getByRole('button', { name: 'Create prospect' }).click();
  await expect(page.getByText('New Salon', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('No evidence captured yet.').first()).toBeVisible();
});
