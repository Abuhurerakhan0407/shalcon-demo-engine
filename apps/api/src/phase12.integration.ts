import {
  CampaignRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
} from '@shalcon/db';
import { Hono } from 'hono';

import {
  getWebsiteAuditHistory,
  runWebsiteOpportunityAudit,
} from './website-audit';

interface Env {
  DB: D1DatabaseLike;
}

const app = new Hono<{ Bindings: Env }>();

function iso(offsetSeconds: number): string {
  return new Date(Date.parse('2026-09-10T00:00:00.000Z') + offsetSeconds * 1000).toISOString();
}

async function createProspect(
  db: D1DatabaseLike,
  id: string,
  campaignId: string,
  now: string,
): Promise<void> {
  await new ProspectRepository(db).create({
    id,
    campaignId,
    canonicalName: id,
    normalizedName: id,
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE12_TEST',
    currentState: 'RESEARCHED',
    domain: 'example.com',
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: now,
    updatedAt: now,
  });
}

function sourceRaw(input: {
  jobId: string;
  capturedAt: string;
  title: string;
  text: string;
  html: string;
  screenshotPath: string;
  mobileScreenshotPath: string;
  desktopWidth?: number;
  mobileWidth?: number;
  consoleErrors?: number;
  discoveredLinks?: string[];
}): string {
  const desktopWidth = input.desktopWidth ?? 1440;
  const mobileWidth = input.mobileWidth ?? 390;
  return JSON.stringify({
    schemaVersion: 'playwright-research.v1',
    jobId: input.jobId,
    prospectId: 'phase12-fixture',
    requestedUrl: 'https://example.com/',
    researchCapturedAt: input.capturedAt,
    sourceOnly: true,
    page: {
      title: input.title,
      text: input.text,
      html: input.html,
      screenshotPath: input.screenshotPath,
      mobileScreenshotPath: input.mobileScreenshotPath,
      viewportAudit: {
        desktop: {
          viewportWidth: 1440,
          documentWidth: desktopWidth,
          hasHorizontalOverflow: desktopWidth > 1442,
        },
        mobile: {
          viewportWidth: 390,
          documentWidth: mobileWidth,
          hasHorizontalOverflow: mobileWidth > 392,
        },
      },
      httpStatus: 200,
      navigationError: null,
      console: Array.from({ length: input.consoleErrors ?? 0 }, () => ({
        type: 'error',
        text: 'fixture browser error',
      })),
      discoveredLinks: input.discoveredLinks ?? [],
    },
  });
}

app.get('/phase12', async (c) => {
  const db = c.env.DB;
  const now = iso(0);
  const userId = 'usr_phase12';
  await new UserRepository(db).create({
    id: userId,
    email: 'phase12@example.com',
    name: 'Phase 12',
    createdAt: now,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(userId, now);
  const sources = new SourceRecordRepository(db);

  await createProspect(db, 'p12_good', campaign.id, now);
  await sources.create({
    id: 'src_p12_good',
    prospectId: 'p12_good',
    provider: 'PLAYWRIGHT',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: 'https://example.com/',
    rawJson: sourceRaw({
      jobId: 'capture_good',
      capturedAt: iso(1),
      title: 'Good Salon',
      text: 'Good Salon offers Haircut and Styling. Book an appointment or contact us.',
      html: '<a href="/contact">Contact</a><a href="/book">Book appointment</a>',
      screenshotPath: '/captures/good.desktop.png',
      mobileScreenshotPath: '/captures/good.mobile.png',
      discoveredLinks: ['https://example.com/contact', 'https://example.com/book'],
    }),
    capturedAt: iso(1),
  });
  const goodRun = await runWebsiteOpportunityAudit(db, userId, 'p12_good', iso(2));

  await createProspect(db, 'p12_poor', campaign.id, now);
  await sources.create({
    id: 'src_p12_poor',
    prospectId: 'p12_poor',
    provider: 'PLAYWRIGHT',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: 'https://example.com/poor',
    rawJson: sourceRaw({
      jobId: 'capture_poor',
      capturedAt: iso(3),
      title: 'Sparse Salon',
      text: 'Welcome to our studio.',
      html: '<main>Welcome to our studio.</main>',
      screenshotPath: '/captures/poor.desktop.png',
      mobileScreenshotPath: '/captures/poor.mobile.png',
      mobileWidth: 620,
    }),
    capturedAt: iso(3),
  });
  const poorRun = await runWebsiteOpportunityAudit(db, userId, 'p12_poor', iso(4));
  const repeatRun = await runWebsiteOpportunityAudit(db, userId, 'p12_poor', iso(5));
  const poorHistory = await getWebsiteAuditHistory(db, userId, 'p12_poor');

  await createProspect(db, 'p12_missing', campaign.id, now);
  const missingRun = await runWebsiteOpportunityAudit(db, userId, 'p12_missing', iso(6));

  const [poorObservations, unsupportedRows, foreignKeys, migrationRows, poorProspect] = await Promise.all([
    db
      .prepare(`
        SELECT code, source_record_id, source_url, screenshot_path, viewport, supported_by_capture
        FROM website_audit_observations WHERE run_id = ? ORDER BY code
      `)
      .bind(poorRun.id)
      .all<{
        code: string;
        source_record_id: string;
        source_url: string;
        screenshot_path: string | null;
        viewport: string;
        supported_by_capture: number;
      }>(),
    db
      .prepare('SELECT id FROM website_audit_observations WHERE supported_by_capture <> 1')
      .all<{ id: string }>(),
    db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>(),
    db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>(),
    new ProspectRepository(db).getById('p12_poor'),
  ]);

  const mobileOverflow = poorObservations.results.find(
    (item) => item.code === 'MOBILE_HORIZONTAL_OVERFLOW',
  );
  const everyObservationHasEvidence =
    poorObservations.results.length > 0 &&
    poorObservations.results.every(
      (item) =>
        item.source_record_id === 'src_p12_poor' &&
        item.source_url === 'https://example.com/poor' &&
        item.supported_by_capture === 1,
    );

  const checks = {
    migrationApplied: Number(migrationRows?.count ?? 0) >= 9,
    goodWebsiteCanBeSkipped:
      goodRun.websitePresence === 'CAPTURED' &&
      goodRun.qualityRating === 'GOOD' &&
      goodRun.recommendation === 'SKIP_DEMO' &&
      goodRun.observations.filter((item) => item.penalty > 0).length === 0,
    noUnsupportedCriticism: unsupportedRows.results.length === 0,
    observationsLinkToEvidence: everyObservationHasEvidence,
    mobileObservationLinksScreenshot:
      mobileOverflow?.screenshot_path === '/captures/poor.mobile.png' &&
      mobileOverflow.viewport === 'MOBILE',
    poorWebsiteIsDemoWorthy:
      poorRun.qualityRating === 'POOR' && poorRun.recommendation === 'DEMO_WORTHY',
    repeatRunsTraceable:
      poorHistory.length === 2 && repeatRun.id !== poorRun.id,
    missingWebsiteIsNotOverclaimed:
      missingRun.websitePresence === 'NOT_FOUND' &&
      missingRun.qualityRating === 'NOT_RATED' &&
      missingRun.recommendation === 'RESEARCH_NEEDED' &&
      missingRun.observations.length === 0 &&
      missingRun.summary.includes('not proof'),
    auditDoesNotAdvanceProspectState: poorProspect?.currentState === 'RESEARCHED',
    foreignKeyViolations: foreignKeys.results.length,
  };

  return c.json({
    ok: Object.values(checks).every((value) => value === true || value === 0),
    checks,
  });
});

export default app;
