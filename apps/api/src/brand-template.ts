import {
  EvidenceRepository,
  ProspectFactRepository,
  ProspectRepository,
  type D1DatabaseLike,
  type ProspectRecord,
} from '@shalcon/db';
import { assertProspectTransition } from '@shalcon/state-machine';
import { parseThemeDNA, type ThemeDNA } from '@shalcon/templates';

import {
  BRAND_PROFILE_VERSION,
  TEMPLATE_MATCHER_VERSION,
  evaluateTemplateCandidate,
  inferBrandProfile,
  selectTemplateForBrand,
  validateManualTemplateSelection,
  type BrandPositioning,
  type BrandProfileDraft,
  type TemplateMatchSignals,
} from './brand-template-policy';

interface WebsiteAuditRow {
  id: string;
  recommendation: 'SKIP_DEMO' | 'LOW_PRIORITY' | 'DEMO_WORTHY' | 'RESEARCH_NEEDED';
}

interface MatchHistoryRow {
  match_id: string;
  prospect_id: string;
  brand_profile_id: string;
  matcher_version: string;
  template_id: string;
  template_version: string;
  archetype: string;
  theme_dna_json: string;
  fit_score: number;
  match_confidence: number;
  reasons_json: string;
  match_evidence_ids_json: string;
  audit_run_id: string | null;
  match_safe_default: number;
  sparse_content_mode: number;
  selection_source: 'AUTO' | 'MANUAL_OVERRIDE';
  supersedes_match_id: string | null;
  match_created_at: string;
  positioning: string | null;
  detected_colors_json: string;
  recommended_themes_json: string;
  profile_confidence: number | null;
  profile_evidence_ids_json: string;
  profile_created_at: string;
  profile_version: string;
  recommended_archetypes_json: string;
  profile_safe_default: number;
}

export interface StoredBrandProfile {
  id: string;
  prospectId: string;
  profileVersion: string;
  positioning: BrandPositioning;
  confidence: number;
  detectedColors: string[];
  recommendedThemeIds: string[];
  recommendedArchetypeIds: string[];
  evidenceIds: string[];
  safeDefault: boolean;
  createdAt: string;
}

export interface StoredTemplateMatch {
  id: string;
  prospectId: string;
  matcherVersion: string;
  templateId: string;
  templateVersion: string;
  archetype: string;
  themeDNA: ThemeDNA;
  fitScore: number;
  confidence: number;
  reasons: string[];
  evidenceIds: string[];
  auditRunId: string | null;
  safeDefault: boolean;
  sparseContentMode: boolean;
  selectionSource: 'AUTO' | 'MANUAL_OVERRIDE';
  supersedesMatchId: string | null;
  createdAt: string;
}

export interface BrandTemplateRun {
  brandProfile: StoredBrandProfile;
  match: StoredTemplateMatch;
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/gu, '');
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
      ),
    ];
  } catch {
    return [];
  }
}

function parseTheme(raw: string): ThemeDNA {
  const parsed: unknown = JSON.parse(raw);
  return parseThemeDNA(parsed);
}

function positioning(value: string | null): BrandPositioning {
  if (
    value === 'luxury' ||
    value === 'premium' ||
    value === 'modern' ||
    value === 'friendly' ||
    value === 'minimal' ||
    value === 'traditional'
  ) return value;
  return 'unknown';
}

function parseHistoryRow(row: MatchHistoryRow): BrandTemplateRun {
  return {
    brandProfile: {
      id: row.brand_profile_id,
      prospectId: row.prospect_id,
      profileVersion: row.profile_version,
      positioning: positioning(row.positioning),
      confidence: row.profile_confidence ?? 0,
      detectedColors: parseStringArray(row.detected_colors_json),
      recommendedThemeIds: parseStringArray(row.recommended_themes_json),
      recommendedArchetypeIds: parseStringArray(row.recommended_archetypes_json),
      evidenceIds: parseStringArray(row.profile_evidence_ids_json),
      safeDefault: row.profile_safe_default === 1,
      createdAt: row.profile_created_at,
    },
    match: {
      id: row.match_id,
      prospectId: row.prospect_id,
      matcherVersion: row.matcher_version,
      templateId: row.template_id,
      templateVersion: row.template_version,
      archetype: row.archetype,
      themeDNA: parseTheme(row.theme_dna_json),
      fitScore: row.fit_score,
      confidence: row.match_confidence,
      reasons: parseStringArray(row.reasons_json),
      evidenceIds: parseStringArray(row.match_evidence_ids_json),
      auditRunId: row.audit_run_id,
      safeDefault: row.match_safe_default === 1,
      sparseContentMode: row.sparse_content_mode === 1,
      selectionSource: row.selection_source,
      supersedesMatchId: row.supersedes_match_id,
      createdAt: row.match_created_at,
    },
  };
}

