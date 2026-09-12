import {
  CampaignRepository,
  EvidenceRepository,
  ProspectFactRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
} from '@shalcon/db';
import { Hono } from 'hono';

import {
  BRAND_PROFILE_VERSION,
  TEMPLATE_MATCHER_VERSION,
  inferBrandProfile,
  selectTemplateForBrand,
} from './brand-template-policy';

interface Env { DB: D1DatabaseLike }
const app = new Hono<{ Bindings: Env }>();
app.get('/healthz', (c) => c.json({ ok: true }));

function iso(offsetSeconds: number): string {
  return new Date(Date.parse('2026-09-12T00:00:00.000Z') + offsetSeconds * 1000).toISOString();
}

async function createProspect(db: D1DatabaseLike, id: string, campaignId: string, now: string) {
  await new ProspectRepository(db).create({
    id, campaignId, canonicalName: id, normalizedName: id, niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE14_TEST', currentState: 'DEMO_QUALIFIED', domain: `${id}.example.com`,
    phoneNormalized: null, city: 'mumbai', addressNormalized: null, createdAt: now, updatedAt: now,
  });
  await new SourceRecordRepository(db).create({
    id: `src_${id}`, prospectId: id, provider: 'PHASE14_FIXTURE', sourceType: 'WEBSITE_PAGE',
    sourceUrl: `https://${id}.example.com/`, rawJson: '{}', capturedAt: now,
  });
}

async function addEvidence(db: D1DatabaseLike, prospectId: string, id: string, field: string, value: string, at: string) {
  await new EvidenceRepository(db).create({
    id, prospectId, field, value, sourceRecordId: `src_${prospectId}`,
    sourceUrl: `https://${prospectId}.example.com/`, sourceQuality: 1, confidence: 0.95,
    verificationStatus: 'VERIFIED', excerpt: value, capturedAt: at,
  });
}

async function addVerifiedService(db: D1DatabaseLike, prospectId: string, index: number, value: string, at: string) {
  const evidenceId = `ev_${prospectId}_service_${index}`;
  await addEvidence(db, prospectId, evidenceId, 'service', value, at);
  await new ProspectFactRepository(db).upsert({
    id: `fact_${prospectId}_service_${index}`, prospectId, field: 'service', value,
    verificationStatus: 'VERIFIED', confidence: 1, evidenceId, createdAt: at, updatedAt: at,
  });
}

app.get('/phase14', async (c) => {
  const db = c.env.DB;
  const userId = 'usr_phase14';
  const now = iso(0);
  await new UserRepository(db).create({ id: userId, email: 'phase14@example.com', name: 'Phase 14', createdAt: now });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(userId, now);
  await createProspect(db, 'p14_rich', campaign.id, now);
  await addEvidence(db, 'p14_rich', 'ev_p14_position', 'brand_positioning', 'Premium salon experience', iso(1));
  await addEvidence(db, 'p14_rich', 'ev_p14_color', 'logo_colors', '#C9A96E and black', iso(2));
  await addVerifiedService(db, 'p14_rich', 1, 'Haircut', iso(3));
  await addVerifiedService(db, 'p14_rich', 2, 'Hair styling', iso(4));
  await addVerifiedService(db, 'p14_rich', 3, 'Spa ritual', iso(5));
  await db.prepare(`
    INSERT INTO assets(id, prospect_id, asset_type, source_type, source_url, storage_ref,
      usage_classification, mime_type, width, height, created_at)
    VALUES (?, ?, 'LOGO', 'OFFICIAL_WEBSITE', ?, ?, 'PROSPECT_OFFICIAL', 'image/png', 512, 512, ?)
  `).bind('asset_p14_rich_logo', 'p14_rich', 'https://p14_rich.example.com/logo.png', 'fixture://logo', iso(6)).run();
  await db.prepare(`
    INSERT INTO website_audit_runs(
      id, prospect_id, user_id, status, website_presence, quality_score, quality_rating,
      recommendation, source_ids_json, summary, created_at, completed_at)
    VALUES (?, ?, ?, 'COMPLETED', 'CAPTURED', 42, 'POOR', 'DEMO_WORTHY', ?, ?, ?, ?)
  `).bind('audit_p14_rich', 'p14_rich', userId, JSON.stringify(['src_p14_rich']), 'Phase 14 fixture audit.', iso(7), iso(7)).run();

  const prospect = await new ProspectRepository(db).getByIdForUser('p14_rich', userId);
  if (!prospect) throw new Error('Fixture prospect not found.');
  const evidence = await new EvidenceRepository(db).listForProspect(prospect.id);
  const facts = await new ProspectFactRepository(db).listForProspect(prospect.id);
  const draft = inferBrandProfile(evidence, prospect.niche);
  const verifiedServices = facts.filter((fact) => fact.verificationStatus === 'VERIFIED' && fact.field === 'service' && fact.evidenceId !== null);
  const selected = selectTemplateForBrand({
    niche: prospect.niche,
    brandProfile: draft,
    verifiedServiceCount: new Set(verifiedServices.map((fact) => fact.value)).size,
    contentEvidenceIds: verifiedServices.map((fact) => fact.evidenceId).filter((id): id is string => id !== null),
    officialAssetCount: 1,
    websiteOpportunity: 'DEMO_WORTHY',
    auditRunId: 'audit_p14_rich',
  });

  const profileId = 'brand_diag';
  const matchId = 'match_diag';
  const writes = await db.batch([
    db.prepare(`
      INSERT INTO brand_profiles(
        id, prospect_id, positioning, detected_colors_json, recommended_themes_json,
        confidence, evidence_ids_json, created_at, profile_version,
        recommended_archetypes_json, safe_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      profileId, prospect.id, draft.positioning, JSON.stringify(draft.detectedColors),
      JSON.stringify(draft.recommendedThemeIds), draft.confidence, JSON.stringify(draft.evidenceIds),
      iso(8), BRAND_PROFILE_VERSION, JSON.stringify(draft.recommendedArchetypeIds), draft.safeDefault ? 1 : 0,
    ),
    db.prepare(`
      INSERT INTO template_match_runs(
        id, prospect_id, brand_profile_id, matcher_version, template_id, template_version,
        archetype, theme_dna_json, fit_score, confidence, reasons_json, evidence_ids_json,
        audit_run_id, safe_default, sparse_content_mode, selection_source, supersedes_match_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AUTO', NULL, ?)
    `).bind(
      matchId, prospect.id, profileId, TEMPLATE_MATCHER_VERSION, selected.templateId,
      selected.templateVersion, selected.archetype, JSON.stringify(selected.themeDNA), selected.fitScore,
      selected.confidence, JSON.stringify(selected.reasons), JSON.stringify(selected.evidenceIds),
      selected.auditRunId, selected.safeDefault ? 1 : 0, selected.sparseContentMode ? 1 : 0, iso(8),
    ),
  ]);

  return c.json({ ok: writes.length === 2, stage: 'profile-match-batch' });
});

export default app;
