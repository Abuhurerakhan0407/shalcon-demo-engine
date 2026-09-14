import { UserRepository, type D1DatabaseLike } from '@shalcon/db';
import { Hono } from 'hono';

interface Env { DB: D1DatabaseLike }

const app = new Hono<{ Bindings: Env }>();

app.get('/phase20-write-control', async (c) => {
  const now = '2026-09-14T05:30:00.000Z';
  const id = 'usr_phase20_write_control';
  const users = new UserRepository(c.env.DB);
  await users.create({
    id,
    email: 'phase20-write-control@example.invalid',
    name: 'Phase 20 Write Control',
    createdAt: now,
  });
  const persisted = await users.getById(id);
  return c.json({ ok: persisted?.id === id }, persisted?.id === id ? 200 : 500);
});

export default app;
