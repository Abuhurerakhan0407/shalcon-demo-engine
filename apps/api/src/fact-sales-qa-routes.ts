import type { D1DatabaseLike } from '@shalcon/db';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Bindings } from './context';
import {
  getPhase19EvidenceInspection,
  getPhase19ReviewQueue,
  resolvePhase19Issue,
  runFactQa,
  salesDecisionSchema,
  submitSalesQa,
} from './fact-sales-qa';

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

const issueResolutionSchema = z.object({
  action: z.enum(['RESOLVED', 'WAIVED']),
  note: z.string().trim().min(2).max(1000),
}).strict();

export const factSalesQaRoutes = new Hono<Bindings>();

factSalesQaRoutes.post('/demos/:demoId/fact-qa/run', async (c) => {
  const user = c.get('authUser');
  const result = await runFactQa(requireDb(c.env.DB), user.id, c.req.param('demoId'));
  return c.json({ result, publicReleaseAvailable: false }, 201);
});

factSalesQaRoutes.get('/demos/:demoId/evidence', async (c) => {
  const user = c.get('authUser');
  const result = await getPhase19EvidenceInspection(
    requireDb(c.env.DB),
    user.id,
    c.req.param('demoId'),
  );
  return c.json(result);
});

factSalesQaRoutes.get('/review-queue', async (c) => {
  const user = c.get('authUser');
  const issues = await getPhase19ReviewQueue(requireDb(c.env.DB), user.id);
  return c.json({ issues });
});

factSalesQaRoutes.post('/issues/:issueId/resolve', async (c) => {
  const user = c.get('authUser');
  const input = issueResolutionSchema.parse(await c.req.json());
  const issue = await resolvePhase19Issue(
    requireDb(c.env.DB),
    user.id,
    c.req.param('issueId'),
    input,
  );
  return c.json({ issue });
});

factSalesQaRoutes.post('/demos/:demoId/sales-qa', async (c) => {
  const user = c.get('authUser');
  const input = salesDecisionSchema.parse(await c.req.json());
  const result = await submitSalesQa(
    requireDb(c.env.DB),
    user.id,
    c.req.param('demoId'),
    input,
  );
  return c.json({
    result,
    publicReleaseAvailable: result.decision === 'APPROVED',
    outreachSendingAvailable: false,
  }, 201);
});
