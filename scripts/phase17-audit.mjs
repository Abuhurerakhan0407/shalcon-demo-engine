import { readFile } from 'node:fs/promises';

async function text(path) { return readFile(path, 'utf8'); }
function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`Phase 17 audit missing ${label}.`);
}
function requirePhaseAtLeast(source, minimum) {
  const match = source.match(/CURRENT_PHASE\s*=\s*(\d+)/u);
  const phase = Number(match?.[1] ?? 0);
  if (!Number.isInteger(phase) || phase < minimum) {
    throw new Error(`Phase 17 audit requires runtime phase >= ${minimum}; found ${phase || 'unknown'}.`);
  }
}

const [
  migration,
  builder,
  routes,
  renderer,
  apiIndex,
  integration,
  verifier,
  phase,
  packageJson,
  apiPackage,
  architecture,
] = await Promise.all([
  text('apps/api/migrations/0013_automated_demo_builder.sql'),
  text('apps/api/src/automated-demo-builder.ts'),
  text('apps/api/src/automated-demo-routes.ts'),
  text('apps/api/src/demo-renderer.ts'),
  text('apps/api/src/index.ts'),
  text('apps/api/src/phase17.integration.ts'),
  text('scripts/verify-phase17-d1.mjs'),
  text('apps/api/src/phase.ts'),
  text('package.json'),
  text('apps/api/package.json'),
  text('ARCHITECTURE.md'),
]);

for (const [needle, label] of [
  ['CREATE TABLE IF NOT EXISTS automated_demo_builds', 'automated build history'],
  ['template_match_id TEXT NOT NULL REFERENCES template_match_runs', 'template provenance'],
  ['content_run_id TEXT NOT NULL REFERENCES content_generation_runs', 'content provenance'],
  ['asset_selection_run_id TEXT NOT NULL REFERENCES asset_selection_runs', 'asset provenance'],
  ['input_fingerprint TEXT NOT NULL', 'input fingerprint'],
  ['UNIQUE(prospect_id, input_fingerprint)', 'idempotent build uniqueness'],
]) requireText(migration, needle, label);

for (const [needle, label] of [
  ["AUTOMATED_DEMO_BUILDER_VERSION = 'automated-demo-builder.v1'", 'builder version'],
  ['latestInputs', 'latest compatible input resolver'],
  ['Latest generated content is stale relative to the latest template match.', 'stale content fail-closed guard'],
  ['Latest asset selection is stale relative to template/content inputs.', 'stale asset fail-closed guard'],
  ['existingBuild', 'idempotent reuse lookup'],
  ['buildManualSalonDemoConfig', 'single existing renderer-config path'],
  ['parseThemeDNA', 'controlled ThemeDNA validation'],
  ['contentPackageSchema.parse', 'strict content validation'],
  ['assetAssignmentSchema', 'strict asset assignment validation'],
  ["'PENDING_PHASE18'", 'Phase 18 QA hold'],
  ["'PENDING_PHASE19'", 'Phase 19 sales QA hold'],
  ["current_state = 'DEMO_CONFIGURED'", 'demo configured transition'],
  ["current_state = 'RENDER_PENDING'", 'render pending transition'],
  ["current_state = 'RENDERED'", 'rendered transition'],
  ['renderDemoRecordForOperator', 'private operator render validation'],
]) requireText(builder, needle, label);

for (const [needle, label] of [
  ["post('/prospects/:prospectId/build'", 'automated build API'],
  ["get('/prospects/:prospectId/builds'", 'automated build history API'],
  ["get('/demos/:demoId/preview'", 'authenticated preview API'],
  ['publicReleaseAvailable: false', 'public release hold'],
]) requireText(routes, needle, label);

requireText(renderer, 'renderDemoRecordForOperator', 'operator-only pre-QA rendering');

for (const [needle, label] of [
  ["import { automatedDemoRoutes } from './automated-demo-routes';", 'automated demo route import'],
  ["app.use('/api/v1/automated-demo/*', requireAuth);", 'automated demo auth boundary'],
  ["app.route('/api/v1/automated-demo', automatedDemoRoutes);", 'automated demo route mount'],
]) requireText(apiIndex, needle, label);

for (const [needle, label] of [
  ['exactTemplatePreserved', 'exact template/version D1 acceptance'],
  ['latestInputsLinked', 'upstream provenance D1 acceptance'],
  ['verifiedContentApplied', 'verified content D1 acceptance'],
  ['matchedThemeApplied', 'matched ThemeDNA D1 acceptance'],
  ['validPrivateRender', 'private render D1 acceptance'],
  ['publicQaBypassBlocked', 'QA bypass rejection D1 acceptance'],
  ['stateProgressionRecorded', 'state history D1 acceptance'],
  ['idempotentReuse', 'idempotent reuse D1 acceptance'],
  ['missingDependencyFailsClosed', 'missing input fail-closed D1 acceptance'],
  ['crossTenantBlocked', 'tenant isolation D1 acceptance'],
]) requireText(integration, needle, label);

requireText(verifier, 'checks.exactTemplatePreserved === true', 'D1 exact-template gate');
requireText(verifier, 'checks.idempotentReuse === true', 'D1 idempotency gate');
requireText(verifier, 'checks.publicQaBypassBlocked === true', 'D1 QA hold gate');
requireText(verifier, 'checks.crossTenantBlocked === true', 'D1 ownership gate');
requireText(verifier, 'checks.foreignKeyViolations === 0', 'D1 foreign-key gate');
requirePhaseAtLeast(phase, 17);
requireText(packageJson, '"test:phase17:d1"', 'Phase 17 D1 script');
requireText(packageJson, '"test:phase17:audit"', 'Phase 17 audit script');
requireText(packageJson, '"test:phase17"', 'Phase 17 regression script');
requireText(apiPackage, '"db:migrate:phase17:local"', 'Phase 17 migration command');
requireText(apiPackage, '"test:d1:phase17-worker"', 'Phase 17 worker command');
requireText(architecture, 'One universal renderer consumes verified prospect configuration', 'single renderer architecture invariant');
requireText(architecture, 'No arbitrary AI-generated website code per prospect.', 'no per-prospect generated code invariant');

console.log('Phase 17 audit passed.');
