import {
  JobContextRepository,
  JobRepository,
  LocalRunnerRepository,
  RunnerJobRepository,
  UserRepository,
  type D1DatabaseLike,
  type JobRecord,
  type LocalRunnerRecord,
} from '@shalcon/db';
import { Hono } from 'hono';

import { signalJob, type JobSignalMessage } from './job-signal';

interface Env { DB: D1DatabaseLike }
type Bindings = { Bindings: Env };
const integration = new Hono<Bindings>();

const USER_ID = 'phase8-user';
const OTHER_USER_ID = 'phase8-other-user';
const NOW = '2026-09-03T12:00:00.000Z';
const AFTER_CRASH = '2026-09-03T12:02:00.000Z';
const LATER = '2026-09-03T12:05:00.000Z';

function runner(id: string, userId: string, tokenHash: string): LocalRunnerRecord {
  return {
    id,
    userId,
    name: id,
    tokenHash,
    version: '0.1.0',
    capabilitiesJson: '["PHASE8_ECHO"]',
    status: 'ACTIVE',
    lastHeartbeatAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    revokedAt: null,
  };
}

function job(id: string, entityId: string, maxAttempts = 3): JobRecord {
  return {
    id,
    jobType: 'PHASE8_ECHO',
    entityId,
    status: 'PENDING',
    priority: 10,
    idempotencyKey: `phase8:${id}`,
    attempts: 0,
    maxAttempts,
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

async function createOwnedJob(db: D1DatabaseLike, record: JobRecord, userId: string, payload: unknown) {
  const created = await new JobRepository(db).createOrGet(record);
  await new JobContextRepository(db).createOrGet({
    jobId: created.job.id,
    userId,
    payloadJson: JSON.stringify(payload),
    resultJson: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return created.job;
}

integration.get('/phase8', async (c) => {
  const db = c.env.DB;
  await db.prepare("DELETE FROM users WHERE id IN ('phase8-user', 'phase8-other-user')").run();

  const users = new UserRepository(db);
  await users.create({ id: USER_ID, email: 'phase8@example.invalid', name: 'Phase 8', createdAt: NOW });
  await users.create({ id: OTHER_USER_ID, email: 'phase8-other@example.invalid', name: 'Phase 8 Other', createdAt: NOW });

  const runnerRepo = new LocalRunnerRepository(db);
  const runnerOne = await runnerRepo.registerOrRotate(runner('phase8-runner-1', USER_ID, 'phase8-token-hash-1'));
  const runnerTwo = await runnerRepo.registerOrRotate(runner('phase8-runner-2', USER_ID, 'phase8-token-hash-2'));
  const otherRunner = await runnerRepo.registerOrRotate(runner('phase8-runner-other', OTHER_USER_ID, 'phase8-token-hash-other'));
  await runnerRepo.heartbeat(runnerOne.id, '0.1.0', '["PHASE8_ECHO"]', NOW);

  const jobs = new RunnerJobRepository(db);
  await createOwnedJob(db, job('phase8-crash-job', 'salon-crash'), USER_ID, { scenario: 'crash-recovery' });

  const firstClaim = await jobs.claimNextForUser(
    USER_ID,
    runnerOne.id,
    '2026-09-03T12:01:00.000Z',
    NOW,
  );
  const competingClaim = await jobs.claimNextForUser(
    USER_ID,
    runnerTwo.id,
    '2026-09-03T12:01:00.000Z',
    NOW,
  );

  const recovered = await jobs.reconcileExpiredLeases(USER_ID, AFTER_CRASH);
  const restartClaim = await jobs.claimNextForUser(
    USER_ID,
    runnerTwo.id,
    '2026-09-03T12:04:00.000Z',
    AFTER_CRASH,
  );
  const failedTwice = restartClaim
    ? await jobs.failWithRetry(
        restartClaim.job.id,
        USER_ID,
        runnerTwo.id,
        'TEST_FAILURE_2',
        'Controlled retry failure.',
        AFTER_CRASH,
        AFTER_CRASH,
      )
    : null;
  const thirdClaim = await jobs.claimNextForUser(
    USER_ID,
    runnerTwo.id,
    '2026-09-03T12:04:30.000Z',
    AFTER_CRASH,
  );
  const deadLetter = thirdClaim
    ? await jobs.failWithRetry(
        thirdClaim.job.id,
        USER_ID,
        runnerTwo.id,
        'TEST_FAILURE_3',
        'Controlled permanent failure.',
        LATER,
        LATER,
      )
    : null;

  const offline = await createOwnedJob(
    db,
    job('phase8-offline-job', 'salon-offline'),
    USER_ID,
    { scenario: 'runner-offline' },
  );
  const noQueueSignal = await signalJob(undefined, {
    jobId: offline.id,
    userId: USER_ID,
    jobType: offline.jobType,
  });
  const dueAfterMissingSignal = await jobs.dueForSignal(USER_ID, LATER);
  const recreatedSignals: JobSignalMessage[] = [];
  const recreatedSignal = await signalJob(
    {
      send(message) {
        recreatedSignals.push(message as JobSignalMessage);
        return Promise.resolve();
      },
    },
    { jobId: offline.id, userId: USER_ID, jobType: offline.jobType },
  );

  const restartedRunner = await runnerRepo.registerOrRotate(
    runner('phase8-runner-restarted', USER_ID, 'phase8-token-hash-restarted'),
  );
  const offlineClaim = await jobs.claimNextForUser(
    USER_ID,
    restartedRunner.id,
    '2026-09-03T12:07:00.000Z',
    LATER,
  );
  const completed = offlineClaim
    ? await jobs.completeWithResult(
        offlineClaim.job.id,
        USER_ID,
        restartedRunner.id,
        JSON.stringify({ ok: true, recoveredAfterRestart: true }),
        LATER,
      )
    : null;

  await createOwnedJob(db, job('phase8-other-job', 'other-salon'), OTHER_USER_ID, { owner: 'other' });
  const wrongUserClaim = await jobs.claimNextForUser(
    USER_ID,
    restartedRunner.id,
    '2026-09-03T12:08:00.000Z',
    LATER,
  );
  const otherUserClaim = await jobs.claimNextForUser(
    OTHER_USER_ID,
    otherRunner.id,
    '2026-09-03T12:08:00.000Z',
    LATER,
  );

  const activeBeforeRevoke = await runnerRepo.getActiveByTokenHash('phase8-token-hash-restarted');
  await runnerRepo.revoke(restartedRunner.id, USER_ID, LATER);
  const activeAfterRevoke = await runnerRepo.getActiveByTokenHash('phase8-token-hash-restarted');
  const deadLetters = await jobs.deadLettersForUser(USER_ID);
  const storedOffline = await new JobRepository(db).getById(offline.id);
  const completedContext = await new JobContextRepository(db).getByJobId(offline.id);
  const migrationCount = await db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>();
  const foreignKeyViolations = await db.prepare('PRAGMA foreign_key_check').all();

  return c.json({
    ok: true,
    migrationCount: migrationCount?.count ?? 0,
    checks: {
      firstRunnerClaimed: firstClaim?.job.id === 'phase8-crash-job',
      duplicateCouldNotProcessTwice: competingClaim === null,
      expiredLeaseRecovered: recovered.some((item) => item.id === 'phase8-crash-job' && item.attempts === 1),
      restartRunnerReclaimed: restartClaim?.job.id === 'phase8-crash-job' && restartClaim.job.leaseOwner === runnerTwo.id,
      retryStayedRetryable: failedTwice?.status === 'FAILED' && failedTwice.attempts === 2,
      permanentFailureDeadLettered: deadLetter?.status === 'DEAD_LETTER' && deadLetter.attempts === 3,
      deadLetterVisible: deadLetters.some((item) => item.id === 'phase8-crash-job'),
      offlineJobStayedCanonical: noQueueSignal === 'D1_ONLY' && storedOffline?.status === 'COMPLETED',
      missingSignalDiscoverable: dueAfterMissingSignal.some((item) => item.id === offline.id),
      queueSignalRecreated: recreatedSignal === 'SIGNALLED' && recreatedSignals.some((item) => item.jobId === offline.id),
      restartRecoveredOfflineJob: completed?.job.status === 'COMPLETED',
      completionResultPersisted: completedContext?.resultJson?.includes('recoveredAfterRestart') === true,
      crossOperatorIsolation: wrongUserClaim === null && otherUserClaim?.job.id === 'phase8-other-job',
      runnerHeartbeatPersisted: (await runnerRepo.getByIdForUser(runnerOne.id, USER_ID))?.lastHeartbeatAt === NOW,
      tokenRevocationWorks: activeBeforeRevoke?.id === restartedRunner.id && activeAfterRevoke === null,
      foreignKeyViolations: foreignKeyViolations.results.length,
    },
  });
});

export default integration;
