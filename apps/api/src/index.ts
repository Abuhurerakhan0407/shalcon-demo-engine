import {
  AuthIdentityRepository,
  AuthSessionRepository,
  UserRepository,
  type D1DatabaseLike,
  type UserRecord,
} from '@shalcon/db';
import { Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { logger } from 'hono/logger';

import { aiRunnerRoutes } from './ai-runner-routes';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  buildGoogleAuthorizationUrl,
  createOAuthState,
  exchangeGoogleCode,
  fetchGoogleProfile,
  hashSessionToken,
  normalizeReturnTo,
  randomToken,
  verifyOAuthState,
} from './auth';
import { brandTemplateRoutes } from './brand-template-routes';
import { contentRoutes } from './content-routes';
import { demoAdminRoutes } from './demo-admin-routes';
import { demoRoutes } from './demo-routes';
import { CURRENT_PHASE } from './phase';
import { prospectRoutes } from './prospect-routes';
import { researchAgentRoutes } from './research-agent-routes';
import { researchRunnerRoutes } from './research-runner-routes';
import { runnerRoutes } from './runner-routes';
import { scoringRoutes } from './scoring-routes';
import { websiteAuditRoutes } from './website-audit-routes';

interface JobSignalQueueLike {
  send(message: unknown): Promise<void>;
}

interface Env {
  DB?: D1DatabaseLike;
  APP_ENV: string;
  WEB_ORIGIN: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  SESSION_SECRET?: string;
  JOB_QUEUE?: JobSignalQueueLike;
}

type Bindings = {
  Bindings: Env;
  Variables: { authUser: UserRecord };
};

export const app = new Hono<Bindings>();

function requireDb(env: Env): D1DatabaseLike {
  if (!env.DB) throw new Error('D1 binding is not configured.');
  return env.DB;
}

function requireSecret(value: string | undefined, name: string): string {
  if (!value || value.length < 16) throw new Error(`${name} is not configured.`);
  return value;
}

function redirectUriFor(requestUrl: string, configured: string | undefined): string {
  return configured ?? `${new URL(requestUrl).origin}/api/v1/auth/google/callback`;
}

function cookieSecurity(env: Env): boolean {
  return env.APP_ENV === 'production';
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const segment of cookieHeader.split(';')) {
    const trimmed = segment.trim();
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    if (trimmed.slice(0, separator) === name) return trimmed.slice(separator + 1);
  }
  return undefined;
}

function identityConflictResponse() {
  return {
    error: {
      code: 'OAUTH_IDENTITY_CONFLICT',
      message: 'This email is already linked to a different Google identity.',
    },
  } as const;
}

async function authenticatedUser(env: Env, rawToken: string | undefined): Promise<UserRecord | null> {
  if (!rawToken || !env.DB) return null;
  const tokenHash = await hashSessionToken(rawToken);
  const now = new Date().toISOString();
  const sessions = new AuthSessionRepository(env.DB);
  const session = await sessions.getActiveByTokenHash(tokenHash, now);
  if (!session) return null;
  const user = await new UserRepository(env.DB).getById(session.userId);
  if (!user) return null;
  await sessions.touch(session.id, now);
  return user;
}

const requireAuth: MiddlewareHandler<Bindings> = async (c, next) => {
  const user = await authenticatedUser(c.env, readCookie(c.req.header('Cookie'), SESSION_COOKIE));
  if (!user) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } }, 401);
  }
  c.set('authUser', user);
  await next();
};

app.use('*', logger());
app.use('/api/*', async (c, next) => {
  const requestOrigin = c.req.header('Origin');
  if (requestOrigin === c.env.WEB_ORIGIN) {
    c.header('Access-Control-Allow-Origin', requestOrigin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, PUT, OPTIONS');
    c.header('Vary', 'Origin');
  }
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
});

app.use('/api/v1/dashboard/*', requireAuth);
app.use('/api/v1/prospects', requireAuth);
app.use('/api/v1/prospects/*', requireAuth);
app.use('/api/v1/research/*', requireAuth);
app.use('/api/v1/audits/*', requireAuth);
app.use('/api/v1/scoring/*', requireAuth);
app.use('/api/v1/brand-template/*', requireAuth);
app.use('/api/v1/content/*', requireAuth);
app.use('/api/v1/demo-admin/*', requireAuth);
app.use('/api/v1/runner/operator/*', requireAuth);

app.get('/', (c) =>
  c.json({ service: 'shalcon-demo-engine-api', phase: CURRENT_PHASE, status: 'ok' }),
);

app.get('/api/v1/health', (c) =>
  c.json({
    ok: true,
    service: 'api',
    phase: CURRENT_PHASE,
    environment: c.env.APP_ENV,
    timestamp: new Date().toISOString(),
  }),
);

app.get('/api/v1/auth/google/start', async (c) => {
  const clientId = requireSecret(c.env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID');
  const sessionSecret = requireSecret(c.env.SESSION_SECRET, 'SESSION_SECRET');
  const returnTo = normalizeReturnTo(c.req.query('return_to'));
  const state = await createOAuthState(sessionSecret, returnTo);
  const redirectUri = redirectUriFor(c.req.url, c.env.GOOGLE_REDIRECT_URI);
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: cookieSecurity(c.env),
    sameSite: 'Lax',
    path: '/api/v1/auth/google',
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });
  return c.redirect(buildGoogleAuthorizationUrl({ clientId, redirectUri, state }));
});

