import { Hono } from 'hono';

const app = new Hono();

app.get('/phase20-setup-control', (c) => c.json({ ok: true, stage: 'GET_TRANSPORT' }));

export default app;
