import type { D1DatabaseLike } from '@shalcon/db';
import { Hono } from 'hono';

import type { Bindings } from './context';
import {
  getAssetSelectionHistory,
  publicTemplateAssetLibrary,
  runAssetSelection,
} from './asset-engine';

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

function responseForError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const notFound = message === 'Prospect not found.';
  return {
    status: notFound ? 404 : 409,
    body: {
      error: {
        code: notFound ? 'NOT_FOUND' : 'ASSET_SELECTION_NOT_READY',
        message,
      },
    },
  } as const;
}

export const assetRoutes = new Hono<Bindings>();

assetRoutes.get('/registry', (c) => c.json({
  assets: publicTemplateAssetLibrary(),
  templateImageryRepresentsProspectReality: false,
  randomThirdPartyReuseAllowed: false,
  watermarkedAssetsAllowed: false,
}));

assetRoutes.get('/prospects/:id/selections', async (c) => {
  try {
    const runs = await getAssetSelectionHistory(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
    );
    return c.json({ runs });
  } catch (error) {
    const response = responseForError(error, 'Asset selection history is unavailable.');
    return c.json(response.body, response.status);
  }
});

assetRoutes.post('/prospects/:id/selections', async (c) => {
  try {
    const run = await runAssetSelection(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
    );
    return c.json({
      run,
      officialProspectAssetsRequireProvenance: true,
      textWordmarkFallback: true,
      templateImageryRepresentsProspectReality: false,
    }, 201);
  } catch (error) {
    const response = responseForError(error, 'Asset selection could not run.');
    return c.json(response.body, response.status);
  }
});
