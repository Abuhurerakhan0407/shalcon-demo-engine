import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(path, 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`Phase 14 audit missing ${label}.`);
}

function requirePhaseAtLeast(source, minimum) {
  const match = source.match(/CURRENT_PHASE\s*=\s*(\d+)/u);
  const phase = Number(match?.[1] ?? 0);
  if (!Number.isInteger(phase) || phase < minimum) {
    throw new Error(`Phase 14 audit requires runtime phase >= ${minimum}; found ${phase || 'unknown'}.`);
  }
}

function requireUiPhaseAtLeast(source, minimum) {
  const match = source.match(/Current phase<\/span><strong>(\d+)<\/strong>/u);
  const phase = Number(match?.[1] ?? 0);
  if (!Number.isInteger(phase) || phase < minimum) {
    throw new Error(`Phase 14 audit requires dashboard phase >= ${minimum}; found ${phase || 'unknown'}.`);
  }
}

const [
  migration,
  policy,
  policyTests,
  service,
  routes,
  apiIndex,
  integration,
  verifier,
  app,
  navigation,
  phase,
  templates,
  packageJson,
] = await Promise.all([
  text('apps/api/migrations/0010_brand_template_matching.sql'),
  text('apps/api/src/brand-template-policy.ts'),
  text('apps/api/src/brand-template-policy.test.ts'),
  text('apps/api/src/brand-template.ts'),
  text('apps/api/src/brand-template-routes.ts'),
  text('apps/api/src/index.ts'),
  text('apps/api/src/phase14.integration.ts'),
  text('scripts/verify-phase14-d1.mjs'),
  text('apps/web/src/App.tsx'),
  text('tests/e2e/navigation.spec.ts'),
  text('apps/api/src/phase.ts'),
  text('packages/templates/src/index.ts'),
  text('package.json'),
]);

for (const [needle, label] of [
  ['profile_version', 'brand profile versioning'],
  ['recommended_archetypes_json', 'brand archetype recommendations'],
  ['CREATE TABLE IF NOT EXISTS template_match_runs', 'immutable template match history'],
  ["selection_source TEXT NOT NULL CHECK (selection_source IN ('AUTO', 'MANUAL_OVERRIDE'))", 'selection source audit'],
  ['supersedes_match_id TEXT REFERENCES template_match_runs', 'override lineage'],
  ['fit_score INTEGER NOT NULL CHECK (fit_score BETWEEN 0 AND 100)', 'bounded template fit score'],
]) requireText(migration, needle, label);

for (const [needle, label] of [
  ['TEMPLATE_REGISTRY', 'allowed template registry use'],
  ['inferBrandProfile', 'structured brand analyzer'],
  ["positioning === 'unknown'", 'unknown brand handling'],
  ['detectedColors', 'explicit detected colors'],
  ['safeDefault', 'safe default path'],
  ['selectTemplateForBrand', 'template selector'],
  ['evaluateTemplateCandidate', 'deterministic template fit evaluation'],
  ["heroVariant: 'split'", 'sparse-content layout'],
  ["motionPreset: 'subtle'", 'sparse-content motion fallback'],
  ['findTemplateDefinition(templateId, templateVersion)', 'manual registry validation'],
  ['parseThemeDNA(themeDNA)', 'controlled theme validation'],
]) requireText(policy, needle, label);

for (const [needle, label] of [
  ['unknown brand on a registry default without inventing a palette story', 'unknown-brand regression'],
  ['only explicit evidence for positioning and colors', 'explicit-evidence regression'],
  ['compatible restrained layout when verified content or imagery is sparse', 'sparse-content regression'],
  ['rejects manual selections outside the allowed registry', 'registry rejection regression'],
  ['manual registry selection only with valid controlled ThemeDNA', 'manual controlled-DNA regression'],
]) requireText(policyTests, needle, label);

for (const [needle, label] of [
  ["prospect.currentState !== 'DEMO_QUALIFIED'", 'DEMO_QUALIFIED gate'],
  ["assertProspectTransition('DEMO_QUALIFIED', 'TEMPLATE_PENDING')", 'template-pending transition'],
  ["assertProspectTransition('TEMPLATE_PENDING', 'TEMPLATE_MATCHED')", 'template-matched transition'],
  ['INSERT INTO brand_profiles', 'brand profile persistence'],
  ['INSERT INTO template_match_runs', 'template match persistence'],
  ['selection_source', 'selection source persistence'],
  ['getBrandTemplateHistory', 'match history service'],
  ['overrideBrandTemplateMatch', 'manual override service'],
]) requireText(service, needle, label);

for (const [needle, label] of [
  ["get('/registry'", 'registry API'],
  ["post('/prospects/:id/matches'", 'automatic match API'],
  ["get('/prospects/:id/matches'", 'match history API'],
  ["post('/prospects/:id/matches/:matchId/override'", 'manual override API'],
  ['overrideSchema.safeParse', 'Zod override boundary'],
  ['registryOnly: true', 'registry-only API invariant'],
]) requireText(routes, needle, label);

for (const [needle, label] of [
  ["import { brandTemplateRoutes } from './brand-template-routes';", 'brand/template route import'],
  ["app.use('/api/v1/brand-template/*', requireAuth);", 'brand/template auth boundary'],
  ["app.route('/api/v1/brand-template', brandTemplateRoutes);", 'brand/template route mount'],
]) requireText(apiIndex, needle, label);

for (const [needle, label] of [
  ['allowedRegistryOnly', 'registry-only D1 acceptance'],
  ['unknownBrandUsesSafeDefault', 'safe-default D1 acceptance'],
  ['insufficientContentUsesCompatibleLayout', 'sparse-layout D1 acceptance'],
  ['manualOverrideLogged', 'manual-override D1 acceptance'],
  ['invalidRegistryBlocked', 'invalid-registry D1 acceptance'],
  ['selectionVersioned', 'versioned-selection D1 acceptance'],
]) requireText(integration, needle, label);
requireText(verifier, 'checks.allowedRegistryOnly === true', 'D1 registry gate');
requireText(verifier, 'checks.manualOverrideLogged === true', 'D1 override gate');
requireText(verifier, 'checks.foreignKeyViolations === 0', 'D1 foreign-key gate');

for (const [needle, label] of [
  ["{ to: '/templates', label: 'Templates'", 'templates navigation'],
  ['<BrandTemplatePage/>', 'brand/template route UI'],
]) requireText(app, needle, label);
requireUiPhaseAtLeast(app, 14);
requireText(navigation, "name: 'Brand evidence becomes controlled design.'", 'Playwright Brand/Templates heading');
requirePhaseAtLeast(phase, 14);

for (const [needle, label] of [
  ['export const TEMPLATE_REGISTRY', 'template registry'],
  ['findTemplateDefinition', 'template registry lookup'],
  ['THEME_DNA_OPTIONS', 'controlled ThemeDNA options'],
]) requireText(templates, needle, label);

requireText(packageJson, '"test:phase14:d1"', 'Phase 14 D1 script');
requireText(packageJson, '"test:phase14:audit"', 'Phase 14 audit script');
requireText(packageJson, '"test:phase14"', 'Phase 14 regression script');

console.log('Phase 14 audit passed.');
