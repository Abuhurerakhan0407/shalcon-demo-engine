import {
  JobContextRepository,
  JobRepository,
  LocalRunnerRepository,
  RunnerJobRepository,
  buildIdempotencyKey,
  type D1DatabaseLike,
  type JobRecord,
  type LocalRunnerRecord,
} from '@shalcon/db';
import { Hono } from 'hono';
import { z } from 'zod';

import { hashSessionToken, randomToken } from './auth';
import type { Bindings } from './context';
import { signalJob } from './job-signal';

const DEFAULT_LEASE_SECONDS = 120;
const RUNNER_STALE_SECONDS = 180;

const runnerRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(80).default('Local Runner'),
  version: z.string().trim().min(1).max(40).nullable().optional(),
  capabilities: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});

const enqueueSchema = z.object({
  jobType: z.string().trim().min(2).max(80),
  entityId: z.string().trim().min(1).max(160),
  payload: z.unknown().default({}),
  priority: z.number().int().min(-100).max(100).default(0),
  maxAttempts: z.number().int().min(1).max(10).default(3),
  scheduledFor: z.string().datetime().optional(),
  idempotencyKey: z.string().trim().min(8).max(240).optional(),
});

const heartbeatSchema = z.object({
  version: z.string().trim().min(1).max(40).nullable().optional(),
  capabilities: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
});

const completeSchema = z.object({ result: z.unknown().default({}) });
const failSchema = z.object({
  errorCode: z.string().trim().min(2).max(80),
  safeMessage: z.string().trim().min(2).max(500),
});

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token || token.length < 24) return null;
  return token;
}

async function authenticatedRunner(
  db: D1DatabaseLike,
  authorization: string | undefined,
): Promise<LocalRunnerRecord | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  return new LocalRunnerRepository(db).getActiveByTokenHash(await hashSessionToken(token));
}

