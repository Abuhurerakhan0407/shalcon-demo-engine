import { access, readFile } from 'node:fs/promises';

const required = [
  'apps/api/migrations/0003_prospect_evidence_core.sql',
  'apps/api/src/prospect-routes.ts',
  'apps/api/src/phase4.integration.ts',
  'packages/evidence/src/index.ts',
  'packages/evidence/src/index.test.ts',
  'packages/db/src/repositories/evidence.ts',
  'scripts/verify-phase4-d1.mjs',
];
for (const path of required) await access(path);

const migration = await readFile('apps/api/migrations/0003_prospect_evidence_core.sql', 'utf8');
for (const contract of [
  'CREATE TABLE IF NOT EXISTS prospect_facts',
  'EVIDENCE_SOURCE_PROSPECT_MISMATCH',
  'FACT_EVIDENCE_MISMATCH',
  "verification_status <> 'VERIFIED' OR evidence_id IS NOT NULL",
]) {
  if (!migration.includes(contract)) throw new Error(`Missing Phase 4 DB invariant: ${contract}`);
}

const evidence = await readFile('packages/evidence/src/index.ts', 'utf8');
for (const contract of [
  'SOURCE_QUALITY',
  'normalizeBusinessName',
  'normalizeDomain',
  'normalizePhone',
  'summarizeFieldEvidence',
  'canVerifyFact',
]) {
  if (!evidence.includes(contract)) throw new Error(`Missing Phase 4 evidence contract: ${contract}`);
}

const routes = await readFile('apps/api/src/prospect-routes.ts', 'utf8');
for (const contract of [
  "prospectRoutes.post('/',",
  "prospectRoutes.patch('/:id'",
  "prospectRoutes.delete('/:id'",
  "prospectRoutes.post('/:id/sources'",
  "prospectRoutes.post('/:id/evidence'",
  "prospectRoutes.put('/:id/facts/:field'",
  "prospectRoutes.get('/:id/evidence-bundle'",
  'VERIFIED_EVIDENCE_REQUIRED',
]) {
  if (!routes.includes(contract)) throw new Error(`Missing Phase 4 API contract: ${contract}`);
}

const api = await readFile('apps/api/src/index.ts', 'utf8');
if (!api.includes("app.use('/api/v1/prospects/*', requireAuth)")) {
  throw new Error('Prospect subroutes are not protected by session middleware.');
}
if (!api.includes("app.route('/api/v1/prospects', prospectRoutes)")) {
  throw new Error('Prospect routes are not mounted.');
}

console.log('Phase 4 audit passed.');
