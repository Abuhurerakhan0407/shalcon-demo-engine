import {
  DemoRepository,
  EvidenceRepository,
  ProspectFactRepository,
  ProspectRepository,
  type D1DatabaseLike,
  type EvidenceRecord,
  type ProspectFactRecord,
} from '@shalcon/db';
import { assertProspectTransition } from '@shalcon/state-machine';
import { z } from 'zod';

import { randomToken } from './auth';
import { contentPackageSchema } from './content-engine';

export const FACT_QA_ENGINE_VERSION = 'fact-qa.v1' as const;
export const SALES_QA_ENGINE_VERSION = 'sales-qa.v1' as const;
export const FACT_EVIDENCE_MAX_AGE_DAYS = 180;

const salesChecklistSchema = z.object({
  previewReviewed: z.boolean(),
  factsReviewed: z.boolean(),
  ctaReviewed: z.boolean(),
  screenshotsReviewed: z.boolean(),
  disclosureReviewed: z.boolean(),
}).strict();

export const salesDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  checklist: salesChecklistSchema,
  note: z.string().trim().max(1000).nullable().optional(),
}).strict();

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

interface IssueRow {
  id: string;
  qa_run_id: string;
  demo_id: string;
  qa_type: 'FACT_PHASE19' | 'SALES_PHASE19';
  code: string;
  field: string | null;
  severity: 'BLOCKING' | 'REVIEW';
  message: string;
  evidence_ids_json: string;
  status: 'OPEN' | 'RESOLVED' | 'WAIVED';
  created_at: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  resolution_note: string | null;
}

interface BuildRow {
  content_run_id: string;
}

interface ContentRow {
  content_json: string;
}

export interface QaIssue {
  id: string;
  qaRunId: string;
  demoId: string;
  qaType: 'FACT_PHASE19' | 'SALES_PHASE19';
  code: string;
  field: string | null;
  severity: 'BLOCKING' | 'REVIEW';
  message: string;
  evidenceIds: string[];
  status: 'OPEN' | 'RESOLVED' | 'WAIVED';
  createdAt: string;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolutionNote: string | null;
}

export interface FactQaResult {
  runId: string;
  demoId: string;
  status: 'PASS' | 'REVIEW' | 'FAIL';
  issues: QaIssue[];
  checks: Record<string, unknown>;
  nextState: 'FACT_QA_PENDING' | 'SALES_QA_PENDING' | 'QA_FAILED';
}

export interface SalesQaResult {
  runId: string;
  demoId: string;
  decision: 'APPROVED' | 'REJECTED';
  nextState: 'DEMO_READY' | 'QA_FAILED';
  demoStatus: 'READY' | 'RENDERED';
}

type IssueDraft = Omit<QaIssue, 'id' | 'qaRunId' | 'demoId' | 'qaType' | 'status' | 'createdAt' | 'resolvedAt' | 'resolvedByUserId' | 'resolutionNote'>;

type DemoConfig = {
  business?: {
    name?: string;
    descriptor?: string;
    city?: string;
    area?: string;
  };
  hero?: {
    headline?: string;
    subhead?: string;
    primaryCtaLabel?: string;
  };
  contact?: {
    address?: string;
    hoursSummary?: string;
    whatsapp?: string;
    phone?: string;
    email?: string;
    ctaLabel?: string;
  };
  disclosure?: { text?: string };
  noindex?: boolean;
};

const DIRECT_FACT_FIELDS = [
  { configPath: 'business.descriptor', aliases: ['category', 'business_category', 'descriptor'] },
  { configPath: 'business.city', aliases: ['city'] },
  { configPath: 'business.area', aliases: ['area', 'locality', 'neighborhood'] },
  { configPath: 'contact.address', aliases: ['address'] },
  { configPath: 'contact.hoursSummary', aliases: ['hours', 'opening_hours'] },
  { configPath: 'contact.whatsapp', aliases: ['whatsapp', 'whatsapp_phone'] },
  { configPath: 'contact.phone', aliases: ['phone'] },
  { configPath: 'contact.email', aliases: ['email'] },
] as const;

function parseJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function normalize(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
}

function pathValue(config: DemoConfig, path: string): string | undefined {
  const [section, key] = path.split('.') as [keyof DemoConfig, string];
  const record = config[section] as Record<string, unknown> | undefined;
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function factForAliases(facts: ProspectFactRecord[], aliases: readonly string[]): ProspectFactRecord | undefined {
  const wanted = new Set(aliases.map((item) => item.toLocaleLowerCase()));
  return facts.find((fact) => wanted.has(fact.field.trim().toLocaleLowerCase()));
}

function evidenceById(evidence: EvidenceRecord[]): Map<string, EvidenceRecord> {
  return new Map(evidence.map((item) => [item.id, item]));
}

function ageDays(capturedAt: string, now: Date): number {
  const captured = Date.parse(capturedAt);
  if (!Number.isFinite(captured)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - captured) / 86_400_000);
}

function clip(value: string, max: number, fallback: string): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized) return fallback;
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function expectedCta(config: DemoConfig): { channel: 'WHATSAPP' | 'CALL' | 'EMAIL' | 'PLACEHOLDER'; label: string } {
  if (config.contact?.whatsapp) return { channel: 'WHATSAPP', label: 'WhatsApp to enquire ↗' };
  if (config.contact?.phone) return { channel: 'CALL', label: 'Call to enquire ↗' };
  if (config.contact?.email) return { channel: 'EMAIL', label: 'Email to enquire ↗' };
  return { channel: 'PLACEHOLDER', label: 'Request appointment ↗' };
}

function parseIssue(row: IssueRow): QaIssue {
  return {
    id: row.id,
    qaRunId: row.qa_run_id,
    demoId: row.demo_id,
    qaType: row.qa_type,
    code: row.code,
    field: row.field,
    severity: row.severity,
    message: row.message,
    evidenceIds: parseJson<string[]>(row.evidence_ids_json, []),
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedByUserId: row.resolved_by_user_id,
    resolutionNote: row.resolution_note,
  };
}

