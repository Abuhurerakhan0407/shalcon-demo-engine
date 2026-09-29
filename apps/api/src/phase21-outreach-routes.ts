import type { D1DatabaseLike } from '@shalcon/db';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Bindings } from './context';
import {
  approvePhase21Outreach,
  getPhase21ApprovalReadiness,
  getPhase21ReviewQueue,
  PHASE21_APPROVAL_CONFIRMATION,
  preparePhase21Outreach,
} from './phase21-outreach';

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

const approvalSchema = z
  .object({
    decision: z.literal('APPROVE'),
    confirmation: z.literal(PHASE21_APPROVAL_CONFIRMATION),
  })
  .strict();

export const phase21OutreachRoutes = new Hono<Bindings>();

phase21OutreachRoutes.get('/review', async (c) => {
  const items = await getPhase21ReviewQueue(requireDb(c.env.DB), c.get('authUser').id);
  return c.json({ phase: 21, items, sendingAvailable: false, permissionFirst: true });
});

phase21OutreachRoutes.get('/prospects/:prospectId/readiness', async (c) => {
  try {
    const readiness = await getPhase21ApprovalReadiness(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('prospectId'),
    );
    return c.json({ readiness, sendingAvailable: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Phase 21 readiness failed.';
    const status = message === 'Prospect not found.' ? 404 : 409;
    return c.json(
      { error: { code: status === 404 ? 'NOT_FOUND' : 'PHASE21_NOT_READY', message } },
      status,
    );
  }
});

phase21OutreachRoutes.post('/prospects/:prospectId/approve', async (c) => {
  const parsed = approvalSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'EXPLICIT_APPROVAL_REQUIRED',
          message: 'Exact explicit human approval confirmation is required.',
        },
      },
      400,
    );
  }
  try {
    const result = await approvePhase21Outreach(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('prospectId'),
      parsed.data.confirmation,
    );
    return c.json({ result, sendingAvailable: false, queueCreated: false }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Phase 21 approval failed.';
    const status = message === 'Prospect not found.' ? 404 : 409;
    return c.json(
      { error: { code: status === 404 ? 'NOT_FOUND' : 'PHASE21_APPROVAL_BLOCKED', message } },
      status,
    );
  }
});

phase21OutreachRoutes.post('/prospects/:prospectId/prepare', async (c) => {
  try {
    const result = await preparePhase21Outreach(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('prospectId'),
    );
    return c.json({ result, sendingAvailable: false }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Phase 21 preparation failed.';
    const status = message === 'Prospect not found.' ? 404 : 409;
    return c.json(
      { error: { code: status === 404 ? 'NOT_FOUND' : 'PHASE21_NOT_READY', message } },
      status,
    );
  }
});
