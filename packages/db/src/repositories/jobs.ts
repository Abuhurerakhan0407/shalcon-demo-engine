import type { D1DatabaseLike } from '../d1';
import type { JobRecord, JobStatus } from '../types';

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

export function nextFailureStatus(attemptsAfterFailure: number, maxAttempts: number): JobStatus {
  return attemptsAfterFailure >= maxAttempts ? 'DEAD_LETTER' : 'FAILED';
}

export function isLeaseExpired(job: Pick<JobRecord, 'leaseExpiresAt'>, now: string): boolean {
  return job.leaseExpiresAt !== null && job.leaseExpiresAt <= now;
}

export class JobRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async createOrGet(record: JobRecord): Promise<{ job: JobRecord; created: boolean }> {
    const inserted = await this.db
      .prepare(`
        INSERT OR IGNORE INTO jobs(
          id, job_type, entity_id, status, priority, idempotency_key, attempts, max_attempts,
          lease_owner, lease_expires_at, scheduled_for, started_at, completed_at,
          last_error_code, last_error_safe_message, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `)
      .bind(
        record.id,
        record.jobType,
        record.entityId,
        record.status,
        record.priority,
        record.idempotencyKey,
        record.attempts,
        record.maxAttempts,
        record.leaseOwner,
        record.leaseExpiresAt,
        record.scheduledFor,
        record.startedAt,
        record.completedAt,
        record.lastErrorCode,
        record.lastErrorSafeMessage,
        record.createdAt,
        record.updatedAt,
      )
      .first<JobRow>();

    if (inserted) {
      return { job: mapJob(inserted), created: true };
    }

