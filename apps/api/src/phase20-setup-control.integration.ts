import { Hono } from 'hono';
import { z } from 'zod';

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

const app = new Hono();

app.post('/phase20-setup-control', async (c) => {
  const raw = await c.req.json();
  const parsed = setupSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ ok: false, stage: 'PARSE', issues: parsed.error.issues }, 422);
  }
  return c.json({
    ok: true,
    stage: 'PARSE',
    parsedCandidateCount: parsed.data.candidates.length,
    firstCandidateId: parsed.data.candidates[0]?.id ?? null,
  });
});

export default app;
