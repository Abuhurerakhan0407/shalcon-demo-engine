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
import { runAutomaticBrandTemplateMatch } from './brand-template';
import { runContentGeneration } from './content-engine';

interface Env { DB: D1DatabaseLike }
const app = new Hono<{ Bindings: Env }>();
app.get('/healthz', (c) => c.json({ ok: true }));

function iso(offset: number): string {
  return new Date(Date.parse('2026-09-14T00:00:00.000Z') + offset * 1000).toISOString();
}

async function addFact(db: D1DatabaseLike, prospectId: string, field: string, value: string, offset: number) {
  const key = field.replace(/[^a-z0-9]/giu, '_').toLowerCase();
  const evidenceId = `ev_${key}`;
  const at = iso(offset);
  await new EvidenceRepository(db).create({
    id: evidenceId,
    prospectId,
    field,
    value,
    sourceRecordId: 'src_p17_prebuild',
    sourceUrl: 'https://p17-prebuild.example.com/',
    sourceQuality: 1,
    confidence: 0.97,
    verificationStatus: 'VERIFIED',
    excerpt: value,
    capturedAt: at,
  });
  await new ProspectFactRepository(db).upsert({
    id: `fact_${key}`,
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

app.get('/phase17-prebuild', async (c) => {
  const db = c.env.DB;
  const userId = 'usr_p17_prebuild';
  const prospectId = 'p17_prebuild';
  await new UserRepository(db).create({
    id: userId,
    email: 'phase17-prebuild@example.com',
    name: 'Phase 17 Prebuild',
    createdAt: iso(0),
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(userId, iso(0));
  await new ProspectRepository(db).create({
    id: prospectId,
    campaignId: campaign.id,
    canonicalName: 'Phase Seventeen Salon',
    normalizedName: 'phase seventeen salon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE17_PREBUILD',
    currentState: 'DEMO_QUALIFIED',
    domain: 'p17-prebuild.example.com',
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: iso(0),
    updatedAt: iso(0),
  });
  await new SourceRecordRepository(db).create({
    id: 'src_p17_prebuild',
    prospectId,
    provider: 'PHASE17_PREBUILD',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: 'https://p17-prebuild.example.com/',
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
    'asset_p17_prebuild',
    prospectId,
    'https://p17-prebuild.example.com/logo.png',
    'fixture://phase17-prebuild-logo',
    iso(8),
    iso(8),
  ).run();
  const assets = await runAssetSelection(db, userId, prospectId, iso(9));
  const state = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  const foreignKeys = await db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>();

  const checks = {
    templateMatched: match.match.templateId === 'elane-v8' && match.match.templateVersion === '8.0.0',
    contentGenerated: content.content.headline?.text === 'Premium Salon in Mumbai',
    assetsSelected: assets.assignments.length === 4 && assets.templateMatchId === match.match.id && assets.contentRunId === content.id,
    contentPending: state?.currentState === 'CONTENT_PENDING',
    foreignKeyViolations: foreignKeys.results.length,
  };
  return c.json({ ok: Object.values(checks).every((value) => value === true || value === 0), checks });
});

export default app;
