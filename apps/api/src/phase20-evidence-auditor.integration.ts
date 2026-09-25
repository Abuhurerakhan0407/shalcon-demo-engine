import {
  CampaignRepository,
  EvidenceRepository,
  ProspectFactRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
  type UserRecord,
} from '@shalcon/db';
import { Hono } from 'hono';

import type { Bindings } from './context';
import { evidenceAuditorRoutes } from './evidence-auditor-routes';

const USER: UserRecord = {
  id: 'usr_phase20_evidence_auditor',
  email: 'phase20-evidence-auditor@example.invalid',
  name: 'Phase 20 Evidence Auditor',
  createdAt: '2026-09-25T00:00:00.000Z',
};

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

const app = new Hono<Bindings>();

app.use('/api/v1/evidence-auditor/*', async (c, next) => {
  c.set('authUser', USER);
  await next();
});
app.route('/api/v1/evidence-auditor', evidenceAuditorRoutes);

app.get('/phase20/health', (c) =>
  c.json({ ok: true, phase: 20, mode: 'EVIDENCE_AUDITOR' }),
);

app.post('/phase20/fixture', async (c) => {
  const db = requireDb(c.env.DB);
  const now = new Date().toISOString();
  await new UserRepository(db).create(USER);
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(USER.id, now);
  const prospects = new ProspectRepository(db);

  await prospects.create({
    id: 'p20_audit',
    campaignId: campaign.id,
    canonicalName: 'Audit Salon',
    normalizedName: 'audit salon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE20_AUDITOR_FIXTURE',
    currentState: 'RESEARCH_PENDING',
    domain: 'audit-salon.example',
    phoneNormalized: '+919876543210',
    city: 'mumbai',
    addressNormalized: '10 audit road, mumbai',
    createdAt: now,
    updatedAt: now,
  });

  await prospects.create({
    id: 'p20_uncertain',
    campaignId: campaign.id,
    canonicalName: 'Uncertain Salon',
    normalizedName: 'uncertain salon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE20_AUDITOR_FIXTURE',
    currentState: 'RESEARCH_PENDING',
    domain: null,
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: now,
    updatedAt: now,
  });

  await prospects.create({
    id: 'p20_clean',
    campaignId: campaign.id,
    canonicalName: 'Clean Salon',
    normalizedName: 'clean salon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE20_AUDITOR_FIXTURE',
    currentState: 'RESEARCH_PENDING',
    domain: 'clean-salon.example',
    phoneNormalized: '+919111111111',
    city: 'mumbai',
    addressNormalized: '5 clean lane, mumbai',
    createdAt: now,
    updatedAt: now,
  });

  const sources = new SourceRecordRepository(db);
  for (const [id, prospectId, url] of [
    ['src_audit_home', 'p20_audit', 'https://audit-salon.example/'],
    ['src_audit_contact', 'p20_audit', 'https://audit-salon.example/contact'],
    ['src_uncertain', 'p20_uncertain', 'https://directory.example/uncertain-salon'],
    ['src_uncertain_two', 'p20_uncertain', 'https://directory-two.example/uncertain-salon'],
    ['src_clean_home', 'p20_clean', 'https://clean-salon.example/'],
    ['src_clean_contact', 'p20_clean', 'https://www.clean-salon.example/contact'],
    ['src_clean_directory', 'p20_clean', 'https://directory.example/clean-salon'],
    ['src_clean_directory_two', 'p20_clean', 'https://directory-two.example/clean-salon'],
  ] as const) {
    await sources.create({
      id,
      prospectId,
      provider: 'PLAYWRIGHT',
      sourceType: 'WEBSITE_PAGE',
      sourceUrl: url,
      rawJson: '{}',
      capturedAt: now,
    });
  }

  const evidence = new EvidenceRepository(db);
  const create = (
    id: string,
    prospectId: string,
    sourceRecordId: string,
    sourceUrl: string,
    field: string,
    value: string,
    confidence = 0.9,
    sourceQuality = 1,
  ) =>
    evidence.create({
      id,
      prospectId,
      field,
      value,
      sourceRecordId,
      sourceUrl,
      sourceQuality,
      confidence,
      verificationStatus: confidence >= 0.8 ? 'PROBABLE' : 'UNVERIFIED',
      excerpt: value,
      capturedAt: now,
    });

  await create(
    'ev_name_good_home',
    'p20_audit',
    'src_audit_home',
    'https://audit-salon.example/',
    'businessName',
    'Audit Salon',
  );
  await create(
    'ev_name_good_contact',
    'p20_audit',
    'src_audit_contact',
    'https://audit-salon.example/contact',
    'businessName',
    'Audit Salon',
  );
  await create(
    'ev_name_bad',
    'p20_audit',
    'src_audit_contact',
    'https://audit-salon.example/contact',
    'businessName',
    'Shree Siddhivinayak Temple',
  );
  await create(
    'ev_phone_good',
    'p20_audit',
    'src_audit_contact',
    'https://audit-salon.example/contact',
    'phone',
    '+91 98765 43210',
  );
  await create(
    'ev_address_good',
    'p20_audit',
    'src_audit_home',
    'https://audit-salon.example/',
    'address',
    '10 Audit Road, Mumbai',
  );
  await create(
    'ev_address_bad',
    'p20_audit',
    'src_audit_contact',
    'https://audit-salon.example/contact',
    'address',
    'SK Bole Rd, Prabhadevi, Mumbai 400028',
  );
  await create(
    'ev_noise',
    'p20_audit',
    'src_audit_home',
    'https://audit-salon.example/',
    'description',
    '66 points away from Level 4',
    0.78,
  );
  await create(
    'ev_service_home',
    'p20_audit',
    'src_audit_home',
    'https://audit-salon.example/',
    'service',
    'Haircut',
  );
  await create(
    'ev_service_contact',
    'p20_audit',
    'src_audit_contact',
    'https://audit-salon.example/contact',
    'service',
    'Haircut',
  );
  await create(
    'ev_email_single',
    'p20_audit',
    'src_audit_contact',
    'https://audit-salon.example/contact',
    'email',
    'hello@audit-salon.example',
  );
  await create(
    'ev_uncertain_address',
    'p20_uncertain',
    'src_uncertain',
    'https://directory.example/uncertain-salon',
    'address',
    '22 Unknown Road, Mumbai',
    0.9,
    0.8,
  );
  await create(
    'ev_uncertain_address_two',
    'p20_uncertain',
    'src_uncertain_two',
    'https://directory-two.example/uncertain-salon',
    'address',
    '22 Unknown Road, Mumbai',
    0.9,
    0.95,
  );

  await create(
    'ev_clean_name',
    'p20_clean',
    'src_clean_home',
    'https://clean-salon.example/',
    'businessName',
    'Clean Salon',
  );
  await create(
    'ev_clean_phone',
    'p20_clean',
    'src_clean_contact',
    'https://www.clean-salon.example/contact',
    'phone',
    '+91 91111 11111',
  );
  await create(
    'ev_clean_phone_alt',
    'p20_clean',
    'src_clean_home',
    'https://clean-salon.example/',
    'phone',
    '+919111111111',
  );
  await create(
    'ev_clean_address',
    'p20_clean',
    'src_clean_home',
    'https://clean-salon.example/',
    'address',
    '5 Clean Lane, Mumbai',
  );
  await create(
    'ev_clean_service_home',
    'p20_clean',
    'src_clean_home',
    'https://clean-salon.example/',
    'service',
    'Haircut',
  );
  await create(
    'ev_clean_service_contact',
    'p20_clean',
    'src_clean_contact',
    'https://www.clean-salon.example/contact',
    'service',
    'Haircut',
  );
  await create(
    'ev_clean_email_home',
    'p20_clean',
    'src_clean_home',
    'https://clean-salon.example/',
    'email',
    'hello@clean-salon.example',
  );
  await create(
    'ev_clean_email_contact',
    'p20_clean',
    'src_clean_contact',
    'https://www.clean-salon.example/contact',
    'email',
    'hello@clean-salon.example',
  );
  await create(
    'ev_clean_social_home',
    'p20_clean',
    'src_clean_home',
    'https://clean-salon.example/',
    'socialLink',
    'https://instagram.com/clean.salon',
  );
  await create(
    'ev_clean_social_contact',
    'p20_clean',
    'src_clean_contact',
    'https://www.clean-salon.example/contact',
    'socialLink',
    'https://instagram.com/clean.salon',
  );
  await create(
    'ev_clean_hours_home',
    'p20_clean',
    'src_clean_home',
    'https://clean-salon.example/',
    'openingHours',
    'Monday - Sunday 10:00 AM - 9:00 PM',
  );
  await create(
    'ev_clean_hours_contact',
    'p20_clean',
    'src_clean_contact',
    'https://www.clean-salon.example/contact',
    'openingHours',
    'Monday - Sunday 10:00 AM - 9:00 PM',
  );
  await create(
    'ev_clean_offdomain_service',
    'p20_clean',
    'src_clean_directory',
    'https://directory.example/clean-salon',
    'service',
    'Massage',
  );
  await create(
    'ev_clean_offdomain_service_two',
    'p20_clean',
    'src_clean_directory_two',
    'https://directory-two.example/clean-salon',
    'service',
    'Massage',
  );
  await create(
    'ev_clean_error_email_home',
    'p20_clean',
    'src_clean_home',
    'https://clean-salon.example/',
    'email',
    'Error establishing a database connection',
  );
  await create(
    'ev_clean_error_email_contact',
    'p20_clean',
    'src_clean_contact',
    'https://www.clean-salon.example/contact',
    'email',
    'Error establishing a database connection',
  );
  await create(
    'ev_clean_social_label_home',
    'p20_clean',
    'src_clean_home',
    'https://clean-salon.example/',
    'socialLink',
    'FB',
  );
  await create(
    'ev_clean_social_label_contact',
    'p20_clean',
    'src_clean_contact',
    'https://www.clean-salon.example/contact',
    'socialLink',
    'FB',
  );

  await db
    .prepare(`
      INSERT INTO research_runs(
        id, prospect_id, user_id, status, selected_sources_json, conflicts_json,
        model, started_at, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'BLOCKED', '[]', ?, NULL, ?, ?, ?, ?)
    `)
    .bind(
      'run_p20_audit',
      'p20_audit',
      USER.id,
      JSON.stringify([
        {
          field: 'businessName',
          values: ['audit salon', 'shree siddhivinayak temple'],
          critical: true,
        },
        {
          field: 'address',
          values: ['10 audit road, mumbai', 'sk bole rd, prabhadevi, mumbai 400028'],
          critical: true,
        },
      ]),
      now,
      now,
      now,
      now,
    )
    .run();

  return c.json({ ok: true }, 201);
});

