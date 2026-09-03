import { expect, test } from '@playwright/test';

const operator = {
  id: 'operator',
  email: 'operator@example.invalid',
  name: 'Operator',
};

test('prospect workspace shows identity, conflicts, proof, provenance, and manual entry', async ({
  page,
}) => {
  const prospects = [
    {
      id: 'pro_one',
      canonicalName: 'ÉLANE Fixture',
      normalizedName: 'élane fixture',
      domain: 'elane.example',
      phoneNormalized: '+919876543210',
      city: 'mumbai',
      addressNormalized: 'andheri west',
      currentState: 'IDENTITY_VERIFIED',
      updatedAt: '2026-09-03T10:00:00Z',
    },
  ];

  await page.route('**/mock-api/api/v1/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: operator }),
    });
  });
  await page.route('**/mock-api/api/v1/prospects', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { businessName: string; city?: string };
      const prospect = {
        ...prospects[0],
        id: 'pro_created',
        canonicalName: body.businessName,
        normalizedName: body.businessName.toLowerCase(),
        city: body.city?.toLowerCase() ?? null,
        domain: null,
        phoneNormalized: null,
        addressNormalized: null,
        currentState: 'IDENTITY_VERIFIED',
      };
      prospects.unshift(prospect);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          prospect,
          identity: {
            status: 'NEW_CANONICAL',
            confidence: 1,
            candidateProspectIds: [],
            matchedKeys: [],
            reasonCodes: ['NO_EXISTING_IDENTITY_MATCH'],
            deduplicated: false,
            canonicalProspectId: prospect.id,
            pendingProspectId: null,
            aliasProspectId: null,
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ prospects }),
    });
  });

  await page.route('**/mock-api/api/v1/prospects/pro_one/identity', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prospect: prospects.find((item) => item.id === 'pro_one'),
        liveResolution: {
          status: 'NEW_CANONICAL',
          confidence: 1,
          candidateProspectIds: [],
          matchedKeys: [],
          reasonCodes: ['NO_EXISTING_IDENTITY_MATCH'],
        },
        registeredKeys: [
          {
            id: 'ikey_domain',
            keyType: 'DOMAIN',
            keyValue: 'elane.example',
            keyStrength: 'STRONG',
            sourceType: 'MANUAL',
          },
          {
            id: 'ikey_phone',
            keyType: 'PHONE',
            keyValue: '+919876543210',
            keyStrength: 'STRONG',
            sourceType: 'MANUAL',
          },
        ],
        latestResolution: null,
        observations: [
          {
            id: 'obs_1',
            observedName: 'ÉLANE Fixture',
            resolutionStatus: 'NEW_CANONICAL',
            confidence: 1,
            sourceType: 'MANUAL',
            reasonCodes: ['NO_EXISTING_IDENTITY_MATCH'],
            createdAt: '2026-09-03T10:00:00Z',
          },
        ],
        alias: null,
        aliases: [],
        candidateProspects: [],
      }),
    });
  });

  await page.route('**/mock-api/api/v1/prospects/pro_created/identity', async (route) => {
    const prospect = prospects.find((item) => item.id === 'pro_created');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prospect,
        liveResolution: {
          status: 'NEW_CANONICAL',
          confidence: 1,
          candidateProspectIds: [],
          matchedKeys: [],
          reasonCodes: ['NO_EXISTING_IDENTITY_MATCH'],
        },
        registeredKeys: [],
        latestResolution: null,
        observations: [],
        alias: null,
        aliases: [],
        candidateProspects: [],
      }),
    });
  });

  await page.route('**/mock-api/api/v1/prospects/pro_one/evidence-bundle', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prospect: prospects.find((item) => item.id === 'pro_one'),
        sources: [
          {
            id: 'src_1',
            provider: 'manual',
            sourceType: 'OFFICIAL_WEBSITE',
            sourceUrl: 'https://elane.example/contact',
            capturedAt: '2026-09-03T10:00:00Z',
          },
        ],
        evidence: [
          {
            id: 'ev_1',
            field: 'phone',
            value: '+919876543210',
            sourceRecordId: 'src_1',
            sourceUrl: 'https://elane.example/contact',
            sourceQuality: 1,
            confidence: 0.99,
            verificationStatus: 'VERIFIED',
            excerpt: 'Call +91 98765 43210',
          },
          {
            id: 'ev_2',
            field: 'phone',
            value: '+919111111111',
            sourceRecordId: 'src_1',
            sourceUrl: 'https://elane.example/contact',
            sourceQuality: 0.7,
            confidence: 0.65,
            verificationStatus: 'PROBABLE',
            excerpt: 'Alternate listing',
          },
        ],
        facts: [
          {
            id: 'fact_1',
            field: 'phone',
            value: '+919876543210',
            verificationStatus: 'VERIFIED',
            confidence: 0.99,
            evidenceId: 'ev_1',
          },
        ],
        conflicts: [
          {
            field: 'phone',
            conflicted: true,
            candidates: [
              {
                value: '+919876543210',
                evidenceIds: ['ev_1'],
                bestConfidence: 0.99,
                bestSourceQuality: 1,
              },
              {
                value: '+919111111111',
                evidenceIds: ['ev_2'],
                bestConfidence: 0.65,
                bestSourceQuality: 0.7,
              },
            ],
          },
        ],
      }),
    });
  });
  await page.route('**/mock-api/api/v1/prospects/pro_created/evidence-bundle', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prospect: prospects.find((item) => item.id === 'pro_created'),
        sources: [],
        evidence: [],
        facts: [],
        conflicts: [],
      }),
    });
  });

  await page.goto('/prospects');
  await expect(page.getByRole('heading', { name: 'One business. One identity.' })).toBeVisible();
  await expect(page.getByText('IDENTITY_VERIFIED', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('2', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('1 conflict', { exact: true })).toBeVisible();
  await expect(page.getByText('+919876543210', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Source ↗' }).first()).toHaveAttribute(
    'href',
    'https://elane.example/contact',
  );
  await expect(page.getByText('OFFICIAL_WEBSITE')).toBeVisible();

  await page.getByRole('button', { name: 'Add prospect' }).click();
  await page.getByLabel('Business name').fill('New Salon');
  await page.getByLabel('City').fill('Mumbai');
  await page.getByRole('button', { name: 'Create or resolve' }).click();
  await expect(page.getByText('New Salon', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('New canonical business identity verified.')).toBeVisible();
  await expect(page.getByText('No evidence captured yet.').first()).toBeVisible();
});

test('identity engine deduplicates exact keys and parks weak matches for operator review', async ({
  page,
}) => {
  const canonical = {
    id: 'pro_canonical',
    canonicalName: 'Glow Salon',
    normalizedName: 'glow salon',
    domain: 'glow.example',
    phoneNormalized: '+919000000001',
    city: 'mumbai',
    addressNormalized: '1 linking road',
    currentState: 'IDENTITY_VERIFIED',
    updatedAt: '2026-09-03T10:00:00Z',
  };
  const prospects = [canonical];
  let pending: typeof canonical | null = null;

  await page.route('**/mock-api/api/v1/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: operator }),
    });
  });

  await page.route('**/mock-api/api/v1/prospects', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as {
        businessName: string;
        domain?: string;
        city?: string;
      };
      if (body.domain === 'glow.example') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            prospect: canonical,
            identity: {
              status: 'EXACT_MATCH',
              confidence: 0.99,
              candidateProspectIds: [canonical.id],
              matchedKeys: [{ type: 'DOMAIN', value: 'glow.example' }],
              reasonCodes: ['DOMAIN_EXACT'],
              deduplicated: true,
              canonicalProspectId: canonical.id,
              pendingProspectId: null,
              aliasProspectId: null,
            },
          }),
        });
        return;
      }

      pending = {
        ...canonical,
        id: 'pro_pending',
        canonicalName: body.businessName,
        normalizedName: body.businessName.toLowerCase(),
        domain: null,
        phoneNormalized: null,
        city: body.city?.toLowerCase() ?? 'mumbai',
        addressNormalized: null,
        currentState: 'IDENTITY_PENDING',
      };
      prospects.unshift(pending);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          prospect: pending,
          identity: {
            status: 'REVIEW_REQUIRED',
            confidence: 0.65,
            candidateProspectIds: [canonical.id],
            matchedKeys: [{ type: 'NAME_CITY', value: 'glow salon|mumbai' }],
            reasonCodes: ['COMPOSITE_MATCH_REQUIRES_REVIEW'],
            deduplicated: false,
            canonicalProspectId: null,
            pendingProspectId: pending.id,
            aliasProspectId: null,
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ prospects }),
    });
  });

  await page.route('**/mock-api/api/v1/prospects/pro_canonical/identity', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prospect: canonical,
        liveResolution: {
          status: 'NEW_CANONICAL',
          confidence: 1,
          candidateProspectIds: [],
          matchedKeys: [],
          reasonCodes: ['NO_EXISTING_IDENTITY_MATCH'],
        },
        registeredKeys: [
          {
            id: 'key_domain',
            keyType: 'DOMAIN',
            keyValue: 'glow.example',
            keyStrength: 'STRONG',
            sourceType: 'MANUAL',
          },
        ],
        latestResolution: null,
        observations: [],
        alias: null,
        aliases: [],
        candidateProspects: [],
      }),
    });
  });

  await page.route('**/mock-api/api/v1/prospects/pro_pending/identity', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prospect: pending,
        liveResolution: {
          status: 'REVIEW_REQUIRED',
          confidence: 0.65,
          candidateProspectIds: [canonical.id],
          matchedKeys: [{ type: 'NAME_CITY', value: 'glow salon|mumbai' }],
          reasonCodes: ['COMPOSITE_MATCH_REQUIRES_REVIEW'],
        },
        registeredKeys: [],
        latestResolution: null,
        observations: [
          {
            id: 'obs_pending',
            observedName: 'Glow Salon',
            resolutionStatus: 'REVIEW_REQUIRED',
            confidence: 0.65,
            sourceType: 'MANUAL',
            reasonCodes: ['COMPOSITE_MATCH_REQUIRES_REVIEW'],
            createdAt: '2026-09-03T10:05:00Z',
          },
        ],
        alias: null,
        aliases: [],
        candidateProspects: [canonical],
      }),
    });
  });

  await page.route('**/mock-api/api/v1/prospects/*/evidence-bundle', async (route) => {
    const id = route.request().url().includes('pro_pending') ? 'pro_pending' : 'pro_canonical';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        prospect: id === 'pro_pending' ? pending : canonical,
        sources: [],
        evidence: [],
        facts: [],
        conflicts: [],
      }),
    });
  });

  await page.route('**/mock-api/api/v1/prospects/pro_pending/identity/resolve', async (route) => {
    const duplicate = { ...pending, currentState: 'DUPLICATE' };
    const index = prospects.findIndex((item) => item.id === 'pro_pending');
    if (index >= 0) prospects[index] = duplicate as typeof canonical;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ prospect: duplicate, canonical, decision: 'LINK_TO_EXISTING' }),
    });
  });

  await page.goto('/prospects');
  await expect(page.getByText('1 records')).toBeVisible();

  await page.getByRole('button', { name: 'Add prospect' }).click();
  await page.getByLabel('Business name').fill('Glow Salon Duplicate');
  await page.getByLabel('Website').fill('glow.example');
  await page.getByRole('button', { name: 'Create or resolve' }).click();
  await expect(page.getByText(/Existing canonical selected/)).toBeVisible();
  await expect(page.getByText('1 records')).toBeVisible();

  await page.getByRole('button', { name: 'Add prospect' }).click();
  await page.getByLabel('Business name').fill('Glow Salon');
  await page.getByLabel('City').fill('Mumbai');
  await page.getByRole('button', { name: 'Create or resolve' }).click();
  await expect(
    page.getByText('Identity review required before this business can enter research or outreach.'),
  ).toBeVisible();
  await expect(page.getByText('Possible duplicate. Human decision required.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Link as duplicate' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep as distinct business' })).toBeEnabled();

  await page.getByRole('button', { name: 'Link as duplicate' }).click();
  await expect(
    page.getByText('Duplicate retired. Glow Salon remains the canonical business.'),
  ).toBeVisible();
  await expect(page.getByText('IDENTITY_VERIFIED', { exact: true }).first()).toBeVisible();
});
