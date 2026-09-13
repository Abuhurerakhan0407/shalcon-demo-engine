import {
  CampaignRepository,
  EvidenceRepository,
  ProspectFactRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
} from '@shalcon/db';
import { Hono } from 'hono';

import { runAssetSelection } from './asset-engine';
import {
  getAutomatedDemoBuildHistory,
  runAutomatedDemoBuild,
} from './automated-demo-builder';
import { runAutomaticBrandTemplateMatch } from './brand-template';
import { runContentGeneration } from './content-engine';
import { renderDemoRecord, renderDemoRecordForOperator } from './demo-renderer';

interface Env { DB: D1DatabaseLike }
const app = new Hono<{ Bindings: Env }>();
app.get('/healthz', (c) => c.json({ ok: true }));

const PREVIEW_SECRET = 'phase17-preview-secret-for-d1-acceptance';

function iso(offsetSeconds: number): string {
  return new Date(Date.parse('2026-09-14T00:00:00.000Z') + offsetSeconds * 1000).toISOString();
}

async function createProspect(
  db: D1DatabaseLike,
  campaignId: string,
  id: string,
  offset: number,
) {
  const now = iso(offset);
  await new ProspectRepository(db).create({
    id,
    campaignId,
    canonicalName: id === 'p17_main' ? 'Phase Seventeen Salon' : 'Missing Asset Salon',
    normalizedName: id,
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE17_TEST',
    currentState: 'DEMO_QUALIFIED',
    domain: `${id}.example.com`,
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: now,
    updatedAt: now,
  });
  await new SourceRecordRepository(db).create({
    id: `src_${id}`,
    prospectId: id,
    provider: 'PHASE17_FIXTURE',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: `https://${id}.example.com/`,
    rawJson: '{}',
    capturedAt: now,
  });
}

async function addVerifiedFact(
  db: D1DatabaseLike,
  prospectId: string,
  field: string,
  value: string,
  offset: number,
) {
  const at = iso(offset);
  const normalizedField = field.replace(/[^a-z0-9]/giu, '_').toLowerCase();
  const evidenceId = `ev_${prospectId}_${normalizedField}`;
  await new EvidenceRepository(db).create({
    id: evidenceId,
    prospectId,
    field,
    value,
    sourceRecordId: `src_${prospectId}`,
    sourceUrl: `https://${prospectId}.example.com/`,
    sourceQuality: 1,
    confidence: 0.97,
    verificationStatus: 'VERIFIED',
    excerpt: value,
    capturedAt: at,
  });
  await new ProspectFactRepository(db).upsert({
    id: `fact_${prospectId}_${normalizedField}`,
    prospectId,
    field,
    value,
    verificationStatus: 'VERIFIED',
    confidence: 0.97,
    evidenceId,
    createdAt: at,
    updatedAt: at,
  });
}

async function prepareContentPipeline(
  db: D1DatabaseLike,
  userId: string,
  campaignId: string,
  prospectId: string,
  offset: number,
) {
  await createProspect(db, campaignId, prospectId, offset);
  await addVerifiedFact(db, prospectId, 'category', 'Premium Salon', offset + 1);
  await addVerifiedFact(db, prospectId, 'city', 'Mumbai', offset + 2);
  await addVerifiedFact(
    db,
    prospectId,
    'business_description',
    'A salon offering verified hair and beauty services.',
    offset + 3,
  );
  await addVerifiedFact(db, prospectId, 'service', 'Haircut', offset + 4);
  await addVerifiedFact(db, prospectId, 'whatsapp', '+91 98765 43210', offset + 5);

  const match = await runAutomaticBrandTemplateMatch(db, userId, prospectId, iso(offset + 6));
  const content = await runContentGeneration(db, userId, prospectId, iso(offset + 7));
  return { match, content };
}

