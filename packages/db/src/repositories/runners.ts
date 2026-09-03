import type { D1DatabaseLike } from '../d1';
import type { JobContextRecord, LocalRunnerRecord, LocalRunnerStatus } from '../types';

interface RunnerRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  version: string | null;
  capabilities_json: string;
  status: LocalRunnerStatus;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}

interface JobContextRow {
  job_id: string;
  user_id: string;
  payload_json: string;
  result_json: string | null;
  created_at: string;
  updated_at: string;
}

function mapRunner(row: RunnerRow): LocalRunnerRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    tokenHash: row.token_hash,
    version: row.version,
    capabilitiesJson: row.capabilities_json,
    status: row.status,
    lastHeartbeatAt: row.last_heartbeat_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
  };
}

function mapJobContext(row: JobContextRow): JobContextRecord {
  return {
    jobId: row.job_id,
    userId: row.user_id,
    payloadJson: row.payload_json,
    resultJson: row.result_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class LocalRunnerRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async registerOrRotate(record: LocalRunnerRecord): Promise<LocalRunnerRecord> {
    const row = await this.db
      .prepare(`
        INSERT INTO local_runners(
          id, user_id, name, token_hash, version, capabilities_json, status,
          last_heartbeat_at, created_at, updated_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, name) DO UPDATE SET
          token_hash = excluded.token_hash,
          version = excluded.version,
          capabilities_json = excluded.capabilities_json,
          status = 'ACTIVE',
          last_heartbeat_at = NULL,
          updated_at = excluded.updated_at,
          revoked_at = NULL
        RETURNING *
      `)
      .bind(
        record.id,
        record.userId,
        record.name,
        record.tokenHash,
        record.version,
        record.capabilitiesJson,
        record.status,
        record.lastHeartbeatAt,
        record.createdAt,
        record.updatedAt,
        record.revokedAt,
      )
      .first<RunnerRow>();
    if (!row) throw new Error('Runner registration did not return a row.');
    return mapRunner(row);
  }

  async getByIdForUser(id: string, userId: string): Promise<LocalRunnerRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM local_runners WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .first<RunnerRow>();
    return row ? mapRunner(row) : null;
  }

  async getActiveByTokenHash(tokenHash: string): Promise<LocalRunnerRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM local_runners WHERE token_hash = ? AND status = 'ACTIVE' AND revoked_at IS NULL")
      .bind(tokenHash)
      .first<RunnerRow>();
    return row ? mapRunner(row) : null;
  }

  async listForUser(userId: string): Promise<LocalRunnerRecord[]> {
    const result = await this.db
      .prepare('SELECT * FROM local_runners WHERE user_id = ? ORDER BY updated_at DESC')
      .bind(userId)
      .all<RunnerRow>();
    return result.results.map(mapRunner);
  }

  async heartbeat(
    id: string,
    version: string | null,
    capabilitiesJson: string,
    now: string,
  ): Promise<LocalRunnerRecord> {
    const row = await this.db
      .prepare(`
        UPDATE local_runners
        SET last_heartbeat_at = ?, version = ?, capabilities_json = ?, updated_at = ?
        WHERE id = ? AND status = 'ACTIVE' AND revoked_at IS NULL
        RETURNING *
      `)
      .bind(now, version, capabilitiesJson, now, id)
      .first<RunnerRow>();
    if (!row) throw new Error(`Runner ${id} is not active.`);
    return mapRunner(row);
  }

  async revoke(id: string, userId: string, now: string): Promise<LocalRunnerRecord> {
    const row = await this.db
      .prepare(`
        UPDATE local_runners
        SET status = 'REVOKED', revoked_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        RETURNING *
      `)
      .bind(now, now, id, userId)
      .first<RunnerRow>();
    if (!row) throw new Error(`Runner ${id} was not found.`);
    return mapRunner(row);
  }
}

export class JobContextRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async createOrGet(record: JobContextRecord): Promise<JobContextRecord> {
    const inserted = await this.db
      .prepare(`
        INSERT OR IGNORE INTO job_contexts(
          job_id, user_id, payload_json, result_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        RETURNING *
      `)
      .bind(
        record.jobId,
        record.userId,
        record.payloadJson,
        record.resultJson,
        record.createdAt,
        record.updatedAt,
      )
      .first<JobContextRow>();
    if (inserted) return mapJobContext(inserted);

    const existing = await this.getByJobId(record.jobId);
    if (!existing) throw new Error('Job context insert did not produce a readable row.');
    if (existing.userId !== record.userId) throw new Error('Job context belongs to a different operator.');
    return existing;
  }

  async getByJobId(jobId: string): Promise<JobContextRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM job_contexts WHERE job_id = ?')
      .bind(jobId)
      .first<JobContextRow>();
    return row ? mapJobContext(row) : null;
  }

  async setResult(jobId: string, userId: string, resultJson: string, now: string): Promise<JobContextRecord> {
    const row = await this.db
      .prepare(`
        UPDATE job_contexts
        SET result_json = ?, updated_at = ?
        WHERE job_id = ? AND user_id = ?
        RETURNING *
      `)
      .bind(resultJson, now, jobId, userId)
      .first<JobContextRow>();
    if (!row) throw new Error(`Job context ${jobId} was not found.`);
    return mapJobContext(row);
  }
}
