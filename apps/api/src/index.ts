import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

interface Env {
  APP_ENV: string;
  WEB_ORIGIN: string;
}

type Bindings = { Bindings: Env };

export const app = new Hono<Bindings>();

app.use('*', logger());
app.use(
  '/api/*',
  cors({
    origin: 'http://localhost:5173',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

app.get('/', (c) =>
  c.json({
    service: 'shalcon-demo-engine-api',
    phase: 0,
    status: 'ok',
  }),
);

app.get('/api/v1/health', (c) =>
  c.json({
    ok: true,
    service: 'api',
    phase: 0,
    environment: c.env.APP_ENV,
    timestamp: new Date().toISOString(),
  }),
);

app.get('/api/v1/runner/health', (c) =>
  c.json({
    ok: true,
    runner: 'not-connected',
    message: 'Local runner connection begins in Phase 8.',
  }),
);

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }, 404));

app.onError((error, c) => {
  console.error('Unhandled request error', { name: error.name });
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' } },
    500,
  );
});

export default app;
