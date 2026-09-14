import {
  CampaignRepository,
  EvidenceRepository,
  LocalRunnerRepository,
  ProspectFactRepository,
  ProspectRepository,
  RunnerJobRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
  type LocalRunnerRecord,
} from '@shalcon/db';
import { Hono } from 'hono';

import { runAssetSelection } from './asset-engine';
import { runAutomatedDemoBuild } from './automated-demo-builder';
import { runAutomaticBrandTemplateMatch } from './brand-template';
import { runContentGeneration } from './content-engine';
import {
  getPhase19EvidenceInspection,
  getPhase19ReviewQueue,
  resolvePhase19Issue,
  runFactQa,
  submitSalesQa,
} from './fact-sales-qa';
import {
  VISUAL_QA_JOB_TYPE,
  completeVisualQa,
  enqueueVisualQa,
  type VisualQaRunnerResult,
} from './visual-qa';

interface Env { DB: D1DatabaseLike }

interface MutableDemoConfig {
  business?: Record<string, unknown>;
  hero?: Record<string, unknown>;
  [key: string]: unknown;
}

const app = new Hono<{ Bindings: Env }>();
app.get('/healthz', (c) => c.json({ ok: true }));

const USER_ID = 'usr_phase19';
const OTHER_USER_ID = 'usr_phase19_other';
const RUNNER_ID = 'runner_phase19';
const PREVIEW_SECRET = 'phase19-preview-secret-for-d1-acceptance';
const BASE = Date.parse('2026-09-14T05:00:00.000Z');

function iso(offsetSeconds: number): string {
  return new Date(BASE + offsetSeconds * 1000).toISOString();
}

function runner(): LocalRunnerRecord {
  return {
    id: RUNNER_ID,
    userId: USER_ID,
    name: RUNNER_ID,
    tokenHash: 'phase19-runner-token-hash',
    version: '0.1.0',
    capabilitiesJson: JSON.stringify([VISUAL_QA_JOB_TYPE]),
    status: 'ACTIVE',
    lastHeartbeatAt: null,
    createdAt: iso(0),
    updatedAt: iso(0),
    revokedAt: null,
  };
}

async function createProspect(db: D1DatabaseLike, campaignId: string, id: string, offset: number) {
  const at = iso(offset);
  await new ProspectRepository(db).create({
    id,
    campaignId,
    canonicalName: `${id.replaceAll('_', ' ')} Salon`,
    normalizedName: id,
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE19_TEST',
    currentState: 'DEMO_QUALIFIED',
    domain: `${id}.example.com`,
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: at,
    updatedAt: at,
  });
  await new SourceRecordRepository(db).create({
    id: `src_${id}`,
    prospectId: id,
    provider: 'PHASE19_FIXTURE',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: `https://${id}.example.com/`,
    rawJson: '{}',
    capturedAt: at,
  });
}

async function addVerifiedFact(
  db: D1DatabaseLike,
  prospectId: string,
  field: string,
  value: string,
  capturedAt: string,
  tag = 'base',
) {
  const key = field.replace(/[^a-z0-9]/giu, '_').toLowerCase();
  const evidenceId = `ev_${prospectId}_${key}_${tag}`;
  await new EvidenceRepository(db).create({
    id: evidenceId,
    prospectId,
    field,
    value,
    sourceRecordId: `src_${prospectId}`,
    sourceUrl: `https://${prospectId}.example.com/`,
    sourceQuality: 1,
    confidence: 0.97,
    verificationStatus: 'VERIFIED',
    excerpt: value,
    capturedAt,
  });
  await new ProspectFactRepository(db).upsert({
    id: `fact_${prospectId}_${key}`,
    prospectId,
    field,
    value,
    verificationStatus: 'VERIFIED',
    confidence: 0.97,
    evidenceId,
    createdAt: capturedAt,
    updatedAt: capturedAt,
  });
  return evidenceId;
}

