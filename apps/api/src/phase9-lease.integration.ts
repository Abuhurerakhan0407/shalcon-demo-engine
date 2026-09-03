import {
  CampaignRepository,
  JobContextRepository,
  JobRepository,
  LocalRunnerRepository,
  ProspectRepository,
  RunnerJobRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
  type JobRecord,
  type SourceRecord,
} from '@shalcon/db';
import { Hono } from 'hono';

import { hashSessionToken } from './auth';

interface Env { DB: D1DatabaseLike }
type Bindings = { Bindings: Env };
const integration = new Hono<Bindings>();

const USER_ID = 'phase9-lease-user';
const PROSPECT_ID = 'phase9-lease-prospect';
const RUNNER_ID = 'phase9-lease-runner';
const ACTIVE_JOB_ID = 'phase9-lease-active-job';
const EXPIRING_JOB_ID = 'phase9-lease-expiring-job';
const NOW = '2026-09-03T15:00:00.000Z';
const ACTIVE_LEASE = '2099-01-01T00:00:00.000Z';
const EXPIRED_AT = '2026-09-03T15:01:00.000Z';

function job(id: string): JobRecord {
  return {
    id,
    jobType: 'PLAYWRIGHT_RESEARCH',
    entityId: PROSPECT_ID,
    status: 'PENDING',
    priority: 10,
    idempotencyKey: `phase9-lease:${id}`,
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

function source(id: string, url: string): SourceRecord {
  return {
    id,
    prospectId: PROSPECT_ID,
    provider: 'PLAYWRIGHT',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: url,
    rawJson: JSON.stringify({ sourceOnly: true, url }),
    capturedAt: NOW,
  };
}

async function createOwnedJob(db: D1DatabaseLike, record: JobRecord): Promise<void> {
  await new JobRepository(db).createOrGet(record);
  await new JobContextRepository(db).createOrGet({
    jobId: record.id,
    userId: USER_ID,
    payloadJson: JSON.stringify({ url: 'https://lease-phase9.example/' }),
    resultJson: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

integration.get('/phase9-lease', async (c) => {
  const db = c.env.DB;
  await db.prepare("DELETE FROM users WHERE id = 'phase9-lease-user'").run();

  await new UserRepository(db).create({
    id: USER_ID,
    email: 'phase9-lease@example.invalid',
    name: 'Phase 9 Lease Fixture',
    createdAt: NOW,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(USER_ID, NOW);
  await new ProspectRepository(db).create({
    id: PROSPECT_ID,
    campaignId: campaign.id,
    canonicalName: 'Lease Phase 9 Salon',
    normalizedName: 'lease phase 9 salon',
    domain: 'lease-phase9.example',
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    niche: 'SALON_SPA',
    sourceFirstSeen: 'MANUAL',
    currentState: 'IDENTITY_VERIFIED',
    createdAt: NOW,
    updatedAt: NOW,
  });

  const runner = await new LocalRunnerRepository(db).registerOrRotate({
    id: RUNNER_ID,
    userId: USER_ID,
    name: 'Phase 9 Lease Runner',
    tokenHash: await hashSessionToken('rnr_phase9_lease_fixture_token_123456789'),
    version: '0.1.0',
    capabilitiesJson: '["PLAYWRIGHT_RESEARCH"]',
    status: 'ACTIVE',
    lastHeartbeatAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    revokedAt: null,
  });

  const jobs = new RunnerJobRepository(db);
  const sources = new SourceRecordRepository(db);

  await createOwnedJob(db, job(ACTIVE_JOB_ID));
  const activeClaim = await jobs.claimNextForUser(USER_ID, runner.id, ACTIVE_LEASE, NOW);
  const activeSource = await sources.createOrGetForActiveLease(
    source('src_phase9_active_lease', 'https://lease-phase9.example/active'),
    { jobId: ACTIVE_JOB_ID, userId: USER_ID, runnerId: runner.id, now: NOW },
  );

  await db
    .prepare("UPDATE jobs SET status = 'COMPLETED', lease_owner = NULL, lease_expires_at = NULL WHERE id = ?")
    .bind(ACTIVE_JOB_ID)
    .run();
  const postCompletionWrite = await sources.createOrGetForActiveLease(
    source('src_phase9_after_completion', 'https://lease-phase9.example/after-completion'),
    { jobId: ACTIVE_JOB_ID, userId: USER_ID, runnerId: runner.id, now: NOW },
  );

  await createOwnedJob(db, job(EXPIRING_JOB_ID));
  const expiringClaim = await jobs.claimNextForUser(USER_ID, runner.id, EXPIRED_AT, NOW);
  const expiredWrite = await sources.createOrGetForActiveLease(
    source('src_phase9_expired_lease', 'https://lease-phase9.example/expired'),
    { jobId: EXPIRING_JOB_ID, userId: USER_ID, runnerId: runner.id, now: EXPIRED_AT },
  );

  const stored = await sources.listForProspect(PROSPECT_ID);
  const foreignKeyViolations = await db.prepare('PRAGMA foreign_key_check').all();

  return c.json({
    ok: true,
    checks: {
      activeLeaseClaimed: activeClaim?.job.id === ACTIVE_JOB_ID,
      activeLeaseAllowsSourceWrite: activeSource?.created === true,
      completedJobBlocksSourceWrite: postCompletionWrite === null,
      expiringJobClaimed: expiringClaim?.job.id === EXPIRING_JOB_ID,
      expiredLeaseBlocksSourceWrite: expiredWrite === null,
      staleSourceRowsAbsent:
        stored.length === 1 && stored[0]?.id === 'src_phase9_active_lease',
      foreignKeyViolations: foreignKeyViolations.results.length,
    },
  });
});

export default integration;
