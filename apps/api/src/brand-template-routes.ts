import type { D1DatabaseLike } from '@shalcon/db';
import { THEME_DNA_OPTIONS } from '@shalcon/templates';
import { Hono } from 'hono';
import { z } from 'zod';

import { publicTemplateRegistry } from './brand-template-policy';
import {
  getBrandTemplateHistory,
  overrideBrandTemplateMatch,
  runAutomaticBrandTemplateMatch,
} from './brand-template';
import type { Bindings } from './context';

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

const themeSchema = z.object({
  paletteId: z.enum(THEME_DNA_OPTIONS.paletteId),
  typographyId: z.enum(THEME_DNA_OPTIONS.typographyId),
  radius: z.enum(THEME_DNA_OPTIONS.radius),
  density: z.enum(THEME_DNA_OPTIONS.density),
  heroVariant: z.enum(THEME_DNA_OPTIONS.heroVariant),
  imageTreatment: z.enum(THEME_DNA_OPTIONS.imageTreatment),
  motionPreset: z.enum(THEME_DNA_OPTIONS.motionPreset),
}).strict();
const overrideSchema = z.object({
  templateId: z.string().trim().min(1).max(120),
  templateVersion: z.string().trim().min(1).max(64),
  themeDNA: themeSchema,
}).strict();

function responseForError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const notFound = message === 'Prospect not found.';
  const invalidSelection = message.includes('allowed template registry entry') ||
    message.includes('not eligible for this prospect niche') ||
    message.includes('Invalid ThemeDNA payload');
  return {
    status: notFound ? 404 : invalidSelection ? 400 : 409,
    body: { error: { code: notFound ? 'NOT_FOUND' : invalidSelection ? 'INVALID_TEMPLATE_SELECTION' : 'BRAND_TEMPLATE_NOT_READY', message } },
  } as const;
}

export const brandTemplateRoutes = new Hono<Bindings>();
brandTemplateRoutes.get('/registry', (c) => c.json(publicTemplateRegistry()));

brandTemplateRoutes.get('/prospects/:id/matches', async (c) => {
  try {
    const runs = await getBrandTemplateHistory(requireDb(c.env.DB), c.get('authUser').id, c.req.param('id'));
    return c.json({ runs });
  } catch (error) {
    const response = responseForError(error, 'Brand/template history is unavailable.');
    return c.json(response.body, response.status);
  }
});

brandTemplateRoutes.post('/prospects/:id/matches', async (c) => {
  try {
    const run = await runAutomaticBrandTemplateMatch(requireDb(c.env.DB), c.get('authUser').id, c.req.param('id'));
    return c.json({ run, registryOnly: true, deterministicFit: true }, 201);
  } catch (error) {
    const response = responseForError(error, 'Brand/template matching could not run.');
    return c.json(response.body, response.status);
  }
});

brandTemplateRoutes.post('/prospects/:id/matches/:matchId/override', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = overrideSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'INVALID_TEMPLATE_OVERRIDE', message: 'Template override must reference an allowed registry template and controlled ThemeDNA values.' } }, 400);
  }
  try {
    const run = await overrideBrandTemplateMatch(requireDb(c.env.DB), c.get('authUser').id, c.req.param('id'), parsed.data);
    return c.json({ run, registryOnly: true, overrideLogged: true }, 201);
  } catch (error) {
    const response = responseForError(error, 'Manual template override could not be applied.');
    return c.json(response.body, response.status);
  }
});
