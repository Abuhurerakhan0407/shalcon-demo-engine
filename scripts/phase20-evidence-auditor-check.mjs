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
  preview.prospectCount !== 3 ||
  preview.safeActionCount !== 17 ||
  preview.autoRejectCount !== 5 ||
  preview.autoVerifyCount !== 12 ||
  preview.humanRequiredCount !== 17
) {
  throw new Error('Evidence auditor preview did not preserve the safe-action boundary.');
}

const auditPlan = preview.plans.find((plan) => plan.prospect.id === 'p20_audit');
const uncertainPlan = preview.plans.find((plan) => plan.prospect.id === 'p20_uncertain');
const cleanPlan = preview.plans.find((plan) => plan.prospect.id === 'p20_clean');
if (!auditPlan || !uncertainPlan || !cleanPlan) {
  throw new Error('Evidence auditor plans are incomplete.');
}

const byId = new Map(auditPlan.recommendations.map((item) => [item.evidenceId, item]));
if (
  byId.get('ev_name_bad')?.action !== 'HUMAN_REQUIRED' ||
  byId.get('ev_name_bad')?.reasonCode !== 'BUSINESS_NAME_VARIANT_REQUIRES_HUMAN' ||
  byId.get('ev_name_good_home')?.action !== 'HUMAN_REQUIRED' ||
  byId.get('ev_name_good_contact')?.action !== 'HUMAN_REQUIRED' ||
  byId.get('ev_address_bad')?.action !== 'HUMAN_REQUIRED' ||
  byId.get('ev_address_bad')?.reasonCode !== 'BUSINESS_IDENTITY_UNANCHORED' ||
  byId.get('ev_noise')?.action !== 'AUTO_REJECT' ||
  byId.get('ev_noise')?.reasonCode !== 'MALFORMED_TEXT' ||
  byId.get('ev_phone_good')?.action !== 'HUMAN_REQUIRED' ||
  byId.get('ev_service_home')?.action !== 'HUMAN_REQUIRED' ||
  byId.get('ev_email_single')?.action !== 'HUMAN_REQUIRED'
) {
  throw new Error('Unanchored identity evidence escaped the human-only boundary.');
}

