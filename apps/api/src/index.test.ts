import { describe, expect, it } from 'vitest';
import { app } from './index';

const testEnv = {
  APP_ENV: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('public API', () => {
  it('returns a phase 2 health response', async () => {
    const response = await app.request('/api/v1/health', {}, testEnv);
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ ok: true, service: 'api', phase: 2 });
  });

  it('allows credentialed CORS only for the configured web origin', async () => {
    const allowed = await app.request(
      '/api/v1/health',
      { headers: { Origin: testEnv.WEB_ORIGIN } },
      testEnv,
    );
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(testEnv.WEB_ORIGIN);
    expect(allowed.headers.get('Access-Control-Allow-Credentials')).toBe('true');

    const rejected = await app.request(
      '/api/v1/health',
      { headers: { Origin: 'https://evil.invalid' } },
      testEnv,
    );
    expect(rejected.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(rejected.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});

describe('protected API', () => {
  it('blocks unauthenticated dashboard requests', async () => {
    const response = await app.request('/api/v1/dashboard/summary', {}, testEnv);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('logout is idempotent when no session exists', async () => {
    const response = await app.request('/api/v1/auth/logout', { method: 'POST' }, testEnv);
    expect(response.status).toBe(204);
  });
});
