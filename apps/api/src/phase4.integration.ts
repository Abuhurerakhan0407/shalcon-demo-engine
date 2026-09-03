import {
  CampaignRepository,
  EvidenceRepository,
  ProspectFactRepository,
  ProspectRepository,
  SourceRecordRepository,
  UserRepository,
  type D1DatabaseLike,
} from '@shalcon/db';
import { Hono } from 'hono';

interface Env { DB: D1DatabaseLike }
type Bindings = { Bindings: Env };
const integration = new Hono<Bindings>();
const NOW = '2026-09-03T10:30:00.000Z';

async function rejects(action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action();
    return false;
  } catch {
    return true;
  }
}

integration.get('/phase4', async (c) => {
  const db = c.env.DB;
  await db.batch([
    db.prepare("DELETE FROM users WHERE id = 'phase4-user'"),
  ]);

  await new UserRepository(db).create({
    id: 'phase4-user',
    email: 'phase4@example.invalid',
    name: 'Phase 4 Fixture',
    createdAt: NOW,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign('phase4-user', NOW);
  const prospects = new ProspectRepository(db);
  await prospects.create({
    id: 'phase4-prospect-a', campaignId: campaign.id, canonicalName: 'Elane Fixture',
    normalizedName: 'elane fixture', domain: 'elane.example', phoneNormalized: '+919876543210',
    city: 'mumbai', addressNormalized: 'andheri west', niche: 'SALON_SPA', sourceFirstSeen: 'MANUAL',
    currentState: 'DISCOVERED', createdAt: NOW, updatedAt: NOW,
  });
  await prospects.create({
    id: 'phase4-prospect-b', campaignId: campaign.id, canonicalName: 'Other Fixture',
    normalizedName: 'other fixture', domain: null, phoneNormalized: null, city: 'mumbai',
    addressNormalized: null, niche: 'SALON_SPA', sourceFirstSeen: 'MANUAL',
    currentState: 'DISCOVERED', createdAt: NOW, updatedAt: NOW,
  });

  const sources = new SourceRecordRepository(db);
  const sourceA = await sources.create({
    id: 'phase4-source-a', prospectId: 'phase4-prospect-a', provider: 'manual',
    sourceType: 'OFFICIAL_WEBSITE', sourceUrl: 'https://elane.example/contact', rawJson: '{}', capturedAt: NOW,
  });
  const sourceB = await sources.create({
    id: 'phase4-source-b', prospectId: 'phase4-prospect-b', provider: 'manual',
    sourceType: 'OFFICIAL_WEBSITE', sourceUrl: 'https://other.example/contact', rawJson: '{}', capturedAt: NOW,
  });

  const evidence = new EvidenceRepository(db);
  const verifiedPhone = await evidence.create({
    id: 'phase4-evidence-phone', prospectId: 'phase4-prospect-a', field: 'phone', value: '+919876543210',
    sourceRecordId: sourceA.id, sourceUrl: sourceA.sourceUrl, sourceQuality: 1, confidence: 0.99,
    verificationStatus: 'VERIFIED', excerpt: 'Call +91 98765 43210', capturedAt: NOW,
  });

  const crossProspectRejected = await rejects(() => evidence.create({
    id: 'phase4-cross-evidence', prospectId: 'phase4-prospect-a', field: 'phone', value: '+919111111111',
    sourceRecordId: sourceB.id, sourceUrl: sourceB.sourceUrl, sourceQuality: 1, confidence: 0.9,
    verificationStatus: 'VERIFIED', excerpt: null, capturedAt: NOW,
  }));

  const facts = new ProspectFactRepository(db);
  const verifiedWithoutEvidenceRejected = await rejects(() => facts.upsert({
    id: 'phase4-fact-no-evidence', prospectId: 'phase4-prospect-a', field: 'phone', value: '+919876543210',
    verificationStatus: 'VERIFIED', confidence: 0.99, evidenceId: null, createdAt: NOW, updatedAt: NOW,
  }));
  const wrongFieldRejected = await rejects(() => facts.upsert({
    id: 'phase4-fact-wrong-field', prospectId: 'phase4-prospect-a', field: 'email', value: '+919876543210',
    verificationStatus: 'VERIFIED', confidence: 0.99, evidenceId: verifiedPhone.id, createdAt: NOW, updatedAt: NOW,
  }));
  const fact = await facts.upsert({
    id: 'phase4-fact-phone', prospectId: 'phase4-prospect-a', field: 'phone', value: '+919876543210',
    verificationStatus: 'VERIFIED', confidence: 0.99, evidenceId: verifiedPhone.id, createdAt: NOW, updatedAt: NOW,
  });

  await evidence.create({
    id: 'phase4-evidence-conflict', prospectId: 'phase4-prospect-a', field: 'phone', value: '+919111111111',
    sourceRecordId: sourceA.id, sourceUrl: sourceA.sourceUrl, sourceQuality: 0.8, confidence: 0.7,
    verificationStatus: 'PROBABLE', excerpt: 'Alternate listing', capturedAt: NOW,
  });

  const migrationCount = await db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>();
  const foreignKeyViolations = await db.prepare('PRAGMA foreign_key_check').all();
  const storedEvidence = await evidence.listForProspect('phase4-prospect-a');
  const storedSources = await sources.listForProspect('phase4-prospect-a');
  const storedFacts = await facts.listForProspect('phase4-prospect-a');

  return c.json({
    ok: true,
    migrationCount: migrationCount?.count ?? 0,
    checks: {
      manualCampaign: campaign.id === 'cmp_manual_phase4-user',
      normalizedProspectRead: (await prospects.getById('phase4-prospect-a'))?.addressNormalized === 'andheri west',
      sourceStored: storedSources.length === 1,
      evidenceStored: storedEvidence.length === 2,
      crossProspectRejected,
      verifiedWithoutEvidenceRejected,
      wrongFieldRejected,
      verifiedFactStored: storedFacts.length === 1 && fact.evidenceId === verifiedPhone.id,
      foreignKeyViolations: foreignKeyViolations.results.length,
    },
  });
});

export default integration;
