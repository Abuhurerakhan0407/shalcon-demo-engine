import {
  DemoBuilderStateRepository,
  DemoRepository,
  EvidenceRepository,
  ProspectFactRepository,
  ProspectRepository,
  type D1DatabaseLike,
  type DemoRecord,
  type ProspectRecord,
} from '@shalcon/db';
import { Hono } from 'hono';

import type { Bindings } from './context';
import { hashDemoToken } from './demo-renderer';
import {
  PHASE7_HIDEABLE_FIELDS,
  PHASE7_THEME_PRESETS,
  buildManualSalonDemoConfig,
  defaultManualDemoBuilderInput,
  deriveManualDemoToken,
  phase7Expiry,
} from './manual-demo-builder';

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

function requirePreviewSecret(secret: string | undefined): string {
  if (!secret || secret.length < 16) throw new Error('SESSION_SECRET is not configured.');
  return secret;
}

function demoSummary(demo: DemoRecord) {
  return {
    id: demo.id,
    prospectId: demo.prospectId,
    status: demo.status,
    templateId: demo.templateId,
    templateVersion: demo.templateVersion,
    expiresAt: demo.expiresAt,
    updatedAt: demo.updatedAt,
    factQaStatus: demo.factQaStatus,
    visualQaStatus: demo.visualQaStatus,
    salesQaStatus: demo.salesQaStatus,
  };
}

function builderStateJson(build: ReturnType<typeof buildManualSalonDemoConfig>) {
  return JSON.stringify({
    input: build.input,
    visibleFields: build.visibleFields,
    evidenceMap: build.evidenceMap,
    contactMode: build.contactMode,
  });
}

async function ownedProspect(
  db: D1DatabaseLike,
  prospectId: string,
  userId: string,
): Promise<ProspectRecord | null> {
  return new ProspectRepository(db).getByIdForUser(prospectId, userId);
}

async function demoDetail(
  db: D1DatabaseLike,
  demo: DemoRecord,
  userId: string,
  secret: string,
  requestOrigin: string,
) {
  const builderState = await new DemoBuilderStateRepository(db).getForUser(demo.id, userId);
  const prospect = await ownedProspect(db, demo.prospectId, userId);
  if (!builderState || !prospect) return null;

  const facts = await new ProspectFactRepository(db).listForProspect(prospect.id);
  const evidence = await new EvidenceRepository(db).listForProspect(prospect.id);
  const parsedState = JSON.parse(builderState.stateJson) as {
    input: unknown;
    visibleFields: Array<{ field: string; value: string; evidenceId: string; confidence: number }>;
    evidenceMap: Record<string, string[]>;
    contactMode: string;
  };
  const usedEvidenceIds = new Set(Object.values(parsedState.evidenceMap).flat());
  const previewToken = await deriveManualDemoToken(secret, demo.id);
  const previewPath = `/d/${previewToken}`;

  return {
    demo: demoSummary(demo),
    prospect,
    builder: {
      revision: builderState.revision,
      ...parsedState,
    },
    verifiedFacts: facts.filter((fact) => fact.verificationStatus === 'VERIFIED' && fact.evidenceId),
    visibleEvidence: evidence.filter((item) => usedEvidenceIds.has(item.id)),
    previewPath,
    previewUrl: `${requestOrigin}${previewPath}`,
  };
}

export const demoAdminRoutes = new Hono<Bindings>();

demoAdminRoutes.get('/prospects/:prospectId', async (c) => {
  const user = c.get('authUser');
  const db = requireDb(c.env.DB);
  const prospect = await ownedProspect(db, c.req.param('prospectId'), user.id);
  if (!prospect) {
    return c.json({ error: { code: 'PROSPECT_NOT_FOUND', message: 'Prospect not found.' } }, 404);
  }

  const facts = await new ProspectFactRepository(db).listForProspect(prospect.id);
  const evidence = await new EvidenceRepository(db).listForProspect(prospect.id);
  const demos = await new DemoRepository(db).listForProspectForUser(prospect.id, user.id);

  return c.json({
    prospect,
    eligible: prospect.currentState === 'IDENTITY_VERIFIED',
    verifiedFacts: facts.filter((fact) => fact.verificationStatus === 'VERIFIED' && fact.evidenceId),
    evidence,
    demos: demos.map(demoSummary),
    builderContract: {
      templateId: 'elane-v8',
      templateVersion: '8.0.0',
      themePresets: PHASE7_THEME_PRESETS,
      hideableFields: PHASE7_HIDEABLE_FIELDS,
      defaultInput: defaultManualDemoBuilderInput(),
      previewExpiryDays: 14,
      ctaPolicy: 'Verified WhatsApp, phone or email is surfaced in the concept note; demo booking stays non-transactional.',
    },
  });
});

