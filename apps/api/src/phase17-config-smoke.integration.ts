import {
  CampaignRepository,
  EvidenceRepository,
  ProspectFactRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
  type DemoRecord,
} from '@shalcon/db';
import { Hono } from 'hono';

import { runAssetSelection } from './asset-engine';
import { runAutomaticBrandTemplateMatch } from './brand-template';
import { runContentGeneration } from './content-engine';
import { renderDemoRecordForOperator } from './demo-renderer';
import { buildManualSalonDemoConfig } from './manual-demo-builder';

interface Env { DB: D1DatabaseLike }
const app = new Hono<{ Bindings: Env }>();
app.get('/healthz', (c) => c.json({ ok: true }));

function iso(offset: number): string {
  return new Date(Date.parse('2026-09-14T03:00:00.000Z') + offset * 1000).toISOString();
}

async function addFact(db: D1DatabaseLike, prospectId: string, field: string, value: string, offset: number) {
  const key = field.replace(/[^a-z0-9]/giu, '_').toLowerCase();
  const evidenceId = `ev_config_${key}`;
  const at = iso(offset);
  await new EvidenceRepository(db).create({
    id: evidenceId,
    prospectId,
    field,
    value,
    sourceRecordId: 'src_p17_config',
    sourceUrl: 'https://p17-config.example.com/',
    sourceQuality: 1,
    confidence: 0.97,
    verificationStatus: 'VERIFIED',
    excerpt: value,
    capturedAt: at,
  });
  await new ProspectFactRepository(db).upsert({
    id: `fact_config_${key}`,
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

app.get('/phase17-config-smoke', async (c) => {
  const db = c.env.DB;
  const userId = 'usr_p17_config';
  const prospectId = 'p17_config';
  await new UserRepository(db).create({ id: userId, email: 'p17-config@example.com', name: 'P17 Config', createdAt: iso(0) });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(userId, iso(0));
  await new ProspectRepository(db).create({
    id: prospectId,
    campaignId: campaign.id,
    canonicalName: 'Phase Seventeen Salon',
    normalizedName: 'phase seventeen salon',
    niche: 'SALON_SPA',
    sourceFirstSeen: 'PHASE17_CONFIG',
    currentState: 'DEMO_QUALIFIED',
    domain: 'p17-config.example.com',
    phoneNormalized: null,
    city: 'mumbai',
    addressNormalized: null,
    createdAt: iso(0),
    updatedAt: iso(0),
  });
  await new SourceRecordRepository(db).create({
    id: 'src_p17_config',
    prospectId,
    provider: 'PHASE17_CONFIG',
    sourceType: 'WEBSITE_PAGE',
    sourceUrl: 'https://p17-config.example.com/',
    rawJson: '{}',
    capturedAt: iso(0),
  });
  await addFact(db, prospectId, 'category', 'Premium Salon', 1);
  await addFact(db, prospectId, 'city', 'Mumbai', 2);
  await addFact(db, prospectId, 'business_description', 'A salon offering verified hair and beauty services.', 3);
  await addFact(db, prospectId, 'service', 'Haircut', 4);
  await addFact(db, prospectId, 'whatsapp', '+91 98765 43210', 5);

  const match = await runAutomaticBrandTemplateMatch(db, userId, prospectId, iso(6));
  const content = await runContentGeneration(db, userId, prospectId, iso(7));
  const assets = await runAssetSelection(db, userId, prospectId, iso(8));
  const prospect = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Config smoke prospect missing.');
  const facts = await new ProspectFactRepository(db).listForProspect(prospectId);
  const base = buildManualSalonDemoConfig(prospect, facts, {
    themePreset: match.match.themeDNA.paletteId === 'warm-stone' ? 'WARM_STONE' : 'ELANE_PAPER',
    headline: content.content.headline?.text ?? 'A sharper first impression.',
    accentHeadline: 'A clearer digital welcome.',
    subhead: content.content.about?.text ?? 'A private website concept assembled from verified business evidence.',
    hiddenFields: [],
  });
  const config = {
    ...base.config,
    theme: { ...base.config.theme, ...match.match.themeDNA },
  };
  const demo: DemoRecord = {
    id: 'demo_p17_config',
    prospectId,
    tokenHash: 'not-used-for-operator-render',
    templateId: match.match.templateId,
    templateVersion: match.match.templateVersion,
    schemaVersion: 'salon-template-config.v1',
    configJson: JSON.stringify(config),
    status: 'RENDERED',
    expiresAt: '2026-09-28T03:00:00.000Z',
    createdAt: iso(9),
    updatedAt: iso(9),
    lastQaAt: null,
    factQaStatus: 'PENDING_PHASE18',
    visualQaStatus: 'PENDING_PHASE18',
    salesQaStatus: 'PENDING_PHASE19',
  };
  const rendered = renderDemoRecordForOperator(demo, iso(10));
  const checks = {
    contentApplied: config.hero.headline === content.content.headline?.text,
    themeApplied: config.theme.heroVariant === match.match.themeDNA.heroVariant,
    assetInputValid: assets.assignments.length === 4,
    operatorRenderValid: rendered.ok === true,
    noindex: config.noindex === true,
  };
  return c.json({ ok: Object.values(checks).every(Boolean), checks });
});

export default app;
