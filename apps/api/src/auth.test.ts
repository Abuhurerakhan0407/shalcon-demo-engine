import { describe, expect, it, vi } from 'vitest';

import {
  buildGoogleAuthorizationUrl,
  createOAuthState,
  exchangeGoogleCode,
  fetchGoogleProfile,
  hashSessionToken,
  normalizeReturnTo,
  verifyOAuthState,
} from './auth';

const SECRET = 'phase-two-test-secret-that-is-long-enough';

describe('OAuth state', () => {
  it('round-trips a signed internal return path and rejects tampering', async () => {
    const now = 1_800_000_000_000;
    const state = await createOAuthState(SECRET, '/prospects?view=ready', now);
    await expect(verifyOAuthState(SECRET, state, now + 1_000)).resolves.toMatchObject({
      returnTo: '/prospects?view=ready',
    });
    const tampered = `${state.slice(0, -1)}${state.endsWith('a') ? 'b' : 'a'}`;
    await expect(verifyOAuthState(SECRET, tampered, now + 1_000)).resolves.toBeNull();
  });

  it('rejects expired state and external return targets', async () => {
    const now = 1_800_000_000_000;
    const state = await createOAuthState(SECRET, 'https://evil.invalid/path', now);
    await expect(verifyOAuthState(SECRET, state, now + 601_000)).resolves.toBeNull();
    expect(normalizeReturnTo('//evil.invalid/path')).toBe('/dashboard');
    expect(normalizeReturnTo('https://evil.invalid/path')).toBe('/dashboard');
  });
});

describe('Google OAuth helpers', () => {
  it('builds the authorization request with the required identity scopes', () => {
    const url = new URL(
      buildGoogleAuthorizationUrl({
        clientId: 'client-id',
        redirectUri: 'https://api.example.com/api/v1/auth/google/callback',
        state: 'signed-state',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('signed-state');
  });

  it('exchanges a code and accepts only verified Google profiles', async () => {
    const tokenFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'access-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      exchangeGoogleCode(
        {
          code: 'code',
          clientId: 'client-id',
          clientSecret: 'client-secret',
          redirectUri: 'https://api.example.com/callback',
        },
        tokenFetch,
      ),
    ).resolves.toBe('access-token');

    const profileFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          sub: 'google-subject',
          email: 'Owner@Example.com',
          name: 'Owner',
          email_verified: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(fetchGoogleProfile('access-token', profileFetch)).resolves.toEqual({
      sub: 'google-subject',
      email: 'owner@example.com',
      name: 'Owner',
      emailVerified: true,
    });
  });
});

describe('session token hashing', () => {
  it('is deterministic without storing the raw token', async () => {
    const one = await hashSessionToken('raw-session-token');
    const two = await hashSessionToken('raw-session-token');
    expect(one).toBe(two);
    expect(one).not.toContain('raw-session-token');
  });
});