app.get('/api/v1/auth/google/callback', async (c) => {
  const state = c.req.query('state');
  const code = c.req.query('code');
  const stateCookie = readCookie(c.req.header('Cookie'), OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/api/v1/auth/google' });
  if (!state || !code || !stateCookie || state !== stateCookie) {
    return c.json({ error: { code: 'OAUTH_STATE_INVALID', message: 'OAuth state is invalid.' } }, 400);
  }

  const sessionSecret = requireSecret(c.env.SESSION_SECRET, 'SESSION_SECRET');
  const statePayload = await verifyOAuthState(sessionSecret, state);
  if (!statePayload) {
    return c.json({ error: { code: 'OAUTH_STATE_INVALID', message: 'OAuth state is invalid.' } }, 400);
  }

  const clientId = requireSecret(c.env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID');
  const clientSecret = requireSecret(c.env.GOOGLE_CLIENT_SECRET, 'GOOGLE_CLIENT_SECRET');
  const redirectUri = redirectUriFor(c.req.url, c.env.GOOGLE_REDIRECT_URI);
  const accessToken = await exchangeGoogleCode({ code, clientId, clientSecret, redirectUri });
  const profile = await fetchGoogleProfile(accessToken);
  const db = requireDb(c.env);
  const now = new Date();
  const nowIso = now.toISOString();
  const users = new UserRepository(db);
  const identities = new AuthIdentityRepository(db);
  const existingIdentity = await identities.getByProviderSubject('google', profile.sub);

  let user: UserRecord;
  if (existingIdentity) {
    const emailOwner = await users.getByEmail(profile.email);
    if (emailOwner && emailOwner.id !== existingIdentity.userId) {
      return c.json(identityConflictResponse(), 409);
    }
    user = await users.updateProfile(existingIdentity.userId, profile.email, profile.name);
    await identities.updateEmail(existingIdentity.id, profile.email, nowIso);
  } else {
    const emailOwner = await users.getByEmail(profile.email);
    if (emailOwner) return c.json(identityConflictResponse(), 409);
    user = {
      id: `usr_${randomToken(12)}`,
      email: profile.email,
      name: profile.name,
      createdAt: nowIso,
    };
    await users.create(user);
    const identity = await identities.createOrGet({
      id: `aid_${randomToken(12)}`,
      userId: user.id,
      provider: 'google',
      providerSubject: profile.sub,
      emailAtLink: profile.email,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    if (identity.identity.userId !== user.id) {
      throw new Error('Google identity resolved to an unexpected user.');
    }
  }

  const rawSessionToken = randomToken(32);
  const tokenHash = await hashSessionToken(rawSessionToken);
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  await new AuthSessionRepository(db).create({
    id: `ses_${randomToken(12)}`,
    userId: user.id,
    tokenHash,
    expiresAt: expiresAt.toISOString(),
    createdAt: nowIso,
    lastSeenAt: nowIso,
    revokedAt: null,
  });
  setCookie(c, SESSION_COOKIE, rawSessionToken, {
    httpOnly: true,
    secure: cookieSecurity(c.env),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return c.redirect(`${c.env.WEB_ORIGIN}${statePayload.returnTo}`);
});

app.get('/api/v1/auth/session', async (c) => {
  const user = await authenticatedUser(c.env, readCookie(c.req.header('Cookie'), SESSION_COOKIE));
  if (!user) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } }, 401);
  }
  return c.json({ user: { id: user.id, email: user.email, name: user.name } });
});

app.post('/api/v1/auth/logout', async (c) => {
  const rawToken = readCookie(c.req.header('Cookie'), SESSION_COOKIE);
  if (rawToken && c.env.DB) {
    const tokenHash = await hashSessionToken(rawToken);
    await new AuthSessionRepository(c.env.DB).revokeByTokenHash(tokenHash, new Date().toISOString());
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.body(null, 204);
});

app.get('/api/v1/dashboard/summary', (c) => {
  const user = c.get('authUser');
  return c.json({
    user: { id: user.id, email: user.email, name: user.name },
    phase: CURRENT_PHASE,
    system: 'ready',
  });
});

app.route('/api/v1/prospects', prospectRoutes);
app.route('/api/v1/research', researchAgentRoutes);
app.route('/api/v1/audits/website', websiteAuditRoutes);
app.route('/api/v1/scoring', scoringRoutes);
app.route('/api/v1/brand-template', brandTemplateRoutes);
app.route('/api/v1/content', contentRoutes);
app.route('/api/v1/demo-admin', demoAdminRoutes);
app.route('/api/v1/runner/ai', aiRunnerRoutes);
app.route('/api/v1/runner/research', researchRunnerRoutes);
app.route('/api/v1/runner', runnerRoutes);
app.route('/d', demoRoutes);

app.get('/api/v1/runner/health', (c) =>
  c.json({
    ok: true,
    phase: CURRENT_PHASE,
    runnerControlPlane: 'ready',
    d1Canonical: true,
    queueRole: c.env.JOB_QUEUE ? 'signal-accelerator' : 'd1-polling',
  }),
);

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }, 404));
app.onError((error, c) => {
  console.error('Unhandled request error', { name: error.name });
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' } }, 500);
});

export default app;
