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
  VISUAL_QA_JOB_TYPE,
  completeVisualQa,
  enqueueVisualQa,
  getVisualQaHistory,
  getVisualQaRunnerInput,
  type VisualQaRunnerResult,
} from './visual-qa';

interface Env { DB: D1DatabaseLike }
const app = new Hono<{ Bindings: Env }>();
app.get('/healthz', (c) => c.json({ ok: true }));

const USER_ID = 'usr_phase18';
const OTHER_USER_ID = 'usr_phase18_other';
const RUNNER_ID = 'runner_phase18';
const SECOND_RUNNER_ID = 'runner_phase18_second';
const PREVIEW_SECRET = 'phase18-preview-secret-for-d1-acceptance';

function iso(offsetSeconds: number): string {
  return new Date(Date.parse('2026-09-14T04:00:00.000Z') + offsetSeconds * 1000).toISOString();
}

function runner(id: string, userId: string): LocalRunnerRecord {
  return {
    id,
    userId,
    name: id,
    tokenHash: `${id}-token-hash`,
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
    canonicalName: id === 'p18_good' ? 'Phase Eighteen Salon' : 'Broken Visual Salon',
    normalizedName: id,
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE18_TEST',
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
    provider: 'PHASE18_FIXTURE',
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
  offset: number,
) {
  const at = iso(offset);
  const key = field.replace(/[^a-z0-9]/giu, '_').toLowerCase();
  const evidenceId = `ev_${prospectId}_${key}`;
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
    capturedAt: at,
  });
  await new ProspectFactRepository(db).upsert({
    id: `fact_${prospectId}_${key}`,
    prospectId,
    field,
    value,
    verificationStatus: 'VERIFIED',
    confidence: 0.97,
    evidenceId,
    createdAt: at,
    updatedAt: at,
  });
}

async function buildRenderedDemo(
  db: D1DatabaseLike,
  userId: string,
  campaignId: string,
  prospectId: string,
  offset: number,
) {
  await createProspect(db, campaignId, prospectId, offset);
  await addVerifiedFact(db, prospectId, 'category', 'Premium Salon', offset + 1);
  await addVerifiedFact(db, prospectId, 'city', 'Mumbai', offset + 2);
  await addVerifiedFact(
    db,
    prospectId,
    'business_description',
    'A salon offering verified hair and beauty services.',
    offset + 3,
  );
  await addVerifiedFact(db, prospectId, 'service', 'Haircut', offset + 4);
  await addVerifiedFact(db, prospectId, 'whatsapp', '+91 98765 43210', offset + 5);
  await runAutomaticBrandTemplateMatch(db, userId, prospectId, iso(offset + 6));
  await runContentGeneration(db, userId, prospectId, iso(offset + 7));
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
    `fixture://phase18/${prospectId}/official-logo`,
    iso(offset + 8),
    iso(offset + 8),
  ).run();
  await runAssetSelection(db, userId, prospectId, iso(offset + 9));
  return runAutomatedDemoBuild(
    db,
    userId,
    prospectId,
    PREVIEW_SECRET,
    new Date(iso(offset + 10)),
  );
}

function viewport(horizontalOverflow = false) {
  return {
    viewportWidth: 1440,
    viewportHeight: 900,
    documentWidth: horizontalOverflow ? 1600 : 1440,
    documentHeight: 2400,
    horizontalOverflow,
    brokenImageCount: 0,
    consoleErrors: [] as string[],
    pageErrors: [] as string[],
    ctaPresent: true,
    placeholderCount: 0,
    disclosurePresent: true,
    noindexPresent: true,
  };
}

