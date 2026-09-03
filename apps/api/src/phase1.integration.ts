import { Hono } from 'hono';
import {
  AgentRunRepository,
  CampaignRepository,
  JobRepository,
  ProspectRepository,
  UserRepository,
  buildIdempotencyKey,
  type AgentRunRecord,
  type CampaignRecord,
  type D1DatabaseLike,
  type JobRecord,
  type ProspectRecord,
  type UserRecord,
} from '@shalcon/db';

interface Env {
  DB: D1DatabaseLike;
}

type Bindings = { Bindings: Env };

const app = new Hono<Bindings>();

const NOW = '2026-09-03T07:10:00.000Z';
const LEASE = '2026-09-03T07:15:00.000Z';

async function cleanup(db: D1DatabaseLike): Promise<void> {
  const statements = [
    db.prepare("DELETE FROM prospect_state_events WHERE prospect_id = 'fixture-prospect'"),
    db.prepare("DELETE FROM jobs WHERE entity_id = 'fixture-prospect'"),
    db.prepare("DELETE FROM agent_runs WHERE id = 'fixture-agent-run'"),
    db.prepare("DELETE FROM prospects WHERE id = 'fixture-prospect'"),
    db.prepare("DELETE FROM campaigns WHERE id = 'fixture-campaign'"),
    db.prepare("DELETE FROM users WHERE id = 'fixture-user'"),
  ];
  await db.batch(statements);
}

app.get('/phase1', async (c) => {
  const db = c.env.DB;
  await cleanup(db);

  const users = new UserRepository(db);
  const campaigns = new CampaignRepository(db);
  const prospects = new ProspectRepository(db);
  const jobs = new JobRepository(db);
  const agentRuns = new AgentRunRepository(db);

  const user: UserRecord = {
    id: 'fixture-user',
    email: 'phase1-fixture@example.invalid',
    name: 'Phase 1 Fixture',
    createdAt: NOW,
  };
  await users.create(user);

  const campaign: CampaignRecord = {
    id: 'fixture-campaign',
    userId: user.id,
    name: 'Mumbai Salon Fixture',
    niche: 'salon',
    status: 'DRAFT',
    city: 'Mumbai',
    approvalMode: 'MANUAL',
    createdAt: NOW,
    updatedAt: NOW,
  };
  await campaigns.create(campaign);

  const prospect: ProspectRecord = {
    id: 'fixture-prospect',
    campaignId: campaign.id,
    canonicalName: 'Fixture Salon',
    normalizedName: 'fixture salon',
    domain: null,
    phoneNormalized: null,
    city: 'Mumbai',
    niche: 'salon',
    sourceFirstSeen: 'fixture',
    currentState: 'DISCOVERED',
    createdAt: NOW,
    updatedAt: NOW,
  };
  await prospects.create(prospect);
  const normalized = await prospects.transition(prospect.id, 'NORMALIZED', NOW);

  let illegalTransitionRejected = false;
  try {
    await prospects.transition(prospect.id, 'SENT', NOW);
  } catch {
    illegalTransitionRejected = true;
  }

  const stateEvents = await prospects.listStateEvents(prospect.id);

  const idempotencyKey = buildIdempotencyKey({
    namespace: 'job',
    action: 'research',
    entityId: prospect.id,
    payload: { campaignId: campaign.id },
  });

  const job: JobRecord = {
    id: 'fixture-job-1',
    jobType: 'RESEARCH_PROSPECT',
    entityId: prospect.id,
    status: 'PENDING',
    priority: 10,
    idempotencyKey,
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

  const firstJob = await jobs.createOrGet(job);
  const duplicateJob = await jobs.createOrGet({ ...job, id: 'fixture-job-duplicate' });
  const claimed = await jobs.claim(firstJob.job.id, 'fixture-runner', LEASE, NOW);
  const completed = await jobs.complete(claimed.id, 'fixture-runner', NOW);

  const agentRun: AgentRunRecord = {
    id: 'fixture-agent-run',
    prospectId: prospect.id,
    campaignId: campaign.id,
    demoId: null,
    agentName: 'phase1-fixture-agent',
    agentVersion: '1',
    promptVersion: null,
    model: null,
    status: 'RUNNING',
    inputJson: JSON.stringify({ prospectId: prospect.id }),
    outputJson: null,
    startedAt: NOW,
    completedAt: null,
    errorCode: null,
    safeError: null,
  };
  await agentRuns.create(agentRun);
  const completedAgentRun = await agentRuns.complete(agentRun.id, JSON.stringify({ ok: true }), NOW);

  const migrationCount = await db
    .prepare('SELECT COUNT(*) AS count FROM d1_migrations')
    .first<{ count: number }>();
  const foreignKeyViolations = await db.prepare('PRAGMA foreign_key_check').all();

  return c.json({
    ok: true,
    migrationCount: migrationCount?.count ?? 0,
    repositoryChecks: {
      user: (await users.getById(user.id))?.email === user.email,
      campaign: (await campaigns.getById(campaign.id))?.niche === campaign.niche,
      prospectState: normalized.currentState,
      stateEventCount: stateEvents.length,
      illegalTransitionRejected,
      idempotentCreate: firstJob.created && !duplicateJob.created && duplicateJob.job.id === firstJob.job.id,
      jobCompleted: completed.status === 'COMPLETED',
      agentRunCompleted: completedAgentRun.status === 'COMPLETED',
      foreignKeyViolations: foreignKeyViolations.results.length,
    },
  });
});

export default app;
