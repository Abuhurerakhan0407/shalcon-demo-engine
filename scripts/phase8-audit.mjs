import { access, readFile } from 'node:fs/promises';

const required = [
  'apps/api/migrations/0007_local_runner_jobs.sql',
  'apps/api/src/job-signal.ts',
  'apps/api/src/runner-routes.ts',
  'apps/api/src/phase8.integration.ts',
  'packages/db/src/repositories/runners.ts',
  'packages/db/src/repositories/runner-jobs.ts',
  'packages/db/src/repositories/runner-jobs.test.ts',
  'apps/local-runner/src/shalcon_runner/client.py',
  'apps/local-runner/src/shalcon_runner/worker.py',
  'apps/local-runner/tests/test_client.py',
  'apps/local-runner/tests/test_worker.py',
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
  'allowedJobTypes',
  'j.job_type IN',
  'renewLease',
  'completeWithResult',
  'this.db.batch',
  'lease_expires_at IS NOT NULL AND lease_expires_at > ?',
  "context.resultJson !== resultJson",
  'failWithRetry',
  "'DEAD_LETTER'",
]) {
  if (!runnerJobs.includes(contract)) throw new Error(`Missing Phase 8 job contract: ${contract}`);
}

const capabilityTest = await readFile('packages/db/src/repositories/runner-jobs.test.ts', 'utf8');
for (const contract of [
  'filters due jobs to the runner advertised job types',
  'does not query or claim any job when the runner advertises no capabilities',
  "['PLAYWRIGHT_RESEARCH', 'PHASE8_ECHO', 'PLAYWRIGHT_RESEARCH']",
]) {
  if (!capabilityTest.includes(contract)) throw new Error(`Missing runner capability test contract: ${contract}`);
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
  'const capabilities = parseCapabilities(runner.capabilitiesJson)',
  'capabilities,',
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

const client = await readFile('apps/local-runner/src/shalcon_runner/client.py', 'utf8');
for (const contract of [
  'Authorization',
  'Bearer',
  '/agent/heartbeat',
  '/agent/jobs/claim',
  '/complete',
  '/fail',
  '_validated_base_url',
  '_loopback_host',
  'requires HTTPS except for loopback',
]) {
  if (!client.includes(contract)) throw new Error(`Missing local runner client contract: ${contract}`);
}

const worker = await readFile('apps/local-runner/src/shalcon_runner/worker.py', 'utf8');
for (const contract of ['PHASE8_ECHO', 'UNSUPPORTED_JOB_TYPE', 'LOCAL_EXECUTION_FAILED', 'run_forever', 'if capabilities is None else list(capabilities)']) {
  if (!worker.includes(contract)) throw new Error(`Missing local execution safety contract: ${contract}`);
}

const workerTest = await readFile('apps/local-runner/tests/test_worker.py', 'utf8');
if (!workerTest.includes('test_explicit_empty_capabilities_stay_empty')) {
  throw new Error('Local runner does not test explicit empty capability advertisement.');
}

const integration = await readFile('apps/api/src/phase8.integration.ts', 'utf8');
for (const contract of [
  'duplicateCouldNotProcessTwice',
  'expiredLeaseRecovered',
  'permanentFailureDeadLettered',
  'expiredLeaseRenewalRejected',
  'expiredLeaseCompletionRejected',
  'expiredLeaseFailureRejected',
  'expiredLeaseResultNotPersisted',
  'staleOwnerCompletionRejected',
  'staleOwnerResultNotPersisted',
  'canonicalReclaimedCompletionAtomic',
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
