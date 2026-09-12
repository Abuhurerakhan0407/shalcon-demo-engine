import { ProspectRepository, type D1DatabaseLike } from '@shalcon/db';
import { findTemplateDefinition } from '@shalcon/templates';
import { z } from 'zod';

export const ASSET_ENGINE_VERSION = 'asset-engine.v1' as const;

const OFFICIAL_SOURCE_TYPES = new Set([
  'OFFICIAL_WEBSITE',
  'OFFICIAL_PROFILE',
  'OFFICIAL_BRAND_UPLOAD',
]);

export const SHALCON_TEMPLATE_ASSET_LIBRARY = [
  {
    id: 'shalcon_elane_v8_hero_builtin',
    templateId: 'elane-v8',
    templateVersion: '8.0.0',
    slot: 'HERO',
    storageRef: 'template-runtime://elane-v8/builtin/hero',
    mimeType: 'image/webp',
    width: 1600,
    height: 1200,
    usageClassification: 'SHALCON_TEMPLATE',
    representation: 'GENERIC_TEMPLATE_IMAGERY',
    watermarked: false,
  },
  {
    id: 'shalcon_elane_v8_service_builtin',
    templateId: 'elane-v8',
    templateVersion: '8.0.0',
    slot: 'SERVICE',
    storageRef: 'template-runtime://elane-v8/builtin/service',
    mimeType: 'image/webp',
    width: 1200,
    height: 1200,
    usageClassification: 'SHALCON_TEMPLATE',
    representation: 'GENERIC_TEMPLATE_IMAGERY',
    watermarked: false,
  },
  {
    id: 'shalcon_elane_v8_gallery_builtin',
    templateId: 'elane-v8',
    templateVersion: '8.0.0',
    slot: 'GALLERY',
    storageRef: 'template-runtime://elane-v8/builtin/gallery',
    mimeType: 'image/webp',
    width: 1400,
    height: 1050,
    usageClassification: 'SHALCON_TEMPLATE',
    representation: 'GENERIC_TEMPLATE_IMAGERY',
    watermarked: false,
  },
] as const;

const optimizationSchema = z.object({
  sourceWidth: z.number().int().positive(),
  sourceHeight: z.number().int().positive(),
  outputWidth: z.number().int().positive(),
  outputHeight: z.number().int().positive(),
  resizeRequired: z.boolean(),
}).strict();

const imageAssignmentSchema = z.object({
  slot: z.enum(['LOGO', 'HERO', 'SERVICE', 'GALLERY']),
  kind: z.literal('IMAGE'),
  assetId: z.string().min(1),
  storageRef: z.string().min(1),
  sourceType: z.string().min(1),
  sourceUrl: z.string().url().nullable(),
  sourceCapturedAt: z.string().nullable(),
  associationAssumption: z.string().nullable(),
  usageClassification: z.enum(['SHALCON_TEMPLATE', 'PROSPECT_OFFICIAL']),
  representation: z.enum(['GENERIC_TEMPLATE_IMAGERY', 'PROSPECT_OFFICIAL_BRAND_ASSET']),
  mayDescribeAsProspectReality: z.literal(false),
  optimization: optimizationSchema,
}).strict();

const wordmarkAssignmentSchema = z.object({
  slot: z.literal('LOGO'),
  kind: z.literal('TEXT_WORDMARK'),
  text: z.string().trim().min(1).max(240),
  usageClassification: z.literal('TEXT_WORDMARK_FALLBACK'),
  mayDescribeAsProspectReality: z.literal(false),
}).strict();

export const assetAssignmentSchema = z.union([imageAssignmentSchema, wordmarkAssignmentSchema]);
export const assetSelectionSchema = z.object({
  assignments: z.array(assetAssignmentSchema).min(4).max(4),
  rejectedExternalAssetIds: z.array(z.string()),
}).strict();

export type AssetAssignment = z.infer<typeof assetAssignmentSchema>;
export type AssetSelection = z.infer<typeof assetSelectionSchema>;

interface AssetRow {
  id: string;
  prospect_id: string | null;
  asset_type: string;
  source_type: string;
  source_url: string | null;
  storage_ref: string;
  usage_classification: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  source_captured_at: string | null;
  association_assumption: string | null;
  watermark_status: 'CLEAR' | 'WATERMARKED' | 'UNKNOWN';
  asset_status: 'ACTIVE' | 'BROKEN' | 'DISABLED';
  created_at: string;
}

interface DependencyRow { id: string; }
interface SelectionRow {
  id: string;
  prospect_id: string;
  template_match_id: string;
  content_run_id: string;
  engine_version: string;
  assignments_json: string;
  asset_ids_json: string;
  created_at: string;
}

