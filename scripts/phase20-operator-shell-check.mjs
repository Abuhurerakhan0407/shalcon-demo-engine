import { setTimeout as sleep } from 'node:timers/promises';

const base = process.env.PHASE20_OPERATOR_BASE_URL ?? 'http://127.0.0.1:8809';
const runnerToken = 'phase20-operator-check-token-0001';

async function request(path, init, expectedStatus = 200) {
  const response = await globalThis.fetch(`${base}${path}`, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (response.status !== expectedStatus) {
    throw new Error(
      `${path} expected HTTP ${expectedStatus}, received ${response.status}: ${text}`,
    );
  }
  return body;
}

async function waitForWorker(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const body = await request('/phase20/operator-health');
      if (body?.ok === true && body.phase === 20 && body.productionAllowed === false) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Phase 20 operator shell did not become healthy.');
}

function setupBody(id, businessName, sourceUrl, officialWebsite) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      candidates: [{ id, businessName, location: 'Mumbai', sourceUrl, officialWebsite }],
      runnerToken,
    }),
  };
}

await waitForWorker();

const session = await request('/api/v1/auth/session');
if (session.user?.id !== 'phase20-live-research-user') {
  throw new Error('Local operator session did not expose the isolated Phase 20 operator.');
}

const first = await request(
  '/phase20/setup',
  setupBody('p20-op-a', 'Phase 20 Operator A', 'https://example.com/', 'https://example.com/'),
  201,
);
const second = await request(
  '/phase20/setup',
  setupBody('p20-op-b', 'Phase 20 Operator B', 'https://example.org/', 'https://example.org/'),
  201,
);
if (
  first.created?.length !== 1 ||
  second.created?.length !== 1 ||
  first.trialResultsModified !== false ||
  second.trialResultsModified !== false
) {
  throw new Error('Batched operator setup did not remain idempotent and trial-safe.');
}

const prospects = await request('/api/v1/prospects');
if (!Array.isArray(prospects.prospects) || prospects.prospects.length !== 2) {
  throw new Error('Local operator prospect list did not expose both setup batches.');
}

const prospectId = first.created[0]?.prospectId;
if (typeof prospectId !== 'string')
  throw new Error('First operator setup did not return a prospect id.');
const researchNotReady = await request(
  `/api/v1/research/prospects/${prospectId}/runs`,
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
  409,
);
if (researchNotReady.error?.code !== 'RESEARCH_NOT_READY') {
  throw new Error('Local operator research rerun route is unavailable or did not fail closed.');
}
const bundle = await request(`/api/v1/prospects/${prospectId}/evidence-bundle`);
if (
  bundle.prospect?.id !== prospectId ||
  !Array.isArray(bundle.evidence) ||
  !Array.isArray(bundle.conflicts)
) {
  throw new Error('Local operator evidence bundle route is unavailable.');
}

const status = await request('/phase20/status');
if (
  status.trialResultsModified !== false ||
  status.foreignKeyViolations !== 0 ||
  status.prospects?.length !== 2
) {
  throw new Error('Local operator status failed its persistence or trial-safety invariants.');
}

console.log(JSON.stringify({ ok: true, phase: 20, prospects: 2, trialResultsModified: false }));
