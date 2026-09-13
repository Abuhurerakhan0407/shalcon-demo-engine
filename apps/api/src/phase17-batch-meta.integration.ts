import {
  CampaignRepository,
  ProspectRepository,
  UserRepository,
  type D1DatabaseLike,
} from '@shalcon/db';
import { Hono } from 'hono';

interface Env { DB: D1DatabaseLike }
const app = new Hono<{ Bindings: Env }>();
app.get('/healthz', (c) => c.json({ ok: true }));

app.get('/phase17-batch-meta', async (c) => {
  const db = c.env.DB;
  const userId = 'usr_p17_batch';
  const prospectId = 'p17_batch';
  const at = '2026-09-14T02:00:00.000Z';
  await new UserRepository(db).create({ id: userId, email: 'p17-batch@example.com', name: 'P17 Batch', createdAt: at });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(userId, at);
  await new ProspectRepository(db).create({
    id: prospectId,
    campaignId: campaign.id,
    canonicalName: 'P17 Batch Salon',
    normalizedName: 'p17 batch salon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE17_BATCH',
    currentState: 'CONTENT_PENDING',
    domain: 'p17-batch.example.com',
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: at,
    updatedAt: at,
  });

  const writes = await db.batch([
    db.prepare(`
      UPDATE prospects SET current_state = 'DEMO_CONFIGURED', updated_at = ?
      WHERE id = ? AND current_state = 'CONTENT_PENDING'
        AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)
    `).bind(at, prospectId, userId),
    db.prepare(`
      UPDATE prospects SET current_state = 'RENDER_PENDING', updated_at = ?
      WHERE id = ? AND current_state = 'DEMO_CONFIGURED'
        AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)
    `).bind(at, prospectId, userId),
    db.prepare(`
      UPDATE prospects SET current_state = 'RENDERED', updated_at = ?
      WHERE id = ? AND current_state = 'RENDER_PENDING'
        AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)
    `).bind(at, prospectId, userId),
  ]);
  const state = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  const events = await new ProspectRepository(db).listStateEvents(prospectId);
  const changes = writes.map((item) => Number(item.meta?.changes ?? -1));
  const checks = {
    eachStatementChangedOne: changes.length === 3 && changes.every((value) => value === 1),
    finalStateRendered: state?.currentState === 'RENDERED',
    threeEvents: events.length === 3,
    exactPath:
      events[0]?.fromState === 'CONTENT_PENDING' && events[0]?.toState === 'DEMO_CONFIGURED' &&
      events[1]?.fromState === 'DEMO_CONFIGURED' && events[1]?.toState === 'RENDER_PENDING' &&
      events[2]?.fromState === 'RENDER_PENDING' && events[2]?.toState === 'RENDERED',
  };
  return c.json({ ok: Object.values(checks).every(Boolean), checks, changes });
});

export default app;
