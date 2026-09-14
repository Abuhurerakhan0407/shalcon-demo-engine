import { setTimeout as sleep } from 'node:timers/promises';

const base = process.env.PHASE20_REVIEW_BASE_URL ?? 'http://127.0.0.1:8808';

async function request(path, init, expectedStatus) {
  const response = await globalThis.fetch(`${base}${path}`, init);
  const text = await response.text();
  let body = null;
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
      if (response.status === 200 && body.ok === true && body.phase === 20) return;
      throw new Error(`Phase 20 evidence review worker returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Phase 20 evidence review integration worker did not become healthy.');
}

await waitForWorker();
await request('/phase20/fixture', { method: 'POST' }, 201);

const phone = await request(
  '/api/v1/prospects/p20_review/evidence/ev_p20_phone/review',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'VERIFY', promoteToFact: true, note: 'Fixture operator confirmed source.' }),
  },
  200,
);
if (
  phone.evidence?.verificationStatus !== 'VERIFIED' ||
  phone.fact?.verificationStatus !== 'VERIFIED' ||
  phone.fact?.evidenceId !== 'ev_p20_phone' ||
  phone.event?.decision !== 'VERIFY' ||
  phone.event?.promotedToFact !== true
) throw new Error('Verified phone review did not persist its evidence-backed canonical fact.');

const blockedMulti = await request(
  '/api/v1/prospects/p20_review/evidence/ev_p20_service/review',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'VERIFY', promoteToFact: true }),
  },
  409,
);
if (blockedMulti.error?.code !== 'MULTI_VALUE_FACT_PROMOTION_BLOCKED') {
  throw new Error('Multi-value fact promotion was not blocked explicitly.');
}

const service = await request(
  '/api/v1/prospects/p20_review/evidence/ev_p20_service/review',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'VERIFY', promoteToFact: false }),
  },
  200,
);
if (service.evidence?.verificationStatus !== 'VERIFIED' || service.fact !== null) {
  throw new Error('Multi-value evidence verification did not remain fact-neutral.');
}

const rejected = await request(
  '/api/v1/prospects/p20_review/evidence/ev_p20_reject/review',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'REJECT', note: 'Fixture operator rejected unsupported claim.' }),
  },
  200,
);
if (rejected.evidence?.verificationStatus !== 'REJECTED' || rejected.fact !== null) {
  throw new Error('Rejected evidence persisted an invalid fact.');
}

const conflict = await request(
  '/api/v1/prospects/p20_review/evidence/ev_p20_address_a/review',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'VERIFY', promoteToFact: true }),
  },
  409,
);
if (conflict.error?.code !== 'CRITICAL_EVIDENCE_CONFLICT') {
  throw new Error('Conflicting critical evidence was not blocked.');
}

const replay = await request(
  '/api/v1/prospects/p20_review/evidence/ev_p20_phone/review',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'VERIFY', promoteToFact: true }),
  },
  409,
);
if (replay.error?.code !== 'EVIDENCE_ALREADY_REVIEWED') {
  throw new Error('Evidence review replay did not fail closed.');
}

await request(
  '/api/v1/prospects/p20_other/evidence/ev_p20_phone/review',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'VERIFY', promoteToFact: false }),
  },
  404,
);

const reviews = await request('/api/v1/prospects/p20_review/evidence/reviews', undefined, 200);
if (!Array.isArray(reviews.events) || reviews.events.length !== 3) {
  throw new Error('Evidence review audit history is incomplete.');
}

const summary = await request('/phase20/summary', undefined, 200);
const status = new Map((summary.evidence ?? []).map((item) => [item.id, item.verificationStatus]));
if (
  status.get('ev_p20_phone') !== 'VERIFIED' ||
  status.get('ev_p20_service') !== 'VERIFIED' ||
  status.get('ev_p20_reject') !== 'REJECTED' ||
  status.get('ev_p20_address_a') !== 'PROBABLE' ||
  status.get('ev_p20_address_b') !== 'PROBABLE' ||
  summary.facts?.length !== 1 ||
  summary.facts[0]?.field !== 'phone' ||
  summary.facts[0]?.evidenceId !== 'ev_p20_phone' ||
  summary.events?.length !== 3 ||
  summary.foreignKeyViolations !== 0
) throw new Error('Evidence review integration summary failed its persistence invariants.');

console.log(JSON.stringify({ ok: true, phase: 20, reviewed: 3, foreignKeyViolations: 0 }));
