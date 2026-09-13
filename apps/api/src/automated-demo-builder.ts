import {
  DemoRepository,
  ProspectFactRepository,
  ProspectRepository,
  type D1DatabaseLike,
  type DemoRecord,
} from '@shalcon/db';
import { parseThemeDNA } from '@shalcon/templates';
import { z } from 'zod';

import { assetAssignmentSchema } from './asset-engine';
import { contentPackageSchema } from './content-engine';
import { hashDemoToken, renderDemoRecordForOperator } from './demo-renderer';
import {
  buildManualSalonDemoConfig,
  deriveManualDemoToken,
  phase7Expiry,
} from './manual-demo-builder';

export const AUTOMATED_DEMO_BUILDER_VERSION = 'automated-demo-builder.v1' as const;
export const AUTOMATED_DEMO_SCHEMA_VERSION = 'automated-demo-build.v1' as const;

interface TemplateMatchRow {
  id: string;
  template_id: string;
  template_version: string;
  theme_dna_json: string;
}

interface ContentRunRow {
  id: string;
  template_match_id: string;
  content_json: string;
}

interface AssetSelectionRow {
  id: string;
  template_match_id: string;
  content_run_id: string;
  assignments_json: string;
}

interface BuildRow {
  id: string;
  prospect_id: string;
  demo_id: string;
  template_match_id: string;
  content_run_id: string;
  asset_selection_run_id: string;
  builder_version: string;
  schema_version: string;
  input_fingerprint: string;
  upstream_json: string;
  status: 'COMPLETED' | 'FAILED';
  created_at: string;
}

export interface AutomatedDemoBuildRecord {
  id: string;
  prospectId: string;
  demoId: string;
  templateMatchId: string;
  contentRunId: string;
  assetSelectionRunId: string;
  builderVersion: string;
  schemaVersion: string;
  inputFingerprint: string;
  upstream: {
    templateMatchId: string;
    contentRunId: string;
    assetSelectionRunId: string;
    assetAssignmentCount: number;
  };
  status: 'COMPLETED' | 'FAILED';
  createdAt: string;
}

export interface AutomatedDemoBuildResult {
  build: AutomatedDemoBuildRecord;
  demo: DemoRecord;
  previewToken: string;
  reused: boolean;
}

function parseBuild(row: BuildRow): AutomatedDemoBuildRecord {
  const upstream = z.object({
    templateMatchId: z.string().min(1),
    contentRunId: z.string().min(1),
    assetSelectionRunId: z.string().min(1),
    assetAssignmentCount: z.number().int().nonnegative(),
  }).parse(JSON.parse(row.upstream_json));
  return {
    id: row.id,
    prospectId: row.prospect_id,
    demoId: row.demo_id,
    templateMatchId: row.template_match_id,
    contentRunId: row.content_run_id,
    assetSelectionRunId: row.asset_selection_run_id,
    builderVersion: row.builder_version,
    schemaVersion: row.schema_version,
    inputFingerprint: row.input_fingerprint,
    upstream,
    status: row.status,
    createdAt: row.created_at,
  };
}

function clip(value: string, max: number, fallback: string): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized) return fallback;
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fingerprint(parts: string[]): Promise<string> {
  const payload = parts.join('\u001f');
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload)));
}

