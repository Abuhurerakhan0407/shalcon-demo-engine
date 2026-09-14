import { readFile } from 'node:fs/promises';

const base = process.env.PHASE20_OPERATOR_BASE_URL ?? 'http://127.0.0.1:8787';
const runnerToken = process.env.SHALCON_RUNNER_TOKEN;
if (!runnerToken || runnerToken.length < 24) {
  throw new Error('Set SHALCON_RUNNER_TOKEN to a local Phase 20 runner token with at least 24 characters.');
}

const trialUrl = new globalThis.URL('../docs/phase20-salon-accuracy-trial.json', import.meta.url);
const trial = JSON.parse(await readFile(trialUrl, 'utf8'));
if (trial.phase !== 20 || !Array.isArray(trial.prospects) || trial.prospects.length !== 20) {
  throw new Error('Phase 20 operator seed requires the locked 20-prospect trial cohort.');
}
if (trial.prospects.some((prospect) => prospect.result !== null)) {
  throw new Error('Refusing to seed from a trial file that already contains result mutations.');
}

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
    throw new Error(`${path} expected HTTP ${expectedStatus}, received ${response.status}: ${text}`);
  }
  return body;
}

const health = await request('/phase20/operator-health');
if (health?.ok !== true || health.phase !== 20 || health.productionAllowed !== false) {
  throw new Error('Phase 20 local operator shell is not healthy or is not fail-closed for production.');
}

const existing = await request('/api/v1/prospects');
if (!Array.isArray(existing.prospects)) throw new Error('Phase 20 operator prospect list is unavailable.');
if (existing.prospects.length !== 0) {
  throw new Error(
    `Phase 20 operator D1 already contains ${existing.prospects.length} prospect(s). Use a fresh operator workspace for the locked trial.`,
  );
}

const candidates = trial.prospects.map((prospect) => ({
  id: prospect.id,
  businessName: prospect.businessName,
  location: prospect.location,
  sourceUrl: prospect.sourceUrl,
  officialWebsite: prospect.officialWebsite ?? null,
}));

const created = [];
for (let index = 0; index < candidates.length; index += 3) {
  const batch = candidates.slice(index, index + 3);
  const result = await request(
    '/phase20/setup',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidates: batch, runnerToken }),
    },
    201,
  );
  if (result.trialResultsModified !== false || result.created?.length !== batch.length) {
    throw new Error(`Phase 20 setup batch ${Math.floor(index / 3) + 1} failed its trial-safety invariant.`);
  }
  created.push(...result.created);
}

const prospects = await request('/api/v1/prospects');
const status = await request('/phase20/status');
if (
  created.length !== 20 ||
  prospects.prospects?.length !== 20 ||
  status.prospects?.length !== 20 ||
  status.foreignKeyViolations !== 0 ||
  status.trialResultsModified !== false
) {
  throw new Error('Phase 20 operator seed did not persist the locked cohort cleanly.');
}

console.log(JSON.stringify({
  ok: true,
  phase: 20,
  seeded: created.length,
  researchJobs: status.researchJobs?.length ?? 0,
  trialResultsModified: false,
}, null, 2));
