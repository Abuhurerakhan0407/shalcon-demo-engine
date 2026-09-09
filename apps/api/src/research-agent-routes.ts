import type { D1DatabaseLike } from '@shalcon/db';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Bindings } from './context';
import { getPhase11ResearchHistory, startPhase11Research } from './research-agent';

const startSchema = z
  .object({
    model: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u)
      .optional(),
    useScrapeGraph: z.boolean().optional(),
  })
  .strict();

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

export const researchAgentRoutes = new Hono<Bindings>();

researchAgentRoutes.post('/prospects/:id/runs', async (c) => {
  const parsed = startSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Automated research options are invalid.' } },
      400,
    );
  }
  try {
    const options = {
      ...(parsed.data.model !== undefined ? { model: parsed.data.model } : {}),
      ...(parsed.data.useScrapeGraph !== undefined
        ? { useScrapeGraph: parsed.data.useScrapeGraph }
        : {}),
    };
    const run = await startPhase11Research(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
      options,
    );
    return c.json({ run, verifiedFactPromotion: false }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Automated research could not start.';
    const notFound = message === 'Prospect not found.';
    return c.json(
      { error: { code: notFound ? 'NOT_FOUND' : 'RESEARCH_NOT_READY', message } },
      notFound ? 404 : 409,
    );
  }
});

researchAgentRoutes.get('/prospects/:id/runs', async (c) => {
  try {
    const runs = await getPhase11ResearchHistory(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
    );
    return c.json({ runs, auditHistoryPreserved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research history is unavailable.';
    return c.json({ error: { code: 'NOT_FOUND', message } }, 404);
  }
});
