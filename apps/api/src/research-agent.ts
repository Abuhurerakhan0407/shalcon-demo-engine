import {
  detectResearchConflicts,
  extractionToEvidenceCandidates,
  hasCriticalResearchConflict,
  prioritizeResearchSources,
  type PrioritizedResearchSource,
  type ResearchPageRole,
  type ResearchSourceInput,
} from '@shalcon/agents';
import {
  JobContextRepository,
  JobRepository,
  ProspectRepository,
  SourceRecordRepository,
  type D1DatabaseLike,
  type JobRecord,
  type SourceRecord,
} from '@shalcon/db';

import type { AiExtractionResult } from './ai-result';

export interface Phase11ResearchRun {
  id: string;
  prospectId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'BLOCKED' | 'FAILED';
  jobIds: string[];
  selectedSources: Array<{ sourceId: string; url: string; role: ResearchPageRole; rank: number }>;
}

export interface Phase11JobPayload {
  sourceText: string;
  sources: Array<{ sourceId: string; url: string }>;
  model?: string;
  useScrapeGraph?: boolean;
  researchRunId: string;
  sourceRecordId: string;
  sourceRole: ResearchPageRole;
  sourceRank: number;
  phase: 11;
}

export function isPhase11JobPayload(value: unknown): value is Phase11JobPayload {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Phase11JobPayload>;
  return (
    item.phase === 11 &&
    typeof item.researchRunId === 'string' &&
    item.researchRunId.length > 0 &&
    typeof item.sourceRecordId === 'string' &&
    item.sourceRecordId.length > 0 &&
    typeof item.sourceRole === 'string' &&
    typeof item.sourceRank === 'number' &&
    item.sourceRank >= 1 &&
    item.sourceRank <= 6 &&
    typeof item.sourceText === 'string' &&
    item.sourceText.length > 0 &&
    Array.isArray(item.sources) &&
    item.sources.length === 1 &&
    item.sources[0]?.sourceId === item.sourceRecordId
  );
}

