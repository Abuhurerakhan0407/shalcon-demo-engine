import { readFile, access } from 'node:fs/promises';

const required = [
  'apps/api/migrations/0001_initial_schema.sql',
  'packages/db/src/d1.ts',
  'packages/db/src/idempotency.ts',
  'packages/db/src/repositories/users.ts',
  'packages/db/src/repositories/campaigns.ts',
  'packages/db/src/repositories/prospects.ts',
  'packages/db/src/repositories/jobs.ts',
  'packages/db/src/repositories/agent-runs.ts',
  'packages/state-machine/src/index.ts',
  'scripts/verify-phase1-d1.mjs',
];

for (const path of required) await access(path);

const migration = await readFile('apps/api/migrations/0001_initial_schema.sql', 'utf8');
for (const table of ['prospects', 'jobs', 'agent_runs', 'prospect_state_events']) {
  if (!migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
    throw new Error(`Missing required Phase 1 table: ${table}`);
  }
}

if (!migration.includes('idempotency_key TEXT NOT NULL UNIQUE')) {
  throw new Error('jobs.idempotency_key must be unique.');
}
if (!migration.includes('trg_prospect_state_event')) {
  throw new Error('Prospect state changes must produce audit events.');
}

const stateMachine = await readFile('packages/state-machine/src/index.ts', 'utf8');
if (!stateMachine.includes('IllegalProspectTransitionError')) {
  throw new Error('Illegal prospect transitions must be rejected explicitly.');
}

console.log('Phase 1 audit passed.');
