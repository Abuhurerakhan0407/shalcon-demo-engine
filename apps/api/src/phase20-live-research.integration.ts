import {
  CampaignRepository,
  JobContextRepository,
  JobRepository,
  LocalRunnerRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
  type JobRecord,
} from '@shalcon/db';
import { normalizeBusinessName, normalizeCity, normalizeDomain } from '@shalcon/evidence';
import { Hono } from 'hono';
import { z } from 'zod';

import { hashSessionToken } from './auth';
import type { Bindings } from './context';
import { createOrResolveProspectIdentity } from './prospect-identity';
import { researchRunnerRoutes } from './research-runner-routes';
import { runnerRoutes } from './runner-routes';

const USER_ID = 'phase20-live-research-user';
const RUNNER_ID = 'phase20-live-research-runner';

const candidateSchema = z.object({
  id: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/u),
  businessName: z.string().trim().min(2).max(200),
  location: z.string().trim().min(2).max(200),
  sourceUrl: z.string().trim().url().max(2048),
  officialWebsite: z.string().trim().url().max(2048).nullable().optional(),
}).strict();

const setupSchema = z.object({
  candidates: z.array(candidateSchema).min(1).max(3),
  runnerToken: z.string().min(24).max(200),
}).strict();

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

function researchJob(id: string, prospectId: string, now: string): JobRecord {
  return {
    id,
    jobType: 'PLAYWRIGHT_RESEARCH',
    entityId: prospectId,
    status: 'PENDING',
    priority: 90,
    idempotencyKey: `phase20-live:${id}`,
    attempts: 0,
    maxAttempts: 1,
    leaseOwner: null,
    leaseExpiresAt: null,
    scheduledFor: now,
    startedAt: null,
    completedAt: null,
    lastErrorCode: null,
    lastErrorSafeMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

const app = new Hono<Bindings>();
app.route('/api/v1/runner/research', researchRunnerRoutes);
app.route('/api/v1/runner', runnerRoutes);

app.get('/phase20/health', (c) => c.json({ ok: true, phase: 20, mode: 'LIVE_RESEARCH_DYNAMIC_TOKEN' }));

app.post('/phase20/setup', async (c) => {
  const input = setupSchema.parse(await c.req.json());
  const db = requireDb(c.env.DB);
  const now = new Date().toISOString();

  await new UserRepository(db).create({
    id: USER_ID,
    email: 'phase20-live@example.invalid',
    name: 'Phase 20 Live Research',
    createdAt: now,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(USER_ID, now);
  await new LocalRunnerRepository(db).registerOrRotate({
    id: RUNNER_ID,
    userId: USER_ID,
    name: 'Phase 20 Dynamic Research Runner',
    tokenHash: await hashSessionToken(input.runnerToken),
    version: 'phase20-live',
    capabilitiesJson: JSON.stringify(['PLAYWRIGHT_RESEARCH']),
    status: 'ACTIVE',
    lastHeartbeatAt: now,
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
  });

  const created: Array<{
    candidateId: string;
    prospectId: string;
    state: string;
    identityStatus: string;
    jobId: string;
  }> = [];

  for (const candidate of input.candidates) {
    const identityUrl = candidate.officialWebsite ?? candidate.sourceUrl;
    const domain = normalizeDomain(new URL(identityUrl).hostname);
    const identity = await createOrResolveProspectIdentity(
      db,
      {
        userId: USER_ID,
        campaignId: campaign.id,
        canonicalName: candidate.businessName,
        normalizedName: normalizeBusinessName(candidate.businessName),
        domain,
        phoneNormalized: null,
        city: normalizeCity('Mumbai'),
        addressNormalized: null,
        niche: 'SALON_SPA',
        sourceType: 'PHASE20_LIVE_RESEARCH',
      },
      now,
    );
    if (identity.prospect.currentState !== 'IDENTITY_VERIFIED') {
      throw new Error(`Phase 20 live identity requires review for ${candidate.id}.`);
    }

    const jobId = `job_${candidate.id}`;
    await new JobRepository(db).createOrGet(researchJob(jobId, identity.prospect.id, now));
    await new JobContextRepository(db).createOrGet({
      jobId,
      userId: USER_ID,
      payloadJson: JSON.stringify({ url: candidate.sourceUrl, maxPages: 4 }),
      resultJson: null,
      createdAt: now,
      updatedAt: now,
    });
    created.push({
      candidateId: candidate.id,
      prospectId: identity.prospect.id,
      state: identity.prospect.currentState,
      identityStatus: identity.identity.status,
      jobId,
    });
  }

  return c.json({ created, trialResultsModified: false }, 201);
});

app.get('/phase20/status', async (c) => {
  const db = requireDb(c.env.DB);
  const prospects = await new ProspectRepository(db).listForUser(USER_ID);
  const sources = new SourceRecordRepository(db);
  const prospectStatus = await Promise.all(
    prospects.map(async (prospect) => {
      const captured = await sources.listForProspect(prospect.id);
      return {
        id: prospect.id,
        canonicalName: prospect.canonicalName,
        currentState: prospect.currentState,
        sourceCount: captured.length,
        playwrightSourceCount: captured.filter(
          (source) => source.provider === 'PLAYWRIGHT' && source.sourceType === 'WEBSITE_PAGE',
        ).length,
      };
    }),
  );

  const jobs = await db.prepare(`
    SELECT j.id, j.job_type, j.entity_id, j.status, j.last_error_code, j.last_error_safe_message
    FROM jobs j
    JOIN job_contexts jc ON jc.job_id = j.id
    WHERE jc.user_id = ?
    ORDER BY j.created_at, j.id
  `).bind(USER_ID).all<{
    id: string;
    job_type: string;
    entity_id: string;
    status: string;
    last_error_code: string | null;
    last_error_safe_message: string | null;
  }>();
  const foreignKeyViolations = await db.prepare('PRAGMA foreign_key_check').all();

  return c.json({
    prospects: prospectStatus,
    researchJobs: jobs.results.filter((job) => job.job_type === 'PLAYWRIGHT_RESEARCH'),
    aiJobs: jobs.results.filter((job) => job.job_type === 'LOCAL_AI_EXTRACT'),
    foreignKeyViolations: foreignKeyViolations.results.length,
    trialResultsModified: false,
  });
});

export default app;
