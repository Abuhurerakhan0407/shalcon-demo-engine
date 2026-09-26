const base = process.env.PHASE20_OPERATOR_BASE_URL ?? 'http://127.0.0.1:8787';
const baseUrl = new globalThis.URL(base);
if (!new Set(['127.0.0.1', 'localhost']).has(baseUrl.hostname)) {
  throw new Error('Phase 20 deterministic cleanup is local-operator only.');
}

const apply = process.argv.includes('--apply');
const expectArg = process.argv.find((arg) => arg.startsWith('--expect='));
const expectedCount = expectArg ? Number(expectArg.slice('--expect='.length)) : null;

async function request(path, init) {
  const response = await globalThis.fetch(`${base}${path}`, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${text}`);
  return body;
}

function normalizedField(value) {
  return value.trim().toLocaleLowerCase('en-IN').replace(/[^a-z0-9]/gu, '');
}

function normalizedHost(url) {
  try {
    return new URL(url).hostname.toLocaleLowerCase('en-US').replace(/^www\./u, '');
  } catch {
    return null;
  }
}

function deterministicJunkRule(evidence) {
  const field = normalizedField(evidence.field);
  const value = evidence.value.trim();
  let url;
  try {
    url = new URL(evidence.sourceUrl);
  } catch {
    url = null;
  }

  if (
    field === 'businessname' &&
    normalizedHost(evidence.sourceUrl) === 'google.com' &&
    url?.pathname.toLocaleLowerCase('en-US').includes('/maps/contrib/')
  ) {
    return 'GOOGLE_MAPS_CONTRIBUTOR_AS_BUSINESS_NAME';
  }

  if (/^(?:we['’]?re verifying your browser|vercel security checkpoint)$/iu.test(value)) {
    return 'ANTI_BOT_CHECKPOINT_TEXT';
  }

  if (field === 'email' && /^[a-z0-9.-]+\.[a-z]{2,}$/iu.test(value)) {
    return 'DOMAIN_MISCLASSIFIED_AS_EMAIL';
  }

  if ((field === 'sociallink' || field === 'sociallinks') && /^(?:website|map)$/iu.test(value)) {
    return 'UI_LABEL_MISCLASSIFIED_AS_SOCIAL_LINK';
  }

  if (
    (field === 'sociallink' || field === 'sociallinks') &&
    /^[a-z]{3}\d::\d+-[a-z0-9_-]+$/iu.test(value)
  ) {
    return 'VERCEL_REQUEST_ID_MISCLASSIFIED_AS_SOCIAL_LINK';
  }

  return null;
}

const [health, prospectList, beforeStatus] = await Promise.all([
  request('/phase20/operator-health'),
  request('/api/v1/prospects'),
  request('/phase20/status'),
]);
if (health?.ok !== true || health.phase !== 20 || health.productionAllowed !== false) {
  throw new Error('Phase 20 local operator shell is not fail-closed.');
}
if (beforeStatus.trialResultsModified !== false || beforeStatus.foreignKeyViolations !== 0) {
  throw new Error('Refusing deterministic cleanup from a dirty Phase 20 workspace.');
}

const beforeStates = new Map(
  (beforeStatus.prospects ?? []).map((prospect) => [prospect.id, prospect.currentState]),
);
const candidates = [];
for (const prospect of prospectList.prospects ?? []) {
  const bundle = await request(`/api/v1/prospects/${prospect.id}/evidence-bundle`);
  for (const evidence of bundle.evidence ?? []) {
    if (!new Set(['PROBABLE', 'UNVERIFIED']).has(evidence.verificationStatus)) continue;
    const rule = deterministicJunkRule(evidence);
    if (!rule) continue;
    candidates.push({
      prospectId: prospect.id,
      prospectName: prospect.canonicalName,
      evidenceId: evidence.id,
      field: evidence.field,
      value: evidence.value,
      sourceUrl: evidence.sourceUrl,
      rule,
    });
  }
}

const ruleCounts = {};
for (const candidate of candidates) {
  ruleCounts[candidate.rule] = (ruleCounts[candidate.rule] ?? 0) + 1;
}
console.log(JSON.stringify({
  ok: true,
  mode: apply ? 'APPLY_REQUESTED' : 'PREVIEW_ONLY',
  candidateCount: candidates.length,
  ruleCounts,
  candidates,
}, null, 2));

if (!apply) process.exit(0);
if (!Number.isInteger(expectedCount) || expectedCount < 0) {
  throw new Error('--apply requires an integer --expect=<candidate-count>.');
}
if (candidates.length !== expectedCount) {
  throw new Error(`Candidate count changed: expected ${expectedCount}, found ${candidates.length}. Nothing applied.`);
}

let appliedCount = 0;
for (const candidate of candidates) {
  await request(
    `/api/v1/prospects/${candidate.prospectId}/evidence/${candidate.evidenceId}/review`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decision: 'REJECT',
        note: `AI deterministic junk cleanup · ${candidate.rule}`,
      }),
    },
  );
  appliedCount += 1;
}

const afterStatus = await request('/phase20/status');
if (afterStatus.trialResultsModified !== false || afterStatus.foreignKeyViolations !== 0) {
  throw new Error('Post-cleanup Phase 20 workspace failed integrity guards.');
}
for (const prospect of afterStatus.prospects ?? []) {
  if (beforeStates.get(prospect.id) !== prospect.currentState) {
    throw new Error(`Prospect state changed during deterministic cleanup: ${prospect.id}.`);
  }
}

console.log(JSON.stringify({
  ok: true,
  appliedCount,
  stateTransitions: 0,
  trialResultsModified: false,
  foreignKeyViolations: 0,
}, null, 2));