async function buildRenderedDemo(
  db: D1DatabaseLike,
  campaignId: string,
  prospectId: string,
  offset: number,
  staleCity = false,
) {
  await createProspect(db, campaignId, prospectId, offset);
  await addVerifiedFact(db, prospectId, 'category', 'Premium Salon', iso(offset + 1));
  await addVerifiedFact(
    db,
    prospectId,
    'city',
    'Mumbai',
    staleCity ? '2026-01-01T00:00:00.000Z' : iso(offset + 2),
  );
  await addVerifiedFact(
    db,
    prospectId,
    'business_description',
    'A salon offering verified hair and beauty services.',
    iso(offset + 3),
  );
  await addVerifiedFact(db, prospectId, 'service', 'Haircut', iso(offset + 4));
  await addVerifiedFact(db, prospectId, 'whatsapp', '+91 98765 43210', iso(offset + 5));

  await runAutomaticBrandTemplateMatch(db, USER_ID, prospectId, iso(offset + 6));
  await runContentGeneration(db, USER_ID, prospectId, iso(offset + 7));
  await db.prepare(`
    INSERT INTO assets(
      id, prospect_id, asset_type, source_type, source_url, storage_ref,
      usage_classification, mime_type, width, height, created_at,
      source_captured_at, association_assumption, watermark_status, asset_status, optimization_json
    ) VALUES (?, ?, 'LOGO', 'OFFICIAL_WEBSITE', ?, ?, 'PROSPECT_OFFICIAL', 'image/png',
      1024, 512, ?, ?, 'OFFICIAL_PROSPECT_SOURCE', 'CLEAR', 'ACTIVE', '{}')
  `).bind(
    `asset_${prospectId}_official_logo`,
    prospectId,
    `https://${prospectId}.example.com/logo.png`,
    `fixture://phase19/${prospectId}/official-logo`,
    iso(offset + 8),
    iso(offset + 8),
  ).run();
  await runAssetSelection(db, USER_ID, prospectId, iso(offset + 9));
  return runAutomatedDemoBuild(
    db,
    USER_ID,
    prospectId,
    PREVIEW_SECRET,
    new Date(iso(offset + 10)),
  );
}

function viewport(width: number, height: number) {
  return {
    viewportWidth: width,
    viewportHeight: height,
    documentWidth: width,
    documentHeight: 2200,
    horizontalOverflow: false,
    brokenImageCount: 0,
    consoleErrors: [] as string[],
    pageErrors: [] as string[],
    ctaPresent: true,
    placeholderCount: 0,
    disclosurePresent: true,
    noindexPresent: true,
  };
}

function visualPassResult(demoId: string, segment: string): VisualQaRunnerResult {
  const kinds = [
    ['DESKTOP_FULL', 1440, 2200],
    ['DESKTOP_HERO', 1440, 900],
    ['MOBILE_FULL', 390, 2200],
    ['MOBILE_HERO', 390, 844],
  ] as const;
  return {
    schemaVersion: 'visual-qa.v1',
    demoId,
    desktop: viewport(1440, 900),
    mobile: viewport(390, 844),
    screenshots: kinds.map(([kind, width, height], index) => ({
      kind,
      storageRef: `runner-artifact://visual-qa/${segment}/${kind.toLowerCase()}.png`,
      mimeType: 'image/png' as const,
      width,
      height,
      sha256: (index + 1).toString(16).repeat(64).slice(0, 64),
    })),
  };
}

async function passVisualQa(
  db: D1DatabaseLike,
  runnerId: string,
  demoId: string,
  offset: number,
  segment: string,
) {
  const queued = await enqueueVisualQa(db, USER_ID, demoId, iso(offset));
  const claimed = await new RunnerJobRepository(db).claimNextForUser(
    USER_ID,
    runnerId,
    iso(offset + 120),
    iso(offset + 1),
    [VISUAL_QA_JOB_TYPE],
  );
  if (!claimed || claimed.job.id !== queued.job.id) throw new Error('Phase 19 fixture failed to claim visual QA job.');
  const completed = await completeVisualQa(
    db,
    USER_ID,
    runnerId,
    claimed.job.id,
    visualPassResult(demoId, segment),
    iso(offset + 2),
  );
  if (!completed.passed || completed.nextState !== 'FACT_QA_PENDING') {
    throw new Error('Phase 19 fixture failed to pass visual QA.');
  }
}

