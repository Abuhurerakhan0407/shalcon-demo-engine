import { readFile } from 'node:fs/promises';

async function text(path) { return readFile(path, 'utf8'); }
function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`Phase 19 audit missing ${label}.`);
}
function requirePhaseAtLeast(source, minimum) {
  const match = source.match(/CURRENT_PHASE\s*=\s*(\d+)/u);
  const phase = Number(match?.[1] ?? 0);
  if (!Number.isInteger(phase) || phase < minimum) {
    throw new Error(`Phase 19 audit requires runtime phase >= ${minimum}; found ${phase || 'unknown'}.`);
  }
}

const [
  migration,
  engine,
  routes,
  automatedRoutes,
  integration,
  verifier,
  phase,
  renderer,
  stateMachine,
  qaPage,
  app,
  qaE2e,
] = await Promise.all([
  text('apps/api/migrations/0015_fact_sales_qa.sql'),
  text('apps/api/src/fact-sales-qa.ts'),
  text('apps/api/src/fact-sales-qa-routes.ts'),
  text('apps/api/src/automated-demo-routes.ts'),
  text('apps/api/src/phase19.integration.ts'),
  text('scripts/verify-phase19-d1.mjs'),
  text('apps/api/src/phase.ts'),
  text('apps/api/src/demo-renderer.ts'),
  text('packages/state-machine/src/index.ts'),
  text('apps/web/src/qa/Phase19QaPage.tsx'),
  text('apps/web/src/App.tsx'),
  text('tests/e2e/phase19-qa.spec.ts'),
]);

for (const [needle, label] of [
  ['CREATE TABLE IF NOT EXISTS demo_qa_issues', 'structured QA issue ledger'],
  ["severity IN ('BLOCKING', 'REVIEW')", 'blocking/review severity contract'],
  ["status IN ('OPEN', 'RESOLVED', 'WAIVED')", 'issue resolution lifecycle'],
  ['demo_qa_issue_run_demo_guard', 'issue/run/demo ownership guard'],
  ['CREATE TABLE IF NOT EXISTS demo_sales_approvals', 'human sales approval ledger'],
  ["decision IN ('APPROVED', 'REJECTED')", 'explicit human decision contract'],
  ['UNIQUE(qa_run_id)', 'one approval per sales QA run'],
  ['demo_sales_approval_run_guard', 'approval/run ownership guard'],
]) requireText(migration, needle, label);

for (const [needle, label] of [
  ["FACT_QA_ENGINE_VERSION = 'fact-qa.v1'", 'versioned Fact QA engine'],
  ["SALES_QA_ENGINE_VERSION = 'sales-qa.v1'", 'versioned Sales QA engine'],
  ['FACT_EVIDENCE_MAX_AGE_DAYS = 180', 'evidence freshness threshold'],
  ['UNSUPPORTED_VISIBLE_FACT', 'unsupported visible fact rejection'],
  ['CONTENT_EVIDENCE_INVALID', 'generated-copy evidence validation'],
  ['HEADLINE_PROVENANCE_MISMATCH', 'headline provenance validation'],
  ['SUBHEAD_PROVENANCE_MISMATCH', 'subhead provenance validation'],
  ['WRONG_CTA', 'CTA validation'],
  ['UNRESOLVED_RESEARCH_CONFLICT', 'research conflict review'],
  ['STALE_EVIDENCE_REVIEW', 'stale evidence review'],
  ["blocking ? 'QA_FAILED' : review ? 'FACT_QA_PENDING' : 'SALES_QA_PENDING'", 'fail/review/pass state progression'],
  ['resolvePhase19Issue', 'human issue remediation'],
  ['Sales QA cannot complete while open QA issues remain.', 'open-issue approval block'],
  ['Sales QA approval requires every human checklist item to be confirmed.', 'mandatory human checklist'],
  ["decision === 'APPROVED' ? 'DEMO_READY' : 'QA_FAILED'", 'human sales decision state progression'],
  ["decision === 'APPROVED' ? 'READY' : 'RENDERED'", 'demo release status gated by approval'],
]) requireText(engine, needle, label);

