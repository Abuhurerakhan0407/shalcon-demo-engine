import type { D1DatabaseLike } from '../d1';
import type { JobContextRecord, JobRecord, JobStatus } from '../types';
import { JobRepository, nextFailureStatus } from './jobs';
import { JobContextRepository } from './runners';

interface JobRow {
  id: string;
  job_type: string;
  entity_id: string;
  status: JobStatus;
  priority: number;
  idempotency_key: string;
  attempts: number;
  max_attempts: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  scheduled_for: string;
  started_at: string | null;
  completed_at: string | null;
  last_error_code: string | null;
  last_error_safe_message: string | null;
  created_at: string;
  updated_at: string;
}

function mapJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    jobType: row.job_type,
    entityId: row.entity_id,
    status: row.status,
    priority: row.priority,
    idempotencyKey: row.idempotency_key,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    scheduledFor: row.scheduled_for,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    lastErrorCode: row.last_error_code,
    lastErrorSafeMessage: row.last_error_safe_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface RunnerJobClaim {
  job: JobRecord;
  context: JobContextRecord;
}

export interface RunnerJobCounts {
  pending: number;
  running: number;
  failed: number;
  deadLetter: number;
  completed: number;
}

export class RunnerJobRepository {
  private readonly jobs: JobRepository;
  private readonly contexts: JobContextRepository;

  constructor(private readonly db: D1DatabaseLike) {
    this.jobs = new JobRepository(db);
    this.contexts = new JobContextRepository(db);
  }

  async reconcileExpiredLeases(userId: string, now: string): Promise<JobRecord[]> {
    const expired = await this.db
      .prepare(`
        SELECT j.*
        FROM jobs j
        INNER JOIN job_contexts jc ON jc.job_id = j.id
        WHERE jc.user_id = ?
          AND j.status = 'RUNNING'
          AND j.lease_expires_at IS NOT NULL
          AND j.lease_expires_at <= ?
        ORDER BY j.lease_expires_at ASC
      `)
      .bind(userId, now)
      .all<JobRow>();

    const reconciled: JobRecord[] = [];
    for (const row of expired.results) {
      const attempts = row.attempts + 1;
      const status = nextFailureStatus(attempts, row.max_attempts);
      const updated = await this.db
        .prepare(`
          UPDATE jobs
          SET status = ?, attempts = ?, lease_owner = NULL, lease_expires_at = NULL,
            last_error_code = 'LEASE_EXPIRED',
            last_error_safe_message = 'Runner lease expired before completion.',
            updated_at = ?
          WHERE id = ?
            AND status = 'RUNNING'
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at <= ?
          RETURNING *
        `)
        .bind(status, attempts, now, row.id, now)
        .first<JobRow>();
      if (updated) reconciled.push(mapJob(updated));
    }
    return reconciled;
  }

  async dueForSignal(userId: string, now: string, limit = 100): Promise<JobRecord[]> {
    const result = await this.db
      .prepare(`
        SELECT j.*
        FROM jobs j
        INNER JOIN job_contexts jc ON jc.job_id = j.id
        WHERE jc.user_id = ?
          AND j.scheduled_for <= ?
          AND j.status IN ('PENDING', 'FAILED')
        ORDER BY j.priority DESC, j.scheduled_for ASC, j.created_at ASC
        LIMIT ?
      `)
      .bind(userId, now, limit)
      .all<JobRow>();
    return result.results.map(mapJob);
  }

  async claimNextForUser(
    userId: string,
    owner: string,
    leaseExpiresAt: string,
    now: string,
  ): Promise<RunnerJobClaim | null> {
    await this.reconcileExpiredLeases(userId, now);
    const candidates = await this.dueForSignal(userId, now, 5);

    for (const candidate of candidates) {
      const context = await this.contexts.getByJobId(candidate.id);
      if (!context || context.userId !== userId) continue;
      try {
        const job = await this.jobs.claim(candidate.id, owner, leaseExpiresAt, now);
        return { job, context };
      } catch {
        // Another runner may have won this lease. Try the next due candidate.
      }
    }
    return null;
  }

