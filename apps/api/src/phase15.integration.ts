import {
  CampaignRepository,
  EvidenceRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
} from '@shalcon/db';
import { Hono } from 'hono';

import { runAutomaticBrandTemplateMatch } from './brand-template';
import { getContentHistory, runContentGeneration } from './content-engine';

interface Env { DB: D1DatabaseLike }
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
    sourceFirstSeen: 'PHASE15_TEST',
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
    provider: 'PHASE15_FIXTURE',
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
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' = 'VERIFIED',
) {
  await new EvidenceRepository(db).create({
    id,
    prospectId,
    field,
    value,
    sourceRecordId: `src_${prospectId}`,
    sourceUrl: `https://${prospectId}.example.com/`,
    sourceQuality: 1,
    confidence: verificationStatus === 'VERIFIED' ? 0.96 : 0.45,
    verificationStatus,
    excerpt: value,
    capturedAt: at,
  });
}

app.get('/phase15', async (c) => {
  const db = c.env.DB;
  const userId = 'usr_phase15';
  const now = iso(0);
  await new UserRepository(db).create({
    id: userId,
    email: 'phase15@example.com',
    name: 'Phase 15',
    createdAt: now,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(userId, now);

  await createProspect(db, 'p15_rich', campaign.id, now);
  await addEvidence(db, 'p15_rich', 'ev_p15_category', 'category', 'Hair & beauty salon', iso(1));
  await addEvidence(db, 'p15_rich', 'ev_p15_city', 'city', 'Mumbai', iso(2));
  await addEvidence(db, 'p15_rich', 'ev_p15_description', 'business_description', 'A salon offering hair and beauty services.', iso(3));
  await addEvidence(db, 'p15_rich', 'ev_p15_haircut', 'service', 'Haircut', iso(4));
  await addEvidence(db, 'p15_rich', 'ev_p15_styling', 'service', 'Hair styling', iso(5));
  await addEvidence(db, 'p15_rich', 'ev_p15_unverified', 'service', 'Tattoo removal', iso(6), 'UNVERIFIED');
  await addEvidence(db, 'p15_rich', 'ev_p15_phone', 'phone', '+91 98765 43210', iso(7));
  await runAutomaticBrandTemplateMatch(db, userId, 'p15_rich', iso(8));
  const richFirst = await runContentGeneration(db, userId, 'p15_rich', iso(9));
  const richSecond = await runContentGeneration(db, userId, 'p15_rich', iso(10));
  const richHistory = await getContentHistory(db, userId, 'p15_rich');

  await createProspect(db, 'p15_sparse', campaign.id, now);
  await runAutomaticBrandTemplateMatch(db, userId, 'p15_sparse', iso(11));
  const sparse = await runContentGeneration(db, userId, 'p15_sparse', iso(12));

  await createProspect(db, 'p15_long', campaign.id, now);
  const longService = `Advanced restorative hair and scalp consultation ${'with personalized care '.repeat(14)}`.trim();
  await addEvidence(db, 'p15_long', 'ev_p15_long_service', 'service', longService, iso(13));
  await runAutomaticBrandTemplateMatch(db, userId, 'p15_long', iso(14));
  const longRun = await runContentGeneration(db, userId, 'p15_long', iso(15));

  const [states, transitions, foreignKeys, migrationRows, runCount] = await Promise.all([
    db.prepare(`SELECT id, current_state FROM prospects WHERE id LIKE 'p15_%' ORDER BY id`).all<{ id: string; current_state: string }>(),
    db.prepare(`SELECT prospect_id, from_state, to_state FROM prospect_state_events WHERE prospect_id LIKE 'p15_%' ORDER BY id`).all<{ prospect_id: string; from_state: string; to_state: string }>(),
    db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>(),
    db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>(),
    db.prepare('SELECT COUNT(*) AS count FROM content_generation_runs').first<{ count: number }>(),
  ]);

  const stateFor = (id: string) => states.results.find((row) => row.id === id)?.current_state;
  const transitionedToContent = (id: string) => transitions.results.some(
    (row) => row.prospect_id === id && row.from_state === 'TEMPLATE_MATCHED' && row.to_state === 'CONTENT_PENDING',
  );
  const output = JSON.stringify(richFirst.content).toLowerCase();
  const richServiceNames = new Set(richFirst.content.services.map((service) => service.serviceName));
  const allRichBlocks = [
    richFirst.content.headline,
    ...richFirst.content.services.map((service) => service.description),
    richFirst.content.about,
    richFirst.content.cta,
  ].filter((item) => item !== undefined);

  const checks = {
    migrationApplied: Number(migrationRows?.count ?? 0) >= 11,
    verifiedInputSelector:
      richServiceNames.size === 2 &&
      richServiceNames.has('Haircut') &&
      richServiceNames.has('Hair styling') &&
      !richServiceNames.has('Tattoo removal'),
    noUnsupportedClaims:
      !output.includes('award-winning') &&
      !output.includes('best salon') &&
      !output.includes('trusted by') &&
      !output.includes('5-star'),
    evidenceMapped:
      richFirst.evidenceIds.includes('ev_p15_category') &&
      richFirst.evidenceIds.includes('ev_p15_haircut') &&
      richFirst.evidenceIds.includes('ev_p15_styling') &&
      richFirst.evidenceIds.includes('ev_p15_phone') &&
      allRichBlocks.every((block) => block.kind === 'CTA' && block.inputEvidenceIds.length === 0 ? true : block.inputEvidenceIds.length > 0),
    missingDataHidesSafely:
      sparse.content.headline === undefined &&
      sparse.content.services.length === 0 &&
      sparse.content.about === undefined &&
      sparse.content.hiddenSections.includes('HEADLINE') &&
      sparse.content.hiddenSections.includes('SERVICES') &&
      sparse.content.hiddenSections.includes('ABOUT') &&
      sparse.content.cta.channel === 'PLACEHOLDER',
    longNamesHandled:
      longRun.content.services[0]?.serviceName === longService &&
      (longRun.content.services[0]?.description.text.length ?? 999) <= 120,
    immutableRepeatHistory:
      richSecond.id !== richFirst.id &&
      richHistory.length === 2 &&
      richHistory.some((run) => run.id === richFirst.id) &&
      richHistory.some((run) => run.id === richSecond.id),
    contentStateEnforced:
      stateFor('p15_rich') === 'CONTENT_PENDING' &&
      stateFor('p15_sparse') === 'CONTENT_PENDING' &&
      stateFor('p15_long') === 'CONTENT_PENDING' &&
      transitionedToContent('p15_rich') &&
      transitionedToContent('p15_sparse') &&
      transitionedToContent('p15_long'),
    versionedGeneration:
      richFirst.engineVersion === 'content-engine.v1' &&
      richFirst.promptVersion === 'content-safe.v1' &&
      richFirst.schemaVersion === 'prospect-content.v1' &&
      Number(runCount?.count ?? 0) === 4,
    foreignKeyViolations: foreignKeys.results.length,
  };

  return c.json({
    ok: Object.values(checks).every((value) => value === true || value === 0),
    checks,
  });
});

export default app;
