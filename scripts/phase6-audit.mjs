import { access, readFile } from 'node:fs/promises';

const required = [
  'apps/api/migrations/0005_universal_demo_renderer.sql',
  'apps/api/src/demo-renderer.ts',
  'apps/api/src/demo-routes.ts',
  'apps/api/src/demo-renderer.test.ts',
  'apps/api/src/phase6.integration.ts',
  'packages/db/src/repositories/demos.ts',
  'scripts/verify-phase6-d1.mjs',
];
for (const path of required) await access(path);

const migration = await readFile('apps/api/migrations/0005_universal_demo_renderer.sql', 'utf8');
for (const contract of [
  'ALTER TABLE demos ADD COLUMN last_qa_at',
  'fact_qa_status',
  'visual_qa_status',
  'sales_qa_status',
  "'elane-v8'",
  "'8.0.0'",
  '"configOnly":true',
]) {
  if (!migration.includes(contract)) throw new Error(`Missing Phase 6 demo schema contract: ${contract}`);
}

const renderer = await readFile('apps/api/src/demo-renderer.ts', 'utf8');
for (const contract of [
  'hashDemoToken',
  'SHA-256',
  'findTemplateDefinition',
  'validateSalonTemplateConfig',
  'renderElaneDocument',
  'ELANE_V8_DOCUMENT_SOURCE',
  "['READY', 'SENT', 'CONVERTED']",
]) {
  if (!renderer.includes(contract)) throw new Error(`Missing Phase 6 renderer contract: ${contract}`);
}
for (const forbidden of ['eval(', 'new Function(', 'writeFile(', 'exec(', 'spawn(']) {
  if (renderer.includes(forbidden)) throw new Error(`Prospect runtime code generation is forbidden: ${forbidden}`);
}

const routes = await readFile('apps/api/src/demo-routes.ts', 'utf8');
for (const contract of [
  "demoRoutes.get('/:token'",
  'X-Robots-Tag',
  'noindex, nofollow, noarchive',
  'private, no-store',
  'Preview unavailable',
]) {
  if (!routes.includes(contract)) throw new Error(`Missing Phase 6 public route contract: ${contract}`);
}
if (routes.includes("demoRoutes.get('/'")) throw new Error('Public demo enumeration route is forbidden.');

const generator = await readFile('scripts/prepare-elane-v8.mjs', 'utf8');
if (!generator.includes('ELANE_V8_DOCUMENT_SOURCE')) {
  throw new Error('Verified ÉLANE document is not exposed to the Worker renderer.');
}
if (!generator.includes('expectedHash') || !generator.includes('expectedRuntimeHash')) {
  throw new Error('ÉLANE source/runtime fingerprints are no longer enforced.');
}

const integration = await readFile('apps/api/src/phase6.integration.ts', 'utf8');
for (const contract of [
  'configOnlyVariation',
  'rawTokenNeverStored',
  'disabledFailsClosed',
  'expiredFailsClosed',
  'invalidConfigFailsClosed',
  'noPublicListing',
]) {
  if (!integration.includes(contract)) throw new Error(`Missing Phase 6 integration assertion: ${contract}`);
}

console.log('Phase 6 audit passed.');
