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
import { runAutomatedDemoBuild } from './automated-demo-builder';
import { runAutomaticBrandTemplateMatch } from './brand-template';
import { runContentGeneration } from './content-engine';
import { renderDemoRecordForOperator } from './demo-renderer';

interface Env { DB: D1DatabaseLike }
const app = new Hono<{ Bindings: Env }>();
app.get('/healthz', (c) => c.json({ ok: true }));
const SECRET = 'phase17-build-smoke-secret-123456';

function iso(offset: number): string {
  return new Date(Date.parse('2026-09-14T01:00:00.000Z') + offset * 1000).toISOString();
}

async function addFact(db: D1DatabaseLike, prospectId: string, field: string, value: string, offset: number) {
  const key = field.replace(/[^a-z0-9]/giu, '_').toLowerCase();
  const evidenceId = `ev_smoke_${key}`;
  const at = iso(offset);
  await new EvidenceRepository(db).create({
    id: evidenceId,
    prospectId,
    field,
    value,
    sourceRecordId: 'src_p17_smoke',
    sourceUrl: 'https://p17-smoke.example.com/',
    sourceQuality: 1,
    confidence: 0.97,
    verificationStatus: 'VERIFIED',
    excerpt: value,
    capturedAt: at,
  });
  await new ProspectFactRepository(db).upsert({
    id: `fact_smoke_${key}`,
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

app.get('/phase17-build-smoke', async (c) => {
  const db = c.env.DB;
  const userId = 'usr_p17_smoke';
  const prospectId = 'p17_smoke';
  await new UserRepository(db).create({
    id: userId,
    email: 'phase17-smoke@example.com',
    name: 'Phase 17 Smoke',
    createdAt: iso(0),
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(userId, iso(0));
  await new ProspectRepository(db).create({
    id: prospectId,
    campaignId: campaign.id,
    canonicalName: 'Phase Seventeen Salon',
    normalizedName: 'phase seventeen salon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE17_SMOKE',
    currentState: 'DEMO_QUALIFIED',
    domain: 'p17-smoke.example.com',
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: iso(0),
    updatedAt: iso(0),
  });
  await new SourceRecordRepository(db).create({
    id: 'src_p17_smoke',
    prospectId,
    provider: 'PHASE17_SMOKE',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: 'https://p17-smoke.example.com/',
    rawJson: '{}',
    capturedAt: iso(0),
  });
  await addFact(db, prospectId, 'category', 'Premium Salon', 1);
  await addFact(db, prospectId, 'city', 'Mumbai', 2);
  await addFact(db, prospectId, 'business_description', 'A salon offering verified hair and beauty services.', 3);
  await addFact(db, prospectId, 'service', 'Haircut', 4);
  await addFact(db, prospectId, 'whatsapp', '+91 98765 43210', 5);

  const match = await runAutomaticBrandTemplateMatch(db, userId, prospectId, iso(6));
  const content = await runContentGeneration(db, userId, prospectId, iso(7));
  await db.prepare(`
    INSERT INTO assets(
      id, prospect_id, asset_type, source_type, source_url, storage_ref,
      usage_classification, mime_type, width, height, created_at,
      source_captured_at, association_assumption, watermark_status, asset_status, optimization_json
    ) VALUES (?, ?, 'LOGO', 'OFFICIAL_WEBSITE', ?, ?, 'PROSPECT_OFFICIAL', 'image/png',
      1024, 512, ?, ?, 'OFFICIAL_PROSPECT_SOURCE', 'CLEAR', 'ACTIVE', '{}')
  `).bind(
    'asset_p17_smoke',
    prospectId,
    'https://p17-smoke.example.com/logo.png',
    'fixture://phase17-smoke-logo',
    iso(8),
    iso(8),
  ).run();
  const assets = await runAssetSelection(db, userId, prospectId, iso(9));
  const result = await runAutomatedDemoBuild(db, userId, prospectId, SECRET, new Date(iso(10)));
  const state = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  const rendered = renderDemoRecordForOperator(result.demo, iso(11));
  const counts = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM demos WHERE prospect_id = ?) AS demos,
      (SELECT COUNT(*) FROM automated_demo_builds WHERE prospect_id = ?) AS builds
  `).bind(prospectId, prospectId).first<{ demos: number; builds: number }>();
  const foreignKeys = await db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>();

  const checks = {
    buildReturned: result.reused === false && result.build.demoId === result.demo.id,
    upstreamLinked:
      result.build.templateMatchId === match.match.id &&
      result.build.contentRunId === content.id &&
      result.build.assetSelectionRunId === assets.id,
    renderedState: state?.currentState === 'RENDERED' && result.demo.status === 'RENDERED',
    operatorRender: rendered.ok === true,
    persistedOnce: Number(counts?.demos ?? 0) === 1 && Number(counts?.builds ?? 0) === 1,
    foreignKeyViolations: foreignKeys.results.length,
  };
  return c.json({ ok: Object.values(checks).every((value) => value === true || value === 0), checks });
});

export default app;