async function latestWebsiteAudit(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
): Promise<WebsiteAuditRow | null> {
  return db
    .prepare(`
      SELECT audit.id, audit.recommendation
      FROM website_audit_runs audit
      JOIN prospects prospect ON prospect.id = audit.prospect_id
      JOIN campaigns campaign ON campaign.id = prospect.campaign_id
      WHERE audit.prospect_id = ? AND campaign.user_id = ? AND audit.status = 'COMPLETED'
      ORDER BY audit.completed_at DESC, audit.created_at DESC, audit.id DESC
      LIMIT 1
    `)
    .bind(prospectId, userId)
    .first<WebsiteAuditRow>();
}

async function supportingSignals(
  db: D1DatabaseLike,
  userId: string,
  prospect: ProspectRecord,
  brandProfile: BrandProfileDraft,
): Promise<TemplateMatchSignals> {
  const [facts, audit, assetCount] = await Promise.all([
    new ProspectFactRepository(db).listForProspect(prospect.id),
    latestWebsiteAudit(db, userId, prospect.id),
    db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM assets
        WHERE prospect_id = ?
          AND (LOWER(source_type) LIKE 'official%' OR LOWER(usage_classification) LIKE '%official%')
      `)
      .bind(prospect.id)
      .first<{ count: number }>(),
  ]);
  const verifiedServices = facts.filter(
    (fact) =>
      fact.verificationStatus === 'VERIFIED' &&
      normalized(fact.field) === 'service' &&
      fact.evidenceId !== null,
  );
  const contentEvidenceIds = [
    ...new Set(
      verifiedServices
        .map((fact) => fact.evidenceId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const serviceValues = new Set(verifiedServices.map((fact) => normalized(fact.value)).filter(Boolean));
  return {
    niche: prospect.niche,
    brandProfile,
    verifiedServiceCount: serviceValues.size,
    contentEvidenceIds,
    officialAssetCount: Number(assetCount?.count ?? 0),
    websiteOpportunity: audit?.recommendation ?? null,
    auditRunId: audit?.id ?? null,
  };
}

function profileDraft(profile: StoredBrandProfile): BrandProfileDraft {
  return {
    positioning: profile.positioning,
    confidence: profile.confidence,
    detectedColors: profile.detectedColors,
    recommendedThemeIds: profile.recommendedThemeIds,
    recommendedArchetypeIds: profile.recommendedArchetypeIds,
    evidenceIds: profile.evidenceIds,
    safeDefault: profile.safeDefault,
  };
}

export async function getBrandTemplateHistory(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
): Promise<BrandTemplateRun[]> {
  const prospect = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  const rows = await db
    .prepare(`
      SELECT
        match.id AS match_id,
        match.prospect_id,
        match.brand_profile_id,
        match.matcher_version,
        match.template_id,
        match.template_version,
        match.archetype,
        match.theme_dna_json,
        match.fit_score,
        match.confidence AS match_confidence,
        match.reasons_json,
        match.evidence_ids_json AS match_evidence_ids_json,
        match.audit_run_id,
        match.safe_default AS match_safe_default,
        match.sparse_content_mode,
        match.selection_source,
        match.supersedes_match_id,
        match.created_at AS match_created_at,
        profile.positioning,
        profile.detected_colors_json,
        profile.recommended_themes_json,
        profile.confidence AS profile_confidence,
        profile.evidence_ids_json AS profile_evidence_ids_json,
        profile.created_at AS profile_created_at,
        profile.profile_version,
        profile.recommended_archetypes_json,
        profile.safe_default AS profile_safe_default
      FROM template_match_runs match
      JOIN brand_profiles profile ON profile.id = match.brand_profile_id
      WHERE match.prospect_id = ?
      ORDER BY match.created_at DESC, match.id DESC
      LIMIT 50
    `)
    .bind(prospectId)
    .all<MatchHistoryRow>();
  return rows.results.map(parseHistoryRow);
}

export async function runAutomaticBrandTemplateMatch(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
  now = new Date().toISOString(),
): Promise<BrandTemplateRun> {
  const prospects = new ProspectRepository(db);
  const prospect = await prospects.getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  if (prospect.currentState !== 'DEMO_QUALIFIED') {
    throw new Error(`Brand/template matching requires DEMO_QUALIFIED state; found ${prospect.currentState}.`);
  }
  assertProspectTransition('DEMO_QUALIFIED', 'TEMPLATE_PENDING');
  assertProspectTransition('TEMPLATE_PENDING', 'TEMPLATE_MATCHED');

  const evidence = await new EvidenceRepository(db).listForProspect(prospect.id);
  const draft = inferBrandProfile(evidence, prospect.niche);
  const signals = await supportingSignals(db, userId, prospect, draft);
  const selected = selectTemplateForBrand(signals);
  const profileId = randomId('brand');
  const matchId = randomId('match');

  const writes = await db.batch([
    db
      .prepare(`
        INSERT INTO brand_profiles(
          id, prospect_id, positioning, detected_colors_json, recommended_themes_json,
          confidence, evidence_ids_json, created_at, profile_version,
          recommended_archetypes_json, safe_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        profileId,
        prospect.id,
        draft.positioning,
        JSON.stringify(draft.detectedColors),
        JSON.stringify(draft.recommendedThemeIds),
        draft.confidence,
        JSON.stringify(draft.evidenceIds),
        now,
        BRAND_PROFILE_VERSION,
        JSON.stringify(draft.recommendedArchetypeIds),
        draft.safeDefault ? 1 : 0,
      ),
    db
      .prepare(`
        INSERT INTO template_match_runs(
          id, prospect_id, brand_profile_id, matcher_version, template_id, template_version,
          archetype, theme_dna_json, fit_score, confidence, reasons_json, evidence_ids_json,
          audit_run_id, safe_default, sparse_content_mode, selection_source,
          supersedes_match_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AUTO', NULL, ?)
      `)
      .bind(
        matchId,
        prospect.id,
        profileId,
        TEMPLATE_MATCHER_VERSION,
        selected.templateId,
        selected.templateVersion,
        selected.archetype,
        JSON.stringify(selected.themeDNA),
        selected.fitScore,
        selected.confidence,
        JSON.stringify(selected.reasons),
        JSON.stringify(selected.evidenceIds),
        selected.auditRunId,
        selected.safeDefault ? 1 : 0,
        selected.sparseContentMode ? 1 : 0,
        now,
      ),
    db
      .prepare(`
        UPDATE prospects
        SET current_state = 'TEMPLATE_PENDING', archetype = ?, updated_at = ?
        WHERE id = ? AND current_state = 'DEMO_QUALIFIED'
          AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)
      `)
      .bind(selected.archetype, now, prospect.id, userId),
    db
      .prepare(`
        UPDATE prospects
        SET current_state = 'TEMPLATE_MATCHED', updated_at = ?
        WHERE id = ? AND current_state = 'TEMPLATE_PENDING'
          AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)
      `)
      .bind(now, prospect.id, userId),
  ]);
  const pendingApplied = writes[2]?.success === true && (writes[2].meta?.changes ?? 0) >= 1;
  const matchedApplied = writes[3]?.success === true && (writes[3].meta?.changes ?? 0) >= 1;
  if (!pendingApplied || !matchedApplied) {
    throw new Error('Prospect changed concurrently; template match was not applied.');
  }
  const history = await getBrandTemplateHistory(db, userId, prospect.id);
  const run = history.find((item) => item.match.id === matchId);
  if (!run) throw new Error('Template match history could not be reloaded.');
  return run;
}

