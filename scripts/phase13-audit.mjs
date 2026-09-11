import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(path, 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`Phase 13 audit missing ${label}.`);
}

const [
  schema,
  scoring,
  scoringTests,
  service,
  routes,
  apiIndex,
  integration,
  verifier,
  app,
  navigation,
  phase,
  stateMachine,
  demoAdmin,
] = await Promise.all([
  text('apps/api/migrations/0001_initial_schema.sql'),
  text('packages/scoring/src/index.ts'),
  text('packages/scoring/src/index.test.ts'),
  text('apps/api/src/demo-worthiness.ts'),
  text('apps/api/src/scoring-routes.ts'),
  text('apps/api/src/index.ts'),
  text('apps/api/src/phase13.integration.ts'),
  text('scripts/verify-phase13-d1.mjs'),
  text('apps/web/src/App.tsx'),
  text('tests/e2e/navigation.spec.ts'),
  text('apps/api/src/phase.ts'),
  text('packages/state-machine/src/index.ts'),
  text('apps/api/src/demo-admin-routes.ts'),
]);

for (const [needle, label] of [
  ['demo_score INTEGER', 'prospect demo score column'],
  ['CREATE TABLE IF NOT EXISTS scores', 'score history table'],
  ['total INTEGER NOT NULL CHECK (total BETWEEN 0 AND 100)', 'score bounds'],
  ['evidence_ids_json TEXT NOT NULL', 'score evidence linkage'],
]) requireText(schema, needle, label);

for (const [needle, label] of [
  ['businessNicheFit: 20', '20-point business/niche component'],
  ['websiteNeed: 25', '25-point website-need component'],
  ['verifiedData: 15', '15-point verified-data component'],
  ['brandSignals: 10', '10-point brand component'],
  ['abilityToPaySignals: 15', '15-point business-capacity component'],
  ['contactability: 10', '10-point contactability component'],
  ['recentActivity: 5', '5-point activity component'],
  ["if (score >= 85)", 'priority-demo threshold'],
  ["if (score >= 70)", 'generate-demo threshold'],
  ["if (score >= 50)", 'research-more threshold'],
  ["decision: 'REJECTED'", 'skip/reject threshold'],
  ['references.length === 0 ? 0', 'missing-evidence zero-point invariant'],
]) requireText(scoring, needle, label);

for (const [needle, label] of [
  ['calculates a deterministic 100-point score', '100-point unit regression'],
  ['gives missing evidence zero points', 'missing-evidence regression'],
  ['enforces master thresholds in code', 'threshold unit regression'],
]) requireText(scoringTests, needle, label);

for (const [needle, label] of [
  ['runDemoWorthinessScoring', 'scoring execution service'],
  ["SCORE_TYPE = 'DEMO_WORTHINESS_V1'", 'versioned score type'],
  ["prospect.currentState !== 'AUDITED'", 'AUDITED-state gate'],
  ['A completed website audit is required before scoring.', 'website-audit prerequisite'],
  ['calculateDemoWorthiness({', 'deterministic calculator invocation'],
  ['INSERT INTO scores', 'score history persistence'],
  ["current_state = 'SCORED'", 'SCORED transition'],
  ['score.decision', 'threshold decision transition'],
  ['getDemoWorthinessHistory', 'score history service'],
]) requireText(service, needle, label);

for (const [needle, label] of [
  ["post('/prospects/:id/runs'", 'scoring run API'],
  ["get('/prospects/:id/runs'", 'score history API'],
  ['deterministicTotal: true', 'deterministic-total API declaration'],
  ['aiCannotOverrideTotal: true', 'AI override prohibition'],
]) requireText(routes, needle, label);

for (const [needle, label] of [
  ["import { scoringRoutes } from './scoring-routes';", 'scoring route import'],
  ["app.use('/api/v1/scoring/*', requireAuth);", 'scoring auth boundary'],
  ["app.route('/api/v1/scoring', scoringRoutes);", 'scoring route mount'],
]) requireText(apiIndex, needle, label);

for (const [needle, label] of [
  ['codeCalculatedPriorityScore', 'code-calculated score acceptance'],
  ['researchMoreThresholdEnforced', 'research-more acceptance'],
  ['rejectThresholdEnforced', 'reject acceptance'],
  ['missingEvidenceReducesScore', 'missing-evidence acceptance'],
  ['everyPositiveComponentHasEvidence', 'component evidence acceptance'],
  ['rejectedCannotGenerateAutomatically', 'rejected-state safety acceptance'],
]) requireText(integration, needle, label);

requireText(verifier, 'checks.everyPositiveComponentHasEvidence === true', 'D1 evidence-link gate');
requireText(verifier, 'checks.rejectedCannotGenerateAutomatically === true', 'D1 rejected-lead gate');
requireText(verifier, 'checks.foreignKeyViolations === 0', 'D1 foreign-key gate');

for (const [needle, label] of [
  ["{ to: '/scoring', label: 'Scoring'", 'scoring navigation'],
  ['<ScoringPage/>', 'scoring route UI'],
  ['<strong>13</strong>', 'dashboard Phase 13 marker'],
]) requireText(app, needle, label);
requireText(navigation, "['Scoring', '/scoring']", 'Playwright scoring navigation coverage');
requireText(navigation, "name: 'Evidence becomes a decision.'", 'Playwright scoring heading coverage');
requireText(phase, 'CURRENT_PHASE = 13', 'runtime Phase 13 marker');

for (const [needle, label] of [
  ["AUDITED: ['SCORED'", 'AUDITED to SCORED state transition'],
  ["SCORED: ['REJECTED', 'RESEARCH_MORE', 'DEMO_QUALIFIED'", 'score decision state transitions'],
  ['REJECTED: []', 'rejected terminal state'],
]) requireText(stateMachine, needle, label);
requireText(demoAdmin, "prospect.currentState !== 'IDENTITY_VERIFIED'", 'existing demo-generation state guard');

console.log('Phase 13 audit passed.');
