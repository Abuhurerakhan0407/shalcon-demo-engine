import { Hono } from 'hono';

const app = new Hono();

app.post('/phase20-setup-control', async (c) => {
  const raw: unknown = await c.req.json();
  if (!raw || typeof raw !== 'object') {
    return c.json({ ok: false, stage: 'JSON', reason: 'body_not_object' }, 422);
  }
  const candidates = (raw as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length < 1) {
    return c.json({ ok: false, stage: 'JSON', reason: 'candidates_missing' }, 422);
  }
  const first = candidates[0];
  const firstCandidateId = first && typeof first === 'object' && 'id' in first
    ? String((first as { id?: unknown }).id ?? '')
    : '';
  return c.json({
    ok: true,
    stage: 'JSON',
    parsedCandidateCount: candidates.length,
    firstCandidateId,
  });
});

export default app;
