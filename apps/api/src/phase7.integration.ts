import {
  CampaignRepository,
  DemoBuilderStateRepository,
  DemoRepository,
  EvidenceRepository,
  ProspectFactRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
  type DemoRecord,
} from '@shalcon/db';
import { Hono } from 'hono';

import { hashDemoToken } from './demo-renderer';
import {
  buildManualSalonDemoConfig,
  defaultManualDemoBuilderInput,
  deriveManualDemoToken,
} from './manual-demo-builder';
import { app as productionApp } from './index';

interface Env { DB: D1DatabaseLike }
type Bindings = { Bindings: Env };
const integration = new Hono<Bindings>();

const NOW = '2026-09-03T12:00:00.000Z';
const FUTURE = '2099-09-03T12:00:00.000Z';
const USER_ID = 'phase7-user';
const PROSPECT_ID = 'phase7-prospect';
const DEMO_ID = 'phase7-demo';
const SECRET = 'phase-seven-integration-secret-with-entropy';

function demoRecord(tokenHash: string, configJson: string): DemoRecord {
  return {
    id: DEMO_ID,
    prospectId: PROSPECT_ID,
    tokenHash,
    templateId: 'elane-v8',
    templateVersion: '8.0.0',
    schemaVersion: 'salon-template-config.v1',
    configJson,
    status: 'READY',
    expiresAt: FUTURE,
    createdAt: NOW,
    updatedAt: NOW,
    lastQaAt: null,
    factQaStatus: 'MANUAL_PHASE7',
    visualQaStatus: 'PENDING_PHASE18',
    salesQaStatus: 'MANUAL_PHASE7',
  };
}

function stateJson(build: ReturnType<typeof buildManualSalonDemoConfig>) {
  return JSON.stringify({
    input: build.input,
    visibleFields: build.visibleFields,
    evidenceMap: build.evidenceMap,
    contactMode: build.contactMode,
  });
}

function readStoredPaletteId(configJson: string): string | null {
  const parsed: unknown = JSON.parse(configJson);
  if (typeof parsed !== 'object' || parsed === null || !('theme' in parsed)) return null;
  const theme = parsed.theme;
  if (typeof theme !== 'object' || theme === null || !('paletteId' in theme)) return null;
  return typeof theme.paletteId === 'string' ? theme.paletteId : null;
}