function token(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/gu, '')}`;
}

function parsePlaywrightSource(source: SourceRecord): ResearchSourceInput | null {
  if (source.provider !== 'PLAYWRIGHT' || source.sourceType !== 'WEBSITE_PAGE') return null;
  try {
    const parsed = JSON.parse(source.rawJson) as { page?: { title?: unknown; text?: unknown } };
    const title = typeof parsed.page?.title === 'string' ? parsed.page.title.slice(0, 500) : '';
    const text = typeof parsed.page?.text === 'string' ? parsed.page.text.trim().slice(0, 40_000) : '';
    if (!text) return null;
    return {
      sourceId: source.id,
      url: source.sourceUrl,
      title,
      text,
      provider: source.provider,
      sourceType: source.sourceType,
    };
  } catch {
    return null;
  }
}

async function transitionIntoResearchPending(
  db: D1DatabaseLike,
  prospectId: string,
  currentState: string,
  now: string,
): Promise<void> {
  const prospects = new ProspectRepository(db);
  if (currentState === 'IDENTITY_VERIFIED') {
    await prospects.transition(prospectId, 'RESEARCH_PENDING', now);
    return;
  }
  if (currentState === 'RESEARCHED') {
    await prospects.transition(prospectId, 'RESEARCH_MORE', now);
    await prospects.transition(prospectId, 'RESEARCH_PENDING', now);
    return;
  }
  if (currentState === 'RESEARCH_MORE') {
    await prospects.transition(prospectId, 'RESEARCH_PENDING', now);
    return;
  }
  if (currentState !== 'RESEARCH_PENDING') {
    throw new Error(`Prospect state ${currentState} cannot start automated research.`);
  }
}

function selectedSourceSummary(source: PrioritizedResearchSource) {
  return { sourceId: source.sourceId, url: source.url, role: source.role, rank: source.rank };
}

export async function startPhase11Research(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
  options: { model?: string; useScrapeGraph?: boolean } = {},
  now = new Date().toISOString(),
): Promise<Phase11ResearchRun> {
  const prospect = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  if (prospect.currentState === 'DUPLICATE') throw new Error('Research belongs on the canonical prospect.');

  const sources = await new SourceRecordRepository(db).listForProspect(prospect.id);
  const prioritized = prioritizeResearchSources(
    sources.map(parsePlaywrightSource).filter((item): item is ResearchSourceInput => item !== null),
    6,
  );
  if (prioritized.length === 0) {
    throw new Error('Automated research requires at least one captured Playwright website source.');
  }

  await transitionIntoResearchPending(db, prospect.id, prospect.currentState, now);

  const runId = token('research');
  const selectedSources = prioritized.map(selectedSourceSummary);
  const jobIds: string[] = [];
  const statements = [
    db
      .prepare(`
        INSERT INTO research_runs(
          id, prospect_id, user_id, status, selected_sources_json, conflicts_json,
          model, started_at, completed_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'QUEUED', ?, '[]', ?, ?, NULL, ?, ?)
      `)
      .bind(runId, prospect.id, userId, JSON.stringify(selectedSources), options.model ?? null, now, now, now),
  ];

  for (const source of prioritized) {
    const jobId = token('job');
    jobIds.push(jobId);
    const payload: Phase11JobPayload = {
      sourceText: source.text,
      sources: [{ sourceId: source.sourceId, url: source.url }],
      ...(options.model ? { model: options.model } : {}),
      ...(options.useScrapeGraph === true ? { useScrapeGraph: true } : {}),
      researchRunId: runId,
      sourceRecordId: source.sourceId,
      sourceRole: source.role,
      sourceRank: source.rank,
      phase: 11,
    };
    const idempotencyKey = `phase11:${runId}:${source.sourceId}`;
    statements.push(
      db
        .prepare(`
          INSERT INTO jobs(
            id, job_type, entity_id, status, priority, idempotency_key, attempts, max_attempts,
            lease_owner, lease_expires_at, scheduled_for, started_at, completed_at,
            last_error_code, last_error_safe_message, created_at, updated_at
          ) VALUES (?, 'LOCAL_AI_EXTRACT', ?, 'PENDING', ?, ?, 0, 3, NULL, NULL, ?, NULL, NULL, NULL, NULL, ?, ?)
        `)
        .bind(jobId, prospect.id, 100 - source.rank, idempotencyKey, now, now, now),
      db
        .prepare(`
          INSERT INTO job_contexts(job_id, user_id, payload_json, result_json, created_at, updated_at)
          VALUES (?, ?, ?, NULL, ?, ?)
        `)
        .bind(jobId, userId, JSON.stringify(payload), now, now),
      db
        .prepare(`
          INSERT INTO research_run_jobs(
            run_id, job_id, source_record_id, source_role, source_rank, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `)
        .bind(runId, jobId, source.sourceId, source.role, source.rank, now, now),
    );
  }

  const writes = await db.batch(statements);
  if (writes.length !== statements.length || writes.some((write) => write.meta?.changes !== 1)) {
    throw new Error('Automated research queueing did not persist atomically.');
  }

  await db.prepare("UPDATE research_runs SET status = 'RUNNING', updated_at = ? WHERE id = ?").bind(now, runId).run();
  return { id: runId, prospectId: prospect.id, status: 'RUNNING', jobIds, selectedSources };
}

function exactExcerpt(sourceText: string, value: string): string | null {
  const needle = value.trim();
  if (!needle) return null;
  const index = sourceText.toLocaleLowerCase('en-US').indexOf(needle.toLocaleLowerCase('en-US'));
  if (index < 0) return null;
  const start = Math.max(0, index - 120);
  const end = Math.min(sourceText.length, index + needle.length + 120);
  return sourceText.slice(start, end).trim().slice(0, 500);
}

async function deterministicEvidenceId(jobId: string, field: string, value: string): Promise<string> {
  const bytes = new TextEncoder().encode(`phase11:${jobId}:${field}:${value}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `ev_ai_${hex.slice(0, 32)}`;
}

