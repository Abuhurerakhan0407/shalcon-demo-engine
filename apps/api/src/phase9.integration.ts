import {
  CampaignRepository,
  EvidenceRepository,
  JobContextRepository,
  JobRepository,
  LocalRunnerRepository,
  ProspectFactRepository,
  ProspectRepository,
  RunnerJobRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
  type JobRecord,
} from '@shalcon/db';
import { Hono } from 'hono';

import { hashSessionToken } from './auth';
import { app as productionApp } from './index';

interface Env { DB: D1DatabaseLike }
type Bindings = { Bindings: Env };
const integration = new Hono<Bindings>();

const USER_ID = 'phase9-user';
const PROSPECT_ID = 'phase9-prospect';
const OTHER_PROSPECT_ID = 'phase9-other-prospect';
const RUNNER_ID = 'phase9-runner';
const JOB_ID = 'phase9-research-job';
const BAD_JOB_ID = 'phase9-mismatch-job';
const URL_MISMATCH_JOB_ID = 'phase9-url-mismatch-job';
const RAW_TOKEN = 'rnr_phase9_fixture_token_1234567890';
const NOW = '2026-09-03T14:30:00.000Z';
const ACTIVE_LEASE = '2099-01-01T00:00:00.000Z';

function researchJob(id: string, prospectId: string): JobRecord {
  return {
    id,
    jobType: 'PLAYWRIGHT_RESEARCH',
    entityId: prospectId,
    status: 'PENDING',
    priority: 20,
    idempotencyKey: `phase9:${id}`,
    attempts: 0,
    maxAttempts: 3,
    leaseOwner: null,
    leaseExpiresAt: null,
    scheduledFor: NOW,
    startedAt: null,
    completedAt: null,
    lastErrorCode: null,
    lastErrorSafeMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function page(
  url: string,
  title: string,
  text: string,
  options: { status?: number | null; navigationError?: string | null } = {},
) {
  const status = options.status === undefined ? 200 : options.status;
  return {
    requestedUrl: url,
    finalUrl: url,
    capturedAt: NOW,
    httpStatus: status,
    title,
    text,
    html: `<html><body>${text}</body></html>`,
    screenshotPath: `artifacts/research/${JOB_ID}/${title.toLowerCase().replaceAll(' ', '-')}.png`,
    navigationError: options.navigationError ?? null,
    console: title === 'Home' ? [{ type: 'warning' as const, text: 'Fixture console warning.' }] : [],
    requestFailures: options.navigationError
      ? [{ url, error: 'net::ERR_TIMED_OUT' }]
      : [],
    httpErrors: status !== null && status >= 400 ? [{ url, status }] : [],
    discoveredLinks: title === 'Home' ? ['https://aura-phase9.example/contact'] : [],
  };
}

function resultFor(jobId: string, prospectId: string) {
  const pages = [
    page('https://aura-phase9.example/', 'Home', 'JS rendered salon landing source text.'),
    page(
      'https://aura-phase9.example/contact',
      'Contact',
      '',
      { status: null, navigationError: 'PlaywrightTimeoutError: navigation failed safely.' },
    ),
  ];
  return {
    schemaVersion: 'playwright-research.v1' as const,
    jobId,
    prospectId,
    requestedUrl: 'https://aura-phase9.example/',
    capturedAt: NOW,
    pages,
    pageCount: pages.length,
    sourceOnly: true as const,
  };
}

async function createOwnedJob(
  db: D1DatabaseLike,
  record: JobRecord,
  payload: unknown,
): Promise<void> {
  await new JobRepository(db).createOrGet(record);
  await new JobContextRepository(db).createOrGet({
    jobId: record.id,
    userId: USER_ID,
    payloadJson: JSON.stringify(payload),
    resultJson: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

integration.get('/phase9', async (c) => {
  const db = c.env.DB;
  await db.prepare("DELETE FROM users WHERE id = 'phase9-user'").run();

  await new UserRepository(db).create({
    id: USER_ID,
    email: 'phase9@example.invalid',
    name: 'Phase 9 Fixture',
    createdAt: NOW,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(USER_ID, NOW);
  const prospects = new ProspectRepository(db);
  for (const [id, name, domain] of [
    [PROSPECT_ID, 'Aura Phase 9 Salon', 'aura-phase9.example'],
    [OTHER_PROSPECT_ID, 'Other Phase 9 Salon', 'other-phase9.example'],
  ] as const) {
    await prospects.create({
      id,
      campaignId: campaign.id,
      canonicalName: name,
      normalizedName: name.toLowerCase(),
      domain,
      phoneNormalized: null,
      city: 'mumbai',
      addressNormalized: null,
      niche: 'SALON_SPA',
      sourceFirstSeen: 'MANUAL',
      currentState: 'IDENTITY_VERIFIED',
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  const runners = new LocalRunnerRepository(db);
  const runner = await runners.registerOrRotate({
    id: RUNNER_ID,
    userId: USER_ID,
    name: 'Phase 9 Runner',
    tokenHash: await hashSessionToken(RAW_TOKEN),
    version: '0.1.0',
    capabilitiesJson: '["PLAYWRIGHT_RESEARCH"]',
    status: 'ACTIVE',
    lastHeartbeatAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    revokedAt: null,
  });

  await createOwnedJob(db, researchJob(JOB_ID, PROSPECT_ID), {
    url: 'https://aura-phase9.example/',
    maxPages: 2,
  });
  const runnerJobs = new RunnerJobRepository(db);
  const claim = await runnerJobs.claimNextForUser(
    USER_ID,
    runner.id,
    ACTIVE_LEASE,
    NOW,
  );

  const env = { DB: db, APP_ENV: 'test', WEB_ORIGIN: 'http://localhost:5173' };
  const completion = await productionApp.request(
    `http://local.test/api/v1/runner/research/jobs/${JOB_ID}/complete`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RAW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ result: resultFor(JOB_ID, PROSPECT_ID) }),
    },
    env,
  );
  const completionBody = (await completion.json()) as {
    sourcePersistence?: { sourceCount?: number };
  };

  const sourceRepo = new SourceRecordRepository(db);
  const sourcesAfterValid = await sourceRepo.listForProspect(PROSPECT_ID);
  const evidenceAfterValid = await new EvidenceRepository(db).listForProspect(PROSPECT_ID);
  const factsAfterValid = await new ProspectFactRepository(db).listForProspect(PROSPECT_ID);
  const completedJob = await new JobRepository(db).getById(JOB_ID);
  const completedContext = await new JobContextRepository(db).getByJobId(JOB_ID);

  const firstSource = sourcesAfterValid.find(
    (source) => source.sourceUrl === 'https://aura-phase9.example/',
  );
  let retrySourceReplaySafe = false;
  let retrySourceIdentityCollisionRejected = false;
  if (firstSource) {
    const replay = await sourceRepo.createOrGet({
      ...firstSource,
      rawJson: JSON.stringify({ retryCapture: true, changedDiagnostics: true }),
      capturedAt: '2026-09-03T14:31:00.000Z',
    });
    retrySourceReplaySafe =
      replay.created === false &&
      replay.source.id === firstSource.id &&
      replay.source.rawJson === firstSource.rawJson &&
      replay.source.capturedAt === firstSource.capturedAt;

    try {
      await sourceRepo.createOrGet({ ...firstSource, provider: 'COLLIDING_PROVIDER' });
    } catch {
      retrySourceIdentityCollisionRejected = true;
    }
  }

  await createOwnedJob(db, researchJob(BAD_JOB_ID, OTHER_PROSPECT_ID), {
    url: 'https://other-phase9.example/',
    maxPages: 1,
  });
  const badClaim = await runnerJobs.claimNextForUser(
    USER_ID,
    runner.id,
    ACTIVE_LEASE,
    '2026-09-03T14:31:00.000Z',
  );
  const badCompletion = await productionApp.request(
    `http://local.test/api/v1/runner/research/jobs/${BAD_JOB_ID}/complete`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RAW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ result: resultFor(BAD_JOB_ID, PROSPECT_ID) }),
    },
    env,
  );

  await createOwnedJob(db, researchJob(URL_MISMATCH_JOB_ID, OTHER_PROSPECT_ID), {
    url: 'https://other-phase9.example/',
    maxPages: 2,
  });
  const urlMismatchClaim = await runnerJobs.claimNextForUser(
    USER_ID,
    runner.id,
    ACTIVE_LEASE,
    '2026-09-03T14:32:00.000Z',
  );
  const urlMismatchCompletion = await productionApp.request(
    `http://local.test/api/v1/runner/research/jobs/${URL_MISMATCH_JOB_ID}/complete`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RAW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ result: resultFor(URL_MISMATCH_JOB_ID, OTHER_PROSPECT_ID) }),
    },
    env,
  );
  const malformedCompletion = await productionApp.request(
    `http://local.test/api/v1/runner/research/jobs/${URL_MISMATCH_JOB_ID}/complete`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RAW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    },
    env,
  );

  const otherSourcesAfterBad = await sourceRepo.listForProspect(OTHER_PROSPECT_ID);
  const foreignKeyViolations = await db.prepare('PRAGMA foreign_key_check').all();
  const migrationCount = await db
    .prepare('SELECT COUNT(*) AS count FROM d1_migrations')
    .first<{ count: number }>();

  return c.json({
    ok: true,
    migrationCount: migrationCount?.count ?? 0,
    checks: {
      researchJobClaimed: claim?.job.id === JOB_ID,
      completionAccepted: completion.status === 200,
      sourceUrlsStored:
        completionBody.sourcePersistence?.sourceCount === 2 &&
        sourcesAfterValid.some((source) => source.sourceUrl === 'https://aura-phase9.example/') &&
        sourcesAfterValid.some((source) => source.sourceUrl === 'https://aura-phase9.example/contact'),
      diagnosticsPersisted: sourcesAfterValid.some(
        (source) =>
          source.sourceUrl.endsWith('/contact') &&
          source.rawJson.includes('navigation failed safely') &&
          source.rawJson.includes('ERR_TIMED_OUT'),
      ),
      sourceMaterialOnly: evidenceAfterValid.length === 0 && factsAfterValid.length === 0,
      resultPersisted:
        completedJob?.status === 'COMPLETED' &&
        completedContext?.resultJson?.includes('playwright-research.v1') === true,
      retrySourceReplaySafe,
      retrySourceIdentityCollisionRejected,
      mismatchedProspectRejected:
        badClaim?.job.id === BAD_JOB_ID && badCompletion.status === 422,
      requestedUrlMismatchRejected:
        urlMismatchClaim?.job.id === URL_MISMATCH_JOB_ID && urlMismatchCompletion.status === 422,
      malformedCompletionRejected: malformedCompletion.status === 422,
      rejectedResultsPersistNothing: otherSourcesAfterBad.length === 0,
      noUnsupportedFactsGenerated:
        (await new EvidenceRepository(db).listForProspect(OTHER_PROSPECT_ID)).length === 0 &&
        (await new ProspectFactRepository(db).listForProspect(OTHER_PROSPECT_ID)).length === 0,
      foreignKeyViolations: foreignKeyViolations.results.length,
    },
  });
});

export default integration;
