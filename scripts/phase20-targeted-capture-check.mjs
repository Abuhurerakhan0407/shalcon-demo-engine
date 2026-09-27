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

const invalidScheme = await request(
  '/phase20/targeted-capture',
  post({ prospectId: 'p20_target_pending', url: 'ftp://example.com/contact', maxPages: 1 }),
  400,
);
if (invalidScheme.error?.code !== 'VALIDATION_ERROR') {
  throw new Error('Non-HTTP targeted capture did not fail closed.');
}

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

const rerunWrongState = await request(
  '/phase20/targeted-rerun',
  post({ prospectId: 'p20_target_researched', sourceRecordId: 'src_p20_done_good' }),
  409,
);
if (rerunWrongState.error?.code !== 'TARGETED_RERUN_STATE_INVALID') {
  throw new Error('Non-pending existing-source rerun did not fail closed.');
}

const rerunWrongProspect = await request(
  '/phase20/targeted-rerun',
  post({ prospectId: 'p20_target_rerun', sourceRecordId: 'src_p20_done_good' }),
  409,
);
if (rerunWrongProspect.error?.code !== 'TARGETED_RERUN_SOURCE_INVALID') {
  throw new Error('Cross-prospect source rerun did not fail closed.');
}

const rerunOffDomain = await request(
  '/phase20/targeted-rerun',
  post({ prospectId: 'p20_target_rerun', sourceRecordId: 'src_p20_rerun_offdomain' }),
  409,
);
if (rerunOffDomain.error?.code !== 'TARGETED_RERUN_SOURCE_UNTRUSTED') {
  throw new Error('Off-domain existing-source rerun did not fail closed.');
}

const rerun = await request(
  '/phase20/targeted-rerun',
  post({ prospectId: 'p20_target_rerun', sourceRecordId: 'src_p20_rerun_good', model: 'qwen3:4b' }),
  202,
);
if (
  rerun.prospectId !== 'p20_target_rerun' ||
  rerun.sourceRecordId !== 'src_p20_rerun_good' ||
  rerun.state !== 'RESEARCH_PENDING' ||
  rerun.verifiedFactPromotion !== false ||
  rerun.trialResultsModified !== false ||
  rerun.run?.selectedSources?.length !== 1 ||
  rerun.run?.selectedSources?.[0]?.sourceId !== 'src_p20_rerun_good' ||
  rerun.run?.jobIds?.length !== 1
) {
  throw new Error(`Existing-source rerun response is invalid: ${JSON.stringify(rerun)}`);
}

const rerunDuplicate = await request(
  '/phase20/targeted-rerun',
  post({ prospectId: 'p20_target_rerun', sourceRecordId: 'src_p20_rerun_good' }),
  409,
);
if (rerunDuplicate.error?.code !== 'TARGETED_RERUN_ALREADY_ACTIVE') {
  throw new Error('Duplicate active existing-source rerun did not fail closed.');
}

const status = await request('/phase20/status');
const pending = status.prospects?.find((item) => item.id === 'p20_target_pending');
const researched = status.prospects?.find((item) => item.id === 'p20_target_researched');
const rerunProspect = status.prospects?.find((item) => item.id === 'p20_target_rerun');
const captureJob = status.jobs?.find((item) => item.job_type === 'PLAYWRIGHT_RESEARCH');
const extractJob = status.jobs?.find((item) => item.job_type === 'LOCAL_AI_EXTRACT');
const capturePayload = captureJob?.payload_json ? JSON.parse(captureJob.payload_json) : null;
const extractPayload = extractJob?.payload_json ? JSON.parse(extractJob.payload_json) : null;
const run = status.runs?.[0];
const selectedSources = run?.selected_sources_json ? JSON.parse(run.selected_sources_json) : null;
if (
  status.prospects?.length !== 3 ||
  pending?.currentState !== 'RESEARCH_PENDING' ||
  researched?.currentState !== 'RESEARCHED' ||
  rerunProspect?.currentState !== 'RESEARCH_PENDING' ||
  status.jobs?.length !== 2 ||
  captureJob?.entity_id !== 'p20_target_pending' ||
  captureJob?.status !== 'PENDING' ||
  capturePayload?.url !== 'https://www.example.com/contact' ||
  capturePayload?.maxPages !== 1 ||
  extractJob?.entity_id !== 'p20_target_rerun' ||
  extractJob?.status !== 'PENDING' ||
  extractPayload?.sourceRecordId !== 'src_p20_rerun_good' ||
  extractPayload?.scopedRun !== true ||
  extractPayload?.model !== 'qwen3:4b' ||
  status.runs?.length !== 1 ||
  run?.prospect_id !== 'p20_target_rerun' ||
  run?.status !== 'QUEUED' ||
  selectedSources?.length !== 1 ||
  selectedSources?.[0]?.sourceId !== 'src_p20_rerun_good' ||
  status.foreignKeyViolations !== 0 ||
  status.trialResultsModified !== false
) {
  throw new Error(`Targeted capture/rerun persistence invariant failed: ${JSON.stringify(status)}`);
}

console.log(
  JSON.stringify({
    ok: true,
    schemeGuard: true,
    domainGuard: true,
    stateGuard: true,
    activeJobGuard: true,
    existingSourceGuard: true,
    existingSourceDomainGuard: true,
    scopedRerunJobs: 1,
    stateTransitions: 0,
    queuedJobs: 2,
    foreignKeyViolations: 0,
    trialResultsModified: false,
  }),
);
