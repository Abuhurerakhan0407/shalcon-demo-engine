import type { D1DatabaseLike } from '@shalcon/db';
import { Hono } from 'hono';

import type { Bindings } from './context';
import { getPhase21ReviewQueue, preparePhase21Outreach } from './phase21-outreach';

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

export const phase21OutreachRoutes = new Hono<Bindings>();

phase21OutreachRoutes.get('/review', async (c) => {
  const items = await getPhase21ReviewQueue(requireDb(c.env.DB), c.get('authUser').id);
  return c.json({
    phase: 21,
    items,
    sendingAvailable: false,
    permissionFirst: true,
  });
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