demoAdminRoutes.post('/prospects/:prospectId/demos', async (c) => {
  const user = c.get('authUser');
  const db = requireDb(c.env.DB);
  const prospect = await ownedProspect(db, c.req.param('prospectId'), user.id);
  if (!prospect) {
    return c.json({ error: { code: 'PROSPECT_NOT_FOUND', message: 'Prospect not found.' } }, 404);
  }
  if (prospect.currentState !== 'IDENTITY_VERIFIED') {
    return c.json(
      {
        error: {
          code: 'IDENTITY_NOT_VERIFIED',
          message: 'Resolve business identity before generating a demo.',
        },
      },
      409,
    );
  }

  const rawInput = await c.req.json().catch(() => ({}));
  const facts = await new ProspectFactRepository(db).listForProspect(prospect.id);
  const build = buildManualSalonDemoConfig(prospect, facts, rawInput);
  const now = new Date();
  const nowIso = now.toISOString();
  const demoId = `demo_${crypto.randomUUID().replaceAll('-', '')}`;
  const secret = requirePreviewSecret(c.env.SESSION_SECRET);
  const previewToken = await deriveManualDemoToken(secret, demoId);
  const demo: DemoRecord = {
    id: demoId,
    prospectId: prospect.id,
    tokenHash: await hashDemoToken(previewToken),
    templateId: 'elane-v8',
    templateVersion: '8.0.0',
    schemaVersion: 'salon-template-config.v1',
    configJson: JSON.stringify(build.config),
    status: 'READY',
    expiresAt: phase7Expiry(now),
    createdAt: nowIso,
    updatedAt: nowIso,
    lastQaAt: null,
    factQaStatus: 'MANUAL_PHASE7',
    visualQaStatus: 'PENDING_PHASE18',
    salesQaStatus: 'MANUAL_PHASE7',
  };

  try {
    const created = await new DemoRepository(db).create(demo);
    await new DemoBuilderStateRepository(db).create({
      demoId,
      userId: user.id,
      stateJson: builderStateJson(build),
      revision: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    const detail = await demoDetail(db, created, user.id, secret, new URL(c.req.url).origin);
    return c.json(detail, 201);
  } catch (error) {
    await db.prepare('DELETE FROM demos WHERE id = ?').bind(demoId).run().catch(() => undefined);
    throw error;
  }
});

demoAdminRoutes.get('/demos/:demoId', async (c) => {
  const user = c.get('authUser');
  const db = requireDb(c.env.DB);
  const demo = await new DemoRepository(db).getByIdForUser(c.req.param('demoId'), user.id);
  if (!demo) {
    return c.json({ error: { code: 'DEMO_NOT_FOUND', message: 'Demo not found.' } }, 404);
  }
  const detail = await demoDetail(
    db,
    demo,
    user.id,
    requirePreviewSecret(c.env.SESSION_SECRET),
    new URL(c.req.url).origin,
  );
  if (!detail) {
    return c.json({ error: { code: 'DEMO_STATE_NOT_FOUND', message: 'Demo builder state not found.' } }, 404);
  }
  return c.json(detail);
});

demoAdminRoutes.put('/demos/:demoId', async (c) => {
  const user = c.get('authUser');
  const db = requireDb(c.env.DB);
  const demos = new DemoRepository(db);
  const demo = await demos.getByIdForUser(c.req.param('demoId'), user.id);
  if (!demo) {
    return c.json({ error: { code: 'DEMO_NOT_FOUND', message: 'Demo not found.' } }, 404);
  }
  const prospect = await ownedProspect(db, demo.prospectId, user.id);
  if (!prospect || prospect.currentState !== 'IDENTITY_VERIFIED') {
    return c.json(
      { error: { code: 'IDENTITY_NOT_VERIFIED', message: 'Business identity is not verified.' } },
      409,
    );
  }
  const builderStates = new DemoBuilderStateRepository(db);
  const currentState = await builderStates.getForUser(demo.id, user.id);
  if (!currentState) {
    return c.json({ error: { code: 'DEMO_STATE_NOT_FOUND', message: 'Demo builder state not found.' } }, 404);
  }

  const rawInput = await c.req.json().catch(() => ({}));
  const facts = await new ProspectFactRepository(db).listForProspect(prospect.id);
  const build = buildManualSalonDemoConfig(prospect, facts, rawInput);
  const now = new Date();
  const nowIso = now.toISOString();
  const updated = await demos.updateConfigurationForUser(
    demo.id,
    user.id,
    JSON.stringify(build.config),
    'READY',
    phase7Expiry(now),
    nowIso,
  );
  await builderStates.update(demo.id, user.id, builderStateJson(build), nowIso);
  const detail = await demoDetail(
    db,
    updated,
    user.id,
    requirePreviewSecret(c.env.SESSION_SECRET),
    new URL(c.req.url).origin,
  );
  return c.json(detail);
});

demoAdminRoutes.post('/demos/:demoId/disable', async (c) => {
  const user = c.get('authUser');
  const db = requireDb(c.env.DB);
  const demos = new DemoRepository(db);
  const demo = await demos.getByIdForUser(c.req.param('demoId'), user.id);
  if (!demo) {
    return c.json({ error: { code: 'DEMO_NOT_FOUND', message: 'Demo not found.' } }, 404);
  }
  const updated = await demos.updateStatusForUser(demo.id, user.id, 'DISABLED', new Date().toISOString());
  return c.json({ demo: demoSummary(updated) });
});