app.get('/phase17', async (c) => {
  const db = c.env.DB;
  const userId = 'usr_phase17';
  const now = iso(0);
  await new UserRepository(db).create({
    id: userId,
    email: 'phase17@example.com',
    name: 'Phase 17',
    createdAt: now,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(userId, now);

  const mainInputs = await prepareContentPipeline(db, userId, campaign.id, 'p17_main', 1);
  await db.prepare(`
    INSERT INTO assets(
      id, prospect_id, asset_type, source_type, source_url, storage_ref,
      usage_classification, mime_type, width, height, created_at,
      source_captured_at, association_assumption, watermark_status, asset_status, optimization_json
    ) VALUES (?, ?, 'LOGO', 'OFFICIAL_WEBSITE', ?, ?, 'PROSPECT_OFFICIAL', 'image/png',
      1024, 512, ?, ?, 'OFFICIAL_PROSPECT_SOURCE', 'CLEAR', 'ACTIVE', '{}')
  `).bind(
    'asset_p17_official_logo',
    'p17_main',
    'https://p17_main.example.com/logo.png',
    'fixture://phase17-official-logo',
    iso(9),
    iso(9),
  ).run();
  const assets = await runAssetSelection(db, userId, 'p17_main', iso(10));
  const first = await runAutomatedDemoBuild(
    db,
    userId,
    'p17_main',
    PREVIEW_SECRET,
    new Date(iso(11)),
  );
  const second = await runAutomatedDemoBuild(
    db,
    userId,
    'p17_main',
    PREVIEW_SECRET,
    new Date(iso(12)),
  );
  const history = await getAutomatedDemoBuildHistory(db, userId, 'p17_main');

  const operatorRender = renderDemoRecordForOperator(first.demo, iso(13));
  const publicRender = renderDemoRecord(first.demo, iso(13));
  const config = JSON.parse(first.demo.configJson) as {
    noindex?: boolean;
    business?: { name?: string };
    hero?: { headline?: string };
    theme?: { paletteId?: string; heroVariant?: string };
    disclosure?: { text?: string };
  };

  let crossTenantBlocked = false;
  try {
    await getAutomatedDemoBuildHistory(db, 'usr_phase17_other', 'p17_main');
  } catch {
    crossTenantBlocked = true;
  }

  await prepareContentPipeline(db, userId, campaign.id, 'p17_missing_assets', 20);
  let missingAssetsBlocked = false;
  try {
    await runAutomatedDemoBuild(
      db,
      userId,
      'p17_missing_assets',
      PREVIEW_SECRET,
      new Date(iso(30)),
    );
  } catch (error) {
    missingAssetsBlocked = error instanceof Error && error.message.includes('asset selection');
  }

  const [
    mainState,
    missingState,
    transitions,
    buildCount,
    demoCount,
    migrationRows,
    foreignKeys,
  ] = await Promise.all([
    db.prepare('SELECT current_state FROM prospects WHERE id = ?')
      .bind('p17_main').first<{ current_state: string }>(),
    db.prepare('SELECT current_state FROM prospects WHERE id = ?')
      .bind('p17_missing_assets').first<{ current_state: string }>(),
    db.prepare(`
      SELECT from_state, to_state
      FROM prospect_state_events
      WHERE prospect_id = ?
      ORDER BY id
    `).bind('p17_main').all<{ from_state: string; to_state: string }>(),
    db.prepare('SELECT COUNT(*) AS count FROM automated_demo_builds WHERE prospect_id = ?')
      .bind('p17_main').first<{ count: number }>(),
    db.prepare('SELECT COUNT(*) AS count FROM demos WHERE prospect_id = ?')
      .bind('p17_main').first<{ count: number }>(),
    db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>(),
    db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>(),
  ]);

  const transitionPairs = transitions.results.map((item) => `${item.from_state}->${item.to_state}`);
  const checks = {
    migrationApplied: Number(migrationRows?.count ?? 0) >= 13,
    exactTemplatePreserved:
      first.demo.templateId === mainInputs.match.match.templateId &&
      first.demo.templateVersion === mainInputs.match.match.templateVersion &&
      first.demo.templateId === 'elane-v8' &&
      first.demo.templateVersion === '8.0.0',
    latestInputsLinked:
      first.build.templateMatchId === mainInputs.match.match.id &&
      first.build.contentRunId === mainInputs.content.id &&
      first.build.assetSelectionRunId === assets.id &&
      first.build.upstream.assetAssignmentCount === 4,
    verifiedContentApplied:
      config.hero?.headline === mainInputs.content.content.headline?.text &&
      config.business?.name === 'Phase Seventeen Salon',
    matchedThemeApplied:
      config.theme?.paletteId === mainInputs.match.match.themeDNA.paletteId &&
      config.theme?.heroVariant === mainInputs.match.match.themeDNA.heroVariant,
    validPrivateRender:
      operatorRender.ok === true &&
      first.previewToken.length >= 32 &&
      first.demo.status === 'RENDERED' &&
      first.demo.expiresAt !== null,
    publicQaBypassBlocked:
      publicRender.ok === false &&
      first.demo.factQaStatus === 'PENDING_PHASE18' &&
      first.demo.visualQaStatus === 'PENDING_PHASE18' &&
      first.demo.salesQaStatus === 'PENDING_PHASE19' &&
      mainState?.current_state === 'RENDERED',
    conceptSafetyPreserved:
      config.noindex === true &&
      Boolean(config.disclosure?.text?.toLowerCase().includes('concept')),
    stateProgressionRecorded:
      transitionPairs.includes('CONTENT_PENDING->DEMO_CONFIGURED') &&
      transitionPairs.includes('DEMO_CONFIGURED->RENDER_PENDING') &&
      transitionPairs.includes('RENDER_PENDING->RENDERED'),
    idempotentReuse:
      first.reused === false &&
      second.reused === true &&
      first.build.id === second.build.id &&
      first.demo.id === second.demo.id &&
      Number(buildCount?.count ?? 0) === 1 &&
      Number(demoCount?.count ?? 0) === 1 &&
      history.length === 1,
    missingDependencyFailsClosed:
      missingAssetsBlocked && missingState?.current_state === 'CONTENT_PENDING',
    crossTenantBlocked,
    foreignKeyViolations: foreignKeys.results.length,
  };

  return c.json({
    ok: Object.values(checks).every((value) => value === true || value === 0),
    checks,
  });
});

export default app;
