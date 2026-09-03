import { access, readFile } from 'node:fs/promises';

const required = [
  'packages/templates/source/elane-v8/original.html.gz.b64',
  'packages/template-runtime/source/elane-runtime-v8.ts.gz.b64',
  'packages/templates/src/index.ts',
  'packages/templates/src/index.test.ts',
  'packages/template-runtime/src/index.ts',
  'packages/template-runtime/src/index.test.ts',
  'apps/web/src/salon/SalonTemplatePreview.tsx',
  'tests/e2e/salon-template.spec.ts',
  'scripts/prepare-elane-v8.mjs',
];
for (const path of required) await access(path);

const prepare = await readFile('scripts/prepare-elane-v8.mjs', 'utf8');
for (const contract of [
  'ed9e8d651e0d24a759968f10febdb43d8ea7d036e53727d3cee8521ad7886dbf',
  'e414630a70a73147b7867f2fc91d3d9237a3b878456fcfe979cc3b16264ae639',
  'data-template-id="elane-v8"',
  'noindex,nofollow,noarchive',
  '[hidden]{display:none!important}',
  'SHALCON_RUNTIME_CONFIG',
  'window.__SHALCON_FINDER_DATA__',
]) {
  if (!prepare.includes(contract)) throw new Error(`Missing Phase 3 source adapter contract: ${contract}`);
}

const templates = await readFile('packages/templates/src/index.ts', 'utf8');
for (const contract of [
  "id: 'elane-v8'",
  "version: '8.0.0'",
  'TEMPLATE_REGISTRY',
  'THEME_DNA_OPTIONS',
  'defaultTheme',
  'noindexSupported: true',
  'conceptDisclosureRequired: true',
]) {
  if (!templates.includes(contract)) throw new Error(`Missing Phase 3 template contract: ${contract}`);
}

const runtime = await readFile('packages/template-runtime/src/index.ts', 'utf8');
for (const contract of [
  'validateSalonTemplateConfig',
  'deriveSalonSections',
  'resolveSalonThemeTokens',
  'renderElaneDocument',
  'SALON_QA_FIXTURE_LONG',
  'SALON_QA_FIXTURE_SHORT',
  'SALON_QA_FIXTURE_MINIMAL',
  "'services-fallback'",
  "'contact-fallback'",
]) {
  if (!runtime.includes(contract)) throw new Error(`Missing Phase 3 runtime contract: ${contract}`);
}

const generated = await readFile('packages/templates/generated/elane-v8/index.html', 'utf8');
for (const contract of [
  'data-template-id="elane-v8"',
  'data-template-version="8.0.0"',
  'noindex,nofollow,noarchive',
  'Concept preview prepared by Shalcon Intelligence',
  '<!-- SHALCON_RUNTIME_CONFIG -->',
]) {
  if (!generated.includes(contract)) throw new Error(`Missing generated ÉLANE contract: ${contract}`);
}

const preview = await readFile('apps/web/src/salon/SalonTemplatePreview.tsx', 'utf8');
for (const contract of [
  'packages/templates/generated/elane-v8/index.html?raw',
  'renderElaneDocument',
  'data-template-id',
  'data-template-version',
  'srcDoc={documentHtml}',
]) {
  if (!preview.includes(contract)) throw new Error(`Missing Phase 3 preview contract: ${contract}`);
}

const app = await readFile('apps/web/src/App.tsx', 'utf8');
if (!app.includes('/template-preview/salon-v1') || !app.includes('<SalonTemplatePreview')) {
  throw new Error('Static Salon v1 preview route is missing.');
}

const e2e = await readFile('tests/e2e/salon-template.spec.ts', 'utf8');
for (const contract of [
  'phase3-elane-desktop-hero.png',
  'phase3-elane-desktop-rituals.png',
  'phase3-elane-mobile-hero.png',
  '?fixture=short',
  '?fixture=minimal',
  'frameLocator',
  'scrollWidth >',
]) {
  if (!e2e.includes(contract)) throw new Error(`Missing Phase 3 browser acceptance: ${contract}`);
}

console.log('Phase 3 audit passed.');
