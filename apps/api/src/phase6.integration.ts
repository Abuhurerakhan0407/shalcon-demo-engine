import {
  CampaignRepository,
  DemoRepository,
  ProspectRepository,
  UserRepository,
  type D1DatabaseLike,
  type DemoRecord,
} from '@shalcon/db';
import { SALON_QA_FIXTURE_MINIMAL } from '@shalcon/template-runtime';
import { Hono } from 'hono';

import { hashDemoToken } from './demo-renderer';
import { app as productionApp } from './index';

interface Env { DB: D1DatabaseLike }
type Bindings = { Bindings: Env };
const integration = new Hono<Bindings>();

const NOW = '2026-09-03T11:00:00.000Z';
const FUTURE = '2099-09-03T11:00:00.000Z';
const PAST = '2020-09-03T11:00:00.000Z';
const TOKEN_A = 'phase6_demo_primary_A_0123456789abcdef';
const TOKEN_B = 'phase6_demo_primary_B_0123456789abcdef';
const TOKEN_DISABLED = 'phase6_demo_disabled_0123456789abcdef';
const TOKEN_EXPIRED = 'phase6_demo_expired_0123456789abcdef0';
const TOKEN_INVALID = 'phase6_demo_invalid_0123456789abcdef0';
const TOKEN_UNKNOWN = 'phase6_demo_unknown_0123456789abcdef0';

function demoRecord(
  id: string,
  prospectId: string,
  tokenHash: string,
  configJson: string,
  status: DemoRecord['status'],
  expiresAt: string | null,
): DemoRecord {
  return {
    id,
    prospectId,
    tokenHash,
    templateId: 'elane-v8',
    templateVersion: '8.0.0',
    schemaVersion: 'salon-template-config.v1',
    configJson,
    status,
    expiresAt,
    createdAt: NOW,
    updatedAt: NOW,
    lastQaAt: NOW,
    factQaStatus: 'PASS',
    visualQaStatus: 'PASS',
    salesQaStatus: 'PASS',
  };
}