export interface StoredAssetSelectionRun {
  id: string;
  prospectId: string;
  templateMatchId: string;
  contentRunId: string;
  engineVersion: string;
  assignments: AssetAssignment[];
  assetIds: string[];
  createdAt: string;
}

export function planOptimizedDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  if (![width, height, maxWidth, maxHeight].every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error('Image dimensions must be positive integers.');
  }
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return optimizationSchema.parse({
    sourceWidth: width,
    sourceHeight: height,
    outputWidth: Math.max(1, Math.round(width * scale)),
    outputHeight: Math.max(1, Math.round(height * scale)),
    resizeRequired: scale < 1,
  });
}

function isHttpUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function eligibleOfficialLogo(asset: AssetRow): boolean {
  return (
    asset.asset_type === 'LOGO' &&
    asset.usage_classification === 'PROSPECT_OFFICIAL' &&
    OFFICIAL_SOURCE_TYPES.has(asset.source_type) &&
    isHttpUrl(asset.source_url) &&
    asset.source_captured_at !== null && asset.source_captured_at.length > 0 &&
    asset.association_assumption === 'OFFICIAL_PROSPECT_SOURCE' &&
    asset.watermark_status === 'CLEAR' &&
    asset.asset_status === 'ACTIVE' &&
    asset.mime_type.startsWith('image/') &&
    (asset.width ?? 0) > 0 &&
    (asset.height ?? 0) > 0
  );
}

function templateAssignment(
  templateId: string,
  templateVersion: string,
  slot: 'HERO' | 'SERVICE' | 'GALLERY',
): AssetAssignment {
  const asset = SHALCON_TEMPLATE_ASSET_LIBRARY.find(
    (item) => item.templateId === templateId && item.templateVersion === templateVersion && item.slot === slot,
  );
  if (!asset) throw new Error(`No approved Shalcon template asset is registered for ${slot}.`);
  const limits = slot === 'HERO' ? [1600, 1200] : slot === 'SERVICE' ? [1200, 1200] : [1400, 1050];
  return imageAssignmentSchema.parse({
    slot,
    kind: 'IMAGE',
    assetId: asset.id,
    storageRef: asset.storageRef,
    sourceType: 'SHALCON_TEMPLATE_LIBRARY',
    sourceUrl: null,
    sourceCapturedAt: null,
    associationAssumption: 'GENERIC_TEMPLATE_PRESENTATION',
    usageClassification: 'SHALCON_TEMPLATE',
    representation: 'GENERIC_TEMPLATE_IMAGERY',
    mayDescribeAsProspectReality: false,
    optimization: planOptimizedDimensions(asset.width, asset.height, limits[0]!, limits[1]!),
  });
}

export function selectAssetAssignments(
  prospectName: string,
  templateId: string,
  templateVersion: string,
  prospectAssets: AssetRow[],
): AssetSelection {
  if (!findTemplateDefinition(templateId, templateVersion)) {
    throw new Error('Asset selection requires an allowed template registry entry.');
  }
  const officialLogo = prospectAssets
    .filter(eligibleOfficialLogo)
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))[0];
  const rejectedExternalAssetIds = prospectAssets
    .filter((asset) => asset.usage_classification !== 'SHALCON_TEMPLATE' && !eligibleOfficialLogo(asset))
    .map((asset) => asset.id);

  const logo: AssetAssignment = officialLogo && officialLogo.width && officialLogo.height
    ? imageAssignmentSchema.parse({
        slot: 'LOGO',
        kind: 'IMAGE',
        assetId: officialLogo.id,
        storageRef: officialLogo.storage_ref,
        sourceType: officialLogo.source_type,
        sourceUrl: officialLogo.source_url,
        sourceCapturedAt: officialLogo.source_captured_at,
        associationAssumption: officialLogo.association_assumption,
        usageClassification: 'PROSPECT_OFFICIAL',
        representation: 'PROSPECT_OFFICIAL_BRAND_ASSET',
        mayDescribeAsProspectReality: false,
        optimization: planOptimizedDimensions(officialLogo.width, officialLogo.height, 512, 512),
      })
    : wordmarkAssignmentSchema.parse({
        slot: 'LOGO',
        kind: 'TEXT_WORDMARK',
        text: prospectName.slice(0, 240),
        usageClassification: 'TEXT_WORDMARK_FALLBACK',
        mayDescribeAsProspectReality: false,
      });

  return assetSelectionSchema.parse({
    assignments: [
      logo,
      templateAssignment(templateId, templateVersion, 'HERO'),
      templateAssignment(templateId, templateVersion, 'SERVICE'),
      templateAssignment(templateId, templateVersion, 'GALLERY'),
    ],
    rejectedExternalAssetIds,
  });
}

