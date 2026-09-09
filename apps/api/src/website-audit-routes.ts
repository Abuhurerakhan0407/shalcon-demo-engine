import type { D1DatabaseLike } from '@shalcon/db';
import { Hono } from 'hono';

import type { Bindings } from './context';
import {
  getWebsiteAuditHistory,
  getWebsiteAuditObservations,
  runWebsiteOpportunityAudit,
} from './website-audit';

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

function responseForError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const notFound = message === 'Prospect not found.' || message === 'Website audit run not found.';
  return {
    status: notFound ? 404 : 409,
    body: {
      error: {
        code: notFound ? 'NOT_FOUND' : 'WEBSITE_AUDIT_NOT_READY',
        message,
      },
    },
  } as const;
}

export const websiteAuditRoutes = new Hono<Bindings>();

websiteAuditRoutes.post('/prospects/:id/runs', async (c) => {
  try {
    const run = await runWebsiteOpportunityAudit(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
    );
    return c.json({ run, evidenceBackedOnly: true }, 201);
  } catch (error) {
    const response = responseForError(error, 'Website opportunity audit could not run.');
    return c.json(response.body, response.status);
  }
});

websiteAuditRoutes.get('/prospects/:id/runs', async (c) => {
  try {
    const runs = await getWebsiteAuditHistory(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
    );
    return c.json({ runs, auditHistoryPreserved: true });
  } catch (error) {
    const response = responseForError(error, 'Website audit history is unavailable.');
    return c.json(response.body, response.status);
  }
});

websiteAuditRoutes.get('/runs/:id/observations', async (c) => {
  try {
    const observations = await getWebsiteAuditObservations(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
    );
    return c.json({ observations, supportedByCaptureOnly: true });
  } catch (error) {
    const response = responseForError(error, 'Website audit observations are unavailable.');
    return c.json(response.body, response.status);
  }
});
