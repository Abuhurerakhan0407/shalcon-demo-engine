import type { D1DatabaseLike } from '../d1';
import type { JobContextRecord } from '../types';

interface JobContextRow {
  job_id: string;
  user_id: string;
  payload_json: string;
  result_json: string | null;
  created_at: string;
  updated_at: string;
}

function mapContext(row: JobContextRow): JobContextRecord {
  return {
    jobId: row.job_id,
    userId: row.user_id,
    payloadJson: row.payload_json,
    resultJson: row.result_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class JobContextRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: JobContextRecord): Promise<JobContextRecord> {
    const row = await this.db
      .prepare(`
        INSERT INTO job_contexts(job_id, user_id, payload_json, result_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
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
    if (!row) throw new Error('Job context insert did not return a row.');
    return mapContext(row);
  }

  async getForJob(jobId: string): Promise<JobContextRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM job_contexts WHERE job_id = ?')
      .bind(jobId)
      .first<JobContextRow>();
    return row ? mapContext(row) : null;
  }

  async getForJobAndUser(jobId: string, userId: string): Promise<JobContextRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM job_contexts WHERE job_id = ? AND user_id = ?')
      .bind(jobId, userId)
      .first<JobContextRow>();
    return row ? mapContext(row) : null;
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
    if (!row) throw new Error(`Job context ${jobId} was not found for this operator.`);
    return mapContext(row);
  }
}
