import { DemoRepository, type D1DatabaseLike } from '@shalcon/db';
import { Hono, type Context } from 'hono';

import type { Bindings } from './context';
import { hashDemoToken, isValidDemoToken, renderDemoRecord } from './demo-renderer';

type AppContext = Context<Bindings>;

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

function setDemoSecurityHeaders(c: AppContext) {
  c.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
  c.header('Cache-Control', 'private, no-store, max-age=0');
  c.header('Pragma', 'no-cache');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Content-Type-Options', 'nosniff');
}

function unavailable(c: AppContext) {
  setDemoSecurityHeaders(c);
  return c.html(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Preview unavailable</title></head><body><main><h1>Preview unavailable</h1><p>This private concept preview is unavailable or has expired.</p></main></body></html>',
    404,
  );
}

export const demoRoutes = new Hono<Bindings>();

demoRoutes.get('/:token', async (c) => {
  const token = c.req.param('token');
  if (!isValidDemoToken(token)) return unavailable(c);

  const tokenHash = await hashDemoToken(token);
  const demo = await new DemoRepository(requireDb(c.env.DB)).getByTokenHash(tokenHash);
  if (!demo) return unavailable(c);

  const rendered = renderDemoRecord(demo, new Date().toISOString());
  if (!rendered.ok) {
    console.warn('Demo render denied', { demoId: demo.id, reason: rendered.reason });
    return unavailable(c);
  }

  setDemoSecurityHeaders(c);
  c.header('Content-Type', 'text/html; charset=UTF-8');
  c.header('X-Shalcon-Demo', rendered.demoId);
  return c.html(rendered.html, 200);
});
