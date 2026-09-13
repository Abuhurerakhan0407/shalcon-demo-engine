import {
  DemoRepository,
  JobContextRepository,
  JobRepository,
  ProspectRepository,
  buildIdempotencyKey,
  type D1DatabaseLike,
  type JobRecord,
} from '@shalcon/db';
import { assertProspectTransition } from '@shalcon/state-machine';
import { z } from 'zod';

import { randomToken } from './auth';
import { renderDemoRecordForOperator } from './demo-renderer';

export const VISUAL_QA_ENGINE_VERSION = 'visual-qa.v1' as const;
export const VISUAL_QA_JOB_TYPE = 'PLAYWRIGHT_VISUAL_QA' as const;

const screenshotKindSchema = z.enum([
  'DESKTOP_FULL',
  'DESKTOP_HERO',
  'MOBILE_FULL',
  'MOBILE_HERO',
]);

const viewportResultSchema = z.object({
  viewportWidth: z.number().int().positive().max(10_000),
  viewportHeight: z.number().int().positive().max(10_000),
  documentWidth: z.number().int().nonnegative().max(100_000),
  documentHeight: z.number().int().nonnegative().max(1_000_000),
  horizontalOverflow: z.boolean(),
  brokenImageCount: z.number().int().nonnegative().max(1_000),
  consoleErrors: z.array(z.string().max(1_000)).max(100),
  pageErrors: z.array(z.string().max(1_000)).max(100),
  ctaPresent: z.boolean(),
  placeholderCount: z.number().int().nonnegative().max(1_000),
  disclosurePresent: z.boolean(),
  noindexPresent: z.boolean(),
}).strict();

