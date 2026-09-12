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

import { getBrandTemplateHistory } from './brand-template';

interface Env {
  DB: D1DatabaseLike;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/healthz', (c) => c.json({ ok: true }));

function iso(offsetSeconds: number): string {
  return new Date(Date.parse('2026-09-12T00:00:00.000Z') + offsetSeconds * 1000).toISOString();
}

async function createProspect(db: D1DatabaseLike, id: string, campaignId: string, now: string) {
  await new ProspectRepository(db).create({
    id,
    campaignId,
    canonicalName: id,
    normalizedName: id,
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE14_TEST',
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
    provider: 'PHASE14_FIXTURE',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: `https://${id}.example.com/`,
    rawJson: '{}',
    capturedAt: now,
  });
}

async function addEvidence(
  db: D1DatabaseLike,
  prospectId: string,
  id: string,
  field: string,
  value: string,
  at: string,
) {
  await new EvidenceRepository(db).create({
    id,
    prospectId,
    field,
    value,
    sourceRecordId: `src_${prospectId}`,
    sourceUrl: `https://${prospectId}.example.com/`,
    sourceQuality: 1,
    confidence: 0.95,
    verificationStatus: 'VERIFIED',
    excerpt: value,
    capturedAt: at,
  });
}

async function addVerifiedService(
  db: D1DatabaseLike,
  prospectId: string,
  index: number,
  value: string,
  at: string,
) {
  const evidenceId = `ev_${prospectId}_service_${index}`;
  await addEvidence(db, prospectId, evidenceId, 'service', value, at);
  await new ProspectFactRepository(db).upsert({
    id: `fact_${prospectId}_service_${index}`,
    prospectId,
    field: 'service',
    value,
    verificationStatus: 'VERIFIED',
    confidence: 1,
    evidenceId,
    createdAt: at,
    updatedAt: at,
  });
}

async function addAudit(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
  recommendation: 'DEMO_WORTHY' | 'LOW_PRIORITY',
  at: string,
) {
  await db
    .prepare(`
      INSERT INTO website_audit_runs(
        id, prospect_id, user_id, status, website_presence, quality_score, quality_rating,
        recommendation, source_ids_json, summary, created_at, completed_at
      ) VALUES (?, ?, ?, 'COMPLETED', 'CAPTURED', ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      `audit_${prospectId}`,
      prospectId,
      userId,
      recommendation === 'DEMO_WORTHY' ? 42 : 68,
      recommendation === 'DEMO_WORTHY' ? 'POOR' : 'FAIR',
      recommendation,
      JSON.stringify([`src_${prospectId}`]),
      'Phase 14 fixture audit.',
      at,
      at,
    )
    .run();
}

app.get('/phase14', async (c) => {
  const db = c.env.DB;
  const userId = 'usr_phase14';
  const now = iso(0);

  await new UserRepository(db).create({
    id: userId,
    email: 'phase14@example.com',
    name: 'Phase 14',
    createdAt: now,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(userId, now);

  await createProspect(db, 'p14_rich', campaign.id, now);
  await addEvidence(db, 'p14_rich', 'ev_p14_position', 'brand_positioning', 'Premium salon experience', iso(1));
  await addEvidence(db, 'p14_rich', 'ev_p14_color', 'logo_colors', '#C9A96E and black', iso(2));
  await addVerifiedService(db, 'p14_rich', 1, 'Haircut', iso(3));
  await addVerifiedService(db, 'p14_rich', 2, 'Hair styling', iso(4));
  await addVerifiedService(db, 'p14_rich', 3, 'Spa ritual', iso(5));
  await db
    .prepare(`
      INSERT INTO assets(
        id, prospect_id, asset_type, source_type, source_url, storage_ref,
        usage_classification, mime_type, width, height, created_at
      ) VALUES (?, ?, 'LOGO', 'OFFICIAL_WEBSITE', ?, ?, 'PROSPECT_OFFICIAL', 'image/png', 512, 512, ?)
    `)
    .bind(
      'asset_p14_rich_logo',
      'p14_rich',
      'https://p14_rich.example.com/logo.png',
      'fixture://logo',
      iso(6),
    )
    .run();
  await addAudit(db, userId, 'p14_rich', 'DEMO_WORTHY', iso(7));

  const history = await getBrandTemplateHistory(db, userId, 'p14_rich');

  return c.json({ ok: history.length === 0, stage: 'empty-history', historyCount: history.length });
});

export default app;
