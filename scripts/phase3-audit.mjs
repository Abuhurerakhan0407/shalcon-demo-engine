import { access, readFile } from 'node:fs/promises';

const required = [
  'packages/templates/src/index.ts',
  'packages/templates/src/index.test.ts',
  'packages/template-runtime/src/index.ts',
  'packages/template-runtime/src/index.test.ts',
  'apps/web/src/salon/SalonTemplatePreview.tsx',
  'apps/web/src/salon/salon-template.css',
  'tests/e2e/salon-template.spec.ts',
];
for (const path of required) await access(path);

const templates = await readFile('packages/templates/src/index.ts', 'utf8');
for (const contract of [
  "id: 'salon-editorial'",
  "version: '1.0.0'",
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
  'SALON_QA_FIXTURE_LONG',
  'SALON_QA_FIXTURE_SHORT',
  'SALON_QA_FIXTURE_MINIMAL',
  "'services-fallback'",
  "'contact-fallback'",
]) {
  if (!runtime.includes(contract)) throw new Error(`Missing Phase 3 runtime contract: ${contract}`);
}

const preview = await readFile('apps/web/src/salon/SalonTemplatePreview.tsx', 'utf8');
for (const contract of [
  'meta[name="robots"]',
  'noindex,nofollow,noarchive',
  'Shalcon Intelligence concept preview',
  'data-template-id',
  'Fixture action',
]) {
  if (!preview.includes(contract)) throw new Error(`Missing Phase 3 preview contract: ${contract}`);
}

const styles = await readFile('apps/web/src/salon/salon-template.css', 'utf8');
if (!styles.includes('@media (max-width: 620px)')) {
  throw new Error('Phase 3 template is missing its mobile breakpoint.');
}
if (!styles.includes('--salon-bg')) {
  throw new Error('Phase 3 template is not consuming CSS theme tokens.');
}

const app = await readFile('apps/web/src/App.tsx', 'utf8');
if (!app.includes("location.pathname === '/template-preview/salon-v1'")) {
  throw new Error('Static Salon v1 preview route is missing.');
}

const e2e = await readFile('tests/e2e/salon-template.spec.ts', 'utf8');
for (const contract of [
  'phase3-salon-desktop.png',
  'phase3-salon-mobile.png',
  '?fixture=short',
  '?fixture=minimal',
  'scrollWidth > window.innerWidth',
]) {
  if (!e2e.includes(contract)) throw new Error(`Missing Phase 3 browser acceptance: ${contract}`);
}

console.log('Phase 3 audit passed.');
