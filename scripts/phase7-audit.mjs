import { access, readFile } from 'node:fs/promises';

const required = [
  'apps/api/migrations/0006_manual_demo_builder.sql',
  'apps/api/src/manual-demo-builder.ts',
  'apps/api/src/manual-demo-builder.test.ts',
  'apps/api/src/demo-admin-routes.ts',
  'apps/api/src/phase7.integration.ts',
  'apps/api/src/phase.ts',
  'packages/db/src/repositories/demo-builder.ts',
  'apps/web/src/demos/DemoBuilderPage.tsx',
  'apps/web/src/demos/demo-builder.css',
  'scripts/verify-phase7-d1.mjs',
];
for (const path of required) await access(path);

const migration = await readFile('apps/api/migrations/0006_manual_demo_builder.sql', 'utf8');
for (const contract of ['CREATE TABLE IF NOT EXISTS demo_builder_states', 'demo_id TEXT PRIMARY KEY', 'revision INTEGER NOT NULL']) {
  if (!migration.includes(contract)) throw new Error(`Missing Phase 7 DB contract: ${contract}`);
}

const builder = await readFile('apps/api/src/manual-demo-builder.ts', 'utf8');
for (const contract of [
  "fact.verificationStatus === 'VERIFIED'",
  'Boolean(fact.evidenceId)',
  "'WARM_STONE'",
  "'ELANE_PAPER'",
  'validateSalonTemplateConfig',
  "name: 'HMAC'",
  'shalcon-demo-preview:v1:',
]) {
  if (!builder.includes(contract)) throw new Error(`Missing Phase 7 builder safety contract: ${contract}`);
}

const routes = await readFile('apps/api/src/demo-admin-routes.ts', 'utf8');
for (const contract of [
  "demoAdminRoutes.get('/prospects/:prospectId'",
  "demoAdminRoutes.post('/prospects/:prospectId/demos'",
  "demoAdminRoutes.get('/demos/:demoId'",
  "demoAdminRoutes.put('/demos/:demoId'",
  "demoAdminRoutes.post('/demos/:demoId/disable'",
  "status: 'READY'",
  "visualQaStatus: 'PENDING_PHASE18'",
]) {
  if (!routes.includes(contract)) throw new Error(`Missing Phase 7 admin API contract: ${contract}`);
}

const api = await readFile('apps/api/src/index.ts', 'utf8');
if (!api.includes("app.use('/api/v1/demo-admin/*', requireAuth)")) throw new Error('Demo admin routes are not protected.');
if (!api.includes("app.route('/api/v1/demo-admin', demoAdminRoutes)")) throw new Error('Demo admin routes are not mounted.');
if (!api.includes("import { CURRENT_PHASE } from './phase'")) throw new Error('API phase marker is not centralized.');
if (!api.includes('phase: CURRENT_PHASE')) throw new Error('API health does not report the centralized phase marker.');
const phaseSource = await readFile('apps/api/src/phase.ts', 'utf8');
const phaseMatch = phaseSource.match(/CURRENT_PHASE\s*=\s*(\d+)/u);
const currentPhase = phaseMatch ? Number(phaseMatch[1]) : Number.NaN;
if (!Number.isInteger(currentPhase) || currentPhase < 7) {
  throw new Error('API phase has regressed below Phase 7.');
}

const ui = await readFile('apps/web/src/demos/DemoBuilderPage.tsx', 'utf8');
for (const contract of [
  'Verified inputs',
  'Generate private demo',
  'Regenerate configuration',
  'Disable preview',
  "setViewport('desktop')",
  "setViewport('mobile')",
  'Visible prospect facts',
  'Screenshot package and automated visual QA arrive in Phase 18',
]) {
  if (!ui.includes(contract)) throw new Error(`Missing Phase 7 operator UI contract: ${contract}`);
}

const integration = await readFile('apps/api/src/phase7.integration.ts', 'utf8');
for (const contract of [
  'correctBusinessIdentity',
  'correctVerifiedCta',
  'unverifiedFactExcluded',
  'rawTokenNeverStored',
  'ownershipIsolation',
  'configOnlyRegeneration',
  'hiddenAddressRemoved',
  'disableFailsClosed',
]) {
  if (!integration.includes(contract)) throw new Error(`Missing Phase 7 integration acceptance: ${contract}`);
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
if (!packageJson.scripts?.['test:phase7:d1'] || !packageJson.scripts?.['test:phase7:audit'] || !packageJson.scripts?.['test:phase7']) {
  throw new Error('Permanent Phase 7 scripts are missing.');
}

console.log('Phase 7 audit passed.');
