import { Hono } from 'hono';

const app = new Hono();

app.post('/phase20-setup-control', (c) => c.json({ ok: true, stage: 'POST_TRANSPORT' }));

export default app;
