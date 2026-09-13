import { DemoRepository, type D1DatabaseLike } from '@shalcon/db';
import { Hono } from 'hono';

import './visual-qa-runner-extension';
import type { Bindings } from './context';
import {
  getAutomatedDemoBuildHistory,
  runAutomatedDemoBuild,
} from './automated-demo-builder';
import { renderDemoRecordForOperator } from './demo-renderer';
import { factSalesQaRoutes } from './fact-sales-qa-routes';
import { visualQaRoutes } from './visual-qa-routes';

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

function requirePreviewSecret(secret: string | undefined): string {
  if (!secret || secret.length < 16) throw new Error('SESSION_SECRET is not configured.');
  return secret;
}

export const automatedDemoRoutes = new Hono<Bindings>();

automatedDemoRoutes.post('/prospects/:prospectId/build', async (c) => {
  const user = c.get('authUser');
  const result = await runAutomatedDemoBuild(
    requireDb(c.env.DB),
    user.id,
    c.req.param('prospectId'),
    requirePreviewSecret(c.env.SESSION_SECRET),
  );
  const previewPath = `/api/v1/automated-demo/demos/${result.demo.id}/preview`;
  return c.json({
    build: result.build,
    demo: {
      id: result.demo.id,
      prospectId: result.demo.prospectId,
      status: result.demo.status,
      templateId: result.demo.templateId,
      templateVersion: result.demo.templateVersion,
      expiresAt: result.demo.expiresAt,
      factQaStatus: result.demo.factQaStatus,
      visualQaStatus: result.demo.visualQaStatus,
      salesQaStatus: result.demo.salesQaStatus,
    },
    previewPath,
    previewUrl: `${new URL(c.req.url).origin}${previewPath}`,
    publicReleaseAvailable: false,
    reused: result.reused,
  }, result.reused ? 200 : 201);
});

automatedDemoRoutes.get('/prospects/:prospectId/builds', async (c) => {
  const user = c.get('authUser');
  const builds = await getAutomatedDemoBuildHistory(
    requireDb(c.env.DB),
    user.id,
    c.req.param('prospectId'),
  );
  return c.json({ builds });
});

automatedDemoRoutes.get('/demos/:demoId/preview', async (c) => {
  const user = c.get('authUser');
  const db = requireDb(c.env.DB);
  const demo = await new DemoRepository(db).getByIdForUser(c.req.param('demoId'), user.id);
  if (!demo) {
    return c.json({ error: { code: 'DEMO_NOT_FOUND', message: 'Demo not found.' } }, 404);
  }
  const rendered = renderDemoRecordForOperator(demo, new Date().toISOString());
  if (!rendered.ok) {
    return c.json(
      { error: { code: rendered.reason, message: 'Demo cannot be rendered for operator preview.' } },
      409,
    );
  }
  c.header('Content-Type', 'text/html; charset=utf-8');
  c.header('Cache-Control', 'private, no-store');
  c.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return c.html(rendered.html);
});

automatedDemoRoutes.route('/visual-qa', visualQaRoutes);
automatedDemoRoutes.route('/phase19', factSalesQaRoutes);
