import {
  CampaignRepository,
  JobContextRepository,
  JobRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
} from '@shalcon/db';
import { Hono } from 'hono';

import type { AiExtractionResult } from './ai-result';
import {
  completePhase11ResearchExtraction,
  isPhase11JobPayload,
  startPhase11Research,
} from './research-agent';

interface Env {
  DB: D1DatabaseLike;
}

interface ConflictPayloadItem {
  field?: string;
  critical?: boolean;
}

const app = new Hono<{ Bindings: Env }>();

function iso(offsetSeconds: number): string {
  return new Date(Date.parse('2026-09-09T18:00:00.000Z') + offsetSeconds * 1000).toISOString();
}

async function createProspect(
  db: D1DatabaseLike,
  id: string,
  campaignId: string,
  now: string,
): Promise<void> {
  await new ProspectRepository(db).create({
    id,
    campaignId,
    canonicalName: id === 'p11_a' ? 'Élane Salon' : 'Conflict Salon',
    normalizedName: id === 'p11_a' ? 'élane salon' : 'conflict salon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE11_TEST',
    currentState: 'IDENTITY_VERIFIED',
    domain: 'example.com',
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: now,
    updatedAt: now,
  });
}

function sourceRaw(title: string, text: string): string {
  return JSON.stringify({
    schemaVersion: 'playwright-research.v1',
    sourceOnly: true,
    page: { title, text },
  });
}

function parseJsonArray(raw: string | null | undefined): unknown[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseConflictPayload(raw: string | null | undefined): ConflictPayloadItem[] {
  return parseJsonArray(raw).filter((item): item is ConflictPayloadItem => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    return (
      (record.field === undefined || typeof record.field === 'string') &&
      (record.critical === undefined || typeof record.critical === 'boolean')
    );
  });
}

function aiResult(
  sourceId: string,
  url: string,
  extracted: AiExtractionResult['extracted'],
): AiExtractionResult {
  return {
    schemaVersion: 'business-extraction.v1',
    sourceOnly: true,
    verified: false,
    provider: 'ollama',
    model: 'qwen3:0.6b',
    adapter: 'ollama-direct',
    extracted,
    provenance: [{ sourceId, url }],
    telemetry: { attempts: 1, elapsedMs: 100, sourceChars: 200, promptChars: 1000 },
  };
}

async function completeRunJob(
  db: D1DatabaseLike,
  userId: string,
  jobId: string,
  extracted: AiExtractionResult['extracted'],
  at: string,
): Promise<void> {
  const jobs = new JobRepository(db);
  const contexts = new JobContextRepository(db);
  const pending = await jobs.getById(jobId);
  const context = await contexts.getByJobId(jobId);
  if (!pending || !context) throw new Error('Phase 11 integration job fixture missing.');
  const payload: unknown = JSON.parse(context.payloadJson);
  if (!isPhase11JobPayload(payload)) throw new Error('Phase 11 integration payload invalid.');
  const claimed = await jobs.claim(jobId, 'runner_phase11', iso(3600), at);
  await completePhase11ResearchExtraction(
    db,
    userId,
    'runner_phase11',
    claimed,
    payload,
    aiResult(payload.sourceRecordId, payload.sources[0]?.url ?? '', extracted),
    at,
  );
}

