import {
  JobContextRepository,
  JobRepository,
  LocalRunnerRepository,
  RunnerJobRepository,
  type D1DatabaseLike,
  type LocalRunnerRecord,
} from '@shalcon/db';
import { Hono } from 'hono';
import { z } from 'zod';

import { hashSessionToken } from './auth';
import type { Bindings } from './context';
import { persistResearchSourcesIfNeeded } from './research-persistence';

const completeSchema = z.object({ result: z.unknown() });

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

function payloadResearchUrl(payloadJson: string): string | null {
  try {
    const parsed: unknown = JSON.parse(payloadJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const url = (parsed as Record<string, unknown>).url;
    return typeof url === 'string' && url.trim() ? url : null;
  } catch {
    return null;
  }
}

async function authenticatedRunner(
  db: D1DatabaseLike,
  authorization: string | undefined,
): Promise<LocalRunnerRecord | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  return new LocalRunnerRepository(db).getActiveByTokenHash(await hashSessionToken(token));
}

export const researchRunnerRoutes = new Hono<Bindings>();

researchRunnerRoutes.post('/jobs/:jobId/complete', async (c) => {
  const db = requireDb(c.env.DB);
  const runner = await authenticatedRunner(db, c.req.header('Authorization'));
  if (!runner) {
    return c.json(
      { error: { code: 'RUNNER_UNAUTHORIZED', message: 'Valid runner token required.' } },
      401,
    );
  }

  const job = await new JobRepository(db).getById(c.req.param('jobId'));
  if (!job || job.jobType !== 'PLAYWRIGHT_RESEARCH') {
    return c.json(
      { error: { code: 'RESEARCH_JOB_NOT_FOUND', message: 'Research job not found.' } },
      404,
    );
  }
  if (job.status !== 'RUNNING' || job.leaseOwner !== runner.id) {
    return c.json(
      { error: { code: 'JOB_NOT_OWNED', message: 'Runner does not own this active research job.' } },
      409,
    );
  }

  const context = await new JobContextRepository(db).getByJobId(job.id);
  const expectedRequestedUrl = context ? payloadResearchUrl(context.payloadJson) : null;
  if (!context || context.userId !== runner.userId || !expectedRequestedUrl) {
    return c.json(
      { error: { code: 'RESEARCH_JOB_NOT_FOUND', message: 'Research job not found.' } },
      404,
    );
  }

  const input = completeSchema.safeParse(await c.req.json().catch(() => null));
  if (!input.success) {
    return c.json(
      {
        error: {
          code: 'INVALID_RESEARCH_RESULT',
          message: 'Research result failed validation or ownership checks.',
        },
      },
      422,
    );
  }

  let sources;
  try {
    sources = await persistResearchSourcesIfNeeded(
      db,
      runner.userId,
      job,
      input.data.result,
      expectedRequestedUrl,
    );
  } catch {
    return c.json(
      {
        error: {
          code: 'INVALID_RESEARCH_RESULT',
          message: 'Research result failed validation or ownership checks.',
        },
      },
      422,
    );
  }

  try {
    const completed = await new RunnerJobRepository(db).completeWithResult(
      job.id,
      runner.userId,
      runner.id,
      JSON.stringify(input.data.result),
      new Date().toISOString(),
    );
    return c.json({
      job: { id: completed.job.id, status: completed.job.status },
      sourcePersistence: sources,
      resultAccepted: true,
    });
  } catch {
    return c.json(
      { error: { code: 'JOB_NOT_OWNED', message: 'Runner does not own this active research job.' } },
      409,
    );
  }
});
