import { Hono } from 'hono';

const app = new Hono();

app.get('/phase20-health-control', (c) => c.json({ ok: true, stage: 'READY' }));
app.post('/phase20-setup-control', (c) => c.json({ ok: true, stage: 'POST_TRANSPORT' }, 201));

export default app;
