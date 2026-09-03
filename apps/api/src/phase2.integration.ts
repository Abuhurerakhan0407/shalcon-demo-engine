import { AuthSessionRepository, UserRepository, type D1DatabaseLike } from '@shalcon/db';
import { Hono } from 'hono';

import { hashSessionToken } from './auth';
import { app as productionApp } from './index';

interface Env {
  DB: D1DatabaseLike;
}

type Bindings = { Bindings: Env };

const integration = new Hono<Bindings>();

const NOW = '2026-09-03T08:00:00.000Z';
const EXPIRES = '2026-09-10T08:00:00.000Z';
const RAW_TOKEN = 'phase2-fixture-session-token';

async function cleanup(db: D1DatabaseLike): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM auth_sessions WHERE user_id = 'phase2-fixture-user'"),
    db.prepare("DELETE FROM users WHERE id = 'phase2-fixture-user'"),
  ]);
}

integration.get('/phase2', async (c) => {
  const db = c.env.DB;
  await cleanup(db);

  const users = new UserRepository(db);
  const sessions = new AuthSessionRepository(db);
  const user = {
    id: 'phase2-fixture-user',
    email: 'phase2-fixture@example.invalid',
    name: 'Phase 2 Fixture',
    createdAt: NOW,
  };
  await users.create(user);

  const tokenHash = await hashSessionToken(RAW_TOKEN);
  await sessions.create({
    id: 'phase2-fixture-session',
    userId: user.id,
    tokenHash,
    expiresAt: EXPIRES,
    createdAt: NOW,
    lastSeenAt: NOW,
    revokedAt: null,
  });

  const runtimeEnv = {
    DB: db,
    APP_ENV: 'test',
    WEB_ORIGIN: 'http://localhost:5173',
    SESSION_SECRET: 'phase-two-integration-secret',
  };

  const unauthorized = await productionApp.request(
    'http://local.test/api/v1/dashboard/summary',
    {},
    runtimeEnv,
  );
  const authorized = await productionApp.request(
    'http://local.test/api/v1/dashboard/summary',
    { headers: { Cookie: `shalcon_session=${RAW_TOKEN}` } },
    runtimeEnv,
  );
  const authorizedBody = (await authorized.json()) as {
    user?: { email?: string };
  };

  const logout = await productionApp.request(
    'http://local.test/api/v1/auth/logout',
    { method: 'POST', headers: { Cookie: `shalcon_session=${RAW_TOKEN}` } },
    runtimeEnv,
  );
  const activeAfterLogout = await sessions.getActiveByTokenHash(
    tokenHash,
    '2026-09-03T08:01:00.000Z',
  );

  const migrationCount = await db
    .prepare('SELECT COUNT(*) AS count FROM d1_migrations')
    .first<{ count: number }>();
  const foreignKeyViolations = await db.prepare('PRAGMA foreign_key_check').all();

  return c.json({
    ok: true,
    migrationCount: migrationCount?.count ?? 0,
    checks: {
      unauthorizedBlocked: unauthorized.status === 401,
      authorizedAllowed: authorized.status === 200,
      authenticatedIdentity: authorizedBody.user?.email === user.email,
      logoutSucceeded: logout.status === 204,
      sessionRevoked: activeAfterLogout === null,
      tokenStoredHashed: tokenHash !== RAW_TOKEN,
      foreignKeyViolations: foreignKeyViolations.results.length,
    },
  });
});

export default integration;