    const existing = await this.getByIdempotencyKey(record.idempotencyKey);
    if (!existing) {
      throw new Error('Job insert did not produce a readable row.');
    }
    return { job: existing, created: false };
  }

  async getById(id: string): Promise<JobRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM jobs WHERE id = ?')
      .bind(id)
      .first<JobRow>();
    return row ? mapJob(row) : null;
  }

  async getByIdempotencyKey(key: string): Promise<JobRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM jobs WHERE idempotency_key = ?')
      .bind(key)
      .first<JobRow>();
    return row ? mapJob(row) : null;
  }

  async listByStatuses(statuses: JobStatus[], limit = 50): Promise<JobRecord[]> {
    if (statuses.length === 0) return [];
    const placeholders = statuses.map(() => '?').join(', ');
    const result = await this.db
      .prepare(`SELECT * FROM jobs WHERE status IN (${placeholders}) ORDER BY priority DESC, scheduled_for, created_at LIMIT ?`)
      .bind(...statuses, limit)
      .all<JobRow>();
    return result.results.map(mapJob);
  }

  async claim(id: string, owner: string, leaseExpiresAt: string, now: string): Promise<JobRecord> {
    const claimed = await this.db
      .prepare(`
        UPDATE jobs
        SET status = 'RUNNING', lease_owner = ?, lease_expires_at = ?,
          started_at = COALESCE(started_at, ?), updated_at = ?
        WHERE id = ?
          AND scheduled_for <= ?
          AND (
            status = 'PENDING'
            OR status = 'FAILED'
            OR (status = 'RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
          )
        RETURNING *
      `)
      .bind(owner, leaseExpiresAt, now, now, id, now, now)
      .first<JobRow>();

    if (!claimed) {
      throw new Error(`Job ${id} is not claimable.`);
    }
    return mapJob(claimed);
  }

  async claimNext(owner: string, leaseExpiresAt: string, now: string): Promise<JobRecord | null> {
    const claimed = await this.db
      .prepare(`
        UPDATE jobs
        SET status = 'RUNNING', lease_owner = ?, lease_expires_at = ?,
          started_at = COALESCE(started_at, ?), updated_at = ?
        WHERE id = (
          SELECT id
          FROM jobs
          WHERE status IN ('PENDING', 'FAILED') AND scheduled_for <= ?
          ORDER BY priority DESC, scheduled_for ASC, created_at ASC
          LIMIT 1
        )
        AND status IN ('PENDING', 'FAILED')
        AND scheduled_for <= ?
        RETURNING *
      `)
      .bind(owner, leaseExpiresAt, now, now, now, now)
      .first<JobRow>();
    return claimed ? mapJob(claimed) : null;
  }

  async renewLease(id: string, owner: string, leaseExpiresAt: string, now: string): Promise<JobRecord> {
    const renewed = await this.db
      .prepare(`
        UPDATE jobs
        SET lease_expires_at = ?, updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND lease_owner = ?
          AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
        RETURNING *
      `)
      .bind(leaseExpiresAt, now, id, owner, now)
      .first<JobRow>();
    if (!renewed) throw new Error(`Job ${id} lease cannot be renewed by ${owner}.`);
    return mapJob(renewed);
  }

  async recoverExpiredLeases(now: string): Promise<JobRecord[]> {
    const expired = await this.db
      .prepare(`
        SELECT * FROM jobs
        WHERE status = 'RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
        ORDER BY lease_expires_at ASC, created_at ASC
      `)
      .bind(now)
      .all<JobRow>();

    const recovered: JobRecord[] = [];
    for (const row of expired.results) {
      const attempts = row.attempts + 1;
      const status = nextFailureStatus(attempts, row.maxAttempts);
      const updated = await this.db
        .prepare(`
          UPDATE jobs
          SET status = ?, attempts = ?, lease_owner = NULL, lease_expires_at = NULL,
            scheduled_for = CASE WHEN ? = 'FAILED' THEN ? ELSE scheduled_for END,
            last_error_code = 'RUNNER_LEASE_EXPIRED',
            last_error_safe_message = 'Runner lease expired before the job completed.',
            updated_at = ?
          WHERE id = ? AND status = 'RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
          RETURNING *
        `)
        .bind(status, attempts, status, now, now, row.id, now)
        .first<JobRow>();
      if (updated) recovered.push(mapJob(updated));
    }
    return recovered;
  }

  async complete(id: string, owner: string, now: string): Promise<JobRecord> {
    const completed = await this.db
      .prepare(`
        UPDATE jobs
        SET status = 'COMPLETED', completed_at = ?, lease_owner = NULL,
          lease_expires_at = NULL, updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND lease_owner = ?
          AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
        RETURNING *
      `)
      .bind(now, now, id, owner, now)
      .first<JobRow>();

    if (!completed) {
      throw new Error(`Job ${id} cannot be completed by ${owner}.`);
    }
    return mapJob(completed);
  }

  async fail(
    id: string,
    owner: string,
    errorCode: string,
    safeMessage: string,
    now: string,
    retryAt = now,
  ): Promise<JobRecord> {
    const current = await this.getById(id);
    if (
      !current ||
      current.status !== 'RUNNING' ||
      current.leaseOwner !== owner ||
      current.leaseExpiresAt === null ||
      current.leaseExpiresAt <= now
    ) {
      throw new Error(`Job ${id} is not owned by ${owner}.`);
    }
    const attempts = current.attempts + 1;
    const status = nextFailureStatus(attempts, current.maxAttempts);

    const failed = await this.db
      .prepare(`
        UPDATE jobs
        SET status = ?, attempts = ?, lease_owner = NULL, lease_expires_at = NULL,
          scheduled_for = CASE WHEN ? = 'FAILED' THEN ? ELSE scheduled_for END,
          last_error_code = ?, last_error_safe_message = ?, updated_at = ?
        WHERE id = ? AND status = 'RUNNING' AND lease_owner = ?
          AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
        RETURNING *
      `)
      .bind(status, attempts, status, retryAt, errorCode, safeMessage, now, id, owner, now)
      .first<JobRow>();

    if (!failed) {
      throw new Error(`Job ${id} is not owned by ${owner}.`);
    }
    return mapJob(failed);
  }
}