async function finalizeRunIfReady(
  db: D1DatabaseLike,
  runId: string,
  prospectId: string,
  now: string,
): Promise<void> {
  const counts = await db
    .prepare(`
      SELECT
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed
      FROM research_run_jobs WHERE run_id = ?
    `)
    .bind(runId)
    .first<{ pending: number | null; failed: number | null }>();
  if (!counts || Number(counts.pending ?? 0) > 0) return;
  if (Number(counts.failed ?? 0) > 0) {
    await db
      .prepare("UPDATE research_runs SET status = 'FAILED', completed_at = ?, updated_at = ? WHERE id = ?")
      .bind(now, now, runId)
      .run();
    return;
  }

  const result = await db
    .prepare(`
      SELECT e.field, e.value, e.id
      FROM research_run_evidence link
      JOIN evidence e ON e.id = link.evidence_id
      WHERE link.run_id = ?
      ORDER BY e.field, e.value, e.id
    `)
    .bind(runId)
    .all<{ field: string; value: string; id: string }>();
  const conflicts = detectResearchConflicts(result.results);
  const blocked = hasCriticalResearchConflict(conflicts);
  const evidenceIds = result.results.map((item) => item.id);
  const values = (field: string) =>
    [...new Set(result.results.filter((item) => item.field === field).map((item) => item.value))];

  await db.batch([
    db
      .prepare(`
        UPDATE research_runs
        SET status = ?, conflicts_json = ?, completed_at = ?, updated_at = ?
        WHERE id = ? AND prospect_id = ?
      `)
      .bind(blocked ? 'BLOCKED' : 'COMPLETED', JSON.stringify(conflicts), now, now, runId, prospectId),
    db
      .prepare(`
        INSERT OR IGNORE INTO research(
          id, prospect_id, summary, category, services_json, business_model,
          contacts_json, socials_json, booking_json, evidence_ids_json, raw_json,
          model, prompt_version, created_at
        )
        SELECT ?, prospect_id, ?, 'SALON_SPA', ?, NULL, ?, ?, '{}', ?, ?, model, 'phase11-research-v1', ?
        FROM research_runs WHERE id = ? AND prospect_id = ?
      `)
      .bind(
        `research_${runId}`,
        values('description')[0] ?? 'Evidence-backed automated website research.',
        JSON.stringify(values('service')),
        JSON.stringify([...values('phone'), ...values('email'), ...values('address'), ...values('openingHours')]),
        JSON.stringify(values('socialLink')),
        JSON.stringify(evidenceIds),
        JSON.stringify({ runId, conflicts, blocked, evidenceOnly: true, verifiedFactPromotion: false }),
        now,
        runId,
        prospectId,
      ),
  ]);

  if (!blocked) {
    const prospect = await new ProspectRepository(db).getById(prospectId);
    if (prospect?.currentState === 'RESEARCH_PENDING') {
      await new ProspectRepository(db).transition(prospectId, 'RESEARCHED', now);
    }
  }
}