integration.get('/phase6', async (c) => {
  const db = c.env.DB;
  await db.prepare("DELETE FROM users WHERE id = 'phase6-user'").run();

  await new UserRepository(db).create({
    id: 'phase6-user',
    email: 'phase6@example.invalid',
    name: 'Phase 6 Fixture',
    createdAt: NOW,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign('phase6-user', NOW);
  const prospects = new ProspectRepository(db);
  await prospects.create({
    id: 'phase6-prospect-a', campaignId: campaign.id, canonicalName: 'Aura One Salon',
    normalizedName: 'aura one salon', domain: 'aura-one.example', phoneNormalized: '+919000000101',
    city: 'mumbai', addressNormalized: 'bandra west', niche: 'SALON_SPA', sourceFirstSeen: 'MANUAL',
    currentState: 'IDENTITY_VERIFIED', createdAt: NOW, updatedAt: NOW,
  });
  await prospects.create({
    id: 'phase6-prospect-b', campaignId: campaign.id, canonicalName: 'Aura Two Spa',
    normalizedName: 'aura two spa', domain: 'aura-two.example', phoneNormalized: '+919000000102',
    city: 'mumbai', addressNormalized: 'andheri west', niche: 'SALON_SPA', sourceFirstSeen: 'MANUAL',
    currentState: 'IDENTITY_VERIFIED', createdAt: NOW, updatedAt: NOW,
  });

  const configA = {
    ...SALON_QA_FIXTURE_MINIMAL,
    business: { ...SALON_QA_FIXTURE_MINIMAL.business, name: 'Aura One Salon' },
  };
  const configB = {
    ...SALON_QA_FIXTURE_MINIMAL,
    business: { ...SALON_QA_FIXTURE_MINIMAL.business, name: 'Aura Two Spa' },
  };
  const demos = new DemoRepository(db);
  await demos.create(demoRecord('phase6-demo-a', 'phase6-prospect-a', await hashDemoToken(TOKEN_A), JSON.stringify(configA), 'READY', FUTURE));
  await demos.create(demoRecord('phase6-demo-b', 'phase6-prospect-b', await hashDemoToken(TOKEN_B), JSON.stringify(configB), 'READY', FUTURE));
  await demos.create(demoRecord('phase6-demo-disabled', 'phase6-prospect-a', await hashDemoToken(TOKEN_DISABLED), JSON.stringify(configA), 'DISABLED', FUTURE));
  await demos.create(demoRecord('phase6-demo-expired', 'phase6-prospect-a', await hashDemoToken(TOKEN_EXPIRED), JSON.stringify(configA), 'READY', PAST));
  await demos.create(demoRecord('phase6-demo-invalid', 'phase6-prospect-a', await hashDemoToken(TOKEN_INVALID), '{"business":{"name":"Broken"}}', 'READY', FUTURE));

  const env = {
    DB: db,
    APP_ENV: 'test',
    WEB_ORIGIN: 'http://localhost:5173',
    SESSION_SECRET: 'phase-six-integration-secret',
  };
  const [responseA, responseB, disabled, expired, invalid, unknown, listing] = await Promise.all([
    productionApp.request(`http://local.test/d/${TOKEN_A}`, {}, env),
    productionApp.request(`http://local.test/d/${TOKEN_B}`, {}, env),
    productionApp.request(`http://local.test/d/${TOKEN_DISABLED}`, {}, env),
    productionApp.request(`http://local.test/d/${TOKEN_EXPIRED}`, {}, env),
    productionApp.request(`http://local.test/d/${TOKEN_INVALID}`, {}, env),
    productionApp.request(`http://local.test/d/${TOKEN_UNKNOWN}`, {}, env),
    productionApp.request('http://local.test/d', {}, env),
  ]);
  const [bodyA, bodyB] = await Promise.all([responseA.text(), responseB.text()]);

  const rawTokenStored = await db
    .prepare('SELECT COUNT(*) AS count FROM demos WHERE token_hash IN (?, ?)')
    .bind(TOKEN_A, TOKEN_B)
    .first<{ count: number }>();
  const template = await db
    .prepare("SELECT id, version, status FROM templates WHERE id = 'elane-v8'")
    .first<{ id: string; version: string; status: string }>();
  const migrationCount = await db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>();
  const foreignKeyViolations = await db.prepare('PRAGMA foreign_key_check').all();

  return c.json({
    ok: true,
    migrationCount: migrationCount?.count ?? 0,
    checks: {
      firstDemoRendered: responseA.status === 200 && bodyA.includes('Aura One Salon'),
      secondDemoRendered: responseB.status === 200 && bodyB.includes('Aura Two Spa'),
      configOnlyVariation: bodyA !== bodyB,
      sameRendererVersion: responseA.headers.get('X-Shalcon-Demo') === 'phase6-demo-a' && responseB.headers.get('X-Shalcon-Demo') === 'phase6-demo-b',
      robotsProtected: responseA.headers.get('X-Robots-Tag') === 'noindex, nofollow, noarchive' && bodyA.includes('noindex,nofollow,noarchive'),
      disclosurePresent: bodyA.includes('Concept preview prepared by Shalcon Intelligence'),
      disabledFailsClosed: disabled.status === 404,
      expiredFailsClosed: expired.status === 404,
      invalidConfigFailsClosed: invalid.status === 404,
      unknownTokenFailsClosed: unknown.status === 404,
      noPublicListing: listing.status === 404,
      rawTokenNeverStored: (rawTokenStored?.count ?? 0) === 0,
      exactTemplateSeeded: template?.id === 'elane-v8' && template.version === '8.0.0' && template.status === 'ACTIVE',
      foreignKeyViolations: foreignKeyViolations.results.length,
    },
  });
});

export default integration;
