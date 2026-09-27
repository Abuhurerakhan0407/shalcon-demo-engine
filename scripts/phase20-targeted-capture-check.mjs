import { setTimeout as sleep } from 'node:timers/promises';

const base = process.env.PHASE20_TARGETED_CAPTURE_BASE_URL ?? 'http://127.0.0.1:8812';

async function request(path, init, expectedStatus = 200) {
  const response = await globalThis.fetch(`${base}${path}`, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (response.status !== expectedStatus) {
    throw new Error(`${path} expected HTTP ${expectedStatus}, got ${response.status}: ${text}`);
  }
  return body;
}

async function waitForHealth() {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const health = await request('/phase20/health');
      if (health.ok === true && health.mode === 'TARGETED_CAPTURE_TEST') return;
    } catch (error) {
      lastError = error;
    }
    await sleep(400);
  }
  throw lastError instanceof Error ? lastError : new Error('Targeted capture fixture did not start.');
}

function post(body) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

await waitForHealth();
const fixture = await request('/phase20/fixture', { method: 'POST' }, 201);
if (fixture.trialResultsModified !== false) throw new Error('Fixture touched trial results.');

const wrongDomain = await request(
  '/phase20/targeted-capture',
  post({ prospectId: 'p20_target_pending', url: 'https://wrong.example/contact', maxPages: 1 }),
  409,
);
if (wrongDomain.error?.code !== 'TARGET_DOMAIN_MISMATCH') {
  throw new Error('Wrong-domain targeted capture did not fail closed.');
}

const wrongState = await request(
  '/phase20/targeted-capture',
  post({ prospectId: 'p20_target_researched', url: 'https://done.example/contact', maxPages: 1 }),
  409,
);
if (wrongState.error?.code !== 'TARGETED_CAPTURE_STATE_INVALID') {
  throw new Error('Non-pending prospect targeted capture did not fail closed.');
}

const queued = await request(
  '/phase20/targeted-capture',
  post({ prospectId: 'p20_target_pending', url: 'https://www.example.com/contact', maxPages: 1 }),
  201,
);
if (
  typeof queued.jobId !== 'string' ||
  queued.prospectId !== 'p20_target_pending' ||
  queued.state !== 'RESEARCH_PENDING' ||
  queued.trialResultsModified !== false
) {
  throw new Error(`Targeted capture queue response is invalid: ${JSON.stringify(queued)}`);
}

const duplicate = await request(
  '/phase20/targeted-capture',
  post({ prospectId: 'p20_target_pending', url: 'https://example.com/about', maxPages: 1 }),
  409,
);
if (duplicate.error?.code !== 'TARGETED_CAPTURE_ALREADY_ACTIVE') {
  throw new Error('Duplicate active targeted capture did not fail closed.');
}

const status = await request('/phase20/status');
const pending = status.prospects?.find((item) => item.id === 'p20_target_pending');
const researched = status.prospects?.find((item) => item.id === 'p20_target_researched');
const job = status.jobs?.[0];
const payload = job?.payload_json ? JSON.parse(job.payload_json) : null;
if (
  status.prospects?.length !== 2 ||
  pending?.currentState !== 'RESEARCH_PENDING' ||
  researched?.currentState !== 'RESEARCHED' ||
  status.jobs?.length !== 1 ||
  job?.job_type !== 'PLAYWRIGHT_RESEARCH' ||
  job?.entity_id !== 'p20_target_pending' ||
  job?.status !== 'PENDING' ||
  payload?.url !== 'https://www.example.com/contact' ||
  payload?.maxPages !== 1 ||
  status.foreignKeyViolations !== 0 ||
  status.trialResultsModified !== false
) {
  throw new Error(`Targeted capture persistence invariant failed: ${JSON.stringify(status)}`);
}

console.log(JSON.stringify({
  ok: true,
  domainGuard: true,
  stateGuard: true,
  activeJobGuard: true,
  stateTransitions: 0,
  queuedJobs: 1,
  foreignKeyViolations: 0,
  trialResultsModified: false,
}));
