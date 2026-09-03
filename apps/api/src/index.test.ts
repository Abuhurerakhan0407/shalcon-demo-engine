import { describe, expect, it } from 'vitest';
import { app } from './index';

describe('health endpoint', () => {
  it('returns a phase 0 health response', async () => {
    const response = await app.request('/api/v1/health', {}, {
      APP_ENV: 'test',
      WEB_ORIGIN: 'http://localhost:5173',
    });
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ ok: true, service: 'api', phase: 0 });
  });
});
