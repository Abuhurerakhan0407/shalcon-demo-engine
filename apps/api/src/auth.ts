const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const SESSION_COOKIE = 'shalcon_session';
export const OAUTH_STATE_COOKIE = 'shalcon_oauth_state';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;

export interface OAuthStatePayload {
  nonce: string;
  returnTo: string;
  issuedAt: number;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

export function normalizeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

export async function createOAuthState(
  secret: string,
  returnTo: string,
  nowMs = Date.now(),
): Promise<string> {
  const payload: OAuthStatePayload = {
    nonce: randomToken(18),
    returnTo: normalizeReturnTo(returnTo),
    issuedAt: nowMs,
  };
  const encodedPayload = bytesToBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const signature = await hmac(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifyOAuthState(
  secret: string,
  state: string,
  nowMs = Date.now(),
): Promise<OAuthStatePayload | null> {
  const [encodedPayload, signature, extra] = state.split('.');
  if (!encodedPayload || !signature || extra !== undefined) return null;

  const expected = await hmac(secret, encodedPayload);
  if (!constantTimeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(textDecoder.decode(base64UrlToBytes(encodedPayload))) as Partial<OAuthStatePayload>;
    if (
      typeof payload.nonce !== 'string' ||
      typeof payload.returnTo !== 'string' ||
      typeof payload.issuedAt !== 'number'
    ) {
      return null;
    }
    const ageMs = nowMs - payload.issuedAt;
    if (ageMs < 0 || ageMs > OAUTH_STATE_MAX_AGE_SECONDS * 1000) return null;
    return {
      nonce: payload.nonce,
      returnTo: normalizeReturnTo(payload.returnTo),
      issuedAt: payload.issuedAt,
    };
  } catch {
    return null;
  }
}

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', input.state);
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export async function exchangeGoogleCode(
  input: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: 'authorization_code',
  });
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error('Google OAuth token exchange failed.');
  const payload = (await response.json()) as { access_token?: unknown };
  if (typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
    throw new Error('Google OAuth token response was invalid.');
  }
  return payload.access_token;
}

export async function fetchGoogleProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleProfile> {
  const response = await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Google profile lookup failed.');
  const payload = (await response.json()) as Record<string, unknown>;
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.name !== 'string' ||
    payload.email_verified !== true
  ) {
    throw new Error('Google profile response was incomplete or unverified.');
  }
  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name,
    emailVerified: true,
  };
}
