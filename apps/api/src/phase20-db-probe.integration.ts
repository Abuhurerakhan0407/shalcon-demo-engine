import type { D1DatabaseLike } from '@shalcon/db';
import { Hono } from 'hono';

type Env = { DB?: D1DatabaseLike };
type Bindings = { Bindings: Env };

const app = new Hono<Bindings>();

app.get('/phase20/db-schema-probe', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ ok: false, binding: false }, 503);
  const users = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .first<{ name: string }>();
  const migrations = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'")
    .first<{ name: string }>();
  return c.json({
    ok: users?.name === 'users' && migrations?.name === 'd1_migrations',
    binding: true,
    usersTable: users?.name === 'users',
    migrationsTable: migrations?.name === 'd1_migrations',
  }, users?.name === 'users' && migrations?.name === 'd1_migrations' ? 200 : 500);
});

async function insertProbe(db: D1DatabaseLike) {
  const id = 'phase20-raw-insert-probe';
  await db
    .prepare('INSERT INTO users(id, email, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, 'phase20-raw-insert@example.invalid', 'Phase 20 Raw Insert', new Date().toISOString())
    .run();
  return db.prepare('SELECT id FROM users WHERE id = ?').bind(id).first<{ id: string }>();
}

app.get('/phase20/db-write-probe', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ ok: false, binding: false }, 503);
  const row = await insertProbe(db);
  return c.json({ ok: row?.id === 'phase20-raw-insert-probe', binding: true }, row?.id === 'phase20-raw-insert-probe' ? 200 : 500);
});

app.post('/phase20/db-insert-probe', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ ok: false, binding: false }, 503);
  const row = await insertProbe(db);
  return c.json({ ok: row?.id === 'phase20-raw-insert-probe', binding: true }, row?.id === 'phase20-raw-insert-probe' ? 201 : 500);
});

export default app;