app.get('/phase11', async (c) => {
  const db = c.env.DB;
  const now = iso(0);
  const userId = 'usr_phase11';
  await new UserRepository(db).create({
    id: userId,
    email: 'phase11@example.com',
    name: 'Phase 11',
    createdAt: now,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(userId, now);

  await createProspect(db, 'p11_a', campaign.id, now);
  await new SourceRecordRepository(db).create({
    id: 'src_p11_contact',
    prospectId: 'p11_a',
    provider: 'PLAYWRIGHT',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: 'https://example.com/contact',
    rawJson: sourceRaw(
      'Contact Élane Salon',
      'Élane Salon is a hair and beauty salon in Mumbai. Email hello@example.com. Services include Haircut and Styling.',
    ),
    capturedAt: now,
  });

  const run = await startPhase11Research(db, userId, 'p11_a', { model: 'qwen3:0.6b' }, iso(1));
  const firstJobId = run.jobIds[0];
  if (!firstJobId) throw new Error('Phase 11 did not queue a source extraction job.');
  await completeRunJob(
    db,
    userId,
    firstJobId,
    {
      businessName: 'Élane Salon',
      description: 'Hair and beauty salon in Mumbai.',
      phone: null,
      email: 'hello@example.com',
      address: null,
      openingHours: [],
      services: ['Haircut', 'Styling'],
      socialLinks: [],
    },
    iso(2),
  );

  const [runRow, prospectA, evidenceA, factsA, researchA, linksA] = await Promise.all([
    db
      .prepare('SELECT status, conflicts_json FROM research_runs WHERE id = ?')
      .bind(run.id)
      .first<{ status: string; conflicts_json: string }>(),
    new ProspectRepository(db).getById('p11_a'),
    db
      .prepare(
        'SELECT field, value, verification_status, source_record_id FROM evidence WHERE prospect_id = ?',
      )
      .bind('p11_a')
      .all<{
        field: string;
        value: string;
        verification_status: string;
        source_record_id: string;
      }>(),
    db.prepare('SELECT id FROM prospect_facts WHERE prospect_id = ?').bind('p11_a').all<{ id: string }>(),
    db
      .prepare('SELECT id, evidence_ids_json FROM research WHERE prospect_id = ?')
      .bind('p11_a')
      .all<{ id: string; evidence_ids_json: string }>(),
    db
      .prepare('SELECT evidence_id, source_record_id FROM research_run_evidence WHERE run_id = ?')
      .bind(run.id)
      .all<{ evidence_id: string; source_record_id: string }>(),
  ]);

  const evidenceOnly = evidenceA.results.length > 0 && factsA.results.length === 0;
  const everyCandidateHasSource = evidenceA.results.every(
    (item) => item.source_record_id === 'src_p11_contact',
  );
  const noAutoVerified = evidenceA.results.every(
    (item) => item.verification_status !== 'VERIFIED',
  );
  const lowConfidenceStaysUnverified = evidenceA.results.some(
    (item) => item.field === 'businessName' && item.verification_status === 'UNVERIFIED',
  );
  const visibleEvidenceIds = parseJsonArray(researchA.results[0]?.evidence_ids_json);
  const visibleCandidatesHaveEvidence =
    linksA.results.length === evidenceA.results.length &&
    visibleEvidenceIds.length === evidenceA.results.length;

  await createProspect(db, 'p11_b', campaign.id, now);
  const sourceRepository = new SourceRecordRepository(db);
  await sourceRepository.create({
    id: 'src_p11_home',
    prospectId: 'p11_b',
    provider: 'PLAYWRIGHT',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: 'https://example.com/',
    rawJson: sourceRaw('Conflict Salon', 'Conflict Salon phone +91 1111111111.'),
    capturedAt: now,
  });
  await sourceRepository.create({
    id: 'src_p11_contact_b',
    prospectId: 'p11_b',
    provider: 'PLAYWRIGHT',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: 'https://example.com/contact',
    rawJson: sourceRaw('Contact', 'Conflict Salon phone +91 2222222222.'),
    capturedAt: now,
  });
  const conflictRun = await startPhase11Research(
    db,
    userId,
    'p11_b',
    { model: 'qwen3:0.6b' },
    iso(10),
  );
  for (const jobId of conflictRun.jobIds) {
    const context = await new JobContextRepository(db).getByJobId(jobId);
    const payload: unknown = context ? JSON.parse(context.payloadJson) : null;
    if (!isPhase11JobPayload(payload)) throw new Error('Conflict job payload invalid.');
    const phone =
      payload.sourceRecordId === 'src_p11_home' ? '+91 1111111111' : '+91 2222222222';
    await completeRunJob(
      db,
      userId,
      jobId,
      {
        businessName: 'Conflict Salon',
        description: null,
        phone,
        email: null,
        address: null,
        openingHours: [],
        services: [],
        socialLinks: [],
      },
      iso(11 + payload.sourceRank),
    );
  }
  const [blockedRun, prospectB] = await Promise.all([
    db
      .prepare('SELECT status, conflicts_json FROM research_runs WHERE id = ?')
      .bind(conflictRun.id)
      .first<{ status: string; conflicts_json: string }>(),
    new ProspectRepository(db).getById('p11_b'),
  ]);
  const conflictPayload = parseConflictPayload(blockedRun?.conflicts_json);
  const criticalConflictStopsPipeline =
    blockedRun?.status === 'BLOCKED' &&
    prospectB?.currentState === 'RESEARCH_PENDING' &&
    conflictPayload.some((item) => item.field === 'phone' && item.critical === true);

  const scopedRerun = await startPhase11Research(
    db,
    userId,
    'p11_b',
    { model: 'qwen3:0.6b', sourceRecordIds: ['src_p11_contact'] },
    iso(29),
  );
  const scopedRerunQueuesOnlyRequestedSource =
    scopedRerun.jobIds.length === 1 &&
    scopedRerun.selectedSources.length === 1 &&
    scopedRerun.selectedSources[0]?.sourceId === 'src_p11_contact';

  const rerun = await startPhase11Research(db, userId, 'p11_a', { model: 'qwen3:0.6b' }, iso(30));
  const history = await db
    .prepare('SELECT id FROM research_runs WHERE prospect_id = ? ORDER BY created_at')
    .bind('p11_a')
    .all<{ id: string }>();
  const rerunPreservesAuditHistory = history.results.length === 2 && rerun.id !== run.id;

  const foreignKeys = await db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>();
  const migrationRows = await db
    .prepare('SELECT COUNT(*) AS count FROM d1_migrations')
    .first<{ count: number }>();

  const checks = {
    migrationApplied: Number(migrationRows?.count ?? 0) >= 8,
    sourceJobsQueued: run.jobIds.length === 1,
    sourceJobsAreSingleSource: run.selectedSources.length === 1,
    runCompleted: runRow?.status === 'COMPLETED',
    prospectAdvancedOnlyAfterCleanResearch: prospectA?.currentState === 'RESEARCHED',
    evidenceOnly,
    everyCandidateHasSource,
    noAutoVerified,
    lowConfidenceStaysUnverified,
    visibleCandidatesHaveEvidence,
    criticalConflictStopsPipeline,
    rerunPreservesAuditHistory,
    scopedRerunQueuesOnlyRequestedSource,
    aiDidNotOverwriteCanonicalFacts: factsA.results.length === 0,
    foreignKeyViolations: foreignKeys.results.length,
  };
  return c.json({
    ok: Object.values(checks).every((value) => value === true || value === 0),
    checks,
  });
});

export default app;
