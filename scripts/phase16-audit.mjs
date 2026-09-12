import { readFile } from 'node:fs/promises';

async function text(path) { return readFile(path, 'utf8'); }
function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`Phase 16 audit missing ${label}.`);
}
function requirePhaseAtLeast(source, minimum) {
  const match = source.match(/CURRENT_PHASE\s*=\s*(\d+)/u);
  const phase = Number(match?.[1] ?? 0);
  if (!Number.isInteger(phase) || phase < minimum) throw new Error(`Phase 16 audit requires runtime phase >= ${minimum}; found ${phase || 'unknown'}.`);
}

const [migration, engine, tests, routes, apiIndex, integration, verifier, phase, packageJson, apiPackage] = await Promise.all([
  text('apps/api/migrations/0012_asset_engine.sql'),
  text('apps/api/src/asset-engine.ts'),
  text('apps/api/src/asset-engine.test.ts'),
  text('apps/api/src/asset-routes.ts'),
  text('apps/api/src/index.ts'),
  text('apps/api/src/phase16.integration.ts'),
  text('scripts/verify-phase16-d1.mjs'),
  text('apps/api/src/phase.ts'),
  text('package.json'),
  text('apps/api/package.json'),
]);

for (const [needle, label] of [
  ['source_captured_at TEXT', 'external asset capture metadata'],
  ['association_assumption TEXT', 'prospect association metadata'],
  ["watermark_status TEXT NOT NULL DEFAULT 'UNKNOWN'", 'watermark status'],
  ["asset_status TEXT NOT NULL DEFAULT 'ACTIVE'", 'broken asset status'],
  ['CREATE TABLE IF NOT EXISTS asset_selection_runs', 'immutable selection history'],
  ['PROSPECT_OFFICIAL_ASSET_REQUIRES_OFFICIAL_SOURCE', 'official-source database guard'],
  ['PROSPECT_OFFICIAL_ASSET_MUST_BE_CLEAR', 'watermark database guard'],
]) requireText(migration, needle, label);

for (const [needle, label] of [
  ['SHALCON_TEMPLATE_ASSET_LIBRARY', 'Shalcon template asset library'],
  ["representation: 'GENERIC_TEMPLATE_IMAGERY'", 'generic template representation'],
  ['eligibleOfficialLogo', 'official prospect logo eligibility'],
  ["usage_classification === 'PROSPECT_OFFICIAL'", 'official usage classification'],
  ["association_assumption === 'OFFICIAL_PROSPECT_SOURCE'", 'official association requirement'],
  ["asset.watermark_status === 'CLEAR'", 'watermark rejection'],
  ["asset.asset_status === 'ACTIVE'", 'broken asset rejection'],
  ["kind: 'TEXT_WORDMARK'", 'text wordmark fallback'],
  ['planOptimizedDimensions', 'dimension optimization plan'],
  ['rejectedExternalAssetIds', 'third-party rejection audit'],
  ['mayDescribeAsProspectReality: false', 'no prospect-reality image claim'],
  ['runAssetSelection', 'selection service'],
]) requireText(engine, needle, label);

for (const [needle, label] of [
  ['prefers a fully sourced official prospect logo', 'official-logo regression'],
  ['rejects random, watermarked, broken, or provenance-incomplete external assets', 'unsafe-external regression'],
  ['uses a text wordmark when no eligible official logo exists', 'missing-logo regression'],
  ['keeps the Shalcon template library clear of watermarks', 'template imagery classification regression'],
  ['plans bounded image dimensions without upscaling', 'dimension regression'],
]) requireText(tests, needle, label);

for (const [needle, label] of [
  ["get('/registry'", 'asset registry API'],
  ["get('/prospects/:id/selections'", 'selection history API'],
  ["post('/prospects/:id/selections'", 'selection execution API'],
  ['randomThirdPartyReuseAllowed: false', 'third-party API invariant'],
  ['watermarkedAssetsAllowed: false', 'watermark API invariant'],
]) requireText(routes, needle, label);

for (const [needle, label] of [
  ["import { assetRoutes } from './asset-routes';", 'asset route import'],
  ["app.use('/api/v1/assets/*', requireAuth);", 'asset auth boundary'],
  ["app.route('/api/v1/assets', assetRoutes);", 'asset route mount'],
]) requireText(apiIndex, needle, label);

for (const [needle, label] of [
  ['officialLogoSelected', 'official-logo D1 acceptance'],
  ['randomThirdPartyRejected', 'third-party D1 acceptance'],
  ['watermarkedAssetRejected', 'watermark D1 acceptance'],
  ['missingLogoUsesWordmark', 'wordmark D1 acceptance'],
  ['templateImageryGeneric', 'generic template-image D1 acceptance'],
  ['externalSourceMetadataAvailable', 'external metadata D1 acceptance'],
]) requireText(integration, needle, label);
requireText(verifier, 'checks.randomThirdPartyRejected === true', 'D1 third-party gate');
requireText(verifier, 'checks.watermarkedAssetRejected === true', 'D1 watermark gate');
requireText(verifier, 'checks.externalSourceMetadataAvailable === true', 'D1 source-metadata gate');
requireText(verifier, 'checks.foreignKeyViolations === 0', 'D1 foreign-key gate');
requirePhaseAtLeast(phase, 16);
requireText(packageJson, '"test:phase16:d1"', 'Phase 16 D1 script');
requireText(packageJson, '"test:phase16:audit"', 'Phase 16 audit script');
requireText(packageJson, '"test:phase16"', 'Phase 16 regression script');
requireText(apiPackage, '"db:migrate:phase16:local"', 'Phase 16 migration command');
requireText(apiPackage, '"test:d1:phase16-worker"', 'Phase 16 worker command');

console.log('Phase 16 audit passed.');