  async renewLease(
    jobId: string,
    owner: string,
    leaseExpiresAt: string,
    now: string,
  ): Promise<JobRecord> {
    const row = await this.db
      .prepare(`
        UPDATE jobs
        SET lease_expires_at = ?, updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND lease_owner = ?
        RETURNING *
      `)
      .bind(leaseExpiresAt, now, jobId, owner)
      .first<JobRow>();
    if (!row) throw new Error(`Job ${jobId} cannot renew lease for ${owner}.`);
    return mapJob(row);
  }

  async completeWithResult(
    jobId: string,
    userId: string,
    owner: string,
    resultJson: string,
    now: string,
  ): Promise<RunnerJobClaim> {
    const writes = await this.db.batch([
      this.db
        .prepare(`
          UPDATE job_contexts
          SET result_json = ?, updated_at = ?
          WHERE job_id = ? AND user_id = ?
            AND EXISTS (
              SELECT 1 FROM jobs
              WHERE id = ? AND status = 'RUNNING' AND lease_owner = ?
            )
        `)
        .bind(resultJson, now, jobId, userId, jobId, owner),
      this.db
        .prepare(`
          UPDATE jobs
          SET status = 'COMPLETED', completed_at = ?, lease_owner = NULL,
            lease_expires_at = NULL, updated_at = ?
          WHERE id = ? AND status = 'RUNNING' AND lease_owner = ?
            AND EXISTS (
              SELECT 1 FROM job_contexts
              WHERE job_id = ? AND user_id = ?
            )
        `)
        .bind(now, now, jobId, owner, jobId, userId),
    ]);

    if (writes.length !== 2 || writes.some((write) => write.meta?.changes !== 1)) {
      throw new Error(`Job ${jobId} is not owned by this operator and runner.`);
    }

    const [job, context] = await Promise.all([
      this.jobs.getById(jobId),
      this.contexts.getByJobId(jobId),
    ]);
    if (
      !job ||
      job.status !== 'COMPLETED' ||
      !context ||
      context.userId !== userId ||
      context.resultJson !== resultJson
    ) {
      throw new Error(`Job ${jobId} completion did not persist atomically.`);
    }
    return { job, context };
  }

  async failWithRetry(
    jobId: string,
    userId: string,
    owner: string,
    errorCode: string,
    safeMessage: string,
    retryAt: string,
    now: string,
  ): Promise<JobRecord> {
    const context = await this.contexts.getByJobId(jobId);
    if (!context || context.userId !== userId) throw new Error(`Job ${jobId} is not owned by this operator.`);
    const failed = await this.jobs.fail(jobId, owner, errorCode, safeMessage, now, retryAt);
    return failed;
  }

  async countsForUser(userId: string): Promise<RunnerJobCounts> {
    const result = await this.db
      .prepare(`
        SELECT j.status AS status, COUNT(*) AS count
        FROM jobs j
        INNER JOIN job_contexts jc ON jc.job_id = j.id
        WHERE jc.user_id = ?
        GROUP BY j.status
      `)
      .bind(userId)
      .all<{ status: JobStatus; count: number }>();
    const counts: RunnerJobCounts = { pending: 0, running: 0, failed: 0, deadLetter: 0, completed: 0 };
    for (const row of result.results) {
      if (row.status === 'PENDING') counts.pending = Number(row.count);
      if (row.status === 'RUNNING') counts.running = Number(row.count);
      if (row.status === 'FAILED') counts.failed = Number(row.count);
      if (row.status === 'DEAD_LETTER') counts.deadLetter = Number(row.count);
      if (row.status === 'COMPLETED') counts.completed = Number(row.count);
    }
    return counts;
  }

  async deadLettersForUser(userId: string, limit = 50): Promise<JobRecord[]> {
    const result = await this.db
      .prepare(`
        SELECT j.*
        FROM jobs j
        INNER JOIN job_contexts jc ON jc.job_id = j.id
        WHERE jc.user_id = ? AND j.status = 'DEAD_LETTER'
        ORDER BY j.updated_at DESC
        LIMIT ?
      `)
      .bind(userId, limit)
      .all<JobRow>();
    return result.results.map(mapJob);
  }
}
