import { access, readFile } from 'node:fs/promises';

const required = [
  'apps/api/migrations/0004_identity_resolution.sql',
  'apps/api/src/prospect-identity.ts',
  'apps/api/src/phase5.integration.ts',
  'packages/db/src/repositories/identity.ts',
  'packages/evidence/src/index.ts',
  'packages/evidence/src/index.test.ts',
  'packages/state-machine/src/index.ts',
  'scripts/verify-phase5-d1.mjs',
];
for (const path of required) await access(path);

const migration = await readFile('apps/api/migrations/0004_identity_resolution.sql', 'utf8');
for (const contract of [
  'CREATE TABLE IF NOT EXISTS prospect_identity_keys',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_strong_unique',
  "WHERE key_type IN ('DOMAIN', 'PHONE')",
  'CREATE TABLE IF NOT EXISTS prospect_observations',
  'CREATE TABLE IF NOT EXISTS prospect_aliases',
  'IDENTITY_KEY_USER_MISMATCH',
  'OBSERVATION_CAMPAIGN_USER_MISMATCH',
  'ALIAS_USER_MISMATCH',
]) {
  if (!migration.includes(contract)) throw new Error(`Missing Phase 5 DB invariant: ${contract}`);
}

const evidence = await readFile('packages/evidence/src/index.ts', 'utf8');
for (const contract of [
  'IDENTITY_KEY_TYPES',
  'STRONG_IDENTITY_KEY_TYPES',
  'buildIdentityKeys',
  'resolveIdentity',
  'STRONG_IDENTIFIERS_DISAGREE',
  'COMPOSITE_MATCH_REQUIRES_REVIEW',
]) {
  if (!evidence.includes(contract)) throw new Error(`Missing Phase 5 identity policy: ${contract}`);
}

const service = await readFile('apps/api/src/prospect-identity.ts', 'utf8');
for (const contract of [
  'createOrResolveProspectIdentity',
  'resolvePendingProspectIdentity',
  "initialResolution.status === 'EXACT_MATCH'",
  "initialResolution.status !== 'NEW_CANONICAL'",
  "prospects.transition(pending.id, 'IDENTITY_VERIFIED'",
  "prospects.transition(pending.id, 'DUPLICATE'",
  'STRONG_IDENTITY_COLLISION',
]) {
  if (!service.includes(contract)) throw new Error(`Missing Phase 5 service contract: ${contract}`);
}

const stateMachine = await readFile('packages/state-machine/src/index.ts', 'utf8');
if (!stateMachine.includes("'DUPLICATE'")) throw new Error('DUPLICATE state is missing.');
if (!stateMachine.includes("IDENTITY_PENDING: ['IDENTITY_VERIFIED', 'DUPLICATE'")) {
  throw new Error('Identity-pending prospects cannot terminalize as duplicates.');
}
if (!stateMachine.includes('DUPLICATE: []')) throw new Error('DUPLICATE is not terminal.');

const routes = await readFile('apps/api/src/prospect-routes.ts', 'utf8');
for (const contract of [
  'createOrResolveProspectIdentity',
  "prospectRoutes.get('/:id/identity'",
  "prospectRoutes.post('/:id/identity/resolve'",
  'IDENTITY_LOCKED',
  'IDENTITY_AUDIT_LOCKED',
  'DUPLICATE_PROSPECT',
]) {
  if (!routes.includes(contract)) throw new Error(`Missing Phase 5 API contract: ${contract}`);
}

console.log('Phase 5 audit passed.');
