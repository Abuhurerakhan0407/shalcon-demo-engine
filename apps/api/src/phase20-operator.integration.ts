import type { UserRecord } from '@shalcon/db';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { automatedDemoRoutes } from './automated-demo-routes';
import { brandTemplateRoutes } from './brand-template-routes';
import type { Bindings } from './context';
import { demoAdminRoutes } from './demo-admin-routes';
import { evidenceReviewRoutes } from './evidence-review-routes';
import liveResearchApp from './phase20-live-research.integration';
import { prospectRoutes } from './prospect-routes';
import { researchAgentRoutes } from './research-agent-routes';
import { scoringRoutes } from './scoring-routes';
import { websiteAuditRoutes } from './website-audit-routes';

const OPERATOR: UserRecord = {
  id: 'phase20-live-research-user',
  email: 'phase20-live@example.invalid',
  name: 'Phase 20 Local Operator',
  createdAt: '2026-09-14T00:00:00.000Z',
};

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
const LOCAL_ORIGINS = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);

const app = new Hono<Bindings>();

app.use('*', async (c, next) => {
  const hostname = new URL(c.req.url).hostname;
  if (c.env.APP_ENV === 'production' || !LOCAL_HOSTS.has(hostname)) {
    return c.json(
      {
        error: {
          code: 'PHASE20_OPERATOR_LOCAL_ONLY',
          message: 'The Phase 20 operator shell is restricted to local development.',
        },
      },
      403,
    );
  }
  await next();
});

app.use(
  '*',
  cors({
    origin: (origin) => (LOCAL_ORIGINS.has(origin) ? origin : ''),
    credentials: true,
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }),
);

app.get('/api/v1/auth/session', (c) => c.json({ user: OPERATOR }));
app.post('/api/v1/auth/logout', (c) => c.body(null, 204));

app.use('/api/v1/prospects/*', async (c, next) => {
  c.set('authUser', OPERATOR);
  await next();
});
app.route('/api/v1/prospects', prospectRoutes);
app.route('/api/v1/prospects', evidenceReviewRoutes);

app.use('/api/v1/research/*', async (c, next) => {
  c.set('authUser', OPERATOR);
  await next();
});
app.route('/api/v1/research', researchAgentRoutes);

for (const prefix of [
  '/api/v1/audits/*',
  '/api/v1/scoring/*',
  '/api/v1/brand-template/*',
  '/api/v1/demo-admin/*',
  '/api/v1/automated-demo/*',
  '/api/v1/runner/operator/*',
]) {
  app.use(prefix, async (c, next) => {
    c.set('authUser', OPERATOR);
    await next();
  });
}

app.route('/api/v1/audits/website', websiteAuditRoutes);
app.route('/api/v1/scoring', scoringRoutes);
app.route('/api/v1/brand-template', brandTemplateRoutes);
app.route('/api/v1/demo-admin', demoAdminRoutes);
app.route('/api/v1/automated-demo', automatedDemoRoutes);

app.get('/phase20/operator-health', (c) =>
  c.json({ ok: true, phase: 20, mode: 'LOCAL_OPERATOR', productionAllowed: false }),
);
app.route('/', liveResearchApp);

export default app;