export async function overrideBrandTemplateMatch(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
  input: { templateId: string; templateVersion: string; themeDNA: unknown },
  now = new Date().toISOString(),
): Promise<BrandTemplateRun> {
  const prospects = new ProspectRepository(db);
  const prospect = await prospects.getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  if (prospect.currentState !== 'TEMPLATE_MATCHED') {
    throw new Error(`Manual template override requires TEMPLATE_MATCHED state; found ${prospect.currentState}.`);
  }
  const history = await getBrandTemplateHistory(db, userId, prospect.id);
  const latest = history[0];
  if (!latest) throw new Error('An automatic template match is required before manual override.');
  const validated = validateManualTemplateSelection(
    prospect.niche,
    input.templateId,
    input.templateVersion,
    input.themeDNA,
  );
  const signals = await supportingSignals(db, userId, prospect, profileDraft(latest.brandProfile));
  const evaluated = evaluateTemplateCandidate(validated.template, signals);
  const matchId = randomId('match');
  const reasons = [
    ...evaluated.reasons,
    'Operator manually selected an allowed registry template/theme; the prior match remains in immutable history.',
  ];
  const writes = await db.batch([
    db
      .prepare(`
        INSERT INTO template_match_runs(
          id, prospect_id, brand_profile_id, matcher_version, template_id, template_version,
          archetype, theme_dna_json, fit_score, confidence, reasons_json, evidence_ids_json,
          audit_run_id, safe_default, sparse_content_mode, selection_source,
          supersedes_match_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL_OVERRIDE', ?, ?)
      `)
      .bind(
        matchId,
        prospect.id,
        latest.brandProfile.id,
        TEMPLATE_MATCHER_VERSION,
        validated.template.id,
        validated.template.version,
        validated.template.archetype,
        JSON.stringify(validated.themeDNA),
        evaluated.fitScore,
        evaluated.confidence,
        JSON.stringify(reasons),
        JSON.stringify(evaluated.evidenceIds),
        evaluated.auditRunId,
        latest.brandProfile.safeDefault ? 1 : 0,
        evaluated.sparseContentMode ? 1 : 0,
        latest.match.id,
        now,
      ),
    db
      .prepare(`
        UPDATE prospects
        SET archetype = ?, updated_at = ?
        WHERE id = ? AND current_state = 'TEMPLATE_MATCHED'
          AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)
      `)
      .bind(validated.template.archetype, now, prospect.id, userId),
  ]);
  if (writes[0]?.meta?.changes !== 1 || writes[1]?.meta?.changes !== 1) {
    throw new Error('Prospect changed concurrently; manual template override was not applied.');
  }
  const updated = await getBrandTemplateHistory(db, userId, prospect.id);
  const run = updated.find((item) => item.match.id === matchId);
  if (!run) throw new Error('Manual template override history could not be reloaded.');
  return run;
}