function qaResult(demoId: string, segment: string, broken = false): VisualQaRunnerResult {
  const shots = [
    ['DESKTOP_FULL', 1440, 2400],
    ['DESKTOP_HERO', 1440, 900],
    ['MOBILE_FULL', 390, 2400],
    ['MOBILE_HERO', 390, 844],
  ] as const;
  return {
    schemaVersion: 'visual-qa.v1',
    demoId,
    desktop: viewport(false),
    mobile: {
      ...viewport(broken),
      viewportWidth: 390,
      viewportHeight: 844,
      documentWidth: broken ? 520 : 390,
    },
    screenshots: shots.map(([kind, width, height], index) => ({
      kind,
      storageRef: `runner-artifact://visual-qa/${segment}/${kind.toLowerCase()}.png`,
      mimeType: 'image/png' as const,
      width,
      height,
      sha256: String(index + (broken ? 5 : 1)).repeat(64).slice(0, 64),
    })),
  };
}

app.get('/phase18', async (c) => {
  const db = c.env.DB;
  await new UserRepository(db).create({
    id: USER_ID,
    email: 'phase18@example.com',
    name: 'Phase 18',
    createdAt: iso(0),
  });
  await new UserRepository(db).create({
    id: OTHER_USER_ID,
    email: 'phase18-other@example.com',
    name: 'Phase 18 Other',
    createdAt: iso(0),
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(USER_ID, iso(0));
  const goodBuild = await buildRenderedDemo(db, USER_ID, campaign.id, 'p18_good', 1);
  const badBuild = await buildRenderedDemo(db, USER_ID, campaign.id, 'p18_bad', 30);

  const runnerRepo = new LocalRunnerRepository(db);
  const primaryRunner = await runnerRepo.registerOrRotate(runner(RUNNER_ID, USER_ID));
  const secondRunner = await runnerRepo.registerOrRotate(runner(SECOND_RUNNER_ID, USER_ID));
  const jobs = new RunnerJobRepository(db);

  const goodEnqueue = await enqueueVisualQa(db, USER_ID, goodBuild.demo.id, iso(20));
  const goodEnqueueAgain = await enqueueVisualQa(db, USER_ID, goodBuild.demo.id, iso(21));
  const goodClaim = await jobs.claimNextForUser(
    USER_ID,
    primaryRunner.id,
    iso(200),
    iso(22),
    [VISUAL_QA_JOB_TYPE],
  );

  let wrongRunnerBlocked = false;
  if (goodClaim) {
    try {
      await getVisualQaRunnerInput(db, USER_ID, secondRunner.id, goodClaim.job.id, iso(23));
    } catch {
      wrongRunnerBlocked = true;
    }
  }

  const goodInput = goodClaim
    ? await getVisualQaRunnerInput(db, USER_ID, primaryRunner.id, goodClaim.job.id, iso(23))
    : null;
  const goodCompletion = goodClaim
    ? await completeVisualQa(
        db,
        USER_ID,
        primaryRunner.id,
        goodClaim.job.id,
        qaResult(goodBuild.demo.id, 'phase18-good'),
        iso(24),
      )
    : null;
  const goodHistory = await getVisualQaHistory(db, USER_ID, goodBuild.demo.id);

  const badEnqueue = await enqueueVisualQa(db, USER_ID, badBuild.demo.id, iso(50));
  const badClaim = await jobs.claimNextForUser(
    USER_ID,
    primaryRunner.id,
    iso(250),
    iso(51),
    [VISUAL_QA_JOB_TYPE],
  );
  const badInput = badClaim
    ? await getVisualQaRunnerInput(db, USER_ID, primaryRunner.id, badClaim.job.id, iso(52))
    : null;
  const badCompletion = badClaim
    ? await completeVisualQa(
        db,
        USER_ID,
        primaryRunner.id,
        badClaim.job.id,
        qaResult(badBuild.demo.id, 'phase18-bad', true),
        iso(53),
      )
    : null;

  let crossTenantBlocked = false;
  try {
    await getVisualQaHistory(db, OTHER_USER_ID, goodBuild.demo.id);
  } catch {
    crossTenantBlocked = true;
  }

  const [
    goodState,
    badState,
    goodDemo,
    badDemo,
    screenshotCount,
    goodTransitions,
    badTransitions,
    migrations,
    foreignKeys,
  ] = await Promise.all([
    db.prepare('SELECT current_state FROM prospects WHERE id = ?').bind('p18_good').first<{ current_state: string }>(),
    db.prepare('SELECT current_state FROM prospects WHERE id = ?').bind('p18_bad').first<{ current_state: string }>(),
    db.prepare('SELECT visual_qa_status, fact_qa_status FROM demos WHERE id = ?')
      .bind(goodBuild.demo.id).first<{ visual_qa_status: string; fact_qa_status: string }>(),
    db.prepare('SELECT visual_qa_status, fact_qa_status FROM demos WHERE id = ?')
      .bind(badBuild.demo.id).first<{ visual_qa_status: string; fact_qa_status: string }>(),
    db.prepare('SELECT COUNT(*) AS count FROM visual_qa_screenshots').first<{ count: number }>(),
    db.prepare('SELECT from_state, to_state FROM prospect_state_events WHERE prospect_id = ? ORDER BY id')
      .bind('p18_good').all<{ from_state: string; to_state: string }>(),
    db.prepare('SELECT from_state, to_state FROM prospect_state_events WHERE prospect_id = ? ORDER BY id')
      .bind('p18_bad').all<{ from_state: string; to_state: string }>(),
    db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>(),
    db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>(),
  ]);

  const goodPairs = goodTransitions.results.map((item) => `${item.from_state}->${item.to_state}`);
  const badPairs = badTransitions.results.map((item) => `${item.from_state}->${item.to_state}`);
  const checks = {
    migrationApplied: Number(migrations?.count ?? 0) >= 14,
    idempotentEnqueue:
      goodEnqueue.created === true &&
      goodEnqueueAgain.created === false &&
      goodEnqueue.job.id === goodEnqueueAgain.job.id &&
      goodEnqueue.run.id === goodEnqueueAgain.run.id,
    runnerLeaseGuard: wrongRunnerBlocked,
    renderedInputSafe:
      goodInput?.schemaVersion === 'visual-qa-input.v1' &&
      goodInput.demoId === goodBuild.demo.id &&
      typeof goodInput.html === 'string' &&
      goodInput.html.toLowerCase().includes('noindex') &&
      goodInput.html.toLowerCase().includes('concept'),
    healthyFixturePasses:
      goodCompletion?.passed === true &&
      goodCompletion.nextState === 'FACT_QA_PENDING' &&
      goodState?.current_state === 'FACT_QA_PENDING' &&
      goodDemo?.visual_qa_status === 'PASS' &&
      goodDemo.fact_qa_status === 'PENDING_PHASE19' &&
      goodHistory.length === 1 &&
      goodHistory[0]?.status === 'PASS',
    brokenFixtureFailsClosed:
      badInput?.demoId === badBuild.demo.id &&
      badCompletion?.passed === false &&
      badCompletion.nextState === 'QA_FAILED' &&
      badState?.current_state === 'QA_FAILED' &&
      badDemo?.visual_qa_status === 'FAIL' &&
      badDemo.fact_qa_status === 'BLOCKED_BY_VISUAL_QA',
    stateTransitionsRecorded:
      goodPairs.includes('RENDERED->VISUAL_QA_PENDING') &&
      goodPairs.includes('VISUAL_QA_PENDING->FACT_QA_PENDING') &&
      badPairs.includes('RENDERED->VISUAL_QA_PENDING') &&
      badPairs.includes('VISUAL_QA_PENDING->QA_FAILED'),
    fourScreenshotsPerRun: Number(screenshotCount?.count ?? 0) === 8,
    crossTenantBlocked,
    publicReleaseStillHeld:
      goodBuild.demo.status === 'RENDERED' &&
      badBuild.demo.status === 'RENDERED' &&
      goodState?.current_state === 'FACT_QA_PENDING',
    foreignKeyViolations: foreignKeys.results.length,
  };

  return c.json({
    ok: Object.values(checks).every((value) => value === true || value === 0),
    checks,
    runs: { good: goodEnqueue.run.id, bad: badEnqueue.run.id },
  });
});

export default app;
