import { access, readFile } from 'node:fs/promises';

const required = [
  'apps/api/migrations/0002_auth_sessions.sql',
  'apps/api/src/auth.ts',
  'apps/api/src/auth.test.ts',
  'apps/api/src/phase2.integration.ts',
  'packages/db/src/repositories/auth-sessions.ts',
  'tests/e2e/navigation.spec.ts',
  'scripts/verify-phase2-d1.mjs',
];
for (const path of required) await access(path);

const migration = await readFile('apps/api/migrations/0002_auth_sessions.sql', 'utf8');
if (!migration.includes('CREATE TABLE IF NOT EXISTS auth_sessions')) {
  throw new Error('Phase 2 auth_sessions table is missing.');
}
if (!migration.includes('token_hash TEXT NOT NULL UNIQUE')) {
  throw new Error('Session tokens must be stored by unique hash.');
}
if (!migration.includes('revoked_at TEXT')) {
  throw new Error('Sessions must support explicit revocation.');
}

const auth = await readFile('apps/api/src/auth.ts', 'utf8');
for (const contract of [
  'createOAuthState',
  'verifyOAuthState',
  'hashSessionToken',
  'email_verified',
  'openid email profile',
]) {
  if (!auth.includes(contract)) throw new Error(`Missing auth contract: ${contract}`);
}

const api = await readFile('apps/api/src/index.ts', 'utf8');
for (const contract of [
  "app.use('/api/v1/dashboard/*'",
  'httpOnly: true',
  "sameSite: 'Lax'",
  "code: 'UNAUTHORIZED'",
  "app.post('/api/v1/auth/logout'",
]) {
  if (!api.includes(contract)) throw new Error(`Missing API auth contract: ${contract}`);
}

const wrangler = await readFile('apps/api/wrangler.jsonc', 'utf8');
if (wrangler.includes('GOOGLE_CLIENT_SECRET') || wrangler.includes('SESSION_SECRET')) {
  throw new Error('Secrets must not be committed into Wrangler vars.');
}

const app = await readFile('apps/web/src/App.tsx', 'utf8');
for (const route of [
  '/dashboard',
  '/campaigns',
  '/prospects',
  '/research',
  '/templates',
  '/demos',
  '/qa',
  '/outreach',
  '/inbox',
  '/pipeline',
  '/analytics',
]) {
  if (!app.includes(route)) throw new Error(`Dashboard route missing: ${route}`);
}
if (!app.includes('aria-expanded')) throw new Error('Mobile navigation control is not accessible.');

console.log('Phase 2 audit passed.');
