import {
  JobContextRepository,
  JobRepository,
  ProspectRepository,
  SourceRecordRepository,
  type D1DatabaseLike,
  type JobRecord,
  type SourceRecord,
} from '@shalcon/db';

import {
  canonicalResearchUrl,
  parseResearchResultForJob,
  researchPageRawJson,
  researchSourceId,
} from './research-result';

export interface ResearchPersistenceResult {
  sourceCount: number;
  sourceIds: string[];
}

export interface ResearchCompletionResult {
  job: JobRecord;
  sourcePersistence: ResearchPersistenceResult;
}

export class ResearchLeaseLostError extends Error {
  constructor() {
    super('Research completion requires an active runner lease.');
    this.name = 'ResearchLeaseLostError';
  }
}

function sourceIdentityMatches(left: SourceRecord, right: SourceRecord): boolean {
  return (
    left.id === right.id &&
    left.prospectId === right.prospectId &&
    left.provider === right.provider &&
    left.sourceType === right.sourceType &&
    left.sourceUrl === right.sourceUrl
  );
}

async function researchSourceRecords(
  job: JobRecord,
  prospectId: string,
  rawResult: unknown,
  expectedRequestedUrl?: string,
): Promise<{ records: SourceRecord[]; resultJson: string }> {
  const result = parseResearchResultForJob(
    rawResult,
    job.id,
    prospectId,
    expectedRequestedUrl,
  );

  const records: SourceRecord[] = [];
  for (const page of result.pages) {
    const sourceUrl = canonicalResearchUrl(page.finalUrl);
    if (!sourceUrl) throw new Error('Research source URL failed canonical validation.');
    records.push({
      id: await researchSourceId(job.id, prospectId, sourceUrl),
      prospectId,
      provider: 'PLAYWRIGHT',
      sourceType: 'WEBSITE_PAGE',
      sourceUrl,
      rawJson: researchPageRawJson(result, page),
      capturedAt: page.capturedAt,
    });
  }

  return { records, resultJson: JSON.stringify(rawResult) };
}

/**
 * Persist a research result and mark its job complete in one D1 batch transaction.
 *
 * Source rows are prepared and identity-checked before the batch, but every new insert and both
 * terminal job writes are gated by the same active lease predicate. D1 batch is transactional,
 * so a stale/reclaimed runner cannot leave source rows behind if it loses the terminal write.
 */
export async function completeResearchWithSources(
  db: D1DatabaseLike,
  userId: string,
  runnerId: string,
  job: JobRecord,
  rawResult: unknown,
  expectedRequestedUrl: string,
  completionAtOverride?: string,
): Promise<ResearchCompletionResult> {
  if (job.jobType !== 'PLAYWRIGHT_RESEARCH') {
    throw new Error('Research completion requires a PLAYWRIGHT_RESEARCH job.');
  }

  const prospect = await new ProspectRepository(db).getByIdForUser(job.entityId, userId);
  if (!prospect) throw new Error('Research prospect is unavailable to this operator.');

  const prepared = await researchSourceRecords(
    job,
    prospect.id,
    rawResult,
    expectedRequestedUrl,
  );
  const sourceRepository = new SourceRecordRepository(db);
  const newRecords: SourceRecord[] = [];

  for (const record of prepared.records) {
    const existing = await sourceRepository.getById(record.id);
    if (!existing) {
      newRecords.push(record);
      continue;
    }
    // Retries reuse the first immutable snapshot for the same job/prospect/provider/type/URL.
    if (!sourceIdentityMatches(existing, record)) {
      throw new Error('Source record id collision or immutable identity mismatch detected.');
    }
  }

  // Evaluate lease freshness after all result validation and source preflight work so the final
  // transaction cannot rely on a timestamp captured before potentially slow processing.
  const completionAt = completionAtOverride ?? new Date().toISOString();
  const activeLeaseSql = `
    SELECT 1
    FROM jobs j
    INNER JOIN job_contexts jc ON jc.job_id = j.id
    WHERE j.id = ?
      AND jc.user_id = ?
      AND j.status = 'RUNNING'
      AND j.lease_owner = ?
      AND j.lease_expires_at IS NOT NULL
      AND j.lease_expires_at > ?
  `;

  const statements = newRecords.map((record) =>
    db
      .prepare(`
        INSERT INTO source_records(
          id, prospect_id, provider, source_type, source_url, raw_json, captured_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (${activeLeaseSql})
      `)
      .bind(
        record.id,
        record.prospectId,
        record.provider,
        record.sourceType,
        record.sourceUrl,
        record.rawJson,
        record.capturedAt,
        job.id,
        userId,
        runnerId,
        completionAt,
      ),
  );

  statements.push(
    db
      .prepare(`
        UPDATE job_contexts
        SET result_json = ?, updated_at = ?
        WHERE job_id = ? AND user_id = ?
          AND EXISTS (${activeLeaseSql})
      `)
      .bind(
        prepared.resultJson,
        completionAt,
        job.id,
        userId,
        job.id,
        userId,
        runnerId,
        completionAt,
      ),
    db
      .prepare(`
        UPDATE jobs
        SET status = 'COMPLETED', completed_at = ?, lease_owner = NULL,
          lease_expires_at = NULL, updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND lease_owner = ?
          AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
          AND EXISTS (
            SELECT 1 FROM job_contexts
            WHERE job_id = ? AND user_id = ?
          )
      `)
      .bind(
        completionAt,
        completionAt,
        job.id,
        runnerId,
        completionAt,
        job.id,
        userId,
      ),
  );

  const writes = await db.batch(statements);
  if (writes.length !== statements.length || writes.some((write) => write.meta?.changes !== 1)) {
    throw new ResearchLeaseLostError();
  }

  const [completedJob, completedContext] = await Promise.all([
    new JobRepository(db).getById(job.id),
    new JobContextRepository(db).getByJobId(job.id),
  ]);
  if (
    !completedJob ||
    completedJob.status !== 'COMPLETED' ||
    !completedContext ||
    completedContext.userId !== userId ||
    completedContext.resultJson !== prepared.resultJson
  ) {
    throw new Error('Research completion did not persist atomically.');
  }

  for (const record of prepared.records) {
    const stored = await sourceRepository.getById(record.id);
    if (!stored || !sourceIdentityMatches(stored, record)) {
      throw new Error('Research source persistence verification failed.');
    }
  }

  return {
    job: completedJob,
    sourcePersistence: {
      sourceCount: prepared.records.length,
      sourceIds: prepared.records.map((record) => record.id),
    },
  };
}