for (const [needle, label] of [
  ["post('/demos/:demoId/fact-qa/run'", 'Fact QA operator API'],
  ["get('/demos/:demoId/evidence'", 'evidence inspection API'],
  ["get('/review-queue'", 'review queue API'],
  ["post('/issues/:issueId/resolve'", 'issue remediation API'],
  ["post('/demos/:demoId/sales-qa'", 'human Sales QA API'],
  ['outreachSendingAvailable: false', 'outreach remains unavailable'],
]) requireText(routes, needle, label);

requireText(automatedRoutes, "route('/phase19', factSalesQaRoutes)", 'Phase 19 authenticated route mount');
requireText(renderer, "PUBLIC_DEMO_STATUSES = new Set<DemoRecord['status']>(['READY', 'SENT', 'CONVERTED'])", 'public renderer remains status-gated');
requireText(stateMachine, "SALES_QA_PENDING: ['DEMO_READY', 'QA_FAILED'", 'Sales QA state transition gate');
requireText(stateMachine, "DEMO_READY: ['CONTACT_PENDING'", 'later contact phase remains required before outreach');

for (const [needle, label] of [
  ['cleanFactQaPasses', 'clean Fact QA acceptance'],
  ['incompleteApprovalBlocked', 'incomplete human checklist acceptance'],
  ['explicitHumanApprovalRequired', 'explicit approval acceptance'],
  ['unsupportedFactFailsClosed', 'unsupported fact failure acceptance'],
  ['wrongCtaFailsClosed', 'wrong CTA failure acceptance'],
  ['staleEvidenceRequiresReview', 'stale evidence review acceptance'],
  ['staleEvidenceCanBeRemediated', 'stale evidence remediation acceptance'],
  ['unresolvedResearchConflictRequiresReview', 'conflict review acceptance'],
  ['humanSalesRejectionFailsClosed', 'human rejection acceptance'],
  ['crossTenantBlocked', 'tenant isolation acceptance'],
  ['foreignKeyViolations', 'foreign-key acceptance'],
]) requireText(integration, needle, label);

for (const [needle, label] of [
  ['/api/v1/automated-demo/phase19/review-queue', 'operator review queue client'],
  ['/fact-qa/run', 'operator Fact QA action'],
  ['/evidence', 'operator evidence inspection'],
  ['/issues/${issueId}/resolve', 'operator issue remediation action'],
  ['/sales-qa', 'operator Sales QA action'],
  ['Inspect source ↗', 'human source inspection link'],
  ['Mark resolved', 'human remediation control'],
  ['Waive with note', 'audited waiver control'],
  ['Private preview reviewed', 'human preview checklist'],
  ['Visible facts and sources reviewed', 'human fact checklist'],
  ['CTA and verified contact path reviewed', 'human CTA checklist'],
  ['Desktop + mobile screenshots reviewed', 'human screenshot checklist'],
  ['Concept disclosure / noindex reviewed', 'human disclosure checklist'],
  ['Approve demo', 'explicit human approval control'],
  ['Reject demo', 'explicit human rejection control'],
  ['It does not queue or send outreach', 'UI outreach separation warning'],
]) requireText(qaPage, needle, label);

requireText(app, "import { Phase19QaPage } from './qa/Phase19QaPage';", 'Phase 19 QA page import');
requireText(app, '<Route path="/qa" element={<Phase19QaPage/>}/>', 'active /qa route');
requireText(app, '<strong>19</strong><small>Fact + Sales QA</small>', 'current dashboard phase marker');

requireText(qaE2e, 'human sales approval requires the complete checklist and keeps outreach separate', 'human approval E2E');
requireText(qaE2e, 'operator can inspect evidence, resolve a review issue with a note, and rerun Fact QA', 'remediation E2E');
requireText(qaE2e, "expect(postedDecision?.decision).toBe('APPROVED')", 'approval payload assertion');
requireText(qaE2e, "expect(resolutionPayload).toEqual({ action: 'RESOLVED'", 'remediation-note assertion');

requireText(verifier, 'checks.explicitHumanApprovalRequired === true', 'D1 human approval gate');
requireText(verifier, 'checks.unsupportedFactFailsClosed === true', 'D1 unsupported fact gate');
requireText(verifier, 'checks.wrongCtaFailsClosed === true', 'D1 CTA gate');
requireText(verifier, 'checks.foreignKeyViolations === 0', 'D1 foreign-key gate');
requirePhaseAtLeast(phase, 19);

console.log('Phase 19 audit passed.');
