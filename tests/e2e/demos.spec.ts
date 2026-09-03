import { expect, test } from '@playwright/test';

const operator = { id: 'operator', email: 'operator@example.invalid', name: 'Operator' };
const prospect = {
  id: 'pro_demo',
  canonicalName: 'Aura Salon & Spa',
  normalizedName: 'aura salon spa',
  domain: 'aura.example',
  phoneNormalized: '+919876543210',
  city: 'mumbai',
  addressNormalized: 'bandra west mumbai',
  currentState: 'IDENTITY_VERIFIED',
  updatedAt: '2026-09-03T12:00:00Z',
};
const verifiedFacts = [
  { id: 'fact_city', field: 'city', value: 'Mumbai', confidence: 0.98, evidenceId: 'ev_city', verificationStatus: 'VERIFIED' },
  { id: 'fact_address', field: 'address', value: 'Bandra West, Mumbai', confidence: 0.98, evidenceId: 'ev_address', verificationStatus: 'VERIFIED' },
  { id: 'fact_phone', field: 'phone', value: '+91 98765 43210', confidence: 0.99, evidenceId: 'ev_phone', verificationStatus: 'VERIFIED' },
];
const evidence = verifiedFacts.map((fact) => ({
  id: fact.evidenceId,
  field: fact.field,
  value: fact.value,
  sourceUrl: 'https://aura.example/contact',
  sourceQuality: 1,
  confidence: fact.confidence,
  verificationStatus: 'VERIFIED',
}));
const defaultInput = {
  themePreset: 'WARM_STONE',
  headline: 'A sharper',
  accentHeadline: 'first impression.',
  subhead: 'A private website concept built around a cleaner, more confident first impression.',
  hiddenFields: [],
};

function demoSummary(status = 'READY') {
  return {
    id: 'demo_ui', prospectId: prospect.id, status, templateId: 'elane-v8', templateVersion: '8.0.0',
    expiresAt: '2099-09-03T12:00:00Z', updatedAt: '2026-09-03T12:00:00Z',
    factQaStatus: 'MANUAL_PHASE7', visualQaStatus: 'PENDING_PHASE18', salesQaStatus: 'MANUAL_PHASE7',
  };
}

function detail(revision: number, input = defaultInput, status = 'READY') {
  const hidden = new Set(input.hiddenFields);
  const visibleFields = [
    !hidden.has('city') ? { field: 'city', value: 'Mumbai', evidenceId: 'ev_city', confidence: 0.98 } : null,
    !hidden.has('address') && !hidden.has('contact') ? { field: 'address', value: 'Bandra West, Mumbai', evidenceId: 'ev_address', confidence: 0.98 } : null,
    !hidden.has('contact') ? { field: 'contact.call', value: '+91 98765 43210', evidenceId: 'ev_phone', confidence: 0.99 } : null,
  ].filter(Boolean);
  return {
    demo: demoSummary(status),
    prospect,
    builder: {
      revision,
      input,
      visibleFields,
      evidenceMap: Object.fromEntries(visibleFields.map((field) => [field.field, [field.evidenceId]])),
      contactMode: hidden.has('contact') ? 'BOOKING_PLACEHOLDER' : 'CALL',
    },
    verifiedFacts,
    visibleEvidence: evidence,
    previewPath: '/mock-api/d/phase7_ui_private_token_0123456789abcdef',
    previewUrl: 'http://127.0.0.1:5173/mock-api/d/phase7_ui_private_token_0123456789abcdef',
  };
}

test('manual demo workspace builds, previews, regenerates, hides fields, and disables', async ({ page }) => {
  let currentDetail: ReturnType<typeof detail> | null = null;
  let revision = 0;

  await page.route('**/mock-api/api/v1/auth/session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: operator }) });
  });
  await page.route('**/mock-api/api/v1/prospects', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prospects: [prospect] }) });
  });
  await page.route('**/mock-api/api/v1/demo-admin/prospects/pro_demo', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prospect,
        eligible: true,
        verifiedFacts,
        evidence,
        demos: currentDetail ? [currentDetail.demo] : [],
        builderContract: {
          templateId: 'elane-v8', templateVersion: '8.0.0', themePresets: ['WARM_STONE', 'ELANE_PAPER'],
          hideableFields: ['descriptor', 'city', 'area', 'address', 'hours', 'contact'], defaultInput,
          previewExpiryDays: 14,
          ctaPolicy: 'Verified WhatsApp, phone or email is surfaced in the concept note; demo booking stays non-transactional.',
        },
      }),
    });
  });
  await page.route('**/mock-api/api/v1/demo-admin/prospects/pro_demo/demos', async (route) => {
    const input = route.request().postDataJSON() as typeof defaultInput;
    revision = 1;
    currentDetail = detail(revision, input);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(currentDetail) });
  });
  await page.route('**/mock-api/api/v1/demo-admin/demos/demo_ui', async (route) => {
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON() as typeof defaultInput;
      revision += 1;
      currentDetail = detail(revision, input);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentDetail) });
  });
  await page.route('**/mock-api/api/v1/demo-admin/demos/demo_ui/disable', async (route) => {
    currentDetail = detail(revision, currentDetail?.builder.input ?? defaultInput, 'DISABLED');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ demo: currentDetail.demo }) });
  });
  await page.route('**/mock-api/d/phase7_ui_private_token_0123456789abcdef', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body style="margin:0"><main style="min-height:900px;padding:40px"><h1>Aura Salon & Spa</h1><p>Call to enquire · +91 98765 43210</p></main></body></html>',
    });
  });

  await page.goto('/demos');
  await expect(page.getByRole('heading', { name: 'Verified facts in. Private demo out.' })).toBeVisible();
  await expect(page.getByText('Aura Salon & Spa').first()).toBeVisible();
  await expect(page.getByText('ev_city')).toBeVisible();

  await page.getByRole('button', { name: 'Generate private demo' }).click();
  await expect(page.getByText('Revision 1')).toBeVisible();
  await expect(page.locator('.live-demo-frame iframe')).toBeVisible();
  await expect(page.getByText('CALL', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Mobile' }).click();
  const iframeBox = await page.locator('.live-demo-frame iframe').boundingBox();
  expect(iframeBox?.width ?? 1000).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Desktop' }).click();

  await page.getByLabel('Hero line').fill('A calmer');
  await page.getByRole('button', { name: 'Regenerate configuration' }).click();
  await expect(page.getByText('Revision 2')).toBeVisible();

  await page.getByText('address', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Regenerate configuration' }).click();
  await expect(page.getByText('Revision 3')).toBeVisible();
  await expect(page.locator('.visible-data-list').getByText('Bandra West, Mumbai')).toHaveCount(0);

  await page.getByRole('button', { name: 'Disable preview' }).click();
  await expect(page.getByText('Preview disabled')).toBeVisible();
  await expect(page.getByText('The private URL currently fails closed.')).toBeVisible();
});
