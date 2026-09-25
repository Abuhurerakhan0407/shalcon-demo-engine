import { Hono } from 'hono';
import { z } from 'zod';

import type { Bindings } from './context';
import {
  applySafeEvidenceAudit,
  planProspectEvidenceAudit,
  previewEvidenceAudit,
} from './evidence-auditor';
import { EvidenceReviewError } from './evidence-verification';

const applySchema = z
  .object({
    prospectIds: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  })
  .strict();

function requireDb(db: Bindings['Bindings']['DB']) {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

function errorResponse(error: EvidenceReviewError) {
  return {
    error: {
      code: error.code,
      message: error.message,
    },
  };
}

export const evidenceAuditorRoutes = new Hono<Bindings>();

evidenceAuditorRoutes.get('/preview', async (c) => {
  try {
    const result = await previewEvidenceAudit(requireDb(c.env.DB), c.get('authUser').id);
    return c.json(result);
  } catch (error) {
    if (error instanceof EvidenceReviewError) return c.json(errorResponse(error), error.status);
    throw error;
  }
});

evidenceAuditorRoutes.get('/prospects/:id/preview', async (c) => {
  try {
    const result = await planProspectEvidenceAudit(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
    );
    return c.json(result);
  } catch (error) {
    if (error instanceof EvidenceReviewError) return c.json(errorResponse(error), error.status);
    throw error;
  }
});

evidenceAuditorRoutes.post('/apply-safe', async (c) => {
  const parsed = applySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((issue) => issue.message).join(' '),
        },
      },
      400,
    );
  }

  try {
    const result = await applySafeEvidenceAudit(
      requireDb(c.env.DB),
      c.get('authUser').id,
      parsed.data.prospectIds,
      new Date().toISOString(),
    );
    return c.json(result);
  } catch (error) {
    if (error instanceof EvidenceReviewError) return c.json(errorResponse(error), error.status);
    throw error;
  }
});