app.get('/phase20/summary', async (c) => {
  const db = requireDb(c.env.DB);
  const evidence = await new EvidenceRepository(db).listForProspect('p20_audit');
  const uncertainEvidence = await new EvidenceRepository(db).listForProspect('p20_uncertain');
  const cleanEvidence = await new EvidenceRepository(db).listForProspect('p20_clean');
  const facts = await new ProspectFactRepository(db).listForProspect('p20_audit');
  const cleanFacts = await new ProspectFactRepository(db).listForProspect('p20_clean');
  const auditProspect = await new ProspectRepository(db).getByIdForUser('p20_audit', USER.id);
  const uncertainProspect = await new ProspectRepository(db).getByIdForUser('p20_uncertain', USER.id);
  const cleanProspect = await new ProspectRepository(db).getByIdForUser('p20_clean', USER.id);
  const events = await db
    .prepare(`
      SELECT evidence_id, decision, promoted_to_fact, note
      FROM evidence_verification_events
      WHERE user_id = ?
      ORDER BY created_at, id
    `)
    .bind(USER.id)
    .all<Record<string, unknown>>();
  const foreignKeys = await db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>();
  return c.json({
    evidence,
    uncertainEvidence,
    cleanEvidence,
    facts,
    cleanFacts,
    auditProspectState: auditProspect?.currentState ?? null,
    uncertainProspectState: uncertainProspect?.currentState ?? null,
    cleanProspectState: cleanProspect?.currentState ?? null,
    events: events.results,
    foreignKeyViolations: foreignKeys.results.length,
  });
});

export default app;
