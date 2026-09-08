import {
  JobRepository,
  LocalRunnerRepository,
  RunnerJobRepository,
  type D1DatabaseLike,
  type LocalRunnerRecord,
} from '@shalcon/db';
import { Hono } from 'hono';
import { z } from 'zod';

import { hashSessionToken } from './auth';
import { aiExtractionResultSchema } from './ai-result';
import type { Bindings } from './context';

const completionSchema = z.object({ result: aiExtractionResultSchema }).strict();

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

export const aiRunnerRoutes = new Hono<Bindings>();

aiRunnerRoutes.post('/jobs/:jobId/complete', async (c) => {
  const db = requireDb(c.env.DB);
  const runner = await authenticatedRunner(db, c.req.header('Authorization'));
  if (!runner) {
    return c.json(
      { error: { code: 'RUNNER_UNAUTHORIZED', message: 'Valid runner token required.' } },
      401,
    );
  }

  const parsed = completionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { error: { code: 'AI_RESULT_INVALID', message: 'AI extraction result failed validation.' } },
      422,
    );
  }

  const job = await new JobRepository(db).getById(c.req.param('jobId'));
  if (!job) {
    return c.json({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found.' } }, 404);
  }
  if (job.jobType !== 'LOCAL_AI_EXTRACT') {
    return c.json(
      { error: { code: 'JOB_TYPE_MISMATCH', message: 'Job does not accept AI extraction results.' } },
      409,
    );
  }

  try {
    const completed = await new RunnerJobRepository(db).completeWithResult(
      job.id,
      runner.userId,
      runner.id,
      JSON.stringify(parsed.data.result),
      new Date().toISOString(),
    );
    return c.json({
      job: {
        id: completed.job.id,
        jobType: completed.job.jobType,
        entityId: completed.job.entityId,
        status: completed.job.status,
        completedAt: completed.job.completedAt,
      },
      result: JSON.parse(completed.context.resultJson ?? '{}') as unknown,
      verifiedFactPromotion: false,
    });
  } catch {
    return c.json(
      { error: { code: 'JOB_NOT_OWNED', message: 'Runner does not own this active job.' } },
      409,
    );
  }
});
