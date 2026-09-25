import {
  EvidenceRepository,
  ProspectFactRepository,
  ProspectRepository,
  type D1DatabaseLike,
  type EvidenceRecord,
  type ProspectFactRecord,
  type ProspectRecord,
} from '@shalcon/db';

export type EvidenceReviewDecision = 'VERIFY' | 'REJECT';

export interface EvidenceReviewInput {
  decision: EvidenceReviewDecision;
  promoteToFact?: boolean | undefined;
  note?: string | undefined;
}

export interface EvidenceVerificationEvent {
  id: string;
  prospectId: string;
  evidenceId: string;
  userId: string;
  decision: EvidenceReviewDecision;
  fromStatus: 'PROBABLE' | 'UNVERIFIED';
  toStatus: 'VERIFIED' | 'REJECTED';
  promotedToFact: boolean;
  note: string | null;
  createdAt: string;
}

interface EventRow {
  id: string;
  prospect_id: string;
  evidence_id: string;
  user_id: string;
  decision: EvidenceReviewDecision;
  from_status: 'PROBABLE' | 'UNVERIFIED';
  to_status: 'VERIFIED' | 'REJECTED';
  promoted_to_fact: number;
  note: string | null;
  created_at: string;
}

const REVIEWABLE_STATUSES = new Set(['PROBABLE', 'UNVERIFIED']);
const MULTI_VALUE_FIELDS = new Set(['service', 'services', 'openinghours', 'sociallink', 'sociallinks']);
const CRITICAL_SCALAR_FIELDS = new Set(['businessname', 'phone', 'address']);

function normalizedField(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/gu, '');
}

function eventId(): string {
  return `evr_${crypto.randomUUID().replaceAll('-', '')}`;
}

function factId(): string {
  return `fact_${crypto.randomUUID().replaceAll('-', '')}`;
}

function mapEvent(row: EventRow): EvidenceVerificationEvent {
  return {
    id: row.id,
    prospectId: row.prospect_id,
    evidenceId: row.evidence_id,
    userId: row.user_id,
    decision: row.decision,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    promotedToFact: row.promoted_to_fact === 1,
    note: row.note,
    createdAt: row.created_at,
  };
}

export class EvidenceReviewError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = 'EvidenceReviewError';
  }
}

async function activeCriticalConflict(
  db: D1DatabaseLike,
  candidate: EvidenceRecord,
): Promise<boolean> {
  if (!CRITICAL_SCALAR_FIELDS.has(normalizedField(candidate.field))) return false;
  const row = await db
    .prepare(`
      SELECT id
      FROM evidence
      WHERE prospect_id = ?
        AND field = ?
        AND id <> ?
        AND verification_status IN ('VERIFIED', 'PROBABLE', 'CONFLICTED', 'UNVERIFIED')
        AND LOWER(TRIM(value)) <> LOWER(TRIM(?))
      LIMIT 1
    `)
    .bind(candidate.prospectId, candidate.field, candidate.id, candidate.value)
    .first<{ id: string }>();
  return row !== null;
}

function normalizedValue(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-IN');
}

async function shouldUnblockBlockedResearch(
  db: D1DatabaseLike,
  evidenceRepository: EvidenceRepository,
  userId: string,
  prospect: ProspectRecord,
  candidate: EvidenceRecord,
  toStatus: 'VERIFIED' | 'REJECTED',
): Promise<boolean> {
  if (prospect.currentState !== 'RESEARCH_PENDING') return false;

  const latestRun = await db
    .prepare(`
      SELECT status
      FROM research_runs
      WHERE prospect_id = ? AND user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `)
    .bind(prospect.id, userId)
    .first<{ status: string }>();
  if (latestRun?.status !== 'BLOCKED') return false;

  const activeValues = new Map<string, Set<string>>();
  for (const item of await evidenceRepository.listForProspect(prospect.id)) {
    const status = item.id === candidate.id ? toStatus : item.verificationStatus;
    if (status === 'REJECTED') continue;
    const field = normalizedField(item.field);
    if (!CRITICAL_SCALAR_FIELDS.has(field)) continue;
    const values = activeValues.get(field) ?? new Set<string>();
    values.add(normalizedValue(item.value));
    activeValues.set(field, values);
  }
  return [...activeValues.values()].every((values) => values.size <= 1);
}

export async function listEvidenceVerificationEvents(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
): Promise<EvidenceVerificationEvent[]> {
  const prospect = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  if (!prospect) throw new EvidenceReviewError('NOT_FOUND', 'Prospect not found.', 404);
  const rows = await db
    .prepare(`
      SELECT event.*
      FROM evidence_verification_events event
      WHERE event.prospect_id = ? AND event.user_id = ?
      ORDER BY event.created_at DESC, event.id DESC
    `)
    .bind(prospectId, userId)
    .all<EventRow>();
  return rows.results.map(mapEvent);
}

