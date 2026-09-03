import { access, readFile } from 'node:fs/promises';

const required = [
  'apps/api/migrations/0007_local_runner_jobs.sql',
  'apps/api/src/job-signal.ts',
  'apps/api/src/runner-routes.ts',
  'apps/api/src/phase8.integration.ts',
  'packages/db/src/repositories/runners.ts',
  'packages/db/src/repositories/runner-jobs.ts',
  'apps/local-runner/src/shalcon_runner/client.py',
  'apps/local-runner/src/shalcon_runner/worker.py',
  'scripts/verify-phase8-d1.mjs',
];
for (const path of required) await access(path);

const migration = await readFile('apps/api/migrations/0007_local_runner_jobs.sql', 'utf8');
for (const contract of ['CREATE TABLE local_runners', 'token_hash TEXT NOT NULL UNIQUE', 'CREATE TABLE job_contexts', 'FOREIGN KEY (job_id) REFERENCES jobs(id)']) {
  if (!migration.includes(contract)) throw new Error(`Missing Phase 8 DB contract: ${contract}`);
}

const runnerJobs = await readFile('packages/db/src/repositories/runner-jobs.ts', 'utf8');
for (const contract of [
  'reconcileExpiredLeases',
  'dueForSignal',
  'claimNextForUser',
  'renewLease',
  'completeWithResult',
  'failWithRetry',
  "'DEAD_LETTER'",
]) {
  if (!runnerJobs.includes(contract)) throw new Error(`Missing Phase 8 job contract: ${contract}`);
}

const routes = await readFile('apps/api/src/runner-routes.ts', 'utf8');
for (const contract of [
  "runnerRoutes.post('/operator/register'",
  'tokenShownOnce: true',
  "runnerRoutes.get('/operator/status'",
  "runnerRoutes.post('/operator/jobs'",
  "runnerRoutes.post('/operator/reconcile'",
  "runnerRoutes.post('/agent/heartbeat'",
  "runnerRoutes.post('/agent/jobs/claim'",
  "runnerRoutes.post('/agent/jobs/:jobId/renew'",
  "runnerRoutes.post('/agent/jobs/:jobId/complete'",
  "runnerRoutes.post('/agent/jobs/:jobId/fail'",
]) {
  if (!routes.includes(contract)) throw new Error(`Missing Phase 8 runner API contract: ${contract}`);
}

const signal = await readFile('apps/api/src/job-signal.ts', 'utf8');
if (!signal.includes("return 'D1_ONLY'")) throw new Error('Queue failure does not preserve D1 canonical state.');
if (!signal.includes("return 'SIGNALLED'")) throw new Error('Queue signal adapter is missing.');

const api = await readFile('apps/api/src/index.ts', 'utf8');
if (!api.includes("app.use('/api/v1/runner/operator/*', requireAuth)")) throw new Error('Runner operator routes are not session protected.');
if (!api.includes("app.route('/api/v1/runner', runnerRoutes)")) throw new Error('Runner routes are not mounted.');
if (!api.includes('phase: 8')) throw new Error('API does not report Phase 8.');

const client = await readFile('apps/local-runner/src/shalcon_runner/client.py', 'utf8');
for (const contract of ['Authorization', 'Bearer', '/agent/heartbeat', '/agent/jobs/claim', '/complete', '/fail']) {
  if (!client.includes(contract)) throw new Error(`Missing local runner client contract: ${contract}`);
}

const worker = await readFile('apps/local-runner/src/shalcon_runner/worker.py', 'utf8');
for (const contract of ['PHASE8_ECHO', 'UNSUPPORTED_JOB_TYPE', 'LOCAL_EXECUTION_FAILED', 'run_forever']) {
  if (!worker.includes(contract)) throw new Error(`Missing local execution safety contract: ${contract}`);
}

const integration = await readFile('apps/api/src/phase8.integration.ts', 'utf8');
for (const contract of [
  'duplicateCouldNotProcessTwice',
  'expiredLeaseRecovered',
  'permanentFailureDeadLettered',
  'missingSignalDiscoverable',
  'queueSignalRecreated',
  'restartRecoveredOfflineJob',
  'crossOperatorIsolation',
  'tokenRevocationWorks',
]) {
  if (!integration.includes(contract)) throw new Error(`Missing Phase 8 integration acceptance: ${contract}`);
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
if (!packageJson.scripts?.['test:phase8:d1'] || !packageJson.scripts?.['test:phase8:audit'] || !packageJson.scripts?.['test:phase8']) {
  throw new Error('Permanent Phase 8 scripts are missing.');
}

console.log('Phase 8 audit passed.');
