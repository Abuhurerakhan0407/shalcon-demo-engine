import type { D1DatabaseLike } from '@shalcon/db';
import { Hono } from 'hono';

import type { Bindings } from './context';
import { getContentHistory, runContentGeneration } from './content-engine';

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
        code: notFound ? 'NOT_FOUND' : 'CONTENT_NOT_READY',
        message,
      },
    },
  } as const;
}

export const contentRoutes = new Hono<Bindings>();

contentRoutes.get('/prospects/:id/runs', async (c) => {
  try {
    const runs = await getContentHistory(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
    );
    return c.json({ runs });
  } catch (error) {
    const response = responseForError(error, 'Content history is unavailable.');
    return c.json(response.body, response.status);
  }
});

contentRoutes.post('/prospects/:id/runs', async (c) => {
  try {
    const run = await runContentGeneration(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
    );
    return c.json(
      {
        run,
        verifiedInputsOnly: true,
        deterministicCopy: true,
        unsupportedClaimsAllowed: false,
      },
      201,
    );
  } catch (error) {
    const response = responseForError(error, 'Content generation could not run.');
    return c.json(response.body, response.status);
  }
});
