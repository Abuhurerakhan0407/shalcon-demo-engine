import type { D1DatabaseLike } from '@shalcon/db';
import { Hono } from 'hono';

import type { Bindings } from './context';
import { signalJob } from './job-signal';
import { enqueueVisualQa, getVisualQaHistory } from './visual-qa';

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

export const visualQaRoutes = new Hono<Bindings>();

visualQaRoutes.post('/demos/:demoId/run', async (c) => {
  const user = c.get('authUser');
  const result = await enqueueVisualQa(
    requireDb(c.env.DB),
    user.id,
    c.req.param('demoId'),
  );
  const signal = await signalJob(c.env.JOB_QUEUE, {
    jobId: result.job.id,
    userId: user.id,
    jobType: result.job.jobType,
  });
  return c.json({
    run: result.run,
    job: {
      id: result.job.id,
      jobType: result.job.jobType,
      entityId: result.job.entityId,
      status: result.job.status,
      attempts: result.job.attempts,
      maxAttempts: result.job.maxAttempts,
    },
    created: result.created,
    signal,
    publicReleaseAvailable: false,
  }, result.created ? 201 : 200);
});

visualQaRoutes.get('/demos/:demoId/runs', async (c) => {
  const user = c.get('authUser');
  const runs = await getVisualQaHistory(
    requireDb(c.env.DB),
    user.id,
    c.req.param('demoId'),
  );
  return c.json({ runs });
});
