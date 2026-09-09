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
import { aiExtractionResultSchema } from './ai-result';
import type { Bindings } from './context';
import { completePhase11ResearchExtraction, isPhase11JobPayload } from './research-agent';

const completionSchema = z.object({ result: aiExtractionResultSchema }).strict();
const sourceSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(160),
    url: z.string().trim().min(1).max(2048),
  })
  .strict();
const jobPayloadSchema = z
  .object({
    sourceText: z.string().min(1).max(40_000),
    sources: z.array(sourceSchema).min(1).max(6),
    model: z.string().trim().min(1).max(120).optional(),
    useScrapeGraph: z.boolean().optional(),
  })
  .passthrough();

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

function sameSources(
  expected: Array<{ sourceId: string; url: string }>,
  actual: Array<{ sourceId: string; url: string }>,
): boolean {
  if (expected.length !== actual.length) return false;
  return expected.every(
    (source, index) =>
      source.sourceId === actual[index]?.sourceId && source.url === actual[index]?.url,
  );
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

  const [job, context] = await Promise.all([
    new JobRepository(db).getById(c.req.param('jobId')),
    new JobContextRepository(db).getByJobId(c.req.param('jobId')),
  ]);
  if (!job || !context) {
    return c.json({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found.' } }, 404);
  }
  if (context.userId !== runner.userId) {
    return c.json(
      { error: { code: 'JOB_NOT_OWNED', message: 'Runner does not own this operator job.' } },
      409,
    );
  }
  if (job.jobType !== 'LOCAL_AI_EXTRACT') {
    return c.json(
      { error: { code: 'JOB_TYPE_MISMATCH', message: 'Job does not accept AI extraction results.' } },
      409,
    );
  }

  let claimedPayload: unknown;
  try {
    claimedPayload = JSON.parse(context.payloadJson) as unknown;
  } catch {
    return c.json(
      { error: { code: 'AI_CONTEXT_INVALID', message: 'Claimed AI extraction context is invalid.' } },
      409,
    );
  }
  const payload = jobPayloadSchema.safeParse(claimedPayload);
  if (!payload.success) {
    return c.json(
      { error: { code: 'AI_CONTEXT_INVALID', message: 'Claimed AI extraction context is invalid.' } },
      409,
    );
  }

  if (!sameSources(payload.data.sources, parsed.data.result.provenance)) {
    return c.json(
      {
        error: {
          code: 'AI_PROVENANCE_MISMATCH',
          message: 'AI result provenance does not match the claimed sources.',
        },
      },
      422,
    );
  }
  if (payload.data.model !== undefined && payload.data.model !== parsed.data.result.model) {
    return c.json(
      {
        error: {
          code: 'AI_MODEL_MISMATCH',
          message: 'AI result model does not match the claimed model.',
        },
      },
      422,
    );
  }

  const now = new Date().toISOString();
  try {
    if (isPhase11JobPayload(claimedPayload)) {
      await completePhase11ResearchExtraction(
        db,
        runner.userId,
        runner.id,
        job,
        claimedPayload,
        parsed.data.result,
        now,
      );
      const completedJob = await new JobRepository(db).getById(job.id);
      if (!completedJob || completedJob.status !== 'COMPLETED') {
        throw new Error('Phase 11 completion did not persist.');
      }
      return c.json({
        job: {
          id: completedJob.id,
          jobType: completedJob.jobType,
          entityId: completedJob.entityId,
          status: completedJob.status,
          completedAt: completedJob.completedAt,
        },
        result: parsed.data.result,
        verifiedFactPromotion: false,
        phase11EvidencePersistence: true,
      });
    }

    const completed = await new RunnerJobRepository(db).completeWithResult(
      job.id,
      runner.userId,
      runner.id,
      JSON.stringify(parsed.data.result),
      now,
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
      phase11EvidencePersistence: false,
    });
  } catch {
    return c.json(
      { error: { code: 'JOB_NOT_OWNED', message: 'Runner does not own this active job.' } },
      409,
    );
  }
});
