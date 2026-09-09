import {
  assessWebsiteOpportunity,
  type WebsiteAuditAssessment,
  type WebsiteAuditSource,
  type WebsiteViewportMetrics,
} from '@shalcon/agents';
import {
  ProspectRepository,
  SourceRecordRepository,
  type D1DatabaseLike,
  type SourceRecord,
} from '@shalcon/db';
import { z } from 'zod';

const viewportMetricsSchema = z.object({
  viewportWidth: z.number().int().min(1).max(10_000),
  documentWidth: z.number().int().min(0).max(100_000),
  hasHorizontalOverflow: z.boolean(),
});

const pageSchema = z.object({
  title: z.string().default(''),
  text: z.string().default(''),
  html: z.string().default(''),
  screenshotPath: z.string().nullable().default(null),
  mobileScreenshotPath: z.string().nullable().optional(),
  viewportAudit: z
    .object({
      desktop: viewportMetricsSchema.nullable(),
      mobile: viewportMetricsSchema.nullable(),
    })
    .nullable()
    .optional(),
  httpStatus: z.number().int().min(100).max(599).nullable().default(null),
  navigationError: z.string().nullable().default(null),
  console: z.array(z.object({ type: z.string(), text: z.string() })).default([]),
  discoveredLinks: z.array(z.string()).default([]),
});

const rawSourceSchema = z.object({
  schemaVersion: z.literal('playwright-research.v1'),
  jobId: z.string().min(1),
  researchCapturedAt: z.string().min(1),
  page: pageSchema,
});

interface ParsedAuditSource {
  batchId: string;
  capturedAt: string;
  auditSource: WebsiteAuditSource;
}

export interface WebsiteAuditRunResult extends WebsiteAuditAssessment {
  id: string;
  prospectId: string;
  createdAt: string;
}

function viewportMetrics(value: z.infer<typeof viewportMetricsSchema> | null): WebsiteViewportMetrics | null {
  if (value === null) return null;
  return {
    viewportWidth: value.viewportWidth,
    documentWidth: value.documentWidth,
    hasHorizontalOverflow: value.hasHorizontalOverflow,
  };
}

function parseAuditSource(source: SourceRecord): ParsedAuditSource | null {
  if (source.provider !== 'PLAYWRIGHT' || source.sourceType !== 'WEBSITE_PAGE') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(source.rawJson) as unknown;
  } catch {
    return null;
  }
  const parsed = rawSourceSchema.safeParse(raw);
  if (!parsed.success) return null;
  const page = parsed.data.page;
  return {
    batchId: parsed.data.jobId,
    capturedAt: parsed.data.researchCapturedAt,
    auditSource: {
      sourceId: source.id,
      sourceUrl: source.sourceUrl,
      title: page.title,
      text: page.text,
      html: page.html,
      screenshotPath: page.screenshotPath,
      mobileScreenshotPath: page.mobileScreenshotPath ?? null,
      viewportAudit: page.viewportAudit
        ? {
            desktop: viewportMetrics(page.viewportAudit.desktop),
            mobile: viewportMetrics(page.viewportAudit.mobile),
          }
        : null,
      httpStatus: page.httpStatus,
      navigationError: page.navigationError,
      consoleErrors: page.console.filter((item) => item.type === 'error').length,
      discoveredLinks: page.discoveredLinks,
    },
  };
}

function latestBatch(sources: readonly ParsedAuditSource[]): WebsiteAuditSource[] {
  if (sources.length === 0) return [];
  const latest = [...sources].sort(
    (left, right) =>
      right.capturedAt.localeCompare(left.capturedAt) || right.batchId.localeCompare(left.batchId),
  )[0];
  if (!latest) return [];
  return sources
    .filter((source) => source.batchId === latest.batchId)
    .map((source) => source.auditSource)
    .sort((left, right) => left.sourceUrl.localeCompare(right.sourceUrl));
}

function token(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/gu, '')}`;
}

export async function runWebsiteOpportunityAudit(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
  now = new Date().toISOString(),
): Promise<WebsiteAuditRunResult> {
  const prospect = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  if (prospect.currentState === 'DUPLICATE') {
    throw new Error('Website audit belongs on the canonical prospect.');
  }

  const sourceRecords = await new SourceRecordRepository(db).listForProspect(prospect.id);
  const sources = latestBatch(
    sourceRecords.map(parseAuditSource).filter((item): item is ParsedAuditSource => item !== null),
  );
  const assessment = assessWebsiteOpportunity(sources);
  const runId = token('waudit');
  const statements = [
    db
      .prepare(`
        INSERT INTO website_audit_runs(
          id, prospect_id, user_id, status, website_presence, quality_score, quality_rating,
          recommendation, source_ids_json, summary, created_at, completed_at
        ) VALUES (?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        runId,
        prospect.id,
        userId,
        assessment.websitePresence,
        assessment.qualityScore,
        assessment.qualityRating,
        assessment.recommendation,
        JSON.stringify(assessment.evidenceSourceIds),
        assessment.summary,
        now,
        now,
      ),
  ];

  for (const item of assessment.observations) {
    statements.push(
      db
        .prepare(`
          INSERT INTO website_audit_observations(
            id, run_id, prospect_id, code, severity, title, detail, source_record_id,
            source_url, screenshot_path, viewport, penalty, supported_by_capture, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `)
        .bind(
          token('wobs'),
          runId,
          prospect.id,
          item.code,
          item.severity,
          item.title,
          item.detail,
          item.sourceId,
          item.sourceUrl,
          item.screenshotPath,
          item.viewport,
          item.penalty,
          now,
        ),
    );
  }

  const writes = await db.batch(statements);
  if (writes.length !== statements.length || writes.some((write) => write.meta?.changes !== 1)) {
    throw new Error('Website audit did not persist atomically.');
  }

  return {
    id: runId,
    prospectId: prospect.id,
    createdAt: now,
    ...assessment,
  };
}

export async function getWebsiteAuditHistory(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
): Promise<unknown[]> {
  const prospect = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  const runs = await db
    .prepare(`
      SELECT id, prospect_id, status, website_presence, quality_score, quality_rating,
        recommendation, source_ids_json, summary, created_at, completed_at
      FROM website_audit_runs
      WHERE prospect_id = ? AND user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    `)
    .bind(prospectId, userId)
    .all<Record<string, unknown>>();
  return runs.results;
}

export async function getWebsiteAuditObservations(
  db: D1DatabaseLike,
  userId: string,
  runId: string,
): Promise<unknown[]> {
  const run = await db
    .prepare('SELECT id FROM website_audit_runs WHERE id = ? AND user_id = ?')
    .bind(runId, userId)
    .first<{ id: string }>();
  if (!run) throw new Error('Website audit run not found.');
  const observations = await db
    .prepare(`
      SELECT id, run_id, prospect_id, code, severity, title, detail, source_record_id,
        source_url, screenshot_path, viewport, penalty, supported_by_capture, created_at
      FROM website_audit_observations
      WHERE run_id = ?
      ORDER BY penalty DESC, severity DESC, code, id
    `)
    .bind(runId)
    .all<Record<string, unknown>>();
  return observations.results;
}
