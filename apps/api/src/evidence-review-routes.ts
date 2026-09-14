import { Hono } from 'hono';
import { z } from 'zod';

import type { Bindings } from './context';
import {
  EvidenceReviewError,
  listEvidenceVerificationEvents,
  reviewEvidenceCandidate,
} from './evidence-verification';

const verifySchema = z
  .object({
    decision: z.literal('VERIFY'),
    promoteToFact: z.boolean().default(false),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
const rejectSchema = z
  .object({
    decision: z.literal('REJECT'),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
const reviewSchema = z.discriminatedUnion('decision', [verifySchema, rejectSchema]);

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

export const evidenceReviewRoutes = new Hono<Bindings>();

evidenceReviewRoutes.get('/:id/evidence/reviews', async (c) => {
  try {
    const events = await listEvidenceVerificationEvents(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
    );
    return c.json({ events });
  } catch (error) {
    if (error instanceof EvidenceReviewError) return c.json(errorResponse(error), error.status);
    throw error;
  }
});

evidenceReviewRoutes.post('/:id/evidence/:evidenceId/review', async (c) => {
  const parsed = reviewSchema.safeParse(await c.req.json().catch(() => null));
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
    const result = await reviewEvidenceCandidate(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
      c.req.param('evidenceId'),
      parsed.data,
      new Date().toISOString(),
    );
    return c.json(result);
  } catch (error) {
    if (error instanceof EvidenceReviewError) return c.json(errorResponse(error), error.status);
    throw error;
  }
});