function parseCapabilities(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function publicRunner(runner: LocalRunnerRecord, now = new Date()): Record<string, unknown> {
  const heartbeatMs = runner.lastHeartbeatAt ? Date.parse(runner.lastHeartbeatAt) : Number.NaN;
  const stale = !Number.isFinite(heartbeatMs) || now.getTime() - heartbeatMs > RUNNER_STALE_SECONDS * 1000;
  return {
    id: runner.id,
    name: runner.name,
    version: runner.version,
    capabilities: parseCapabilities(runner.capabilitiesJson),
    status: runner.status,
    connection: runner.status === 'ACTIVE' && !stale ? 'ONLINE' : runner.status === 'ACTIVE' ? 'STALE' : 'REVOKED',
    lastHeartbeatAt: runner.lastHeartbeatAt,
    updatedAt: runner.updatedAt,
  };
}

function jobSummary(job: JobRecord): Record<string, unknown> {
  return {
    id: job.id,
    jobType: job.jobType,
    entityId: job.entityId,
    status: job.status,
    priority: job.priority,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    leaseOwner: job.leaseOwner,
    leaseExpiresAt: job.leaseExpiresAt,
    scheduledFor: job.scheduledFor,
    completedAt: job.completedAt,
    lastErrorCode: job.lastErrorCode,
    lastErrorSafeMessage: job.lastErrorSafeMessage,
    updatedAt: job.updatedAt,
  };
}

function leaseExpiry(now: Date): string {
  return new Date(now.getTime() + DEFAULT_LEASE_SECONDS * 1000).toISOString();
}

function retryTimestamp(job: JobRecord, now: Date): string {
  const attemptAfterFailure = job.attempts + 1;
  const seconds = Math.min(900, 30 * 2 ** Math.max(0, attemptAfterFailure - 1));
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

export const runnerRoutes = new Hono<Bindings>();

runnerRoutes.post('/operator/register', async (c) => {
  const user = c.get('authUser');
  const db = requireDb(c.env.DB);
  const input = runnerRegistrationSchema.parse(await c.req.json().catch(() => ({})));
  const rawToken = `rnr_${randomToken(32)}`;
  const now = new Date().toISOString();
  const runner = await new LocalRunnerRepository(db).registerOrRotate({
    id: `runner_${randomToken(12)}`,
    userId: user.id,
    name: input.name,
    tokenHash: await hashSessionToken(rawToken),
    version: input.version ?? null,
    capabilitiesJson: JSON.stringify(input.capabilities),
    status: 'ACTIVE',
    lastHeartbeatAt: null,
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
  });
  return c.json({ runner: publicRunner(runner), token: rawToken, tokenShownOnce: true }, 201);
});

runnerRoutes.post('/operator/runners/:runnerId/revoke', async (c) => {
  const user = c.get('authUser');
  const runner = await new LocalRunnerRepository(requireDb(c.env.DB)).revoke(
    c.req.param('runnerId'),
    user.id,
    new Date().toISOString(),
  );
  return c.json({ runner: publicRunner(runner) });
});

runnerRoutes.get('/operator/status', async (c) => {
  const user = c.get('authUser');
  const db = requireDb(c.env.DB);
  const now = new Date();
  const jobs = new RunnerJobRepository(db);
  const reconciled = await jobs.reconcileExpiredLeases(user.id, now.toISOString());
  const [runners, counts, deadLetters] = await Promise.all([
    new LocalRunnerRepository(db).listForUser(user.id),
    jobs.countsForUser(user.id),
    jobs.deadLettersForUser(user.id, 20),
  ]);
  return c.json({
    runners: runners.map((runner) => publicRunner(runner, now)),
    jobs: counts,
    deadLetters: deadLetters.map(jobSummary),
    reconciledExpiredLeases: reconciled.map(jobSummary),
    staleAfterSeconds: RUNNER_STALE_SECONDS,
    d1Canonical: true,
  });
});

runnerRoutes.post('/operator/jobs', async (c) => {
  const user = c.get('authUser');
  const db = requireDb(c.env.DB);
  const input = enqueueSchema.parse(await c.req.json());
  const now = new Date().toISOString();
  const idempotencyKey = input.idempotencyKey ?? buildIdempotencyKey({
    namespace: `runner:${user.id}`,
    action: input.jobType,
    entityId: input.entityId,
    payload: input.payload,
  });
  const jobs = new JobRepository(db);
  const created = await jobs.createOrGet({
    id: `job_${randomToken(12)}`,
    jobType: input.jobType,
    entityId: input.entityId,
    status: 'PENDING',
    priority: input.priority,
    idempotencyKey,
    attempts: 0,
    maxAttempts: input.maxAttempts,
    leaseOwner: null,
    leaseExpiresAt: null,
    scheduledFor: input.scheduledFor ?? now,
    startedAt: null,
    completedAt: null,
    lastErrorCode: null,
    lastErrorSafeMessage: null,
    createdAt: now,
    updatedAt: now,
  });
  const context = await new JobContextRepository(db).createOrGet({
    jobId: created.job.id,
    userId: user.id,
    payloadJson: JSON.stringify(input.payload),
    resultJson: null,
    createdAt: now,
    updatedAt: now,
  });
  const signal = await signalJob(c.env.JOB_QUEUE, {
    jobId: created.job.id,
    userId: user.id,
    jobType: created.job.jobType,
  });
  return c.json(
    { job: jobSummary(created.job), payload: JSON.parse(context.payloadJson) as unknown, created: created.created, signal },
    created.created ? 201 : 200,
  );
});

runnerRoutes.post('/operator/reconcile', async (c) => {
  const user = c.get('authUser');
  const db = requireDb(c.env.DB);
  const now = new Date().toISOString();
  const jobs = new RunnerJobRepository(db);
  const reconciled = await jobs.reconcileExpiredLeases(user.id, now);
  const due = await jobs.dueForSignal(user.id, now, 100);
  const signals = await Promise.all(
    due.map(async (job) => ({
      jobId: job.id,
      result: await signalJob(c.env.JOB_QUEUE, {
        jobId: job.id,
        userId: user.id,
        jobType: job.jobType,
      }),
    })),
  );
  return c.json({
    reconciled: reconciled.map(jobSummary),
    count: reconciled.length,
    signals,
    signalCount: signals.length,
    d1Canonical: true,
  });
});

runnerRoutes.get('/operator/dead-letters', async (c) => {
  const user = c.get('authUser');
  const jobs = await new RunnerJobRepository(requireDb(c.env.DB)).deadLettersForUser(user.id, 100);
  return c.json({ jobs: jobs.map(jobSummary) });
});

runnerRoutes.post('/agent/heartbeat', async (c) => {
  const db = requireDb(c.env.DB);
  const runner = await authenticatedRunner(db, c.req.header('Authorization'));
  if (!runner) return c.json({ error: { code: 'RUNNER_UNAUTHORIZED', message: 'Valid runner token required.' } }, 401);
  const input = heartbeatSchema.parse(await c.req.json().catch(() => ({})));
  const currentCapabilities = parseCapabilities(runner.capabilitiesJson);
  const updated = await new LocalRunnerRepository(db).heartbeat(
    runner.id,
    input.version === undefined ? runner.version : input.version,
    JSON.stringify(input.capabilities ?? currentCapabilities),
    new Date().toISOString(),
  );
  return c.json({ runner: publicRunner(updated) });
});

runnerRoutes.post('/agent/jobs/claim', async (c) => {
  const db = requireDb(c.env.DB);
  const runner = await authenticatedRunner(db, c.req.header('Authorization'));
  if (!runner) return c.json({ error: { code: 'RUNNER_UNAUTHORIZED', message: 'Valid runner token required.' } }, 401);
  const now = new Date();
  await new LocalRunnerRepository(db).heartbeat(
    runner.id,
    runner.version,
    runner.capabilitiesJson,
    now.toISOString(),
  );
  const capabilities = parseCapabilities(runner.capabilitiesJson);
  const claim = await new RunnerJobRepository(db).claimNextForUser(
    runner.userId,
    runner.id,
    leaseExpiry(now),
    now.toISOString(),
    capabilities,
  );
  if (!claim) return c.json({ job: null, leaseSeconds: DEFAULT_LEASE_SECONDS });
  return c.json({
    job: jobSummary(claim.job),
    payload: JSON.parse(claim.context.payloadJson) as unknown,
    leaseSeconds: DEFAULT_LEASE_SECONDS,
  });
});

runnerRoutes.post('/agent/jobs/:jobId/renew', async (c) => {
  const db = requireDb(c.env.DB);
  const runner = await authenticatedRunner(db, c.req.header('Authorization'));
  if (!runner) return c.json({ error: { code: 'RUNNER_UNAUTHORIZED', message: 'Valid runner token required.' } }, 401);
  const now = new Date();
  try {
    const job = await new RunnerJobRepository(db).renewLease(
      c.req.param('jobId'),
      runner.id,
      leaseExpiry(now),
      now.toISOString(),
    );
    return c.json({ job: jobSummary(job), leaseSeconds: DEFAULT_LEASE_SECONDS });
  } catch {
    return c.json({ error: { code: 'LEASE_NOT_OWNED', message: 'Runner does not own this active lease.' } }, 409);
  }
});

runnerRoutes.post('/agent/jobs/:jobId/complete', async (c) => {
  const db = requireDb(c.env.DB);
  const runner = await authenticatedRunner(db, c.req.header('Authorization'));
  if (!runner) return c.json({ error: { code: 'RUNNER_UNAUTHORIZED', message: 'Valid runner token required.' } }, 401);
  const input = completeSchema.parse(await c.req.json().catch(() => ({})));
  try {
    const completed = await new RunnerJobRepository(db).completeWithResult(
      c.req.param('jobId'),
      runner.userId,
      runner.id,
      JSON.stringify(input.result),
      new Date().toISOString(),
    );
    return c.json({ job: jobSummary(completed.job), result: JSON.parse(completed.context.resultJson ?? '{}') as unknown });
  } catch {
    return c.json({ error: { code: 'JOB_NOT_OWNED', message: 'Runner does not own this active job.' } }, 409);
  }
});

runnerRoutes.post('/agent/jobs/:jobId/fail', async (c) => {
  const db = requireDb(c.env.DB);
  const runner = await authenticatedRunner(db, c.req.header('Authorization'));
  if (!runner) return c.json({ error: { code: 'RUNNER_UNAUTHORIZED', message: 'Valid runner token required.' } }, 401);
  const input = failSchema.parse(await c.req.json());
  const current = await new JobRepository(db).getById(c.req.param('jobId'));
  if (!current) return c.json({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found.' } }, 404);
  const retryAt = retryTimestamp(current, new Date());
  try {
    const job = await new RunnerJobRepository(db).failWithRetry(
      current.id,
      runner.userId,
      runner.id,
      input.errorCode,
      input.safeMessage,
      retryAt,
      new Date().toISOString(),
    );
    return c.json({ job: jobSummary(job), retryAt: job.status === 'FAILED' ? job.scheduledFor : null });
  } catch {
    return c.json({ error: { code: 'JOB_NOT_OWNED', message: 'Runner does not own this active job.' } }, 409);
  }
});
