import { readFile } from 'node:fs/promises';

async function text(path) { return readFile(path, 'utf8'); }
function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`Phase 18 audit missing ${label}.`);
}
function requirePhaseAtLeast(source, minimum) {
  const match = source.match(/CURRENT_PHASE\s*=\s*(\d+)/u);
  const phase = Number(match?.[1] ?? 0);
  if (!Number.isInteger(phase) || phase < minimum) {
    throw new Error(`Phase 18 audit requires runtime phase >= ${minimum}; found ${phase || 'unknown'}.`);
  }
}

const [
  migration,
  qa,
  routes,
  runnerExtension,
  automatedRoutes,
  worker,
  browserEngine,
  browserTests,
  integration,
  verifier,
  phase,
  architecture,
] = await Promise.all([
  text('apps/api/migrations/0014_visual_qa.sql'),
  text('apps/api/src/visual-qa.ts'),
  text('apps/api/src/visual-qa-routes.ts'),
  text('apps/api/src/visual-qa-runner-extension.ts'),
  text('apps/api/src/automated-demo-routes.ts'),
  text('apps/local-runner/src/shalcon_runner/worker.py'),
  text('apps/local-runner/src/shalcon_runner/visual_qa.py'),
  text('apps/local-runner/tests/test_visual_qa.py'),
  text('apps/api/src/phase18.integration.ts'),
  text('scripts/verify-phase18-d1.mjs'),
  text('apps/api/src/phase.ts'),
  text('ARCHITECTURE.md'),
]);

for (const [needle, label] of [
  ['runner_job_id TEXT REFERENCES jobs', 'QA runner provenance'],
  ['CREATE TABLE IF NOT EXISTS visual_qa_screenshots', 'visual screenshot storage metadata'],
  ["'DESKTOP_FULL', 'DESKTOP_HERO', 'MOBILE_FULL', 'MOBILE_HERO'", 'four screenshot kinds'],
  ['UNIQUE(qa_run_id, kind)', 'one screenshot per QA kind'],
  ['visual_qa_screenshot_demo_guard', 'screenshot/demo ownership guard'],
]) requireText(migration, needle, label);

for (const [needle, label] of [
  ["VISUAL_QA_ENGINE_VERSION = 'visual-qa.v1'", 'versioned visual QA engine'],
  ["VISUAL_QA_JOB_TYPE = 'PLAYWRIGHT_VISUAL_QA'", 'runner job type'],
  ['visualQaRunnerResultSchema', 'strict runner result schema'],
  ['visualIssues', 'deterministic issue classifier'],
  ['horizontal-overflow', 'overflow failure rule'],
  ['broken-images', 'broken image failure rule'],
  ['console-errors', 'console error failure rule'],
  ['page-errors', 'page error failure rule'],
  ['cta-missing', 'CTA failure rule'],
  ['placeholder-content', 'placeholder failure rule'],
  ['concept-disclosure-missing', 'disclosure failure rule'],
  ['noindex-missing', 'noindex failure rule'],
  ['enqueueVisualQa', 'QA enqueue function'],
  ['getVisualQaRunnerInput', 'lease-bound runner input'],
  ['renderDemoRecordForOperator', 'existing universal renderer reuse'],
  ['completeVisualQa', 'authoritative completion function'],
  ["passed ? 'FACT_QA_PENDING' : 'QA_FAILED'", 'fail-closed state progression'],
  ["passed ? 'PASS' : 'FAIL'", 'persisted QA verdict'],
  ["'PENDING_PHASE19'", 'fact QA hold after visual pass'],
  ["'BLOCKED_BY_VISUAL_QA'", 'fact QA block after visual fail'],
]) requireText(qa, needle, label);

for (const [needle, label] of [
  ["post('/demos/:demoId/run'", 'operator QA enqueue API'],
  ["get('/demos/:demoId/runs'", 'operator QA history API'],
  ['publicReleaseAvailable: false', 'public release hold'],
]) requireText(routes, needle, label);

for (const [needle, label] of [
  ["post('/agent/jobs/:jobId/visual-qa/input'", 'runner QA input API'],
  ["post('/agent/jobs/:jobId/visual-qa/complete'", 'runner QA completion API'],
  ['authenticatedRunner', 'runner bearer authentication'],
  ['getVisualQaRunnerInput', 'runner lease guard'],
  ['completeVisualQa', 'runner completion persistence'],
]) requireText(runnerExtension, needle, label);

requireText(automatedRoutes, "import './visual-qa-runner-extension';", 'runner QA extension mount');
requireText(automatedRoutes, "route('/visual-qa', visualQaRoutes)", 'operator visual QA route mount');

for (const [needle, label] of [
  ['PLAYWRIGHT_VISUAL_QA', 'runner visual QA capability'],
  ['visual_qa_job(job, self.client)', 'runner visual QA execution'],
  ['complete_visual_qa', 'validated visual QA completion path'],
  ['VisualQaJobError', 'specific safe visual QA errors'],
]) requireText(worker, needle, label);

for (const [needle, label] of [
  ['f"{label}.full.png"', 'full-page screenshot generation'],
  ['f"{label}.hero.png"', 'hero screenshot generation'],
  ['horizontalOverflow', 'overflow measurement'],
  ['brokenImageCount', 'broken image measurement'],
  ['consoleErrors', 'console diagnostics'],
  ['pageErrors', 'page diagnostics'],
  ['ctaPresent', 'CTA detection'],
  ['placeholderCount', 'placeholder detection'],
  ['disclosurePresent', 'concept disclosure detection'],
  ['noindexPresent', 'noindex detection'],
  ['sha256', 'artifact hash provenance'],
  ['runner-artifact://visual-qa/', 'local runner artifact reference'],
]) requireText(browserEngine, needle, label);

requireText(browserTests, '"DESKTOP_FULL", "DESKTOP_HERO", "MOBILE_FULL", "MOBILE_HERO"', 'four browser screenshot kinds');
requireText(browserTests, 'test_visual_qa_good_fixture_passes_all_required_checks_and_writes_four_pngs', 'passing browser fixture');
requireText(browserTests, 'test_visual_qa_broken_fixture_is_detected_on_desktop_and_mobile', 'deliberately broken browser fixture');

for (const [needle, label] of [
  ['idempotentEnqueue', 'D1 idempotency acceptance'],
  ['runnerLeaseGuard', 'D1 lease ownership acceptance'],
  ['healthyFixturePasses', 'D1 PASS acceptance'],
  ['brokenFixtureFailsClosed', 'D1 FAIL acceptance'],
  ['stateTransitionsRecorded', 'D1 prospect-state acceptance'],
  ['fourScreenshotsPerRun', 'D1 screenshot provenance acceptance'],
  ['crossTenantBlocked', 'D1 tenant isolation acceptance'],
  ['publicReleaseStillHeld', 'D1 release hold acceptance'],
  ['foreignKeyViolations', 'D1 foreign-key acceptance'],
]) requireText(integration, needle, label);

requireText(verifier, 'checks.healthyFixturePasses === true', 'D1 healthy fixture gate');
requireText(verifier, 'checks.brokenFixtureFailsClosed === true', 'D1 broken fixture gate');
requireText(verifier, 'checks.foreignKeyViolations === 0', 'D1 foreign key gate');
requirePhaseAtLeast(phase, 18);
requireText(architecture, 'One universal renderer consumes verified prospect configuration', 'single renderer architecture invariant');
requireText(architecture, 'No arbitrary AI-generated website code per prospect.', 'no per-prospect generated code invariant');

console.log('Phase 18 audit passed.');
