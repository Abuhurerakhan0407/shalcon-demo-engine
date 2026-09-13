import {
  CampaignRepository,
  EvidenceRepository,
  ProspectFactRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
} from '@shalcon/db';
import { ELANE_V8_TEMPLATE } from '@shalcon/templates';
import { Hono } from 'hono';

import {
  getBrandTemplateHistory,
  overrideBrandTemplateMatch,
  runAutomaticBrandTemplateMatch,
} from './brand-template';

interface Env {
  DB: D1DatabaseLike;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/healthz', (c) => c.json({ ok: true }));

function iso(offsetSeconds: number): string {
  return new Date(Date.parse('2026-09-12T00:00:00.000Z') + offsetSeconds * 1000).toISOString();
}

async function createProspect(db: D1DatabaseLike, id: string, campaignId: string, now: string) {
  await new ProspectRepository(db).create({
    id,
    campaignId,
    canonicalName: id,
    normalizedName: id,
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE14_TEST',
    currentState: 'DEMO_QUALIFIED',
    domain: `${id}.example.com`,
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: now,
    updatedAt: now,
  });
  await new SourceRecordRepository(db).create({
    id: `src_${id}`,
    prospectId: id,
    provider: 'PHASE14_FIXTURE',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: `https://${id}.example.com/`,
    rawJson: '{}',
    capturedAt: now,
  });
}

async function addEvidence(
  db: D1DatabaseLike,
  prospectId: string,
  id: string,
  field: string,
  value: string,
  at: string,
) {
  await new EvidenceRepository(db).create({
    id,
    prospectId,
    field,
    value,
    sourceRecordId: `src_${prospectId}`,
    sourceUrl: `https://${prospectId}.example.com/`,
    sourceQuality: 1,
    confidence: 0.95,
    verificationStatus: 'VERIFIED',
    excerpt: value,
    capturedAt: at,
  });
}

async function addVerifiedService(
  db: D1DatabaseLike,
  prospectId: string,
  index: number,
  value: string,
  at: string,
) {
  const evidenceId = `ev_${prospectId}_service_${index}`;
  await addEvidence(db, prospectId, evidenceId, 'service', value, at);
  await new ProspectFactRepository(db).upsert({
    id: `fact_${prospectId}_service_${index}`,
    prospectId,
    field: 'service',
    value,
    verificationStatus: 'VERIFIED',
    confidence: 1,
    evidenceId,
    createdAt: at,
    updatedAt: at,
  });
}

async function addAudit(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
  recommendation: 'DEMO_WORTHY' | 'LOW_PRIORITY',
  at: string,
) {
  await db
    .prepare(`
      INSERT INTO website_audit_runs(
        id, prospect_id, user_id, status, website_presence, quality_score, quality_rating,
        recommendation, source_ids_json, summary, created_at, completed_at
      ) VALUES (?, ?, ?, 'COMPLETED', 'CAPTURED', ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      `audit_${prospectId}`,
      prospectId,
      userId,
      recommendation === 'DEMO_WORTHY' ? 42 : 68,
      recommendation === 'DEMO_WORTHY' ? 'POOR' : 'FAIR',
      recommendation,
      JSON.stringify([`src_${prospectId}`]),
      'Phase 14 fixture audit.',
      at,
      at,
    )
    .run();
}

app.get('/phase14', async (c) => {
  const db = c.env.DB;
  const userId = 'usr_phase14';
  const now = iso(0);
  await new UserRepository(db).create({
    id: userId,
    email: 'phase14@example.com',
    name: 'Phase 14',
    createdAt: now,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(userId, now);

  await createProspect(db, 'p14_rich', campaign.id, now);
  await addEvidence(db, 'p14_rich', 'ev_p14_position', 'brand_positioning', 'Premium salon experience', iso(1));
  await addEvidence(db, 'p14_rich', 'ev_p14_color', 'logo_colors', '#C9A96E and black', iso(2));
  await addVerifiedService(db, 'p14_rich', 1, 'Haircut', iso(3));
  await addVerifiedService(db, 'p14_rich', 2, 'Hair styling', iso(4));
  await addVerifiedService(db, 'p14_rich', 3, 'Spa ritual', iso(5));
  await db
    .prepare(`
      INSERT INTO assets(
        id, prospect_id, asset_type, source_type, source_url, storage_ref,
        usage_classification, mime_type, width, height, created_at,
        source_captured_at, association_assumption, watermark_status, asset_status, optimization_json
      ) VALUES (?, ?, 'LOGO', 'OFFICIAL_WEBSITE', ?, ?, 'PROSPECT_OFFICIAL', 'image/png',
        512, 512, ?, ?, 'OFFICIAL_PROSPECT_SOURCE', 'CLEAR', 'ACTIVE', '{}')
    `)
    .bind(
      'asset_p14_rich_logo',
      'p14_rich',
      'https://p14_rich.example.com/logo.png',
      'fixture://logo',
      iso(6),
      iso(6),
    )
    .run();
  await addAudit(db, userId, 'p14_rich', 'DEMO_WORTHY', iso(7));
  const richAuto = await runAutomaticBrandTemplateMatch(db, userId, 'p14_rich', iso(8));

  await createProspect(db, 'p14_sparse', campaign.id, now);
  await addAudit(db, userId, 'p14_sparse', 'LOW_PRIORITY', iso(9));
  const sparseAuto = await runAutomaticBrandTemplateMatch(db, userId, 'p14_sparse', iso(10));

  const manualTheme = {
    ...richAuto.match.themeDNA,
    heroVariant: 'immersive' as const,
    imageTreatment: 'full-bleed' as const,
  };
  const manual = await overrideBrandTemplateMatch(
    db,
    userId,
    'p14_rich',
    {
      templateId: ELANE_V8_TEMPLATE.id,
      templateVersion: ELANE_V8_TEMPLATE.version,
      themeDNA: manualTheme,
    },
    iso(11),
  );
  const richHistory = await getBrandTemplateHistory(db, userId, 'p14_rich');

  let invalidRegistryBlocked = false;
  try {
    await overrideBrandTemplateMatch(
      db,
      userId,
      'p14_rich',
      {
        templateId: 'invented-template',
        templateVersion: '1.0.0',
        themeDNA: manualTheme,
      },
      iso(12),
    );
  } catch {
    invalidRegistryBlocked = true;
  }

  const [richState, sparseState, transitions, foreignKeys, migrationRows, matchCount] = await Promise.all([
    db.prepare('SELECT current_state, archetype FROM prospects WHERE id = ?').bind('p14_rich').first<{ current_state: string; archetype: string | null }>(),
    db.prepare('SELECT current_state, archetype FROM prospects WHERE id = ?').bind('p14_sparse').first<{ current_state: string; archetype: string | null }>(),
    db.prepare('SELECT prospect_id, from_state, to_state FROM prospect_state_events WHERE prospect_id LIKE ? ORDER BY id').bind('p14_%').all<{ prospect_id: string; from_state: string; to_state: string }>(),
    db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>(),
    db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>(),
    db.prepare('SELECT COUNT(*) AS count FROM template_match_runs').first<{ count: number }>(),
  ]);

  const hasStatePath = (prospectId: string) => {
    const rows = transitions.results.filter((item) => item.prospect_id === prospectId);
    return rows.some((item) => item.from_state === 'DEMO_QUALIFIED' && item.to_state === 'TEMPLATE_PENDING') &&
      rows.some((item) => item.from_state === 'TEMPLATE_PENDING' && item.to_state === 'TEMPLATE_MATCHED');
  };

  const checks = {
    migrationApplied: Number(migrationRows?.count ?? 0) >= 10,
    allowedRegistryOnly:
      richAuto.match.templateId === ELANE_V8_TEMPLATE.id &&
      richAuto.match.templateVersion === ELANE_V8_TEMPLATE.version &&
      sparseAuto.match.templateId === ELANE_V8_TEMPLATE.id,
    explicitBrandSignalsPreserved:
      richAuto.brandProfile.positioning === 'premium' &&
      richAuto.brandProfile.detectedColors.includes('#c9a96e') &&
      richAuto.brandProfile.evidenceIds.includes('ev_p14_position'),
    unknownBrandUsesSafeDefault:
      sparseAuto.brandProfile.positioning === 'unknown' &&
      sparseAuto.brandProfile.detectedColors.length === 0 &&
      sparseAuto.brandProfile.safeDefault &&
      sparseAuto.match.themeDNA.paletteId === ELANE_V8_TEMPLATE.defaultTheme.paletteId,
    insufficientContentUsesCompatibleLayout:
      sparseAuto.match.sparseContentMode &&
      sparseAuto.match.themeDNA.heroVariant === 'split' &&
      sparseAuto.match.themeDNA.imageTreatment === 'framed' &&
      sparseAuto.match.themeDNA.motionPreset === 'subtle',
    fitScoreDeterministic:
      richAuto.match.fitScore > sparseAuto.match.fitScore &&
      richAuto.match.fitScore <= 100 && sparseAuto.match.fitScore >= 0,
    stateTransitionsEnforced:
      richState?.current_state === 'TEMPLATE_MATCHED' &&
      sparseState?.current_state === 'TEMPLATE_MATCHED' &&
      hasStatePath('p14_rich') && hasStatePath('p14_sparse'),
    manualOverrideLogged:
      manual.match.selectionSource === 'MANUAL_OVERRIDE' &&
      manual.match.supersedesMatchId === richAuto.match.id &&
      manual.match.themeDNA.heroVariant === 'immersive' &&
      richHistory.length === 2 && richHistory[0]?.match.id === manual.match.id,
    invalidRegistryBlocked,
    selectionVersioned:
      richAuto.brandProfile.profileVersion === 'brand-profile.v1' &&
      richAuto.match.matcherVersion === 'template-matcher.v1' &&
      Number(matchCount?.count ?? 0) === 3,
    archetypePersisted:
      richState?.archetype === ELANE_V8_TEMPLATE.archetype &&
      sparseState?.archetype === ELANE_V8_TEMPLATE.archetype,
    foreignKeyViolations: foreignKeys.results.length,
  };

  return c.json({
    ok: Object.values(checks).every((value) => value === true || value === 0),
    checks,
  });
});

export default app;
