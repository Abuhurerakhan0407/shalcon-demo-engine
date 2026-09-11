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

import { getDemoWorthinessHistory, runDemoWorthinessScoring } from './demo-worthiness';

interface Env {
  DB: D1DatabaseLike;
}

const app = new Hono<{ Bindings: Env }>();

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
    sourceFirstSeen: 'PHASE13_TEST',
    currentState: 'AUDITED',
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
    provider: 'PHASE13_FIXTURE',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: `https://${id}.example.com/`,
    rawJson: '{}',
    capturedAt: now,
  });
}

async function addEvidence(
  db: D1DatabaseLike,
  prospectId: string,
  field: string,
  value: string,
  at: string,
  verified = false,
) {
  const id = `ev_${prospectId}_${field.replace(/[^a-z0-9]/giu, '_')}`;
  await new EvidenceRepository(db).create({
    id,
    prospectId,
    field,
    value,
    sourceRecordId: `src_${prospectId}`,
    sourceUrl: `https://${prospectId}.example.com/`,
    sourceQuality: 1,
    confidence: verified ? 1 : 0.9,
    verificationStatus: verified ? 'VERIFIED' : 'PROBABLE',
    excerpt: `${field}: ${value}`,
    capturedAt: at,
  });
  return id;
}

async function addVerifiedFact(
  db: D1DatabaseLike,
  prospectId: string,
  field: string,
  value: string,
  at: string,
) {
  const evidenceId = await addEvidence(db, prospectId, field, value, at, true);
  await new ProspectFactRepository(db).upsert({
    id: `fact_${prospectId}_${field}`,
    prospectId,
    field,
    value,
    verificationStatus: 'VERIFIED',
    confidence: 1,
    evidenceId,
    createdAt: at,
    updatedAt: at,
  });
  return evidenceId;
}

async function addAudit(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
  recommendation: 'SKIP_DEMO' | 'DEMO_WORTHY',
  at: string,
) {
  const good = recommendation === 'SKIP_DEMO';
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
      good ? 95 : 40,
      good ? 'GOOD' : 'POOR',
      recommendation,
      JSON.stringify([`src_${prospectId}`]),
      'Phase 13 fixture audit.',
      at,
      at,
    )
    .run();
}

app.get('/phase13', async (c) => {
  const db = c.env.DB;
  const now = iso(0);
  const userId = 'usr_phase13';
  await new UserRepository(db).create({
    id: userId,
    email: 'phase13@example.com',
    name: 'Phase 13',
    createdAt: now,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(userId, now);

  await createProspect(db, 'p13_high', campaign.id, now);
  await addVerifiedFact(db, 'p13_high', 'service', 'Haircut', iso(1));
  await addVerifiedFact(db, 'p13_high', 'phone', '+912200000001', iso(2));
  await addVerifiedFact(db, 'p13_high', 'email', 'hello@p13-high.example.com', iso(3));
  await addVerifiedFact(db, 'p13_high', 'address', 'Mumbai', iso(4));
  await addVerifiedFact(db, 'p13_high', 'description', 'Premium salon and spa', iso(5));
  await addEvidence(db, 'p13_high', 'premium_positioning', 'Premium positioning visible', iso(6));
  await addEvidence(db, 'p13_high', 'booking_software', 'Online booking software visible', iso(7));
  await addEvidence(db, 'p13_high', 'multiple_locations', 'Multiple locations listed', iso(8));
  await addEvidence(db, 'p13_high', 'recent_activity', 'Recent public activity visible', iso(9));
  await addAudit(db, userId, 'p13_high', 'DEMO_WORTHY', iso(10));
  const high = await runDemoWorthinessScoring(db, userId, 'p13_high', iso(11));

  await createProspect(db, 'p13_mid', campaign.id, now);
  await addEvidence(db, 'p13_mid', 'service', 'Haircut', iso(12));
  await addAudit(db, userId, 'p13_mid', 'DEMO_WORTHY', iso(13));
  const middle = await runDemoWorthinessScoring(db, userId, 'p13_mid', iso(14));

  await createProspect(db, 'p13_low', campaign.id, now);
  await addAudit(db, userId, 'p13_low', 'SKIP_DEMO', iso(15));
  const low = await runDemoWorthinessScoring(db, userId, 'p13_low', iso(16));

  const highHistory = await getDemoWorthinessHistory(db, userId, 'p13_high');
  const [highRow, middleRow, lowRow, transitions, foreignKeys, migrationRows] = await Promise.all([
    db.prepare('SELECT current_state, demo_score FROM prospects WHERE id = ?').bind('p13_high').first<{ current_state: string; demo_score: number | null }>(),
    db.prepare('SELECT current_state, demo_score FROM prospects WHERE id = ?').bind('p13_mid').first<{ current_state: string; demo_score: number | null }>(),
    db.prepare('SELECT current_state, demo_score FROM prospects WHERE id = ?').bind('p13_low').first<{ current_state: string; demo_score: number | null }>(),
    db.prepare('SELECT prospect_id, from_state, to_state FROM prospect_state_events WHERE prospect_id LIKE ? ORDER BY id').bind('p13_%').all<{ prospect_id: string; from_state: string; to_state: string }>(),
    db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>(),
    db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>(),
  ]);

  let rejectedCannotAdvance = false;
  try {
    await new ProspectRepository(db).transition('p13_low', 'DEMO_QUALIFIED', iso(17));
  } catch {
    rejectedCannotAdvance = true;
  }

  const statePath = (id: string, target: string) => {
    const rows = transitions.results.filter((item) => item.prospect_id === id);
    return rows.some((item) => item.from_state === 'AUDITED' && item.to_state === 'SCORED') &&
      rows.some((item) => item.from_state === 'SCORED' && item.to_state === target);
  };

  const checks = {
    migrationApplied: Number(migrationRows?.count ?? 0) >= 9,
    codeCalculatedPriorityScore:
      high.score.total === 100 && high.score.band === 'PRIORITY_DEMO' && high.score.decision === 'DEMO_QUALIFIED',
    generateThresholdEnforced:
      highRow?.current_state === 'DEMO_QUALIFIED' && highRow.demo_score === high.score.total,
    researchMoreThresholdEnforced:
      middle.score.total === 50 && middle.score.decision === 'RESEARCH_MORE' &&
      middleRow?.current_state === 'RESEARCH_MORE' && middleRow.demo_score === 50,
    rejectThresholdEnforced:
      low.score.total === 0 && low.score.decision === 'REJECTED' &&
      lowRow?.current_state === 'REJECTED' && lowRow.demo_score === 0,
    missingEvidenceReducesScore:
      low.score.components.businessNicheFit.points === 0 && low.score.components.verifiedData.points === 0,
    everyPositiveComponentHasEvidence:
      Object.values(high.score.components).filter((item) => item.points > 0).every((item) => item.references.length > 0),
    historyPreserved: highHistory.length === 1 && highHistory[0]?.id === high.id,
    scoredStateIsAuditable:
      statePath('p13_high', 'DEMO_QUALIFIED') &&
      statePath('p13_mid', 'RESEARCH_MORE') &&
      statePath('p13_low', 'REJECTED'),
    rejectedCannotGenerateAutomatically: rejectedCannotAdvance,
    foreignKeyViolations: foreignKeys.results.length,
  };

  return c.json({
    ok: Object.values(checks).every((value) => value === true || value === 0),
    checks,
  });
});

export default app;
