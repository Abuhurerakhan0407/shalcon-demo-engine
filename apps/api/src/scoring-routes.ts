import type { D1DatabaseLike } from '@shalcon/db';
import { Hono } from 'hono';

import type { Bindings } from './context';
import { getDemoWorthinessHistory, runDemoWorthinessScoring } from './demo-worthiness';

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

function responseForError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const notFound = message === 'Prospect not found.';
  return {
    status: notFound ? 404 : 409,
    body: {
      error: {
        code: notFound ? 'NOT_FOUND' : 'DEMO_SCORING_NOT_READY',
        message,
      },
    },
  } as const;
}

export const scoringRoutes = new Hono<Bindings>();

scoringRoutes.post('/prospects/:id/runs', async (c) => {
  try {
    const run = await runDemoWorthinessScoring(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
    );
    return c.json({
      run,
      deterministicTotal: true,
      aiCannotOverrideTotal: true,
    }, 201);
  } catch (error) {
    const response = responseForError(error, 'Demo worthiness scoring could not run.');
    return c.json(response.body, response.status);
  }
});

scoringRoutes.get('/prospects/:id/runs', async (c) => {
  try {
    const runs = await getDemoWorthinessHistory(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
    );
    return c.json({ runs, deterministicTotal: true });
  } catch (error) {
    const response = responseForError(error, 'Demo worthiness score history is unavailable.');
    return c.json(response.body, response.status);
  }
});