export async function completePhase11ResearchExtraction(
  db: D1DatabaseLike,
  userId: string,
  runnerId: string,
  job: JobRecord,
  payload: Phase11JobPayload,
  result: AiExtractionResult,
  now = new Date().toISOString(),
): Promise<void> {
  if (job.jobType !== 'LOCAL_AI_EXTRACT' || job.entityId.length === 0) {
    throw new Error('Phase 11 completion requires a LOCAL_AI_EXTRACT job.');
  }
  if (
    result.provenance.length !== 1 ||
    result.provenance[0]?.sourceId !== payload.sourceRecordId ||
    result.provenance[0]?.url !== payload.sources[0]?.url
  ) {
    throw new Error('Phase 11 extraction provenance does not match its source job.');
  }

  const source = await new SourceRecordRepository(db).getById(payload.sourceRecordId);
  if (!source || source.prospectId !== job.entityId) throw new Error('Phase 11 source does not match the job prospect.');

  const mapping = await db
    .prepare(`
      SELECT run.user_id, mapping.status
      FROM research_run_jobs mapping
      JOIN research_runs run ON run.id = mapping.run_id
      WHERE mapping.run_id = ? AND mapping.job_id = ? AND mapping.source_record_id = ?
        AND run.prospect_id = ?
    `)
    .bind(payload.researchRunId, job.id, payload.sourceRecordId, job.entityId)
    .first<{ user_id: string; status: string }>();
  if (!mapping || mapping.user_id !== userId || mapping.status !== 'PENDING') {
    throw new Error('Phase 11 research mapping is unavailable to this runner.');
  }

  const candidates = extractionToEvidenceCandidates(result.extracted, payload.sourceRole);
  const unique = new Map(candidates.map((item) => [`${item.field}\u0000${item.value}`, item]));
  const activeLeaseSql = `
    SELECT 1 FROM jobs j
    JOIN job_contexts jc ON jc.job_id = j.id
    WHERE j.id = ? AND jc.user_id = ? AND j.status = 'RUNNING'
      AND j.lease_owner = ? AND j.lease_expires_at IS NOT NULL AND j.lease_expires_at > ?
  `;
  const statements = [];
  for (const item of unique.values()) {
    const evidenceId = await deterministicEvidenceId(job.id, item.field, item.value);
    statements.push(
      db
        .prepare(`
          INSERT INTO evidence(
            id, prospect_id, field, value, source_record_id, source_url,
            source_quality, confidence, verification_status, excerpt, captured_at
          )
          SELECT ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?
          WHERE EXISTS (${activeLeaseSql})
        `)
        .bind(
          evidenceId,
          job.entityId,
          item.field,
          item.value,
          source.id,
          source.sourceUrl,
          item.confidence,
          item.verificationStatus,
          exactExcerpt(payload.sourceText, item.value),
          now,
          job.id,
          userId,
          runnerId,
          now,
        ),
      db
        .prepare(`
          INSERT INTO research_run_evidence(run_id, evidence_id, source_record_id, created_at)
          SELECT ?, ?, ?, ? WHERE EXISTS (${activeLeaseSql})
        `)
        .bind(payload.researchRunId, evidenceId, source.id, now, job.id, userId, runnerId, now),
    );
  }
  statements.push(
    db
      .prepare(`
        UPDATE research_run_jobs SET status = 'COMPLETED', updated_at = ?
        WHERE run_id = ? AND job_id = ? AND status = 'PENDING' AND EXISTS (${activeLeaseSql})
      `)
      .bind(now, payload.researchRunId, job.id, job.id, userId, runnerId, now),
    db
      .prepare(`
        UPDATE job_contexts SET result_json = ?, updated_at = ?
        WHERE job_id = ? AND user_id = ? AND EXISTS (${activeLeaseSql})
      `)
      .bind(JSON.stringify(result), now, job.id, userId, job.id, userId, runnerId, now),
    db
      .prepare(`
        UPDATE jobs
        SET status = 'COMPLETED', completed_at = ?, lease_owner = NULL,
          lease_expires_at = NULL, updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND lease_owner = ?
          AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
          AND EXISTS (SELECT 1 FROM job_contexts WHERE job_id = ? AND user_id = ?)
      `)
      .bind(now, now, job.id, runnerId, now, job.id, userId),
  );

  const writes = await db.batch(statements);
  if (writes.length !== statements.length || writes.some((write) => write.meta?.changes !== 1)) {
    throw new Error('Phase 11 extraction lost its active lease or failed atomic persistence.');
  }
  await finalizeRunIfReady(db, payload.researchRunId, job.entityId, now);
}

export async function getPhase11ResearchHistory(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
): Promise<unknown[]> {
  const prospect = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  const runs = await db
    .prepare(`
      SELECT id, prospect_id, status, selected_sources_json, conflicts_json, model,
        started_at, completed_at, created_at, updated_at
      FROM research_runs WHERE prospect_id = ? AND user_id = ?
      ORDER BY created_at DESC, id DESC LIMIT 50
    `)
    .bind(prospectId, userId)
    .all<Record<string, unknown>>();
  return runs.results;
}
