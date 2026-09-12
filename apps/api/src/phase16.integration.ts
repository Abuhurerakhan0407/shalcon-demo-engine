import {
  CampaignRepository,
  EvidenceRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
} from '@shalcon/db';
import { Hono } from 'hono';

import { runAssetSelection } from './asset-engine';
import { runAutomaticBrandTemplateMatch } from './brand-template';
import { runContentGeneration } from './content-engine';

interface Env { DB: D1DatabaseLike }
const app = new Hono<{ Bindings: Env }>();
app.get('/healthz', (c) => c.json({ ok: true }));

function iso(offsetSeconds: number): string {
  return new Date(Date.parse('2026-09-12T00:00:00.000Z') + offsetSeconds * 1000).toISOString();
}

async function prepareProspect(db: D1DatabaseLike, userId: string, campaignId: string, id: string, offset: number) {
  const now = iso(offset);
  await new ProspectRepository(db).create({
    id,
    campaignId,
    canonicalName: id === 'p16_no_logo' ? 'No Logo Salon' : 'Official Logo Salon',
    normalizedName: id,
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE16_TEST',
    currentState: 'DEMO_QUALIFIED',
    domain: `${id}.example.com`,
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: now,
    updatedAt: now,
  });
  await new SourceRecordRepository(db).create({
    id: `src_${id}`,
    prospectId: id,
    provider: 'PHASE16_FIXTURE',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: `https://${id}.example.com/`,
    rawJson: '{}',
    capturedAt: now,
  });
  await new EvidenceRepository(db).create({
    id: `ev_${id}_service`,
    prospectId: id,
    field: 'service',
    value: 'Haircut',
    sourceRecordId: `src_${id}`,
    sourceUrl: `https://${id}.example.com/`,
    sourceQuality: 1,
    confidence: 0.96,
    verificationStatus: 'VERIFIED',
    excerpt: 'Haircut',
    capturedAt: now,
  });
  await runAutomaticBrandTemplateMatch(db, userId, id, iso(offset + 1));
  await runContentGeneration(db, userId, id, iso(offset + 2));
}

app.get('/phase16', async (c) => {
  const db = c.env.DB;
  const userId = 'usr_phase16';
  const now = iso(0);
  await new UserRepository(db).create({ id: userId, email: 'phase16@example.com', name: 'Phase 16', createdAt: now });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(userId, now);

  await prepareProspect(db, userId, campaign.id, 'p16_official_logo', 1);
  await db.prepare(`
    INSERT INTO assets(
      id, prospect_id, asset_type, source_type, source_url, storage_ref,
      usage_classification, mime_type, width, height, created_at,
      source_captured_at, association_assumption, watermark_status, asset_status, optimization_json
    ) VALUES (?, ?, 'LOGO', 'OFFICIAL_WEBSITE', ?, ?, 'PROSPECT_OFFICIAL', 'image/png',
      1024, 512, ?, ?, 'OFFICIAL_PROSPECT_SOURCE', 'CLEAR', 'ACTIVE', '{}')
  `).bind(
    'asset_p16_official_logo',
    'p16_official_logo',
    'https://p16_official_logo.example.com/logo.png',
    'fixture://official-logo',
    iso(4),
    iso(4),
  ).run();
  await db.prepare(`
    INSERT INTO assets(
      id, prospect_id, asset_type, source_type, source_url, storage_ref,
      usage_classification, mime_type, width, height, created_at,
      source_captured_at, association_assumption, watermark_status, asset_status, optimization_json
    ) VALUES (?, ?, 'LOGO', 'GENERAL_DIRECTORY', ?, ?, 'UNVERIFIED_EXTERNAL', 'image/jpeg',
      800, 600, ?, ?, 'THIRD_PARTY_LISTING', 'WATERMARKED', 'ACTIVE', '{}')
  `).bind(
    'asset_p16_random_watermarked',
    'p16_official_logo',
    'https://directory.example/customer-upload.jpg',
    'fixture://random-watermarked',
    iso(5),
    iso(5),
  ).run();
  const officialRun = await runAssetSelection(db, userId, 'p16_official_logo', iso(6));

  await prepareProspect(db, userId, campaign.id, 'p16_no_logo', 10);
  const noLogoRun = await runAssetSelection(db, userId, 'p16_no_logo', iso(13));

  const officialLogo = officialRun.assignments.find((item) => item.slot === 'LOGO');
  const noLogo = noLogoRun.assignments.find((item) => item.slot === 'LOGO');
  const selectedImages = officialRun.assignments.filter((item) => item.kind === 'IMAGE');
  const externalMetadata = officialLogo?.kind === 'IMAGE'
    ? Boolean(officialLogo.sourceUrl && officialLogo.sourceCapturedAt && officialLogo.associationAssumption)
    : false;
  const [foreignKeys, migrationRows, runCount] = await Promise.all([
    db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>(),
    db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>(),
    db.prepare('SELECT COUNT(*) AS count FROM asset_selection_runs').first<{ count: number }>(),
  ]);

  const checks = {
    migrationApplied: Number(migrationRows?.count ?? 0) >= 12,
    officialLogoSelected:
      officialLogo?.kind === 'IMAGE' &&
      officialLogo.assetId === 'asset_p16_official_logo' &&
      officialLogo.usageClassification === 'PROSPECT_OFFICIAL',
    randomThirdPartyRejected:
      !selectedImages.some((item) => item.assetId === 'asset_p16_random_watermarked'),
    watermarkedAssetRejected:
      !selectedImages.some((item) => item.assetId === 'asset_p16_random_watermarked'),
    missingLogoUsesWordmark:
      noLogo?.kind === 'TEXT_WORDMARK' && noLogo.text === 'No Logo Salon',
    templateImageryGeneric:
      selectedImages.filter((item) => item.slot !== 'LOGO').every((item) =>
        item.usageClassification === 'SHALCON_TEMPLATE' &&
        item.representation === 'GENERIC_TEMPLATE_IMAGERY' &&
        item.mayDescribeAsProspectReality === false,
      ),
    externalSourceMetadataAvailable: externalMetadata,
    dimensionsBounded:
      selectedImages.every((item) =>
        item.optimization.outputWidth <= item.optimization.sourceWidth &&
        item.optimization.outputHeight <= item.optimization.sourceHeight,
      ),
    immutableSelectionHistory: Number(runCount?.count ?? 0) === 2,
    foreignKeyViolations: foreignKeys.results.length,
  };

  return c.json({ ok: Object.values(checks).every((value) => value === true || value === 0), checks });
});

export default app;
