import { LocalRunnerRepository, type D1DatabaseLike, type LocalRunnerRecord } from '@shalcon/db';
import { z } from 'zod';

import { hashSessionToken } from './auth';
import { runnerRoutes } from './runner-routes';
import { completeVisualQa, getVisualQaRunnerInput } from './visual-qa';

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

async function authenticatedRunner(
  db: D1DatabaseLike,
  authorization: string | undefined,
): Promise<LocalRunnerRecord | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  return new LocalRunnerRepository(db).getActiveByTokenHash(await hashSessionToken(token));
}

runnerRoutes.post('/agent/jobs/:jobId/visual-qa/input', async (c) => {
  const db = requireDb(c.env.DB);
  const runner = await authenticatedRunner(db, c.req.header('Authorization'));
  if (!runner) {
    return c.json(
      { error: { code: 'RUNNER_UNAUTHORIZED', message: 'Valid runner token required.' } },
      401,
    );
  }
  try {
    const input = await getVisualQaRunnerInput(
      db,
      runner.userId,
      runner.id,
      c.req.param('jobId'),
    );
    return c.json({ input });
  } catch (error) {
    return c.json(
      {
        error: {
          code: 'VISUAL_QA_INPUT_UNAVAILABLE',
          message: error instanceof Error ? error.message : 'Visual QA input unavailable.',
        },
      },
      409,
    );
  }
});

runnerRoutes.post('/agent/jobs/:jobId/visual-qa/complete', async (c) => {
  const db = requireDb(c.env.DB);
  const runner = await authenticatedRunner(db, c.req.header('Authorization'));
  if (!runner) {
    return c.json(
      { error: { code: 'RUNNER_UNAUTHORIZED', message: 'Valid runner token required.' } },
      401,
    );
  }
  const parsed = completeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Visual QA completion requires a result.' } },
      400,
    );
  }
  try {
    const completed = await completeVisualQa(
      db,
      runner.userId,
      runner.id,
      c.req.param('jobId'),
      parsed.data.result,
    );
    return c.json(completed);
  } catch (error) {
    return c.json(
      {
        error: {
          code: 'VISUAL_QA_COMPLETION_REJECTED',
          message: error instanceof Error ? error.message : 'Visual QA completion rejected.',
        },
      },
      409,
    );
  }
});
