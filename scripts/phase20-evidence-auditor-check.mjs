import { setTimeout as sleep } from 'node:timers/promises';

const base = process.env.PHASE20_AUDITOR_BASE_URL ?? 'http://127.0.0.1:8811';

async function request(path, init, expectedStatus) {
  const response = await globalThis.fetch(`${base}${path}`, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  console.log(path, response.status, JSON.stringify(body));
  if (response.status !== expectedStatus) {
    throw new Error(`${path} expected HTTP ${expectedStatus}, received ${response.status}`);
  }
  return body;
}

async function waitForWorker(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await globalThis.fetch(`${base}/phase20/health`);
      const body = await response.json();
      if (response.status === 200 && body.ok === true && body.mode === 'EVIDENCE_AUDITOR') return;
      throw new Error(`Evidence auditor worker returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw lastError instanceof Error ? lastError : new Error('Evidence auditor worker did not become healthy.');
}

await waitForWorker();
await request('/phase20/fixture', { method: 'POST' }, 201);

const preview = await request('/api/v1/evidence-auditor/preview', undefined, 200);
if (
  preview.prospectCount !== 2 ||
  preview.safeActionCount !== 9 ||
  preview.autoRejectCount !== 3 ||
  preview.autoVerifyCount !== 6 ||
  preview.humanRequiredCount !== 2
) {
  throw new Error('Evidence auditor preview did not preserve the safe-action boundary.');
}

const auditPlan = preview.plans.find((plan) => plan.prospect.id === 'p20_audit');
const uncertainPlan = preview.plans.find((plan) => plan.prospect.id === 'p20_uncertain');
if (!auditPlan || !uncertainPlan) throw new Error('Evidence auditor plans are incomplete.');

const byId = new Map(auditPlan.recommendations.map((item) => [item.evidenceId, item]));
if (
  byId.get('ev_name_bad')?.action !== 'AUTO_REJECT' ||
  byId.get('ev_name_bad')?.reasonCode !== 'LOCKED_IDENTITY_CONFLICT' ||
  byId.get('ev_address_bad')?.action !== 'AUTO_REJECT' ||
  byId.get('ev_noise')?.reasonCode !== 'MALFORMED_TEXT' ||
  byId.get('ev_phone_good')?.action !== 'AUTO_VERIFY' ||
  byId.get('ev_address_good')?.promoteToFact !== true ||
  byId.get('ev_service_home')?.reasonCode !== 'MULTI_SOURCE_CORROBORATION' ||
  byId.get('ev_email_single')?.action !== 'HUMAN_REQUIRED'
) {
  throw new Error('Evidence auditor classified a fixture outside the intended safety policy.');
}
if (uncertainPlan.recommendations[0]?.action !== 'HUMAN_REQUIRED') {
  throw new Error('Single-source critical evidence was auto-decided without identity corroboration.');
}

const applied = await request(
  '/api/v1/evidence-auditor/apply-safe',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  },
  200,
);
if (
  applied.appliedCount !== 9 ||
  applied.skippedCount !== 0 ||
  applied.safeActionCount !== 0 ||
  applied.humanRequiredCount !== 2
) {
  throw new Error('Evidence auditor safe application did not converge to the expected exception queue.');
}

const replay = await request(
  '/api/v1/evidence-auditor/apply-safe',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  },
  200,
);
if (replay.appliedCount !== 0 || replay.safeActionCount !== 0 || replay.humanRequiredCount !== 2) {
  throw new Error('Evidence auditor replay was not idempotent.');
}

const summary = await request('/phase20/summary', undefined, 200);
const status = new Map((summary.evidence ?? []).map((item) => [item.id, item.verificationStatus]));
if (
  status.get('ev_name_good_home') !== 'VERIFIED' ||
  status.get('ev_name_good_contact') !== 'VERIFIED' ||
  status.get('ev_name_bad') !== 'REJECTED' ||
  status.get('ev_phone_good') !== 'VERIFIED' ||
  status.get('ev_address_good') !== 'VERIFIED' ||
  status.get('ev_address_bad') !== 'REJECTED' ||
  status.get('ev_noise') !== 'REJECTED' ||
  status.get('ev_service_home') !== 'VERIFIED' ||
  status.get('ev_service_contact') !== 'VERIFIED' ||
  status.get('ev_email_single') !== 'PROBABLE' ||
  summary.uncertainEvidence?.[0]?.verificationStatus !== 'PROBABLE' ||
  summary.auditProspectState !== 'RESEARCHED' ||
  summary.uncertainProspectState !== 'RESEARCH_PENDING' ||
  summary.facts?.length !== 3 ||
  summary.events?.length !== 9 ||
  summary.foreignKeyViolations !== 0
) {
  throw new Error('Evidence auditor persistence invariants failed.');
}

if (
  !summary.events.every(
    (event) => typeof event.note === 'string' && event.note.startsWith('AI Evidence Auditor · '),
  )
) {
  throw new Error('Automatic evidence decisions are not machine-labeled in the immutable trail.');
}

console.log(
  JSON.stringify({
    ok: true,
    phase: 20,
    safeActionsApplied: 9,
    remainingHumanExceptions: 2,
    lockedIdentityGuard: true,
    singleSourceCriticalGuard: true,
    idempotent: true,
    foreignKeyViolations: 0,
  }),
);