async function ownedDemoContext(db: D1DatabaseLike, userId: string, demoId: string) {
  const demo = await new DemoRepository(db).getByIdForUser(demoId, userId);
  if (!demo) throw new Error('Demo not found.');
  const prospect = await new ProspectRepository(db).getByIdForUser(demo.prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  return { demo, prospect };
}

async function latestFactQaRun(db: D1DatabaseLike, demoId: string): Promise<QaRunRow | null> {
  return db.prepare(`
    SELECT id, demo_id, qa_type, status, issues_json, screenshot_asset_ids_json,
      started_at, completed_at, runner_job_id, engine_version, checks_json, viewport_results_json
    FROM demo_qa_runs
    WHERE demo_id = ? AND qa_type = 'FACT_PHASE19'
    ORDER BY started_at DESC, id DESC LIMIT 1
  `).bind(demoId).first<QaRunRow>();
}

async function listIssuesForRun(db: D1DatabaseLike, runId: string): Promise<QaIssue[]> {
  const rows = await db.prepare(`
    SELECT id, qa_run_id, demo_id, qa_type, code, field, severity, message,
      evidence_ids_json, status, created_at, resolved_at, resolved_by_user_id, resolution_note
    FROM demo_qa_issues WHERE qa_run_id = ? ORDER BY created_at ASC, id ASC
  `).bind(runId).all<IssueRow>();
  return rows.results.map(parseIssue);
}

async function createQaRun(
  db: D1DatabaseLike,
  demoId: string,
  qaType: 'FACT_PHASE19' | 'SALES_PHASE19',
  status: string,
  issues: IssueDraft[],
  checks: Record<string, unknown>,
  engineVersion: string,
  nowIso: string,
): Promise<{ runId: string; issues: QaIssue[] }> {
  const runId = `qa19_${randomToken(12)}`;
  await db.prepare(`
    INSERT INTO demo_qa_runs(
      id, demo_id, qa_type, status, issues_json, screenshot_asset_ids_json,
      started_at, completed_at, runner_job_id, engine_version, checks_json, viewport_results_json
    ) VALUES (?, ?, ?, ?, ?, '[]', ?, ?, NULL, ?, ?, '{}')
  `).bind(
    runId,
    demoId,
    qaType,
    status,
    JSON.stringify(issues.map((item) => ({ code: item.code, field: item.field, severity: item.severity }))),
    nowIso,
    nowIso,
    engineVersion,
    JSON.stringify(checks),
  ).run();

  for (const issue of issues) {
    await db.prepare(`
      INSERT INTO demo_qa_issues(
        id, qa_run_id, demo_id, qa_type, code, field, severity, message,
        evidence_ids_json, status, created_at, resolved_at, resolved_by_user_id, resolution_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, NULL, NULL, NULL)
    `).bind(
      `qa_issue_${randomToken(12)}`,
      runId,
      demoId,
      qaType,
      issue.code,
      issue.field,
      issue.severity,
      issue.message,
      JSON.stringify(issue.evidenceIds),
      nowIso,
    ).run();
  }
  return { runId, issues: await listIssuesForRun(db, runId) };
}

export async function runFactQa(
  db: D1DatabaseLike,
  userId: string,
  demoId: string,
  now = new Date(),
): Promise<FactQaResult> {
  const { demo, prospect } = await ownedDemoContext(db, userId, demoId);
  if (prospect.currentState !== 'FACT_QA_PENDING') {
    throw new Error(`Fact QA requires FACT_QA_PENDING state; found ${prospect.currentState}.`);
  }
  if (demo.visualQaStatus !== 'PASS') throw new Error('Fact QA requires visual QA PASS.');

  const [facts, evidence, build] = await Promise.all([
    new ProspectFactRepository(db).listForProspect(prospect.id),
    new EvidenceRepository(db).listForProspect(prospect.id),
    db.prepare(`
      SELECT content_run_id FROM automated_demo_builds
      WHERE demo_id = ? AND prospect_id = ? AND status = 'COMPLETED'
      ORDER BY created_at DESC LIMIT 1
    `).bind(demo.id, prospect.id).first<BuildRow>(),
  ]);
  if (!build) throw new Error('Fact QA requires automated build provenance.');
  const contentRow = await db.prepare(`
    SELECT content_json FROM content_generation_runs WHERE id = ? AND prospect_id = ? LIMIT 1
  `).bind(build.content_run_id, prospect.id).first<ContentRow>();
  if (!contentRow) throw new Error('Fact QA content provenance is missing.');

  const config = parseJson<DemoConfig>(demo.configJson, {});
  const content = contentPackageSchema.parse(JSON.parse(contentRow.content_json));
  const evidenceMap = evidenceById(evidence);
  const issues: IssueDraft[] = [];
  const directChecks: Array<Record<string, unknown>> = [];

  if (normalize(config.business?.name ?? '') !== normalize(prospect.canonicalName)) {
    issues.push({ code: 'BUSINESS_NAME_MISMATCH', field: 'business.name', severity: 'BLOCKING', message: 'Visible business name does not match the canonical prospect identity.', evidenceIds: [] });
  }

  for (const field of DIRECT_FACT_FIELDS) {
    const visible = pathValue(config, field.configPath);
    if (!visible) continue;
    const fact = factForAliases(facts, field.aliases);
    const proof = fact?.evidenceId ? evidenceMap.get(fact.evidenceId) : undefined;
    const exact = Boolean(
      fact &&
      proof &&
      fact.verificationStatus === 'VERIFIED' &&
      proof.verificationStatus === 'VERIFIED' &&
      fact.prospectId === prospect.id &&
      proof.prospectId === prospect.id &&
      normalize(fact.value) === normalize(visible) &&
      normalize(proof.value) === normalize(visible)
    );
    directChecks.push({ field: field.configPath, visible, factId: fact?.id ?? null, evidenceId: proof?.id ?? null, exact });
    if (!exact) {
      issues.push({
        code: 'UNSUPPORTED_VISIBLE_FACT',
        field: field.configPath,
        severity: 'BLOCKING',
        message: 'Visible critical field is not exactly backed by a current VERIFIED canonical fact and evidence row.',
        evidenceIds: proof ? [proof.id] : [],
      });
      continue;
    }
    if (proof && ageDays(proof.capturedAt, now) > FACT_EVIDENCE_MAX_AGE_DAYS) {
      issues.push({
        code: 'STALE_EVIDENCE_REVIEW',
        field: field.configPath,
        severity: 'REVIEW',
        message: `Evidence is older than ${FACT_EVIDENCE_MAX_AGE_DAYS} days and requires refresh/review.`,
        evidenceIds: [proof.id],
      });
    }
  }

  const contentEvidenceIds = new Set<string>();
  for (const block of [content.headline, content.about, content.cta]) {
    for (const evidenceId of block?.inputEvidenceIds ?? []) contentEvidenceIds.add(evidenceId);
  }
  for (const service of content.services) {
    contentEvidenceIds.add(service.serviceEvidenceId);
    for (const evidenceId of service.description.inputEvidenceIds) contentEvidenceIds.add(evidenceId);
  }
  for (const evidenceId of contentEvidenceIds) {
    const proof = evidenceMap.get(evidenceId);
    if (!proof || proof.prospectId !== prospect.id || proof.verificationStatus !== 'VERIFIED') {
      issues.push({
        code: 'CONTENT_EVIDENCE_INVALID',
        field: 'generated-content',
        severity: 'BLOCKING',
        message: 'Generated visible copy references evidence that is missing, foreign, or no longer VERIFIED.',
        evidenceIds: [evidenceId],
      });
    }
  }

  const expectedHeadline = clip(content.headline?.text ?? '', 72, 'A sharper first impression.');
  const expectedSubhead = clip(content.about?.text ?? '', 220, 'A private website concept assembled from verified business evidence.');
  if (normalize(config.hero?.headline ?? '') !== normalize(expectedHeadline)) {
    issues.push({ code: 'HEADLINE_PROVENANCE_MISMATCH', field: 'hero.headline', severity: 'BLOCKING', message: 'Rendered headline no longer matches the evidence-linked content run used by the build.', evidenceIds: content.headline?.inputEvidenceIds ?? [] });
  }
  if (normalize(config.hero?.subhead ?? '') !== normalize(expectedSubhead)) {
    issues.push({ code: 'SUBHEAD_PROVENANCE_MISMATCH', field: 'hero.subhead', severity: 'BLOCKING', message: 'Rendered subhead no longer matches the evidence-linked content run used by the build.', evidenceIds: content.about?.inputEvidenceIds ?? [] });
  }

  const expected = expectedCta(config);
  const visibleCta = config.hero?.primaryCtaLabel ?? config.contact?.ctaLabel ?? '';
  if (normalize(visibleCta) !== normalize(expected.label)) {
    issues.push({
      code: 'WRONG_CTA',
      field: 'hero.primaryCtaLabel',
      severity: 'BLOCKING',
      message: `Rendered CTA does not match the verified ${expected.channel} contact mode.`,
      evidenceIds: [],
    });
  }

  const latestResearch = await db.prepare(`
    SELECT conflicts_json FROM research_runs
    WHERE prospect_id = ? AND user_id = ? AND status = 'COMPLETED'
    ORDER BY completed_at DESC, created_at DESC LIMIT 1
  `).bind(prospect.id, userId).first<{ conflicts_json: string }>();
  const conflicts = latestResearch ? parseJson<unknown[]>(latestResearch.conflicts_json, []) : [];
  if (conflicts.length > 0) {
    issues.push({
      code: 'UNRESOLVED_RESEARCH_CONFLICT',
      field: null,
      severity: 'REVIEW',
      message: 'Latest research run contains unresolved conflicts and requires human review before sales QA.',
      evidenceIds: [],
    });
  }

  const blocking = issues.some((issue) => issue.severity === 'BLOCKING');
  const review = !blocking && issues.some((issue) => issue.severity === 'REVIEW');
  const status: FactQaResult['status'] = blocking ? 'FAIL' : review ? 'REVIEW' : 'PASS';
  const nextState: FactQaResult['nextState'] = blocking ? 'QA_FAILED' : review ? 'FACT_QA_PENDING' : 'SALES_QA_PENDING';
  if (nextState !== 'FACT_QA_PENDING') assertProspectTransition('FACT_QA_PENDING', nextState);
  const nowIso = now.toISOString();
  const checks = {
    engineVersion: FACT_QA_ENGINE_VERSION,
    directChecks,
    contentEvidenceIds: [...contentEvidenceIds],
    generatedHeadlineMatches: normalize(config.hero?.headline ?? '') === normalize(expectedHeadline),
    generatedSubheadMatches: normalize(config.hero?.subhead ?? '') === normalize(expectedSubhead),
    ctaChannel: expected.channel,
    ctaMatches: normalize(visibleCta) === normalize(expected.label),
    latestResearchConflictCount: conflicts.length,
    staleAfterDays: FACT_EVIDENCE_MAX_AGE_DAYS,
    blockingIssueCount: issues.filter((item) => item.severity === 'BLOCKING').length,
    reviewIssueCount: issues.filter((item) => item.severity === 'REVIEW').length,
  };
  const created = await createQaRun(db, demo.id, 'FACT_PHASE19', status, issues, checks, FACT_QA_ENGINE_VERSION, nowIso);

  const statements = [
    db.prepare(`
      UPDATE demos SET fact_qa_status = ?, sales_qa_status = ?, last_qa_at = ?, updated_at = ?
      WHERE id = ? AND prospect_id IN (
        SELECT prospect.id FROM prospects prospect JOIN campaigns campaign ON campaign.id = prospect.campaign_id
        WHERE campaign.user_id = ?
      )
    `).bind(
      status,
      status === 'PASS' ? 'PENDING_PHASE19' : status === 'FAIL' ? 'BLOCKED_BY_FACT_QA' : 'WAITING_FACT_REVIEW',
      nowIso,
      nowIso,
      demo.id,
      userId,
    ),
  ];
  if (nextState !== 'FACT_QA_PENDING') {
    statements.push(db.prepare(`
      UPDATE prospects SET current_state = ?, updated_at = ?
      WHERE id = ? AND current_state = 'FACT_QA_PENDING'
        AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)
    `).bind(nextState, nowIso, prospect.id, userId));
  }
  const writes = await db.batch(statements);
  if (writes.some((write) => write.success !== true)) throw new Error('Fact QA persistence batch failed.');

  const committed = await new ProspectRepository(db).getByIdForUser(prospect.id, userId);
  const storedDemo = await new DemoRepository(db).getByIdForUser(demo.id, userId);
  if (!committed || !storedDemo || committed.currentState !== nextState || storedDemo.factQaStatus !== status) {
    throw new Error('Fact QA persisted invariants failed.');
  }

  return { runId: created.runId, demoId: demo.id, status, issues: created.issues, checks, nextState };
}

export async function getPhase19ReviewQueue(db: D1DatabaseLike, userId: string) {
  const rows = await db.prepare(`
    SELECT issue.id, issue.qa_run_id, issue.demo_id, issue.qa_type, issue.code, issue.field,
      issue.severity, issue.message, issue.evidence_ids_json, issue.status, issue.created_at,
      issue.resolved_at, issue.resolved_by_user_id, issue.resolution_note
    FROM demo_qa_issues issue
    JOIN demos demo ON demo.id = issue.demo_id
    JOIN prospects prospect ON prospect.id = demo.prospect_id
    JOIN campaigns campaign ON campaign.id = prospect.campaign_id
    WHERE campaign.user_id = ? AND issue.status = 'OPEN'
    ORDER BY CASE issue.severity WHEN 'BLOCKING' THEN 0 ELSE 1 END, issue.created_at ASC
    LIMIT 200
  `).bind(userId).all<IssueRow>();
  return rows.results.map(parseIssue);
}

export async function getPhase19EvidenceInspection(db: D1DatabaseLike, userId: string, demoId: string) {
  const { demo, prospect } = await ownedDemoContext(db, userId, demoId);
  const [facts, evidence, factRun] = await Promise.all([
    new ProspectFactRepository(db).listForProspect(prospect.id),
    new EvidenceRepository(db).listForProspect(prospect.id),
    latestFactQaRun(db, demo.id),
  ]);
  return {
    demo: { id: demo.id, prospectId: demo.prospectId, factQaStatus: demo.factQaStatus, salesQaStatus: demo.salesQaStatus },
    prospect: { id: prospect.id, canonicalName: prospect.canonicalName, currentState: prospect.currentState },
    facts,
    evidence,
    factQa: factRun ? {
      id: factRun.id,
      status: factRun.status,
      checks: parseJson<Record<string, unknown>>(factRun.checks_json, {}),
      issues: await listIssuesForRun(db, factRun.id),
    } : null,
  };
}

export async function resolvePhase19Issue(
  db: D1DatabaseLike,
  userId: string,
  issueId: string,
  resolution: { action: 'RESOLVED' | 'WAIVED'; note: string },
  now = new Date().toISOString(),
): Promise<QaIssue> {
  if (!resolution.note.trim()) throw new Error('Issue resolution note is required.');
  const row = await db.prepare(`
    UPDATE demo_qa_issues
    SET status = ?, resolved_at = ?, resolved_by_user_id = ?, resolution_note = ?
    WHERE id = ? AND status = 'OPEN' AND demo_id IN (
      SELECT demo.id FROM demos demo
      JOIN prospects prospect ON prospect.id = demo.prospect_id
      JOIN campaigns campaign ON campaign.id = prospect.campaign_id
      WHERE campaign.user_id = ?
    )
    RETURNING id, qa_run_id, demo_id, qa_type, code, field, severity, message,
      evidence_ids_json, status, created_at, resolved_at, resolved_by_user_id, resolution_note
  `).bind(resolution.action, now, userId, resolution.note.trim(), issueId, userId).first<IssueRow>();
  if (!row) throw new Error('Open QA issue not found for this operator.');
  return parseIssue(row);
}

export async function submitSalesQa(
  db: D1DatabaseLike,
  userId: string,
  demoId: string,
  rawDecision: unknown,
  now = new Date().toISOString(),
): Promise<SalesQaResult> {
  const input = salesDecisionSchema.parse(rawDecision);
  const { demo, prospect } = await ownedDemoContext(db, userId, demoId);
  if (prospect.currentState !== 'SALES_QA_PENDING') {
    throw new Error(`Sales QA requires SALES_QA_PENDING state; found ${prospect.currentState}.`);
  }
  if (demo.visualQaStatus !== 'PASS' || demo.factQaStatus !== 'PASS') {
    throw new Error('Sales QA requires visual and fact QA PASS.');
  }
  const openIssues = await db.prepare(`
    SELECT COUNT(*) AS count FROM demo_qa_issues WHERE demo_id = ? AND status = 'OPEN'
  `).bind(demo.id).first<{ count: number }>();
  if (Number(openIssues?.count ?? 0) > 0) throw new Error('Sales QA cannot complete while open QA issues remain.');

  const checklistComplete = Object.values(input.checklist).every(Boolean);
  if (input.decision === 'APPROVED' && !checklistComplete) {
    throw new Error('Sales QA approval requires every human checklist item to be confirmed.');
  }

  const decision = input.decision;
  const nextState: SalesQaResult['nextState'] = decision === 'APPROVED' ? 'DEMO_READY' : 'QA_FAILED';
  assertProspectTransition('SALES_QA_PENDING', nextState);
  const runId = `qa19_sales_${randomToken(12)}`;
  const approvalId = `sales_approval_${randomToken(12)}`;
  const issueDrafts: IssueDraft[] = decision === 'REJECTED'
    ? [{ code: 'SALES_QA_REJECTED', field: null, severity: 'BLOCKING', message: 'Human sales QA rejected this demo.', evidenceIds: [] }]
    : [];
  const checks = { engineVersion: SALES_QA_ENGINE_VERSION, checklist: input.checklist, checklistComplete, humanDecision: decision };

  await db.prepare(`
    INSERT INTO demo_qa_runs(
      id, demo_id, qa_type, status, issues_json, screenshot_asset_ids_json,
      started_at, completed_at, runner_job_id, engine_version, checks_json, viewport_results_json
    ) VALUES (?, ?, 'SALES_PHASE19', ?, ?, '[]', ?, ?, NULL, ?, ?, '{}')
  `).bind(
    runId,
    demo.id,
    decision === 'APPROVED' ? 'PASS' : 'FAIL',
    JSON.stringify(issueDrafts),
    now,
    now,
    SALES_QA_ENGINE_VERSION,
    JSON.stringify(checks),
  ).run();
  for (const issue of issueDrafts) {
    await db.prepare(`
      INSERT INTO demo_qa_issues(
        id, qa_run_id, demo_id, qa_type, code, field, severity, message,
        evidence_ids_json, status, created_at
      ) VALUES (?, ?, ?, 'SALES_PHASE19', ?, ?, ?, ?, ?, 'OPEN', ?)
    `).bind(`qa_issue_${randomToken(12)}`, runId, demo.id, issue.code, issue.field, issue.severity, issue.message, JSON.stringify(issue.evidenceIds), now).run();
  }

  const writes = await db.batch([
    db.prepare(`
      INSERT INTO demo_sales_approvals(id, demo_id, qa_run_id, user_id, decision, checklist_json, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(approvalId, demo.id, runId, userId, decision, JSON.stringify(input.checklist), input.note ?? null, now),
    db.prepare(`
      UPDATE demos SET status = ?, sales_qa_status = ?, last_qa_at = ?, updated_at = ?
      WHERE id = ? AND prospect_id IN (
        SELECT prospect.id FROM prospects prospect JOIN campaigns campaign ON campaign.id = prospect.campaign_id
        WHERE campaign.user_id = ?
      )
    `).bind(decision === 'APPROVED' ? 'READY' : 'RENDERED', decision === 'APPROVED' ? 'PASS' : 'FAIL', now, now, demo.id, userId),
    db.prepare(`
      UPDATE prospects SET current_state = ?, updated_at = ?
      WHERE id = ? AND current_state = 'SALES_QA_PENDING'
        AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)
    `).bind(nextState, now, prospect.id, userId),
  ]);
  if (writes.some((write) => write.success !== true)) throw new Error('Sales QA persistence batch failed.');

  const [storedDemo, storedProspect] = await Promise.all([
    new DemoRepository(db).getByIdForUser(demo.id, userId),
    new ProspectRepository(db).getByIdForUser(prospect.id, userId),
  ]);
  const expectedDemoStatus = decision === 'APPROVED' ? 'READY' : 'RENDERED';
  if (!storedDemo || !storedProspect || storedDemo.status !== expectedDemoStatus || storedDemo.salesQaStatus !== (decision === 'APPROVED' ? 'PASS' : 'FAIL') || storedProspect.currentState !== nextState) {
    throw new Error('Sales QA persisted invariants failed.');
  }
  return { runId, demoId: demo.id, decision, nextState, demoStatus: expectedDemoStatus };
}