integration.get('/phase7', async (c) => {
  const db = c.env.DB;
  await db.prepare("DELETE FROM users WHERE id IN ('phase7-user', 'phase7-other-user')").run();

  await new UserRepository(db).create({
    id: USER_ID,
    email: 'phase7@example.invalid',
    name: 'Phase 7 Fixture',
    createdAt: NOW,
  });
  await new UserRepository(db).create({
    id: 'phase7-other-user',
    email: 'phase7-other@example.invalid',
    name: 'Other Operator',
    createdAt: NOW,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(USER_ID, NOW);
  const prospects = new ProspectRepository(db);
  const prospect = {
    id: PROSPECT_ID,
    campaignId: campaign.id,
    canonicalName: 'Aura Salon & Spa',
    normalizedName: 'aura salon spa',
    domain: 'aura-phase7.example',
    phoneNormalized: '+919876543210',
    city: 'mumbai',
    addressNormalized: 'bandra west mumbai',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'MANUAL',
    currentState: 'IDENTITY_VERIFIED' as const,
    createdAt: NOW,
    updatedAt: NOW,
  };
  await prospects.create(prospect);

  const source = await new SourceRecordRepository(db).create({
    id: 'phase7-source',
    prospectId: PROSPECT_ID,
    provider: 'MANUAL',
    sourceType: 'OFFICIAL_WEBSITE',
    sourceUrl: 'https://aura-phase7.example',
    rawJson: '{}',
    capturedAt: NOW,
  });
  const evidenceRepo = new EvidenceRepository(db);
  const factRepo = new ProspectFactRepository(db);
  const verified = [
    ['category', 'Premium Salon & Spa'],
    ['city', 'Mumbai'],
    ['address', 'Bandra West, Mumbai'],
    ['hours', '10 AM–8 PM'],
    ['phone', '+91 98765 43210'],
  ] as const;
  for (const [field, value] of verified) {
    const evidence = await evidenceRepo.create({
      id: `phase7-evidence-${field}`,
      prospectId: PROSPECT_ID,
      field,
      value,
      sourceRecordId: source.id,
      sourceUrl: source.sourceUrl,
      sourceQuality: 1,
      confidence: 0.98,
      verificationStatus: 'VERIFIED',
      excerpt: `${field}: ${value}`,
      capturedAt: NOW,
    });
    await factRepo.upsert({
      id: `phase7-fact-${field}`,
      prospectId: PROSPECT_ID,
      field,
      value,
      verificationStatus: 'VERIFIED',
      confidence: 0.98,
      evidenceId: evidence.id,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  await factRepo.upsert({
    id: 'phase7-fact-instagram',
    prospectId: PROSPECT_ID,
    field: 'instagram',
    value: '@unverified_phase7',
    verificationStatus: 'UNVERIFIED',
    confidence: 0.4,
    evidenceId: null,
    createdAt: NOW,
    updatedAt: NOW,
  });

  const facts = await factRepo.listForProspect(PROSPECT_ID);
  const firstBuild = buildManualSalonDemoConfig(prospect, facts, defaultManualDemoBuilderInput());
  const token = await deriveManualDemoToken(SECRET, DEMO_ID);
  const demos = new DemoRepository(db);
  const created = await demos.create(demoRecord(await hashDemoToken(token), JSON.stringify(firstBuild.config)));
  const builderStates = new DemoBuilderStateRepository(db);
  await builderStates.create({
    demoId: DEMO_ID,
    userId: USER_ID,
    stateJson: stateJson(firstBuild),
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });

  const env = {
    DB: db,
    APP_ENV: 'test',
    WEB_ORIGIN: 'http://localhost:5173',
    SESSION_SECRET: SECRET,
  };
  const firstResponse = await productionApp.request(`http://local.test/d/${token}`, {}, env);
  const firstBody = await firstResponse.text();
  const otherOperatorRead = await demos.getByIdForUser(DEMO_ID, 'phase7-other-user');

  const regeneratedInput = {
    ...defaultManualDemoBuilderInput(),
    themePreset: 'ELANE_PAPER' as const,
    headline: 'A calmer',
    accentHeadline: 'digital welcome.',
    subhead: 'A private website concept with a quieter, more premium first impression.',
    hiddenFields: ['address'] as const,
  };
  const secondBuild = buildManualSalonDemoConfig(prospect, facts, regeneratedInput);
  const updated = await demos.updateConfigurationForUser(
    DEMO_ID,
    USER_ID,
    JSON.stringify(secondBuild.config),
    'READY',
    FUTURE,
    '2026-09-03T12:05:00.000Z',
  );
  const secondState = await builderStates.update(
    DEMO_ID,
    USER_ID,
    stateJson(secondBuild),
    '2026-09-03T12:05:00.000Z',
  );
  const secondResponse = await productionApp.request(`http://local.test/d/${token}`, {}, env);
  const secondBody = await secondResponse.text();

  const stored = await db
    .prepare('SELECT token_hash, template_id, template_version, config_json FROM demos WHERE id = ?')
    .bind(DEMO_ID)
    .first<{ token_hash: string; template_id: string; template_version: string; config_json: string }>();
  const storedPaletteId = readStoredPaletteId(stored?.config_json ?? '{}');
  const migrationCount = await db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>();
  const foreignKeyViolations = await db.prepare('PRAGMA foreign_key_check').all();

  await demos.updateStatusForUser(DEMO_ID, USER_ID, 'DISABLED', '2026-09-03T12:06:00.000Z');
  const disabledResponse = await productionApp.request(`http://local.test/d/${token}`, {}, env);

  return c.json({
    ok: true,
    migrationCount: migrationCount?.count ?? 0,
    checks: {
      manualDemoRendered: firstResponse.status === 200,
      correctBusinessIdentity:
        firstBuild.config.business.name === prospect.canonicalName &&
        (firstBody.includes('Aura Salon & Spa') || firstBody.includes('Aura Salon &amp; Spa')),
      verifiedCityRendered: firstBody.includes('Mumbai'),
      correctVerifiedCta: firstBody.includes('Call to enquire') && firstBody.includes('+91 98765 43210'),
      unverifiedFactExcluded: !firstBody.includes('@unverified_phase7'),
      evidenceMapped: firstBuild.evidenceMap.city?.includes('phase7-evidence-city') === true,
      rawTokenNeverStored: stored?.token_hash !== token,
      ownershipIsolation: otherOperatorRead === null,
      configOnlyRegeneration:
        created.templateId === updated.templateId &&
        created.templateVersion === updated.templateVersion &&
        firstBody !== secondBody,
      revisionIncremented: secondState.revision === 2,
      safeCopyUpdated: secondBody.includes('A calmer') && secondBody.includes('digital welcome.'),
      hiddenAddressRemoved:
        secondBuild.config.contact?.address === undefined &&
        !secondBuild.visibleFields.some((field) => field.field === 'address') &&
        !updated.configJson.includes('Bandra West, Mumbai'),
      controlledThemeApplied: storedPaletteId === 'elane-paper',
      samePrivateUrlAfterRegenerate: secondResponse.status === 200,
      disableFailsClosed: disabledResponse.status === 404,
      exactTemplateVersion: stored?.template_id === 'elane-v8' && stored.template_version === '8.0.0',
      foreignKeyViolations: foreignKeyViolations.results.length,
    },
  });
});

export default integration;