export async function reviewEvidenceCandidate(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
  evidenceId: string,
  input: EvidenceReviewInput,
  now = new Date().toISOString(),
): Promise<{
  evidence: EvidenceRecord;
  fact: ProspectFactRecord | null;
  event: EvidenceVerificationEvent;
}> {
  const prospect = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  if (!prospect) throw new EvidenceReviewError('NOT_FOUND', 'Prospect not found.', 404);
  if (prospect.currentState === 'DUPLICATE') {
    throw new EvidenceReviewError(
      'DUPLICATE_PROSPECT',
      'Evidence review belongs on the canonical prospect.',
    );
  }

  const evidenceRepository = new EvidenceRepository(db);
  const candidate = await evidenceRepository.getById(evidenceId);
  if (!candidate || candidate.prospectId !== prospect.id) {
    throw new EvidenceReviewError('NOT_FOUND', 'Evidence candidate not found.', 404);
  }
  if (!REVIEWABLE_STATUSES.has(candidate.verificationStatus)) {
    throw new EvidenceReviewError(
      'EVIDENCE_ALREADY_REVIEWED',
      `Evidence candidate is already ${candidate.verificationStatus}.`,
    );
  }

  const promoteToFact = input.decision === 'VERIFY' && input.promoteToFact === true;
  if (input.decision === 'REJECT' && input.promoteToFact === true) {
    throw new EvidenceReviewError(
      'REJECTED_FACT_PROMOTION_BLOCKED',
      'Rejected evidence cannot be promoted to a canonical fact.',
      400,
    );
  }
  if (promoteToFact && MULTI_VALUE_FIELDS.has(normalizedField(candidate.field))) {
    throw new EvidenceReviewError(
      'MULTI_VALUE_FACT_PROMOTION_BLOCKED',
      'Multi-value evidence can be verified, but it cannot replace the one-value canonical fact slot.',
    );
  }
  if (input.decision === 'VERIFY' && (await activeCriticalConflict(db, candidate))) {
    throw new EvidenceReviewError(
      'CRITICAL_EVIDENCE_CONFLICT',
      'Conflicting critical evidence must be rejected or resolved before this candidate can be verified.',
    );
  }

  const fromStatus = candidate.verificationStatus as 'PROBABLE' | 'UNVERIFIED';
  const toStatus = input.decision === 'VERIFY' ? 'VERIFIED' : 'REJECTED';
  const shouldUnblockResearch = await shouldUnblockBlockedResearch(
    db,
    evidenceRepository,
    userId,
    prospect,
    candidate,
    toStatus,
  );
  const id = eventId();
  const note = input.note?.trim() || null;
  const statements = [
    db
      .prepare(`
        UPDATE evidence
        SET verification_status = ?
        WHERE id = ? AND prospect_id = ? AND verification_status = ?
      `)
      .bind(toStatus, candidate.id, prospect.id, fromStatus),
    db
      .prepare(`
        INSERT INTO evidence_verification_events(
          id, prospect_id, evidence_id, user_id, decision, from_status, to_status,
          promoted_to_fact, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        prospect.id,
        candidate.id,
        userId,
        input.decision,
        fromStatus,
        toStatus,
        promoteToFact ? 1 : 0,
        note,
        now,
      ),
  ];

  const newFactId = factId();
  if (promoteToFact) {
    statements.push(
      db
        .prepare(`
          INSERT INTO prospect_facts(
            id, prospect_id, field, value, verification_status, confidence,
            evidence_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'VERIFIED', ?, ?, ?, ?)
          ON CONFLICT(prospect_id, field) DO UPDATE SET
            value = excluded.value,
            verification_status = 'VERIFIED',
            confidence = excluded.confidence,
            evidence_id = excluded.evidence_id,
            updated_at = excluded.updated_at
        `)
        .bind(
          newFactId,
          prospect.id,
          candidate.field,
          candidate.value,
          candidate.confidence,
          candidate.id,
          now,
          now,
        ),
    );
  }

  if (shouldUnblockResearch) {
    statements.push(
      db
        .prepare(`
          UPDATE prospects
          SET current_state = 'RESEARCHED', updated_at = ?
          WHERE id = ? AND current_state = 'RESEARCH_PENDING'
        `)
        .bind(now, prospect.id),
    );
  }

  let writes;
  try {
    writes = await db.batch(statements);
  } catch {
    throw new EvidenceReviewError(
      'EVIDENCE_REVIEW_CONFLICT',
      'Evidence review changed concurrently and was not applied.',
    );
  }
  if (Number(writes[0]?.meta?.changes ?? 0) !== 1 || Number(writes[1]?.meta?.changes ?? 0) !== 1) {
    throw new EvidenceReviewError(
      'EVIDENCE_REVIEW_CONFLICT',
      'Evidence review changed concurrently and was not applied.',
    );
  }
  if (promoteToFact && Number(writes[2]?.meta?.changes ?? 0) < 1) {
    throw new EvidenceReviewError(
      'FACT_PROMOTION_FAILED',
      'Verified evidence was not promoted to the canonical fact slot.',
    );
  }

  const [updatedEvidence, eventRow, facts] = await Promise.all([
    evidenceRepository.getById(candidate.id),
    db
      .prepare('SELECT * FROM evidence_verification_events WHERE id = ?')
      .bind(id)
      .first<EventRow>(),
    promoteToFact
      ? new ProspectFactRepository(db).listForProspect(prospect.id)
      : Promise.resolve([] as ProspectFactRecord[]),
  ]);
  if (!updatedEvidence || !eventRow || updatedEvidence.verificationStatus !== toStatus) {
    throw new EvidenceReviewError(
      'EVIDENCE_REVIEW_PERSISTENCE_FAILED',
      'Evidence review could not be reloaded after persistence.',
    );
  }
  const fact = promoteToFact
    ? facts.find((item) => item.field === candidate.field && item.evidenceId === candidate.id) ?? null
    : null;
  if (promoteToFact && !fact) {
    throw new EvidenceReviewError(
      'FACT_PROMOTION_FAILED',
      'Verified evidence fact could not be reloaded.',
    );
  }
  return { evidence: updatedEvidence, fact, event: mapEvent(eventRow) };
}
