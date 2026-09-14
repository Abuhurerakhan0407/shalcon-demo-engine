import { UserRepository, type D1DatabaseLike } from '@shalcon/db';
import { Hono } from 'hono';
import { z } from 'zod';

interface Env { DB: D1DatabaseLike }

const candidateSchema = z.object({
  id: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/u),
  businessName: z.string().trim().min(2).max(200),
  location: z.string().trim().min(2).max(200),
  sourceUrl: z.string().trim().url().max(2048),
  officialWebsite: z.string().trim().url().max(2048).nullable().optional(),
}).strict();

const setupSchema = z.object({
  candidates: z.array(candidateSchema).min(1).max(3),
}).strict();

const app = new Hono<{ Bindings: Env }>();

app.post('/phase20-setup-control', async (c) => {
  const input = setupSchema.parse(await c.req.json());
  const now = '2026-09-14T05:35:00.000Z';
  const id = 'usr_phase20_setup_control';
  const users = new UserRepository(c.env.DB);
  await users.create({
    id,
    email: 'phase20-setup-control@example.invalid',
    name: 'Phase 20 Setup Control',
    createdAt: now,
  });
  const persisted = await users.getById(id);
  return c.json({
    ok: persisted?.id === id,
    parsedCandidateCount: input.candidates.length,
    firstCandidateId: input.candidates[0]?.id ?? null,
  }, persisted?.id === id ? 201 : 500);
});

export default app;
