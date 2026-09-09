import {
  JobContextRepository,
  type D1DatabaseLike,
  type JobRecord,
} from '@shalcon/db';

import { isPhase11JobPayload } from './research-agent';

export async function failPhase11RunForTerminalJob(
  db: D1DatabaseLike,
  userId: string,
  job: JobRecord,
  now = new Date().toISOString(),
): Promise<boolean> {
  if (!['DEAD_LETTER', 'CANCELLED'].includes(job.status)) return false;
  const context = await new JobContextRepository(db).getByJobId(job.id);
  if (!context || context.userId !== userId) return false;

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(context.payloadJson) as unknown;
  } catch {
    return false;
  }
  if (!isPhase11JobPayload(rawPayload)) return false;

  const mapping = await db
    .prepare(`
      SELECT mapping.run_id, run.prospect_id, run.status
      FROM research_run_jobs mapping
      JOIN research_runs run ON run.id = mapping.run_id
      WHERE mapping.job_id = ? AND mapping.run_id = ? AND run.user_id = ?
    `)
    .bind(job.id, rawPayload.researchRunId, userId)
    .first<{ run_id: string; prospect_id: string; status: string }>();
  if (!mapping) return false;
  if (['COMPLETED', 'BLOCKED', 'FAILED'].includes(mapping.status)) return true;

  const writes = await db.batch([
    db
      .prepare(`
        UPDATE research_run_jobs
        SET status = 'FAILED', updated_at = ?
        WHERE run_id = ? AND status = 'PENDING'
      `)
      .bind(now, mapping.run_id),
    db
      .prepare(`
        UPDATE jobs
        SET status = 'CANCELLED', completed_at = ?, lease_owner = NULL,
          lease_expires_at = NULL, updated_at = ?
        WHERE id IN (
          SELECT job_id FROM research_run_jobs WHERE run_id = ? AND job_id <> ?
        ) AND status IN ('PENDING', 'FAILED')
      `)
      .bind(now, now, mapping.run_id, job.id),
    db
      .prepare(`
        UPDATE research_runs
        SET status = 'FAILED', completed_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND status IN ('QUEUED', 'RUNNING')
      `)
      .bind(now, now, mapping.run_id, userId),
  ]);
  if (writes.length !== 3) throw new Error('Phase 11 terminal failure reconciliation was incomplete.');
  return true;
}

export async function reconcilePhase11TerminalJobs(
  db: D1DatabaseLike,
  userId: string,
  jobs: readonly JobRecord[],
  now = new Date().toISOString(),
): Promise<number> {
  let reconciled = 0;
  for (const job of jobs) {
    if (await failPhase11RunForTerminalJob(db, userId, job, now)) reconciled += 1;
  }
  return reconciled;
}
