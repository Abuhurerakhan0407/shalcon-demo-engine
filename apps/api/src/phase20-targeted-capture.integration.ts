import {
  CampaignRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
  type UserRecord,
} from '@shalcon/db';
import { Hono } from 'hono';

import type { Bindings } from './context';
import { createTargetedResearchCaptureRoutes } from './targeted-research-capture-routes';

const USER: UserRecord = {
  id: 'phase20-targeted-capture-user',
  email: 'phase20-targeted-capture@example.invalid',
  name: 'Phase 20 Targeted Capture',
  createdAt: '2026-09-27T00:00:00.000Z',
};

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

const app = new Hono<Bindings>();

app.get('/phase20/health', (c) => c.json({ ok: true, phase: 20, mode: 'TARGETED_CAPTURE_TEST' }));

app.post('/phase20/fixture', async (c) => {
  const db = requireDb(c.env.DB);
  const now = new Date().toISOString();
  await new UserRepository(db).create(USER);
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(USER.id, now);
  const prospects = new ProspectRepository(db);
  await prospects.create({
    id: 'p20_target_pending',
    campaignId: campaign.id,
    canonicalName: 'Target Salon',
    normalizedName: 'target salon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE20_TARGETED_CAPTURE_FIXTURE',
    currentState: 'RESEARCH_PENDING',
    domain: 'example.com',
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: now,
    updatedAt: now,
  });
  await prospects.create({
    id: 'p20_target_researched',
    campaignId: campaign.id,
    canonicalName: 'Done Salon',
    normalizedName: 'done salon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE20_TARGETED_CAPTURE_FIXTURE',
    currentState: 'RESEARCHED',
    domain: 'done.example',
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: now,
    updatedAt: now,
  });
  await prospects.create({
    id: 'p20_target_rerun',
    campaignId: campaign.id,
    canonicalName: 'Rerun Salon',
    normalizedName: 'rerun salon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE20_TARGETED_RERUN_FIXTURE',
    currentState: 'RESEARCH_PENDING',
    domain: 'rerun.example',
    phoneNormalized: '+919111111111',
    city: 'mumbai',
    addressNormalized: '5 rerun lane, mumbai',
    createdAt: now,
    updatedAt: now,
  });

  const sources = new SourceRecordRepository(db);
  await sources.create({
    id: 'src_p20_rerun_good',
    prospectId: 'p20_target_rerun',
    provider: 'PLAYWRIGHT',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: 'https://www.rerun.example/contact',
    rawJson: JSON.stringify({
      page: {
        title: 'Rerun Salon Contact',
        text: 'Rerun Salon\nPhone +91 91111 11111\n5 Rerun Lane, Mumbai',
      },
    }),
    capturedAt: now,
  });
  await sources.create({
    id: 'src_p20_rerun_offdomain',
    prospectId: 'p20_target_rerun',
    provider: 'PLAYWRIGHT',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: 'https://wrong.example/contact',
    rawJson: JSON.stringify({ page: { title: 'Wrong', text: 'Wrong source content' } }),
    capturedAt: now,
  });
  await sources.create({
    id: 'src_p20_done_good',
    prospectId: 'p20_target_researched',
    provider: 'PLAYWRIGHT',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: 'https://done.example/contact',
    rawJson: JSON.stringify({ page: { title: 'Done Salon', text: 'Done Salon contact page' } }),
    capturedAt: now,
  });
  return c.json({ ok: true, trialResultsModified: false }, 201);
});

app.route('/phase20', createTargetedResearchCaptureRoutes(USER.id));

app.get('/phase20/status', async (c) => {
  const db = requireDb(c.env.DB);
  const prospects = await new ProspectRepository(db).listForUser(USER.id);
  const jobs = await db
    .prepare(`
      SELECT j.id, j.job_type, j.entity_id, j.status, jc.payload_json
      FROM jobs j
      JOIN job_contexts jc ON jc.job_id = j.id
      WHERE jc.user_id = ?
      ORDER BY j.created_at, j.id
    `)
    .bind(USER.id)
    .all<Record<string, unknown>>();
  const runs = await db
    .prepare(`
      SELECT id, prospect_id, status, selected_sources_json
      FROM research_runs
      WHERE user_id = ?
      ORDER BY created_at, id
    `)
    .bind(USER.id)
    .all<Record<string, unknown>>();
  const fk = await db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>();
  return c.json({
    prospects: prospects.map((prospect) => ({ id: prospect.id, currentState: prospect.currentState })),
    jobs: jobs.results,
    runs: runs.results,
    foreignKeyViolations: fk.results.length,
    trialResultsModified: false,
  });
});

export default app;