const screenshotSchema = z.object({
  kind: screenshotKindSchema,
  storageRef: z.string().regex(/^runner-artifact:\/\/visual-qa\/[A-Za-z0-9_.\/-]+\.png$/u),
  mimeType: z.literal('image/png'),
  width: z.number().int().positive().max(20_000),
  height: z.number().int().positive().max(100_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

export const visualQaRunnerResultSchema = z.object({
  schemaVersion: z.literal('visual-qa.v1'),
  demoId: z.string().min(1).max(160),
  desktop: viewportResultSchema,
  mobile: viewportResultSchema,
  screenshots: z.array(screenshotSchema).length(4),
}).strict().superRefine((value, ctx) => {
  const kinds = new Set(value.screenshots.map((item) => item.kind));
  for (const kind of screenshotKindSchema.options) {
    if (!kinds.has(kind)) {
      ctx.addIssue({ code: 'custom', message: `Missing required screenshot ${kind}.` });
    }
  }
  if (kinds.size !== 4) {
    ctx.addIssue({ code: 'custom', message: 'Visual QA screenshots must contain four unique kinds.' });
  }
});

export type VisualQaRunnerResult = z.infer<typeof visualQaRunnerResultSchema>;

interface QaRunRow {
  id: string;
  demo_id: string;
  qa_type: string;
  status: string;
  issues_json: string;
  screenshot_asset_ids_json: string;
  started_at: string;
  completed_at: string | null;
  runner_job_id: string | null;
  engine_version: string;
  checks_json: string;
  viewport_results_json: string;
}

interface RunnerInputRow extends QaRunRow {
  job_id: string;
  job_type: string;
  job_status: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  user_id: string;
}

interface ScreenshotRow {
  id: string;
  qa_run_id: string;
  demo_id: string;
  kind: z.infer<typeof screenshotKindSchema>;
  storage_ref: string;
  mime_type: 'image/png';
  width: number;
  height: number;
  sha256: string;
  created_at: string;
}

export interface VisualQaRunRecord {
  id: string;
  demoId: string;
  status: string;
  issues: string[];
  screenshotAssetIds: string[];
  runnerJobId: string | null;
  engineVersion: string;
  checks: unknown;
  viewportResults: unknown;
  startedAt: string;
  completedAt: string | null;
}

export interface VisualQaEnqueueResult {
  run: VisualQaRunRecord;
  job: JobRecord;
  created: boolean;
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

function parseQaRun(row: QaRunRow): VisualQaRunRecord {
  return {
    id: row.id,
    demoId: row.demo_id,
    status: row.status,
    issues: parseJsonArray(row.issues_json),
    screenshotAssetIds: parseJsonArray(row.screenshot_asset_ids_json),
    runnerJobId: row.runner_job_id,
    engineVersion: row.engine_version,
    checks: parseJson(row.checks_json),
    viewportResults: parseJson(row.viewport_results_json),
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function visualIssues(result: VisualQaRunnerResult): string[] {
  const issues: string[] = [];
  for (const [label, viewport] of [['desktop', result.desktop], ['mobile', result.mobile]] as const) {
    if (viewport.horizontalOverflow) issues.push(`${label}:horizontal-overflow`);
    if (viewport.brokenImageCount > 0) issues.push(`${label}:broken-images`);
    if (viewport.consoleErrors.length > 0) issues.push(`${label}:console-errors`);
    if (viewport.pageErrors.length > 0) issues.push(`${label}:page-errors`);
    if (!viewport.ctaPresent) issues.push(`${label}:cta-missing`);
    if (viewport.placeholderCount > 0) issues.push(`${label}:placeholder-content`);
    if (!viewport.disclosurePresent) issues.push(`${label}:concept-disclosure-missing`);
    if (!viewport.noindexPresent) issues.push(`${label}:noindex-missing`);
  }
  return issues;
}

function qaChecks(result: VisualQaRunnerResult, passed: boolean, issues: string[]) {
  return {
    engineVersion: VISUAL_QA_ENGINE_VERSION,
    passed,
    issueCount: issues.length,
    screenshotCount: result.screenshots.length,
    desktop: {
      noOverflow: !result.desktop.horizontalOverflow,
      noBrokenImages: result.desktop.brokenImageCount === 0,
      noConsoleErrors: result.desktop.consoleErrors.length === 0,
      noPageErrors: result.desktop.pageErrors.length === 0,
      ctaPresent: result.desktop.ctaPresent,
      noPlaceholders: result.desktop.placeholderCount === 0,
      disclosurePresent: result.desktop.disclosurePresent,
      noindexPresent: result.desktop.noindexPresent,
    },
    mobile: {
      noOverflow: !result.mobile.horizontalOverflow,
      noBrokenImages: result.mobile.brokenImageCount === 0,
      noConsoleErrors: result.mobile.consoleErrors.length === 0,
      noPageErrors: result.mobile.pageErrors.length === 0,
      ctaPresent: result.mobile.ctaPresent,
      noPlaceholders: result.mobile.placeholderCount === 0,
      disclosurePresent: result.mobile.disclosurePresent,
      noindexPresent: result.mobile.noindexPresent,
    },
  };
}

async function qaRunByJob(db: D1DatabaseLike, jobId: string): Promise<QaRunRow | null> {
  return db.prepare(`
    SELECT id, demo_id, qa_type, status, issues_json, screenshot_asset_ids_json,
      started_at, completed_at, runner_job_id, engine_version, checks_json, viewport_results_json
    FROM demo_qa_runs
    WHERE runner_job_id = ? AND qa_type = 'VISUAL_PHASE18'
    LIMIT 1
  `).bind(jobId).first<QaRunRow>();
}

async function qaRunById(db: D1DatabaseLike, runId: string): Promise<QaRunRow | null> {
  return db.prepare(`
    SELECT id, demo_id, qa_type, status, issues_json, screenshot_asset_ids_json,
      started_at, completed_at, runner_job_id, engine_version, checks_json, viewport_results_json
    FROM demo_qa_runs
    WHERE id = ?
    LIMIT 1
  `).bind(runId).first<QaRunRow>();
}

export async function getVisualQaHistory(
  db: D1DatabaseLike,
  userId: string,
  demoId: string,
): Promise<VisualQaRunRecord[]> {
  const demo = await new DemoRepository(db).getByIdForUser(demoId, userId);
  if (!demo) throw new Error('Demo not found.');
  const rows = await db.prepare(`
    SELECT run.id, run.demo_id, run.qa_type, run.status, run.issues_json,
      run.screenshot_asset_ids_json, run.started_at, run.completed_at, run.runner_job_id,
      run.engine_version, run.checks_json, run.viewport_results_json
    FROM demo_qa_runs run
    WHERE run.demo_id = ? AND run.qa_type = 'VISUAL_PHASE18'
    ORDER BY run.started_at DESC, run.id DESC
    LIMIT 50
  `).bind(demoId).all<QaRunRow>();
  return rows.results.map(parseQaRun);
}

export async function enqueueVisualQa(
  db: D1DatabaseLike,
  userId: string,
  demoId: string,
  now = new Date().toISOString(),
): Promise<VisualQaEnqueueResult> {
  const demos = new DemoRepository(db);
  const prospects = new ProspectRepository(db);
  const demo = await demos.getByIdForUser(demoId, userId);
  if (!demo) throw new Error('Demo not found.');
  if (demo.status !== 'RENDERED') {
    throw new Error(`Phase 18 visual QA requires a RENDERED demo; found ${demo.status}.`);
  }
  const prospect = await prospects.getByIdForUser(demo.prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  if (prospect.currentState !== 'RENDERED' && prospect.currentState !== 'VISUAL_QA_PENDING') {
    throw new Error(`Phase 18 visual QA requires RENDERED state; found ${prospect.currentState}.`);
  }

  const idempotencyKey = buildIdempotencyKey({
    namespace: `visual-qa:${userId}`,
    action: VISUAL_QA_JOB_TYPE,
    entityId: demo.id,
    payload: { demoUpdatedAt: demo.updatedAt, engineVersion: VISUAL_QA_ENGINE_VERSION },
  });
  const jobs = new JobRepository(db);
  const created = await jobs.createOrGet({
    id: `job_${randomToken(12)}`,
    jobType: VISUAL_QA_JOB_TYPE,
    entityId: demo.id,
    status: 'PENDING',
    priority: 20,
    idempotencyKey,
    attempts: 0,
    maxAttempts: 3,
    leaseOwner: null,
    leaseExpiresAt: null,
    scheduledFor: now,
    startedAt: null,
    completedAt: null,
    lastErrorCode: null,
    lastErrorSafeMessage: null,
    createdAt: now,
    updatedAt: now,
  });
  await new JobContextRepository(db).createOrGet({
    jobId: created.job.id,
    userId,
    payloadJson: JSON.stringify({ demoId: demo.id, engineVersion: VISUAL_QA_ENGINE_VERSION }),
    resultJson: null,
    createdAt: now,
    updatedAt: now,
  });

  let run = await qaRunByJob(db, created.job.id);
  if (!run) {
    const runId = `qa_visual_${randomToken(12)}`;
    const writes = await db.batch([
      db.prepare(`
        INSERT INTO demo_qa_runs(
          id, demo_id, qa_type, status, issues_json, screenshot_asset_ids_json,
          started_at, completed_at, runner_job_id, engine_version, checks_json, viewport_results_json
        ) VALUES (?, ?, 'VISUAL_PHASE18', 'PENDING', '[]', '[]', ?, NULL, ?, ?, '{}', '{}')
      `).bind(runId, demo.id, now, created.job.id, VISUAL_QA_ENGINE_VERSION),
      db.prepare(`
        UPDATE prospects
        SET current_state = 'VISUAL_QA_PENDING', updated_at = ?
        WHERE id = ? AND current_state = 'RENDERED'
          AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)
      `).bind(now, prospect.id, userId),
    ]);
    if (writes.some((write) => write.success !== true)) {
      throw new Error('Visual QA enqueue batch reported an unsuccessful statement.');
    }
    run = await qaRunById(db, runId);
  }

  const committedProspect = await prospects.getByIdForUser(prospect.id, userId);
  if (!run || committedProspect?.currentState !== 'VISUAL_QA_PENDING') {
    throw new Error('Visual QA enqueue did not persist required state.');
  }
  return { run: parseQaRun(run), job: created.job, created: created.created };
}

export async function getVisualQaRunnerInput(
  db: D1DatabaseLike,
  userId: string,
  runnerId: string,
  jobId: string,
  now = new Date().toISOString(),
) {
  const row = await db.prepare(`
    SELECT run.id, run.demo_id, run.qa_type, run.status, run.issues_json,
      run.screenshot_asset_ids_json, run.started_at, run.completed_at, run.runner_job_id,
      run.engine_version, run.checks_json, run.viewport_results_json,
      job.id AS job_id, job.job_type, job.status AS job_status, job.lease_owner,
      job.lease_expires_at, context.user_id
    FROM demo_qa_runs run
    JOIN jobs job ON job.id = run.runner_job_id
    JOIN job_contexts context ON context.job_id = job.id
    WHERE job.id = ?
      AND job.job_type = ?
      AND job.status = 'RUNNING'
      AND job.lease_owner = ?
      AND job.lease_expires_at IS NOT NULL
      AND job.lease_expires_at > ?
      AND context.user_id = ?
      AND run.status IN ('PENDING', 'RUNNING')
    LIMIT 1
  `).bind(jobId, VISUAL_QA_JOB_TYPE, runnerId, now, userId).first<RunnerInputRow>();
  if (!row) throw new Error('Visual QA job is not actively leased by this runner.');

  const demo = await new DemoRepository(db).getByIdForUser(row.demo_id, userId);
  if (!demo) throw new Error('Visual QA demo is unavailable.');
  const rendered = renderDemoRecordForOperator(demo, now);
  if (!rendered.ok) throw new Error(`Visual QA demo cannot be rendered: ${rendered.reason}.`);

  await db.prepare(`
    UPDATE demo_qa_runs SET status = 'RUNNING'
    WHERE id = ? AND status = 'PENDING' AND runner_job_id = ?
  `).bind(row.id, jobId).run();

  return {
    schemaVersion: 'visual-qa-input.v1' as const,
    qaRunId: row.id,
    demoId: demo.id,
    html: rendered.html,
    viewports: {
      desktop: { width: 1440, height: 900 },
      mobile: { width: 390, height: 844 },
    },
    requiredScreenshots: screenshotKindSchema.options,
  };
}

export async function completeVisualQa(
  db: D1DatabaseLike,
  userId: string,
  runnerId: string,
  jobId: string,
  rawResult: unknown,
  now = new Date().toISOString(),
): Promise<{ run: VisualQaRunRecord; passed: boolean; nextState: 'FACT_QA_PENDING' | 'QA_FAILED' }> {
  const result = visualQaRunnerResultSchema.parse(rawResult);
  const leased = await db.prepare(`
    SELECT run.id, run.demo_id, run.qa_type, run.status, run.issues_json,
      run.screenshot_asset_ids_json, run.started_at, run.completed_at, run.runner_job_id,
      run.engine_version, run.checks_json, run.viewport_results_json,
      job.id AS job_id, job.job_type, job.status AS job_status, job.lease_owner,
      job.lease_expires_at, context.user_id
    FROM demo_qa_runs run
    JOIN jobs job ON job.id = run.runner_job_id
    JOIN job_contexts context ON context.job_id = job.id
    WHERE job.id = ? AND job.job_type = ? AND job.status = 'RUNNING'
      AND job.lease_owner = ? AND job.lease_expires_at IS NOT NULL AND job.lease_expires_at > ?
      AND context.user_id = ? AND run.status IN ('PENDING', 'RUNNING')
    LIMIT 1
  `).bind(jobId, VISUAL_QA_JOB_TYPE, runnerId, now, userId).first<RunnerInputRow>();
  if (!leased) throw new Error('Visual QA job is not actively leased by this runner.');
  if (result.demoId !== leased.demo_id) throw new Error('Visual QA result demo does not match leased job.');

  const demo = await new DemoRepository(db).getByIdForUser(leased.demo_id, userId);
  if (!demo) throw new Error('Visual QA demo is unavailable.');
  const prospects = new ProspectRepository(db);
  const prospect = await prospects.getByIdForUser(demo.prospectId, userId);
  if (!prospect || prospect.currentState !== 'VISUAL_QA_PENDING') {
    throw new Error('Visual QA completion requires VISUAL_QA_PENDING state.');
  }

  const issues = visualIssues(result);
  const passed = issues.length === 0;
  const nextState = passed ? 'FACT_QA_PENDING' : 'QA_FAILED';
  assertProspectTransition('VISUAL_QA_PENDING', nextState);
  const checks = qaChecks(result, passed, issues);
  const screenshotIds = result.screenshots.map(() => `qa_shot_${randomToken(12)}`);
  const resultJson = JSON.stringify({ ...result, passed, issues });

  const statements = result.screenshots.map((screenshot, index) => db.prepare(`
    INSERT INTO visual_qa_screenshots(
      id, qa_run_id, demo_id, kind, storage_ref, mime_type, width, height, sha256, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    screenshotIds[index]!,
    leased.id,
    demo.id,
    screenshot.kind,
    screenshot.storageRef,
    screenshot.mimeType,
    screenshot.width,
    screenshot.height,
    screenshot.sha256,
    now,
  ));

  statements.push(
    db.prepare(`
      UPDATE demo_qa_runs
      SET status = ?, issues_json = ?, screenshot_asset_ids_json = ?, completed_at = ?,
        checks_json = ?, viewport_results_json = ?
      WHERE id = ? AND runner_job_id = ? AND status IN ('PENDING', 'RUNNING')
    `).bind(
      passed ? 'PASS' : 'FAIL',
      JSON.stringify(issues),
      JSON.stringify(screenshotIds),
      now,
      JSON.stringify(checks),
      JSON.stringify({ desktop: result.desktop, mobile: result.mobile }),
      leased.id,
      jobId,
    ),
    db.prepare(`
      UPDATE demos
      SET visual_qa_status = ?, fact_qa_status = ?, last_qa_at = ?, updated_at = ?
      WHERE id = ? AND prospect_id IN (
        SELECT prospect.id FROM prospects prospect
        JOIN campaigns campaign ON campaign.id = prospect.campaign_id
        WHERE campaign.user_id = ?
      )
    `).bind(
      passed ? 'PASS' : 'FAIL',
      passed ? 'PENDING_PHASE19' : 'BLOCKED_BY_VISUAL_QA',
      now,
      now,
      demo.id,
      userId,
    ),
    db.prepare(`
      UPDATE prospects SET current_state = ?, updated_at = ?
      WHERE id = ? AND current_state = 'VISUAL_QA_PENDING'
        AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)
    `).bind(nextState, now, prospect.id, userId),
    db.prepare(`
      UPDATE job_contexts SET result_json = ?, updated_at = ?
      WHERE job_id = ? AND user_id = ?
        AND EXISTS (
          SELECT 1 FROM jobs
          WHERE id = ? AND status = 'RUNNING' AND lease_owner = ?
            AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
        )
    `).bind(resultJson, now, jobId, userId, jobId, runnerId, now),
    db.prepare(`
      UPDATE jobs
      SET status = 'COMPLETED', completed_at = ?, lease_owner = NULL,
        lease_expires_at = NULL, updated_at = ?
      WHERE id = ? AND status = 'RUNNING' AND lease_owner = ?
        AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
        AND EXISTS (SELECT 1 FROM job_contexts WHERE job_id = ? AND user_id = ?)
    `).bind(now, now, jobId, runnerId, now, jobId, userId),
  );

  const writes = await db.batch(statements);
  if (writes.some((write) => write.success !== true)) {
    throw new Error('Visual QA completion batch reported an unsuccessful statement.');
  }

  const [storedRun, storedDemo, storedProspect, storedJob, storedContext, storedScreenshots] = await Promise.all([
    qaRunById(db, leased.id),
    new DemoRepository(db).getByIdForUser(demo.id, userId),
    prospects.getByIdForUser(prospect.id, userId),
    new JobRepository(db).getById(jobId),
    new JobContextRepository(db).getByJobId(jobId),
    db.prepare(`
      SELECT id, qa_run_id, demo_id, kind, storage_ref, mime_type, width, height, sha256, created_at
      FROM visual_qa_screenshots WHERE qa_run_id = ? ORDER BY kind
    `).bind(leased.id).all<ScreenshotRow>(),
  ]);
  const committed =
    storedRun !== null && storedRun.status === (passed ? 'PASS' : 'FAIL') &&
    storedDemo?.visualQaStatus === (passed ? 'PASS' : 'FAIL') &&
    storedProspect?.currentState === nextState &&
    storedJob?.status === 'COMPLETED' &&
    storedContext?.userId === userId && storedContext.resultJson === resultJson &&
    storedScreenshots.results.length === 4;
  if (!committed) throw new Error('Visual QA completion failed persisted post-commit invariants.');

  return { run: parseQaRun(storedRun), passed, nextState };
}
