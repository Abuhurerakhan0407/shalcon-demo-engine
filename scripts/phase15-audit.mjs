import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(path, 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`Phase 15 audit missing ${label}.`);
}

function requirePhaseAtLeast(source, minimum) {
  const match = source.match(/CURRENT_PHASE\s*=\s*(\d+)/u);
  const phase = Number(match?.[1] ?? 0);
  if (!Number.isInteger(phase) || phase < minimum) {
    throw new Error(`Phase 15 audit requires runtime phase >= ${minimum}; found ${phase || 'unknown'}.`);
  }
}

const [
  migration,
  engine,
  engineTests,
  routes,
  apiIndex,
  integration,
  verifier,
  phase,
  stateMachine,
  packageJson,
  apiPackage,
] = await Promise.all([
  text('apps/api/migrations/0011_content_engine.sql'),
  text('apps/api/src/content-engine.ts'),
  text('apps/api/src/content-engine.test.ts'),
  text('apps/api/src/content-routes.ts'),
  text('apps/api/src/index.ts'),
  text('apps/api/src/phase15.integration.ts'),
  text('scripts/verify-phase15-d1.mjs'),
  text('apps/api/src/phase.ts'),
  text('packages/state-machine/src/index.ts'),
  text('package.json'),
  text('apps/api/package.json'),
]);

for (const [needle, label] of [
  ['CREATE TABLE IF NOT EXISTS content_generation_runs', 'immutable content-run history'],
  ['template_match_id TEXT NOT NULL REFERENCES template_match_runs', 'template-match provenance'],
  ['prompt_version TEXT NOT NULL', 'prompt version persistence'],
  ['evidence_ids_json TEXT NOT NULL', 'run-level evidence persistence'],
  ['CONTENT_TEMPLATE_MATCH_PROSPECT_MISMATCH', 'template/prospect integrity trigger'],
]) requireText(migration, needle, label);

for (const [needle, label] of [
  ["CONTENT_ENGINE_VERSION = 'content-engine.v1'", 'content engine version'],
  ["CONTENT_PROMPT_VERSION = 'content-safe.v1'", 'prompt version'],
  ['contentPackageSchema', 'strict copy schema'],
  ['buildContentPackageFromVerifiedEvidence', 'verified input selector'],
  ["item.verificationStatus !== 'VERIFIED'", 'unverified-evidence rejection'],
  ["'SERVICE_DESCRIPTION'", 'service description support'],
  ["'HEADLINE'", 'headline generation'],
  ["'ABOUT'", 'about generation'],
  ["channel: 'PLACEHOLDER'", 'safe CTA fallback'],
  ["hiddenSections.push('SERVICES')", 'missing-service fallback'],
  ['serviceEvidenceId', 'per-service evidence mapping'],
  ['promptVersion: CONTENT_PROMPT_VERSION', 'copy-block prompt provenance'],
  ['runContentGeneration', 'content generation service'],
  ["prospect.currentState !== 'TEMPLATE_MATCHED'", 'template-matched state guard'],
  ["current_state = 'CONTENT_PENDING'", 'content-pending transition'],
  ['getContentHistory', 'content history service'],
]) requireText(engine, needle, label);

for (const [needle, label] of [
  ['uses only verified source evidence and never invents an unverified service', 'no-invented-service regression'],
  ['does not generate unsupported social proof or superlative claims', 'unsupported-claim regression'],
  ['hides factual sections safely when verified inputs are missing', 'safe missing-data regression'],
  ['stores prompt/model provenance on every generated copy block', 'provenance regression'],
  ['handles long verified service names without overflowing generated copy bounds', 'long-name regression'],
]) requireText(engineTests, needle, label);

for (const [needle, label] of [
  ["get('/prospects/:id/runs'", 'content history API'],
  ["post('/prospects/:id/runs'", 'content generation API'],
  ['verifiedInputsOnly: true', 'verified-input API invariant'],
  ['unsupportedClaimsAllowed: false', 'unsupported-claim API invariant'],
]) requireText(routes, needle, label);

for (const [needle, label] of [
  ["import { contentRoutes } from './content-routes';", 'content route import'],
  ["app.use('/api/v1/content/*', requireAuth);", 'content auth boundary'],
  ["app.route('/api/v1/content', contentRoutes);", 'content route mount'],
]) requireText(apiIndex, needle, label);

for (const [needle, label] of [
  ['verifiedInputSelector', 'verified-input D1 acceptance'],
  ['noUnsupportedClaims', 'unsupported-claim D1 acceptance'],
  ['evidenceMapped', 'evidence-map D1 acceptance'],
  ['missingDataHidesSafely', 'fallback D1 acceptance'],
  ['longNamesHandled', 'long-name D1 acceptance'],
  ['immutableRepeatHistory', 'immutable history D1 acceptance'],
  ['contentStateEnforced', 'content-state D1 acceptance'],
]) requireText(integration, needle, label);

requireText(verifier, 'checks.verifiedInputSelector === true', 'D1 verified-input gate');
requireText(verifier, 'checks.noUnsupportedClaims === true', 'D1 unsupported-claim gate');
requireText(verifier, 'checks.evidenceMapped === true', 'D1 evidence-map gate');
requireText(verifier, 'checks.foreignKeyViolations === 0', 'D1 foreign-key gate');

requirePhaseAtLeast(phase, 15);
requireText(stateMachine, "TEMPLATE_MATCHED: ['CONTENT_PENDING'", 'template-to-content state transition');
requireText(packageJson, '"test:phase15:d1"', 'Phase 15 D1 script');
requireText(packageJson, '"test:phase15:audit"', 'Phase 15 audit script');
requireText(packageJson, '"test:phase15"', 'Phase 15 regression script');
requireText(apiPackage, '"db:migrate:phase15:local"', 'Phase 15 local migration command');
requireText(apiPackage, '"test:d1:phase15-worker"', 'Phase 15 D1 worker command');

console.log('Phase 15 audit passed.');
