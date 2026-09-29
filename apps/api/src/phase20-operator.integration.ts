import { ProspectRepository, type D1DatabaseLike, type UserRecord } from '@shalcon/db';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { assetRoutes } from './asset-routes';
import { automatedDemoRoutes } from './automated-demo-routes';
import { brandTemplateRoutes } from './brand-template-routes';
import type { Bindings } from './context';
import { contentRoutes } from './content-routes';
import { demoAdminRoutes } from './demo-admin-routes';
import { runDemoWorthinessScoring } from './demo-worthiness';
import { evidenceAuditorRoutes } from './evidence-auditor-routes';
import { evidenceReviewRoutes } from './evidence-review-routes';
import liveResearchApp from './phase20-live-research.integration';
import { prospectRoutes } from './prospect-routes';
import { researchAgentRoutes } from './research-agent-routes';
import { scoringRoutes } from './scoring-routes';
import { createTargetedResearchCaptureRoutes } from './targeted-research-capture-routes';
import { websiteAuditRoutes } from './website-audit-routes';
import { runWebsiteOpportunityAudit } from './website-audit';

const OPERATOR: UserRecord = {
  id: 'phase20-live-research-user',
  email: 'phase20-live@example.invalid',
  name: 'Phase 20 Local Operator',
  createdAt: '2026-09-14T00:00:00.000Z',
};

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
const LOCAL_ORIGINS = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);
const OPPORTUNITY_STATES = new Set(['RESEARCHED', 'AUDIT_PENDING', 'AUDITED']);

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

async function runOpportunityPipeline(db: D1DatabaseLike, prospectId: string) {
  const prospects = new ProspectRepository(db);
  let prospect = await prospects.getByIdForUser(prospectId, OPERATOR.id);
  if (!prospect) throw new Error('Prospect not found.');
  if (!OPPORTUNITY_STATES.has(prospect.currentState)) {
    throw new Error(`Opportunity pipeline requires RESEARCHED, AUDIT_PENDING, or AUDITED state; found ${prospect.currentState}.`);
  }

  let audit = null;
  if (prospect.currentState === 'RESEARCHED') {
    prospect = await prospects.transition(prospect.id, 'AUDIT_PENDING', new Date().toISOString());
  }
  if (prospect.currentState === 'AUDIT_PENDING') {
    audit = await runWebsiteOpportunityAudit(db, OPERATOR.id, prospect.id);
    prospect = await prospects.transition(prospect.id, 'AUDITED', new Date().toISOString());
  }

  const score = await runDemoWorthinessScoring(db, OPERATOR.id, prospect.id);
  const finalProspect = await prospects.getByIdForUser(prospect.id, OPERATOR.id);
  if (!finalProspect) throw new Error('Prospect disappeared after opportunity pipeline execution.');
  return { prospect: finalProspect, audit, score };
}

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

app.use('/api/v1/evidence-auditor/*', async (c, next) => {
  c.set('authUser', OPERATOR);
  await next();
});
app.route('/api/v1/evidence-auditor', evidenceAuditorRoutes);

app.use('/api/v1/research/*', async (c, next) => {
  c.set('authUser', OPERATOR);
  await next();
});
app.route('/api/v1/research', researchAgentRoutes);

for (const prefix of [
  '/api/v1/audits/*',
  '/api/v1/scoring/*',
  '/api/v1/brand-template/*',
  '/api/v1/content/*',
  '/api/v1/assets/*',
  '/api/v1/demo-admin/*',
  '/api/v1/automated-demo/*',
]) {
  app.use(prefix, async (c, next) => {
    c.set('authUser', OPERATOR);
    await next();
  });
}

app.route('/api/v1/audits/website', websiteAuditRoutes);
app.route('/api/v1/scoring', scoringRoutes);
app.route('/api/v1/brand-template', brandTemplateRoutes);
app.route('/api/v1/content', contentRoutes);
app.route('/api/v1/assets', assetRoutes);
app.route('/api/v1/demo-admin', demoAdminRoutes);
app.route('/api/v1/automated-demo', automatedDemoRoutes);
app.route('/phase20', createTargetedResearchCaptureRoutes(OPERATOR.id));

app.post('/phase20/opportunity/prospects/:id/run', async (c) => {
  try {
    const result = await runOpportunityPipeline(requireDb(c.env.DB), c.req.param('id'));
    return c.json({ result, stateMachineEnforced: true, trialResultUntouched: true }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Opportunity pipeline failed.';
    const status = message === 'Prospect not found.' ? 404 : 409;
    return c.json({ error: { code: status === 404 ? 'NOT_FOUND' : 'OPPORTUNITY_PIPELINE_NOT_READY', message } }, status);
  }
});

app.post('/phase20/opportunity/run', async (c) => {
  const db = requireDb(c.env.DB);
  const prospects = await new ProspectRepository(db).listForUser(OPERATOR.id, 200);
  const eligible = prospects.filter((prospect) => OPPORTUNITY_STATES.has(prospect.currentState));
  const completed = [];
  const failed = [];
  for (const prospect of eligible) {
    try {
      const result = await runOpportunityPipeline(db, prospect.id);
      completed.push({
        prospectId: prospect.id,
        businessName: prospect.canonicalName,
        score: result.score.score.total,
        decision: result.score.score.decision,
      });
    } catch (error) {
      failed.push({
        prospectId: prospect.id,
        businessName: prospect.canonicalName,
        error: error instanceof Error ? error.message : 'Opportunity pipeline failed.',
      });
    }
  }
  return c.json({
    attempted: eligible.length,
    completed,
    failed,
    stateMachineEnforced: true,
    trialResultUntouched: true,
  });
});

app.get('/phase20/operator-health', (c) =>
  c.json({ ok: true, phase: 20, mode: 'LOCAL_OPERATOR', productionAllowed: false }),
);
app.route('/', liveResearchApp);

export default app;
