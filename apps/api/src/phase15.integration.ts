import {
  CampaignRepository,
  ProspectRepository,
  UserRepository,
  type D1DatabaseLike,
} from '@shalcon/db';
import { Hono } from 'hono';

import { runAutomaticBrandTemplateMatch } from './brand-template';

interface Env { DB: D1DatabaseLike }
const app = new Hono<{ Bindings: Env }>();
app.get('/healthz', (c) => c.json({ ok: true }));

const now = '2026-09-12T00:00:00.000Z';

app.get('/phase15', async (c) => {
  const db = c.env.DB;
  const userId = 'usr_phase15_diag';
  await new UserRepository(db).create({
    id: userId,
    email: 'phase15-diag@example.com',
    name: 'Phase 15 diagnostic',
    createdAt: now,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(userId, now);
  await new ProspectRepository(db).create({
    id: 'p15_diag',
    campaignId: campaign.id,
    canonicalName: 'Phase 15 diagnostic salon',
    normalizedName: 'phase15 diagnosticsalon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE15_DIAGNOSTIC',
    currentState: 'DEMO_QUALIFIED',
    domain: 'p15-diag.example.com',
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: now,
    updatedAt: now,
  });
  const match = await runAutomaticBrandTemplateMatch(db, userId, 'p15_diag', now);
  const state = await db
    .prepare('SELECT current_state FROM prospects WHERE id = ?')
    .bind('p15_diag')
    .first<{ current_state: string }>();
  return c.json({
    ok: match.match.templateId.length > 0 && state?.current_state === 'TEMPLATE_MATCHED',
    stage: 'brand-template',
  });
});

export default app;