const cleanById = new Map(cleanPlan.recommendations.map((item) => [item.evidenceId, item]));
if (
  cleanById.get('ev_clean_name')?.action !== 'AUTO_VERIFY' ||
  cleanById.get('ev_clean_name')?.promoteToFact !== true ||
  cleanById.get('ev_clean_phone')?.action !== 'AUTO_VERIFY' ||
  cleanById.get('ev_clean_phone_alt')?.action !== 'AUTO_VERIFY' ||
  ![cleanById.get('ev_clean_phone')?.promoteToFact, cleanById.get('ev_clean_phone_alt')?.promoteToFact].includes(true) ||
  cleanById.get('ev_clean_address')?.action !== 'AUTO_VERIFY' ||
  cleanById.get('ev_clean_address')?.promoteToFact !== true ||
  cleanById.get('ev_clean_service_home')?.reasonCode !== 'OFFICIAL_DOMAIN_CORROBORATION' ||
  cleanById.get('ev_clean_email_home')?.reasonCode !== 'OFFICIAL_DOMAIN_CORROBORATION' ||
  cleanById.get('ev_clean_social_home')?.reasonCode !== 'OFFICIAL_DOMAIN_CORROBORATION' ||
  cleanById.get('ev_clean_hours_home')?.reasonCode !== 'OFFICIAL_DOMAIN_CORROBORATION' ||
  cleanById.get('ev_clean_offdomain_service')?.action !== 'HUMAN_REQUIRED' ||
  cleanById.get('ev_clean_offdomain_service')?.reasonCode !==
    'OFFICIAL_DOMAIN_CORROBORATION_REQUIRED' ||
  cleanById.get('ev_clean_repeat_service_home')?.action !== 'HUMAN_REQUIRED' ||
  cleanById.get('ev_clean_repeat_service_home')?.reasonCode !==
    'OFFICIAL_DOMAIN_CORROBORATION_REQUIRED' ||
  cleanById.get('ev_clean_repeat_service_same_page')?.action !== 'HUMAN_REQUIRED' ||
  cleanById.get('ev_clean_error_email_home')?.action !== 'AUTO_REJECT' ||
  cleanById.get('ev_clean_social_label_home')?.action !== 'AUTO_REJECT'
) {
  throw new Error('Official-domain or field-validation auditor guards failed.');
}
const uncertainById = new Map(
  uncertainPlan.recommendations.map((item) => [item.evidenceId, item]),
);
if (
  uncertainPlan.recommendations.length !== 4 ||
  uncertainPlan.recommendations.some((item) => item.action !== 'HUMAN_REQUIRED') ||
  uncertainById.get('ev_uncertain_name')?.reasonCode !==
    'OFFICIAL_DOMAIN_CORROBORATION_REQUIRED' ||
  uncertainById.get('ev_uncertain_phone')?.reasonCode !== 'BUSINESS_IDENTITY_UNANCHORED'
) {
  throw new Error('Listing-led identity escaped the human-only provenance boundary.');
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
  applied.appliedCount !== 17 ||
  applied.skippedCount !== 0 ||
  applied.safeActionCount !== 0 ||
  applied.humanRequiredCount !== 17
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
if (replay.appliedCount !== 0 || replay.safeActionCount !== 0 || replay.humanRequiredCount !== 17) {
  throw new Error('Evidence auditor replay was not idempotent.');
}

const summary = await request('/phase20/summary', undefined, 200);
const status = new Map((summary.evidence ?? []).map((item) => [item.id, item.verificationStatus]));
const cleanStatus = new Map(
  (summary.cleanEvidence ?? []).map((item) => [item.id, item.verificationStatus]),
);
if (
  status.get('ev_name_good_home') !== 'PROBABLE' ||
  status.get('ev_name_good_contact') !== 'PROBABLE' ||
  status.get('ev_name_bad') !== 'PROBABLE' ||
  status.get('ev_phone_good') !== 'PROBABLE' ||
  status.get('ev_address_good') !== 'PROBABLE' ||
  status.get('ev_address_bad') !== 'PROBABLE' ||
  status.get('ev_noise') !== 'REJECTED' ||
  status.get('ev_service_home') !== 'PROBABLE' ||
  status.get('ev_service_contact') !== 'PROBABLE' ||
  status.get('ev_email_single') !== 'PROBABLE' ||
  summary.uncertainEvidence?.length !== 2 ||
  summary.uncertainEvidence.some((item) => item.verificationStatus !== 'PROBABLE') ||
  cleanStatus.get('ev_clean_name') !== 'VERIFIED' ||
  cleanStatus.get('ev_clean_phone') !== 'VERIFIED' ||
  cleanStatus.get('ev_clean_phone_alt') !== 'VERIFIED' ||
  cleanStatus.get('ev_clean_address') !== 'VERIFIED' ||
  cleanStatus.get('ev_clean_service_home') !== 'VERIFIED' ||
  cleanStatus.get('ev_clean_service_contact') !== 'VERIFIED' ||
  cleanStatus.get('ev_clean_email_home') !== 'VERIFIED' ||
  cleanStatus.get('ev_clean_email_contact') !== 'VERIFIED' ||
  cleanStatus.get('ev_clean_social_home') !== 'VERIFIED' ||
  cleanStatus.get('ev_clean_social_contact') !== 'VERIFIED' ||
  cleanStatus.get('ev_clean_hours_home') !== 'VERIFIED' ||
  cleanStatus.get('ev_clean_hours_contact') !== 'VERIFIED' ||
  cleanStatus.get('ev_clean_offdomain_service') !== 'PROBABLE' ||
  cleanStatus.get('ev_clean_offdomain_service_two') !== 'PROBABLE' ||
  cleanStatus.get('ev_clean_repeat_service_home') !== 'PROBABLE' ||
  cleanStatus.get('ev_clean_repeat_service_same_page') !== 'PROBABLE' ||
  cleanStatus.get('ev_clean_error_email_home') !== 'REJECTED' ||
  cleanStatus.get('ev_clean_error_email_contact') !== 'REJECTED' ||
  cleanStatus.get('ev_clean_social_label_home') !== 'REJECTED' ||
  cleanStatus.get('ev_clean_social_label_contact') !== 'REJECTED' ||
  summary.auditProspectState !== 'RESEARCH_PENDING' ||
  summary.uncertainProspectState !== 'RESEARCH_PENDING' ||
  summary.cleanProspectState !== 'RESEARCH_PENDING' ||
  summary.facts?.length !== 0 ||
  summary.cleanFacts?.length !== 3 ||
  summary.events?.length !== 17 ||
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
    safeActionsApplied: 17,
    remainingHumanExceptions: 17,
    lockedIdentityGuard: true,
    criticalCorroborationGuard: true,
    businessIdentityAnchorGuard: true,
    officialDomainGuard: true,
    fieldValidationGuard: true,
    idempotent: true,
    foreignKeyViolations: 0,
  }),
);
