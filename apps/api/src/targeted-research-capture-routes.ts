import { ProspectRepository, SourceRecordRepository, type D1DatabaseLike } from '@shalcon/db';
import { normalizeDomain } from '@shalcon/evidence';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Bindings } from './context';
import { startPhase11Research } from './research-agent';

const targetedCaptureSchema = z
  .object({
    prospectId: z.string().trim().min(1).max(120),
    url: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine((value) => new Set(['http:', 'https:']).has(new URL(value).protocol), {
        message: 'Targeted capture URL must use HTTP or HTTPS.',
      }),
    maxPages: z.number().int().min(1).max(4).default(1),
  })
  .strict();

const targetedRerunSchema = z
  .object({
    prospectId: z.string().trim().min(1).max(120),
    sourceRecordId: z.string().trim().min(1).max(160),
    model: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u)
      .optional(),
  })
  .strict();

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

function token(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/gu, '')}`;
}

function hostMatchesLockedDomain(url: string, lockedDomain: string): boolean {
  const target = normalizeDomain(new URL(url).hostname);
  const locked = normalizeDomain(lockedDomain);
  if (!target || !locked) return false;
  return target === locked || target.endsWith(`.${locked}`);
}

async function activeResearchJob(db: D1DatabaseLike, prospectId: string) {
  return db
    .prepare(`
      SELECT id, job_type
      FROM jobs
      WHERE entity_id = ?
        AND job_type IN ('PLAYWRIGHT_RESEARCH', 'LOCAL_AI_EXTRACT')
        AND status IN ('PENDING', 'RUNNING')
      LIMIT 1
    `)
    .bind(prospectId)
    .first<{ id: string; job_type: string }>();
}

export function createTargetedResearchCaptureRoutes(userId: string): Hono<Bindings> {
  const routes = new Hono<Bindings>();

  routes.post('/targeted-capture', async (c) => {
    const parsed = targetedCaptureSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Targeted capture input is invalid.' } },
        400,
      );
    }

    const db = requireDb(c.env.DB);
    const prospect = await new ProspectRepository(db).getByIdForUser(parsed.data.prospectId, userId);
    if (!prospect) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Prospect not found.' } }, 404);
    }
    if (prospect.currentState !== 'RESEARCH_PENDING') {
      return c.json(
        {
          error: {
            code: 'TARGETED_CAPTURE_STATE_INVALID',
            message: `Targeted capture requires RESEARCH_PENDING; found ${prospect.currentState}.`,
          },
        },
        409,
      );
    }
    if (!prospect.domain || !hostMatchesLockedDomain(parsed.data.url, prospect.domain)) {
      return c.json(
        {
          error: {
            code: 'TARGET_DOMAIN_MISMATCH',
            message: 'Targeted capture URL must match the prospect locked domain.',
          },
        },
        409,
      );
    }

    const active = await activeResearchJob(db, prospect.id);
    if (active?.id) {
      return c.json(
        {
          error: {
            code: 'TARGETED_CAPTURE_ALREADY_ACTIVE',
            message: 'A research job is already active for this prospect.',
          },
        },
        409,
      );
    }

    const now = new Date().toISOString();
    const jobId = token('job_targeted');
    const idempotencyKey = `phase20-targeted:${prospect.id}:${jobId}`;
    const payloadJson = JSON.stringify({ url: parsed.data.url, maxPages: parsed.data.maxPages });
    const writes = await db.batch([
      db
        .prepare(`
          INSERT INTO jobs(
            id, job_type, entity_id, status, priority, idempotency_key, attempts, max_attempts,
            lease_owner, lease_expires_at, scheduled_for, started_at, completed_at,
            last_error_code, last_error_safe_message, created_at, updated_at
          ) VALUES (?, 'PLAYWRIGHT_RESEARCH', ?, 'PENDING', 95, ?, 0, 1,
            NULL, NULL, ?, NULL, NULL, NULL, NULL, ?, ?)
        `)
        .bind(jobId, prospect.id, idempotencyKey, now, now, now),
      db
        .prepare(`
          INSERT INTO job_contexts(job_id, user_id, payload_json, result_json, created_at, updated_at)
          VALUES (?, ?, ?, NULL, ?, ?)
        `)
        .bind(jobId, userId, payloadJson, now, now),
    ]);
    if (writes.length !== 2 || writes.some((write) => write.meta?.changes !== 1)) {
      throw new Error('Targeted research capture did not queue atomically.');
    }

    return c.json(
      {
        jobId,
        prospectId: prospect.id,
        url: parsed.data.url,
        maxPages: parsed.data.maxPages,
        state: prospect.currentState,
        trialResultsModified: false,
      },
      201,
    );
  });

  routes.post('/targeted-rerun', async (c) => {
    const parsed = targetedRerunSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Targeted rerun input is invalid.' } },
        400,
      );
    }

    const db = requireDb(c.env.DB);
    const prospect = await new ProspectRepository(db).getByIdForUser(parsed.data.prospectId, userId);
    if (!prospect) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Prospect not found.' } }, 404);
    }
    if (prospect.currentState !== 'RESEARCH_PENDING') {
      return c.json(
        {
          error: {
            code: 'TARGETED_RERUN_STATE_INVALID',
            message: `Targeted rerun requires RESEARCH_PENDING; found ${prospect.currentState}.`,
          },
        },
        409,
      );
    }

    const source = await new SourceRecordRepository(db).getById(parsed.data.sourceRecordId);
    if (!source || source.prospectId !== prospect.id) {
      return c.json(
        { error: { code: 'TARGETED_RERUN_SOURCE_INVALID', message: 'Source is unavailable to this prospect.' } },
        409,
      );
    }
    if (
      source.provider !== 'PLAYWRIGHT' ||
      source.sourceType !== 'WEBSITE_PAGE' ||
      !prospect.domain ||
      !hostMatchesLockedDomain(source.sourceUrl, prospect.domain)
    ) {
      return c.json(
        {
          error: {
            code: 'TARGETED_RERUN_SOURCE_UNTRUSTED',
            message: 'Targeted rerun requires a Playwright website source on the locked domain.',
          },
        },
        409,
      );
    }

    const active = await activeResearchJob(db, prospect.id);
    if (active?.id) {
      return c.json(
        {
          error: {
            code: 'TARGETED_RERUN_ALREADY_ACTIVE',
            message: 'A research job is already active for this prospect.',
          },
        },
        409,
      );
    }

    try {
      const run = await startPhase11Research(
        db,
        userId,
        prospect.id,
        {
          sourceRecordIds: [source.id],
          ...(parsed.data.model ? { model: parsed.data.model } : {}),
        },
      );
      return c.json(
        {
          run,
          prospectId: prospect.id,
          sourceRecordId: source.id,
          state: prospect.currentState,
          verifiedFactPromotion: false,
          trialResultsModified: false,
        },
        202,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Targeted rerun could not start.';
      return c.json({ error: { code: 'TARGETED_RERUN_NOT_READY', message } }, 409);
    }
  });

  return routes;
}