async function mutateDemoConfig(
  db: D1DatabaseLike,
  demoId: string,
  mutate: (config: MutableDemoConfig) => void,
) {
  const row = await db.prepare('SELECT config_json FROM demos WHERE id = ?').bind(demoId).first<{ config_json: string }>();
  if (!row) throw new Error('Demo config missing.');
  const config = JSON.parse(row.config_json) as MutableDemoConfig;
  mutate(config);
  await db.prepare('UPDATE demos SET config_json = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(config), iso(900), demoId).run();
}

const completeChecklist = {
  previewReviewed: true,
  factsReviewed: true,
  ctaReviewed: true,
  screenshotsReviewed: true,
  disclosureReviewed: true,
};

app.get('/phase19', async (c) => {
  const db = c.env.DB;
  await new UserRepository(db).create({ id: USER_ID, email: 'phase19@example.com', name: 'Phase 19', createdAt: iso(0) });
  await new UserRepository(db).create({ id: OTHER_USER_ID, email: 'phase19-other@example.com', name: 'Phase 19 Other', createdAt: iso(0) });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(USER_ID, iso(0));
  const registeredRunner = await new LocalRunnerRepository(db).registerOrRotate(runner());

  const clean = await buildRenderedDemo(db, campaign.id, 'p19_clean', 10);
  await passVisualQa(db, registeredRunner.id, clean.demo.id, 25, 'phase19-clean');
  const cleanFact = await runFactQa(db, USER_ID, clean.demo.id, new Date(iso(30)));
  let incompleteApprovalBlocked = false;
  try {
    await submitSalesQa(db, USER_ID, clean.demo.id, {
      decision: 'APPROVED',
      checklist: { ...completeChecklist, screenshotsReviewed: false },
      note: 'Should be blocked.',
    }, iso(31));
  } catch {
    incompleteApprovalBlocked = true;
  }
  const cleanSales = await submitSalesQa(db, USER_ID, clean.demo.id, {
    decision: 'APPROVED',
    checklist: completeChecklist,
    note: 'Human reviewed and approved the concept.',
  }, iso(32));

  const unsupported = await buildRenderedDemo(db, campaign.id, 'p19_unsupported', 100);
  await passVisualQa(db, registeredRunner.id, unsupported.demo.id, 115, 'phase19-unsupported');
  await mutateDemoConfig(db, unsupported.demo.id, (config) => {
    config.business = { ...(config.business ?? {}), city: 'Delhi' };
  });
  const unsupportedFact = await runFactQa(db, USER_ID, unsupported.demo.id, new Date(iso(120)));

  const wrongCta = await buildRenderedDemo(db, campaign.id, 'p19_wrong_cta', 200);
  await passVisualQa(db, registeredRunner.id, wrongCta.demo.id, 215, 'phase19-wrong-cta');
  await mutateDemoConfig(db, wrongCta.demo.id, (config) => {
    config.hero = { ...(config.hero ?? {}), primaryCtaLabel: 'Book now' };
  });
  const wrongCtaFact = await runFactQa(db, USER_ID, wrongCta.demo.id, new Date(iso(220)));

  const stale = await buildRenderedDemo(db, campaign.id, 'p19_stale', 300, true);
  await passVisualQa(db, registeredRunner.id, stale.demo.id, 315, 'phase19-stale');
  const staleFirst = await runFactQa(db, USER_ID, stale.demo.id, new Date(iso(320)));
  const staleIssue = staleFirst.issues.find((issue) => issue.code === 'STALE_EVIDENCE_REVIEW');
  if (!staleIssue) throw new Error('Expected stale-evidence review issue.');
  const resolvedStale = await resolvePhase19Issue(
    db,
    USER_ID,
    staleIssue.id,
    { action: 'RESOLVED', note: 'Refreshed the city evidence from the same official source.' },
    iso(321),
  );
  await addVerifiedFact(db, 'p19_stale', 'city', 'Mumbai', iso(322), 'refresh');
  const staleSecond = await runFactQa(db, USER_ID, stale.demo.id, new Date(iso(323)));

  const conflict = await buildRenderedDemo(db, campaign.id, 'p19_conflict', 400);
  await passVisualQa(db, registeredRunner.id, conflict.demo.id, 415, 'phase19-conflict');
  await db.prepare(`
    INSERT INTO research_runs(
      id, prospect_id, user_id, status, selected_sources_json, conflicts_json, model,
      started_at, completed_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'COMPLETED', '[]', ?, 'phase19-fixture', ?, ?, ?, ?)
  `).bind(
    'research_p19_conflict',
    'p19_conflict',
    USER_ID,
    JSON.stringify([{ field: 'phone', reason: 'conflicting verified sources' }]),
    iso(418), iso(419), iso(418), iso(419),
  ).run();
  const conflictFact = await runFactQa(db, USER_ID, conflict.demo.id, new Date(iso(420)));

  const rejected = await buildRenderedDemo(db, campaign.id, 'p19_rejected', 500);
  await passVisualQa(db, registeredRunner.id, rejected.demo.id, 515, 'phase19-rejected');
  const rejectedFact = await runFactQa(db, USER_ID, rejected.demo.id, new Date(iso(520)));
  const rejectedSales = await submitSalesQa(db, USER_ID, rejected.demo.id, {
    decision: 'REJECTED',
    checklist: completeChecklist,
    note: 'Human sales review intentionally rejected this fixture.',
  }, iso(521));

  let crossTenantBlocked = false;
  try {
    await getPhase19EvidenceInspection(db, OTHER_USER_ID, clean.demo.id);
  } catch {
    crossTenantBlocked = true;
  }

  const reviewQueue = await getPhase19ReviewQueue(db, USER_ID);
  const cleanStored = await db.prepare('SELECT status, fact_qa_status, visual_qa_status, sales_qa_status FROM demos WHERE id = ?')
    .bind(clean.demo.id).first<{ status: string; fact_qa_status: string; visual_qa_status: string; sales_qa_status: string }>();
  const cleanProspect = await db.prepare('SELECT current_state FROM prospects WHERE id = ?').bind('p19_clean').first<{ current_state: string }>();
  const staleProspect = await db.prepare('SELECT current_state FROM prospects WHERE id = ?').bind('p19_stale').first<{ current_state: string }>();
  const rejectedProspect = await db.prepare('SELECT current_state FROM prospects WHERE id = ?').bind('p19_rejected').first<{ current_state: string }>();
  const approvals = await db.prepare('SELECT COUNT(*) AS count FROM demo_sales_approvals').first<{ count: number }>();
  const migrations = await db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>();
  const foreignKeys = await db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>();

  const checks = {
    migrationApplied: Number(migrations?.count ?? 0) >= 15,
    cleanFactQaPasses:
      cleanFact.status === 'PASS' &&
      cleanFact.nextState === 'SALES_QA_PENDING',
    incompleteApprovalBlocked,
    explicitHumanApprovalRequired:
      cleanSales.decision === 'APPROVED' &&
      cleanSales.nextState === 'DEMO_READY' &&
      cleanSales.demoStatus === 'READY' &&
      cleanStored?.status === 'READY' &&
      cleanStored.visual_qa_status === 'PASS' &&
      cleanStored.fact_qa_status === 'PASS' &&
      cleanStored.sales_qa_status === 'PASS' &&
      cleanProspect?.current_state === 'DEMO_READY',
    unsupportedFactFailsClosed:
      unsupportedFact.status === 'FAIL' &&
      unsupportedFact.nextState === 'QA_FAILED' &&
      unsupportedFact.issues.some((issue) => issue.code === 'UNSUPPORTED_VISIBLE_FACT'),
    wrongCtaFailsClosed:
      wrongCtaFact.status === 'FAIL' &&
      wrongCtaFact.nextState === 'QA_FAILED' &&
      wrongCtaFact.issues.some((issue) => issue.code === 'WRONG_CTA'),
    staleEvidenceRequiresReview:
      staleFirst.status === 'REVIEW' &&
      staleFirst.nextState === 'FACT_QA_PENDING' &&
      resolvedStale.status === 'RESOLVED',
    staleEvidenceCanBeRemediated:
      staleSecond.status === 'PASS' &&
      staleSecond.nextState === 'SALES_QA_PENDING' &&
      staleProspect?.current_state === 'SALES_QA_PENDING',
    unresolvedResearchConflictRequiresReview:
      conflictFact.status === 'REVIEW' &&
      conflictFact.nextState === 'FACT_QA_PENDING' &&
      conflictFact.issues.some((issue) => issue.code === 'UNRESOLVED_RESEARCH_CONFLICT'),
    humanSalesRejectionFailsClosed:
      rejectedFact.status === 'PASS' &&
      rejectedSales.decision === 'REJECTED' &&
      rejectedSales.nextState === 'QA_FAILED' &&
      rejectedSales.demoStatus === 'RENDERED' &&
      rejectedProspect?.current_state === 'QA_FAILED',
    reviewQueueSurfacesOpenIssues:
      reviewQueue.some((issue) => issue.demoId === conflict.demo.id && issue.code === 'UNRESOLVED_RESEARCH_CONFLICT') &&
      reviewQueue.some((issue) => issue.demoId === rejected.demo.id && issue.code === 'SALES_QA_REJECTED'),
    salesApprovalHistoryStored: Number(approvals?.count ?? 0) === 2,
    crossTenantBlocked,
    foreignKeyViolations: foreignKeys.results.length,
  };

  return c.json({
    ok: Object.values(checks).every((value) => value === true || value === 0),
    checks,
  });
});

export default app;
