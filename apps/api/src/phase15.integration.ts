import {
  CampaignRepository,
  EvidenceRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
} from '@shalcon/db';
import { Hono } from 'hono';

import { runAutomaticBrandTemplateMatch } from './brand-template';
import { runContentGeneration } from './content-engine';

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
  await new SourceRecordRepository(db).create({
    id: 'src_p15_diag',
    prospectId: 'p15_diag',
    provider: 'PHASE15_DIAGNOSTIC',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: 'https://p15-diag.example.com/',
    rawJson: '{}',
    capturedAt: now,
  });
  await new EvidenceRepository(db).create({
    id: 'ev_p15_diag_service',
    prospectId: 'p15_diag',
    field: 'service',
    value: 'Haircut',
    sourceRecordId: 'src_p15_diag',
    sourceUrl: 'https://p15-diag.example.com/',
    sourceQuality: 1,
    confidence: 0.96,
    verificationStatus: 'VERIFIED',
    excerpt: 'Haircut',
    capturedAt: now,
  });
  await runAutomaticBrandTemplateMatch(db, userId, 'p15_diag', now);
  const run = await runContentGeneration(db, userId, 'p15_diag', now);
  const state = await db
    .prepare('SELECT current_state FROM prospects WHERE id = ?')
    .bind('p15_diag')
    .first<{ current_state: string }>();
  return c.json({
    ok:
      state?.current_state === 'CONTENT_PENDING' &&
      run.content.services.length === 1 &&
      run.content.services[0]?.serviceName === 'Haircut' &&
      run.evidenceIds.includes('ev_p15_diag_service'),
    stage: 'first-content-run',
  });
});

export default app;