async function latestInputs(db: D1DatabaseLike, prospectId: string) {
  const [match, content, assets] = await Promise.all([
    db.prepare(`
      SELECT id, template_id, template_version, theme_dna_json
      FROM template_match_runs
      WHERE prospect_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).bind(prospectId).first<TemplateMatchRow>(),
    db.prepare(`
      SELECT id, template_match_id, content_json
      FROM content_generation_runs
      WHERE prospect_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).bind(prospectId).first<ContentRunRow>(),
    db.prepare(`
      SELECT id, template_match_id, content_run_id, assignments_json
      FROM asset_selection_runs
      WHERE prospect_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).bind(prospectId).first<AssetSelectionRow>(),
  ]);
  if (!match) throw new Error('Automated demo build requires a template match.');
  if (!content) throw new Error('Automated demo build requires generated content.');
  if (!assets) throw new Error('Automated demo build requires asset selection.');
  if (content.template_match_id !== match.id) {
    throw new Error('Latest generated content is stale relative to the latest template match.');
  }
  if (assets.template_match_id !== match.id || assets.content_run_id !== content.id) {
    throw new Error('Latest asset selection is stale relative to template/content inputs.');
  }
  return { match, content, assets };
}

async function existingBuild(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
  inputFingerprint: string,
): Promise<BuildRow | null> {
  return db.prepare(`
    SELECT build.*
    FROM automated_demo_builds build
    JOIN prospects prospect ON prospect.id = build.prospect_id
    JOIN campaigns campaign ON campaign.id = prospect.campaign_id
    WHERE build.prospect_id = ? AND build.input_fingerprint = ? AND campaign.user_id = ?
    LIMIT 1
  `).bind(prospectId, inputFingerprint, userId).first<BuildRow>();
}

export async function getAutomatedDemoBuildHistory(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
): Promise<AutomatedDemoBuildRecord[]> {
  const prospect = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  const rows = await db.prepare(`
    SELECT build.*
    FROM automated_demo_builds build
    JOIN prospects prospect ON prospect.id = build.prospect_id
    JOIN campaigns campaign ON campaign.id = prospect.campaign_id
    WHERE build.prospect_id = ? AND campaign.user_id = ?
    ORDER BY build.created_at DESC, build.id DESC
    LIMIT 50
  `).bind(prospectId, userId).all<BuildRow>();
  return rows.results.map(parseBuild);
}

export async function runAutomatedDemoBuild(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
  previewSecret: string,
  now = new Date(),
): Promise<AutomatedDemoBuildResult> {
  if (previewSecret.length < 16) throw new Error('Preview secret is not configured.');
  const prospects = new ProspectRepository(db);
  const prospect = await prospects.getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');

  const { match, content, assets } = await latestInputs(db, prospect.id);
  if (match.template_id !== 'elane-v8' || match.template_version !== '8.0.0') {
    throw new Error('Automated demo builder supports only registered ÉLANE v8 in Phase 17.');
  }
  const themeDNA = parseThemeDNA(JSON.parse(match.theme_dna_json));
  const contentPackage = contentPackageSchema.parse(JSON.parse(content.content_json));
  const assignments = z.array(assetAssignmentSchema).parse(JSON.parse(assets.assignments_json));
  const inputFingerprint = await fingerprint([
    match.id,
    content.id,
    assets.id,
    AUTOMATED_DEMO_BUILDER_VERSION,
    AUTOMATED_DEMO_SCHEMA_VERSION,
  ]);

  const prior = await existingBuild(db, userId, prospect.id, inputFingerprint);
  if (prior) {
    const demo = await new DemoRepository(db).getByIdForUser(prior.demo_id, userId);
    if (!demo) throw new Error('Existing automated build points to a missing demo.');
    return {
      build: parseBuild(prior),
      demo,
      previewToken: await deriveManualDemoToken(previewSecret, demo.id),
      reused: true,
    };
  }

  if (prospect.currentState !== 'CONTENT_PENDING') {
    throw new Error(`Automated demo build requires CONTENT_PENDING state; found ${prospect.currentState}.`);
  }

  const facts = await new ProspectFactRepository(db).listForProspect(prospect.id);
  const baseBuild = buildManualSalonDemoConfig(prospect, facts, {
    themePreset: themeDNA.paletteId === 'warm-stone' ? 'WARM_STONE' : 'ELANE_PAPER',
    headline: clip(contentPackage.headline?.text ?? '', 72, 'A sharper first impression.'),
    accentHeadline: 'A clearer digital welcome.',
    subhead: clip(
      contentPackage.about?.text ?? '',
      220,
      'A private website concept assembled from verified business evidence.',
    ),
    hiddenFields: [],
  });
  const config = {
    ...baseBuild.config,
    theme: {
      ...baseBuild.config.theme,
      ...themeDNA,
    },
  };

  const nowIso = now.toISOString();
  const demoId = `demo_auto_${crypto.randomUUID().replaceAll('-', '')}`;
  const buildId = `demo_build_${crypto.randomUUID().replaceAll('-', '')}`;
  const previewToken = await deriveManualDemoToken(previewSecret, demoId);
  const tokenHash = await hashDemoToken(previewToken);
  const expiresAt = phase7Expiry(now);
  const upstream = {
    templateMatchId: match.id,
    contentRunId: content.id,
    assetSelectionRunId: assets.id,
    assetAssignmentCount: assignments.length,
  };

  const writes = await db.batch([
    db.prepare(`
      INSERT INTO demos(
        id, prospect_id, token_hash, template_id, template_version, schema_version,
        config_json, status, expires_at, created_at, updated_at, last_qa_at,
        fact_qa_status, visual_qa_status, sales_qa_status
      )
      SELECT ?, ?, ?, ?, ?, 'salon-template-config.v1', ?, 'RENDERED', ?, ?, ?, NULL,
        'PENDING_PHASE18', 'PENDING_PHASE18', 'PENDING_PHASE19'
      WHERE EXISTS (
        SELECT 1 FROM prospects prospect
        JOIN campaigns campaign ON campaign.id = prospect.campaign_id
        WHERE prospect.id = ? AND campaign.user_id = ? AND prospect.current_state = 'CONTENT_PENDING'
      )
    `).bind(
      demoId,
      prospect.id,
      tokenHash,
      match.template_id,
      match.template_version,
      JSON.stringify(config),
      expiresAt,
      nowIso,
      nowIso,
      prospect.id,
      userId,
    ),
    db.prepare(`
      INSERT INTO automated_demo_builds(
        id, prospect_id, demo_id, template_match_id, content_run_id, asset_selection_run_id,
        builder_version, schema_version, input_fingerprint, upstream_json, status, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?
      WHERE EXISTS (SELECT 1 FROM demos WHERE id = ?)
    `).bind(
      buildId,
      prospect.id,
      demoId,
      match.id,
      content.id,
      assets.id,
      AUTOMATED_DEMO_BUILDER_VERSION,
      AUTOMATED_DEMO_SCHEMA_VERSION,
      inputFingerprint,
      JSON.stringify(upstream),
      nowIso,
      demoId,
    ),
    db.prepare(`
      UPDATE prospects SET current_state = 'DEMO_CONFIGURED', updated_at = ?
      WHERE id = ? AND current_state = 'CONTENT_PENDING'
        AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)
    `).bind(nowIso, prospect.id, userId),
    db.prepare(`
      UPDATE prospects SET current_state = 'RENDER_PENDING', updated_at = ?
      WHERE id = ? AND current_state = 'DEMO_CONFIGURED'
        AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)
    `).bind(nowIso, prospect.id, userId),
    db.prepare(`
      UPDATE prospects SET current_state = 'RENDERED', updated_at = ?
      WHERE id = ? AND current_state = 'RENDER_PENDING'
        AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)
    `).bind(nowIso, prospect.id, userId),
  ]);

  if (writes.some((result) => Number(result.meta?.changes ?? 0) !== 1)) {
    await db.prepare('DELETE FROM demos WHERE id = ?').bind(demoId).run().catch(() => undefined);
    throw new Error('Automated demo build did not commit all guarded writes.');
  }

  const demo = await new DemoRepository(db).getByIdForUser(demoId, userId);
  if (!demo) throw new Error('Automated demo could not be reloaded.');
  const rendered = renderDemoRecordForOperator(demo, nowIso);
  if (!rendered.ok) throw new Error(`Automated demo config failed renderer validation: ${rendered.reason}.`);
  const history = await getAutomatedDemoBuildHistory(db, userId, prospect.id);
  const build = history.find((item) => item.id === buildId);
  if (!build) throw new Error('Automated demo build provenance could not be reloaded.');

  return { build, demo, previewToken, reused: false };
}