function parseRun(row: SelectionRow): StoredAssetSelectionRun {
  const rawAssignments: unknown = JSON.parse(row.assignments_json);
  const assignments = z.array(assetAssignmentSchema).parse(rawAssignments);
  const rawIds: unknown = JSON.parse(row.asset_ids_json);
  const assetIds = z.array(z.string()).parse(rawIds);
  return {
    id: row.id,
    prospectId: row.prospect_id,
    templateMatchId: row.template_match_id,
    contentRunId: row.content_run_id,
    engineVersion: row.engine_version,
    assignments,
    assetIds,
    createdAt: row.created_at,
  };
}

function randomId(): string {
  return `asset_selection_${crypto.randomUUID().replaceAll('-', '')}`;
}

export async function getAssetSelectionHistory(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
): Promise<StoredAssetSelectionRun[]> {
  const prospect = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  const rows = await db.prepare(`
    SELECT run.*
    FROM asset_selection_runs run
    JOIN prospects prospect ON prospect.id = run.prospect_id
    JOIN campaigns campaign ON campaign.id = prospect.campaign_id
    WHERE run.prospect_id = ? AND campaign.user_id = ?
    ORDER BY run.created_at DESC, run.id DESC
    LIMIT 50
  `).bind(prospectId, userId).all<SelectionRow>();
  return rows.results.map(parseRun);
}

export async function runAssetSelection(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
  now = new Date().toISOString(),
): Promise<StoredAssetSelectionRun> {
  const prospect = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  if (prospect.currentState !== 'CONTENT_PENDING') {
    throw new Error(`Asset selection requires CONTENT_PENDING state; found ${prospect.currentState}.`);
  }
  const [match, content, assetRows] = await Promise.all([
    db.prepare(`SELECT id, template_id, template_version FROM template_match_runs WHERE prospect_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`)
      .bind(prospect.id).first<{ id: string; template_id: string; template_version: string }>(),
    db.prepare(`SELECT id FROM content_generation_runs WHERE prospect_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`)
      .bind(prospect.id).first<DependencyRow>(),
    db.prepare(`SELECT id, prospect_id, asset_type, source_type, source_url, storage_ref,
      usage_classification, mime_type, width, height, source_captured_at, association_assumption,
      watermark_status, asset_status, created_at
      FROM assets WHERE prospect_id = ? ORDER BY created_at DESC, id DESC`)
      .bind(prospect.id).all<AssetRow>(),
  ]);
  if (!match) throw new Error('A template match is required before asset selection.');
  if (!content) throw new Error('A content generation run is required before asset selection.');

  const selection = selectAssetAssignments(
    prospect.canonicalName,
    match.template_id,
    match.template_version,
    assetRows.results,
  );
  const assetIds = selection.assignments
    .filter((assignment): assignment is Extract<AssetAssignment, { kind: 'IMAGE' }> => assignment.kind === 'IMAGE')
    .map((assignment) => assignment.assetId);
  const runId = randomId();
  const result = await db.prepare(`
    INSERT INTO asset_selection_runs(
      id, prospect_id, template_match_id, content_run_id, engine_version,
      assignments_json, asset_ids_json, created_at
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM prospects prospect
      JOIN campaigns campaign ON campaign.id = prospect.campaign_id
      WHERE prospect.id = ? AND campaign.user_id = ? AND prospect.current_state = 'CONTENT_PENDING'
    )
  `).bind(
    runId,
    prospect.id,
    match.id,
    content.id,
    ASSET_ENGINE_VERSION,
    JSON.stringify(selection.assignments),
    JSON.stringify(assetIds),
    now,
    prospect.id,
    userId,
  ).run();
  if ((result.meta?.changes ?? 0) < 1) {
    throw new Error('Prospect changed concurrently; asset selection was not persisted.');
  }
  const history = await getAssetSelectionHistory(db, userId, prospect.id);
  const run = history.find((item) => item.id === runId);
  if (!run) throw new Error('Asset selection history could not be reloaded.');
  return run;
}

export function publicTemplateAssetLibrary() {
  return SHALCON_TEMPLATE_ASSET_LIBRARY.map((asset) => ({
    id: asset.id,
    templateId: asset.templateId,
    templateVersion: asset.templateVersion,
    slot: asset.slot,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    usageClassification: asset.usageClassification,
    representation: asset.representation,
    watermarked: asset.watermarked,
  }));
}
