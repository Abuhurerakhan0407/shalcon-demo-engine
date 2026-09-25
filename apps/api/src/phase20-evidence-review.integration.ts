import {
  CampaignRepository,
  EvidenceRepository,
  ProspectFactRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
  type UserRecord,
} from '@shalcon/db';
import { Hono } from 'hono';

import type { Bindings } from './context';
import { evidenceReviewRoutes } from './evidence-review-routes';

const USER: UserRecord = {
  id: 'usr_phase20_evidence_review',
  email: 'phase20-evidence-review@example.invalid',
  name: 'Phase 20 Evidence Review',
  createdAt: '2026-09-14T00:00:00.000Z',
};

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

const app = new Hono<Bindings>();

app.use('/api/v1/prospects/*', async (c, next) => {
  c.set('authUser', USER);
  await next();
});
app.route('/api/v1/prospects', evidenceReviewRoutes);

app.get('/phase20/health', (c) => c.json({ ok: true, phase: 20, mode: 'EVIDENCE_REVIEW' }));

app.post('/phase20/fixture', async (c) => {
  const db = requireDb(c.env.DB);
  const now = new Date().toISOString();
  await new UserRepository(db).create(USER);
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(USER.id, now);
  const prospects = new ProspectRepository(db);
  await prospects.create({
    id: 'p20_review',
    campaignId: campaign.id,
    canonicalName: 'Phase 20 Review Salon',
    normalizedName: 'phase20 review salon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE20_REVIEW_FIXTURE',
    currentState: 'RESEARCHED',
    domain: 'phase20-review.example',
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: now,
    updatedAt: now,
  });
  await prospects.create({
    id: 'p20_other',
    campaignId: campaign.id,
    canonicalName: 'Other Review Salon',
    normalizedName: 'other review salon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE20_REVIEW_FIXTURE',
    currentState: 'RESEARCHED',
    domain: 'phase20-other.example',
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: now,
    updatedAt: now,
  });

  await prospects.create({
    id: 'p20_blocked',
    campaignId: campaign.id,
    canonicalName: 'Blocked Review Salon',
    normalizedName: 'blocked review salon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE20_REVIEW_FIXTURE',
    currentState: 'RESEARCH_PENDING',
    domain: 'phase20-blocked.example',
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: now,
    updatedAt: now,
  });

  const sources = new SourceRecordRepository(db);
  await sources.create({
    id: 'src_p20_review',
    prospectId: 'p20_review',
    provider: 'PLAYWRIGHT',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: 'https://phase20-review.example/',
    rawJson: '{}',
    capturedAt: now,
  });

  await sources.create({
    id: 'src_p20_blocked',
    prospectId: 'p20_blocked',
    provider: 'PLAYWRIGHT',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: 'https://phase20-blocked.example/',
    rawJson: '{}',
    capturedAt: now,
  });

  const evidence = new EvidenceRepository(db);
  const createEvidence = (
    id: string,
    field: string,
    value: string,
    verificationStatus: 'PROBABLE' | 'UNVERIFIED',
  ) =>
    evidence.create({
      id,
      prospectId: 'p20_review',
      field,
      value,
      sourceRecordId: 'src_p20_review',
      sourceUrl: 'https://phase20-review.example/',
      sourceQuality: 1,
      confidence: verificationStatus === 'PROBABLE' ? 0.9 : 0.78,
      verificationStatus,
      excerpt: value,
      capturedAt: now,
    });

  await createEvidence('ev_p20_phone', 'phone', '+91 99999 11111', 'PROBABLE');
  await createEvidence('ev_p20_service', 'service', 'Haircut', 'PROBABLE');
  await createEvidence('ev_p20_reject', 'description', 'Unsupported marketing claim', 'UNVERIFIED');
  await createEvidence('ev_p20_address_a', 'address', '10 Review Road, Mumbai', 'PROBABLE');
  await createEvidence('ev_p20_address_b', 'address', '99 Conflict Road, Mumbai', 'PROBABLE');

  await evidence.create({
    id: 'ev_p20_blocked_address_a',
    prospectId: 'p20_blocked',
    field: 'address',
    value: '10 Blocked Road, Mumbai',
    sourceRecordId: 'src_p20_blocked',
    sourceUrl: 'https://phase20-blocked.example/',
    sourceQuality: 1,
    confidence: 0.9,
    verificationStatus: 'PROBABLE',
    excerpt: '10 Blocked Road, Mumbai',
    capturedAt: now,
  });
  await evidence.create({
    id: 'ev_p20_blocked_address_b',
    prospectId: 'p20_blocked',
    field: 'address',
    value: '99 Wrong Road, Mumbai',
    sourceRecordId: 'src_p20_blocked',
    sourceUrl: 'https://phase20-blocked.example/',
    sourceQuality: 1,
    confidence: 0.8,
    verificationStatus: 'PROBABLE',
    excerpt: '99 Wrong Road, Mumbai',
    capturedAt: now,
  });
  await db
    .prepare(`
      INSERT INTO research_runs(
        id, prospect_id, user_id, status, selected_sources_json, conflicts_json,
        model, started_at, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'BLOCKED', '[]', ?, NULL, ?, ?, ?, ?)
    `)
    .bind(
      'run_p20_blocked',
      'p20_blocked',
      USER.id,
      JSON.stringify([{ field: 'address', values: ['10 blocked road, mumbai', '99 wrong road, mumbai'], critical: true }]),
      now,
      now,
      now,
      now,
    )
    .run();

  return c.json({ ok: true }, 201);
});

app.get('/phase20/summary', async (c) => {
  const db = requireDb(c.env.DB);
  const evidence = await new EvidenceRepository(db).listForProspect('p20_review');
  const facts = await new ProspectFactRepository(db).listForProspect('p20_review');
  const events = await db
    .prepare(`
      SELECT id, evidence_id, decision, from_status, to_status, promoted_to_fact
      FROM evidence_verification_events
      WHERE prospect_id = ?
      ORDER BY created_at, id
    `)
    .bind('p20_review')
    .all<Record<string, unknown>>();
  const blockedProspect = await new ProspectRepository(db).getByIdForUser('p20_blocked', USER.id);
  const blockedStateEvents = await new ProspectRepository(db).listStateEvents('p20_blocked');
  const foreignKeys = await db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>();
  return c.json({
    evidence,
    facts,
    events: events.results,
    blockedProspectState: blockedProspect?.currentState ?? null,
    blockedStateEvents,
    foreignKeyViolations: foreignKeys.results.length,
  });
});

export default app;
