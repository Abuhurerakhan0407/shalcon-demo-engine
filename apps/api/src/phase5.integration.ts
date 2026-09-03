import {
  CampaignRepository,
  IdentityRepository,
  ProspectRepository,
  UserRepository,
  type D1DatabaseLike,
} from '@shalcon/db';
import { Hono } from 'hono';

import {
  ProspectIdentityError,
  createOrResolveProspectIdentity,
  resolvePendingProspectIdentity,
} from './prospect-identity';

interface Env {
  DB: D1DatabaseLike;
}
type Bindings = { Bindings: Env };
const integration = new Hono<Bindings>();
const NOW = '2026-09-03T11:30:00.000Z';

async function rejectsWithCode(action: () => Promise<unknown>, code: string): Promise<boolean> {
  try {
    await action();
    return false;
  } catch (error) {
    return error instanceof ProspectIdentityError && error.code === code;
  }
}

integration.get('/phase5', async (c) => {
  const db = c.env.DB;
  const users = new UserRepository(db);
  await users.create({
    id: 'phase5-user',
    email: 'phase5@example.invalid',
    name: 'Phase 5 Fixture',
    createdAt: NOW,
  });
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign('phase5-user', NOW);

  const canonicalA = await createOrResolveProspectIdentity(
    db,
    {
      userId: 'phase5-user',
      campaignId: campaign.id,
      canonicalName: 'Glow Salon',
      normalizedName: 'glow salon',
      domain: 'glow.example',
      phoneNormalized: '+919000000001',
      city: 'mumbai',
      addressNormalized: '1 linking road',
      niche: 'SALON_SPA',
      sourceType: 'INTEGRATION',
    },
    NOW,
  );

  const domainDuplicate = await createOrResolveProspectIdentity(
    db,
    {
      userId: 'phase5-user',
      campaignId: campaign.id,
      canonicalName: 'Glow Salon Mumbai',
      normalizedName: 'glow salon mumbai',
      domain: 'glow.example',
      phoneNormalized: null,
      city: 'mumbai',
      addressNormalized: null,
      niche: 'SALON_SPA',
      sourceType: 'INTEGRATION',
    },
    NOW,
  );

  const phoneDuplicate = await createOrResolveProspectIdentity(
    db,
    {
      userId: 'phase5-user',
      campaignId: campaign.id,
      canonicalName: 'Glow Beauty',
      normalizedName: 'glow beauty',
      domain: null,
      phoneNormalized: '+919000000001',
      city: 'mumbai',
      addressNormalized: null,
      niche: 'SALON_SPA',
      sourceType: 'INTEGRATION',
    },
    NOW,
  );

  const weakReview = await createOrResolveProspectIdentity(
    db,
    {
      userId: 'phase5-user',
      campaignId: campaign.id,
      canonicalName: 'Glow Salon',
      normalizedName: 'glow salon',
      domain: null,
      phoneNormalized: null,
      city: 'mumbai',
      addressNormalized: null,
      niche: 'SALON_SPA',
      sourceType: 'INTEGRATION',
    },
    NOW,
  );

  const canonicalC = await createOrResolveProspectIdentity(
    db,
    {
      userId: 'phase5-user',
      campaignId: campaign.id,
      canonicalName: 'Nova Spa',
      normalizedName: 'nova spa',
      domain: 'nova.example',
      phoneNormalized: '+919000000002',
      city: 'mumbai',
      addressNormalized: '2 hill road',
      niche: 'SALON_SPA',
      sourceType: 'INTEGRATION',
    },
    NOW,
  );

  const strongConflict = await createOrResolveProspectIdentity(
    db,
    {
      userId: 'phase5-user',
      campaignId: campaign.id,
      canonicalName: 'Conflicted Listing',
      normalizedName: 'conflicted listing',
      domain: 'glow.example',
      phoneNormalized: '+919000000002',
      city: 'mumbai',
      addressNormalized: null,
      niche: 'SALON_SPA',
      sourceType: 'INTEGRATION',
    },
    NOW,
  );

  const linkedReview = await resolvePendingProspectIdentity(
    db,
    'phase5-user',
    weakReview.prospect.id,
    { type: 'LINK_TO_EXISTING', canonicalProspectId: canonicalA.prospect.id },
    NOW,
  );

  const weakDistinct = await createOrResolveProspectIdentity(
    db,
    {
      userId: 'phase5-user',
      campaignId: campaign.id,
      canonicalName: 'Glow Salon',
      normalizedName: 'glow salon',
      domain: null,
      phoneNormalized: null,
      city: 'mumbai',
      addressNormalized: '99 distinct street',
      niche: 'SALON_SPA',
      sourceType: 'INTEGRATION',
    },
    NOW,
  );
  const distinctReview = await resolvePendingProspectIdentity(
    db,
    'phase5-user',
    weakDistinct.prospect.id,
    { type: 'KEEP_DISTINCT' },
    NOW,
  );

  const strongConflictCannotStayDistinct = await rejectsWithCode(
    () =>
      resolvePendingProspectIdentity(
        db,
        'phase5-user',
        strongConflict.prospect.id,
        { type: 'KEEP_DISTINCT' },
        NOW,
      ),
    'STRONG_IDENTITY_COLLISION',
  );

  await users.create({
    id: 'phase5-other-user',
    email: 'phase5-other@example.invalid',
    name: 'Other Fixture',
    createdAt: NOW,
  });
  const otherCampaign = await new CampaignRepository(db).ensureManualSalonCampaign('phase5-other-user', NOW);
  const otherProspect = new ProspectRepository(db);
  await otherProspect.create({
    id: 'phase5-other-prospect',
    campaignId: otherCampaign.id,
    canonicalName: 'Other Salon',
    normalizedName: 'other salon',
    domain: 'other.example',
    phoneNormalized: null,
    city: 'pune',
    addressNormalized: null,
    niche: 'SALON_SPA',
    sourceFirstSeen: 'INTEGRATION',
    currentState: 'DISCOVERED',
    createdAt: NOW,
    updatedAt: NOW,
  });

  let crossUserKeyRejected = false;
  try {
    await new IdentityRepository(db).registerCanonicalKeys([
      {
        id: 'phase5-illegal-key',
        userId: 'phase5-user',
        prospectId: 'phase5-other-prospect',
        keyType: 'DOMAIN',
        keyValue: 'illegal.example',
        keyStrength: 'STRONG',
        sourceType: 'INTEGRATION',
        createdAt: NOW,
      },
    ]);
  } catch {
    crossUserKeyRejected = true;
  }

  const prospects = await new ProspectRepository(db).listForUser('phase5-user');
  const identity = new IdentityRepository(db);
  const canonicalAKeys = await identity.listKeysForProspect(canonicalA.prospect.id);
  const canonicalAObservations = await identity.listObservationsForProspect(canonicalA.prospect.id);
  const alias = await identity.getAlias(weakReview.prospect.id);
  const migrationCount = await db.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>();
  const foreignKeyViolations = await db.prepare('PRAGMA foreign_key_check').all();

  return c.json({
    ok: true,
    migrationCount: migrationCount?.count ?? 0,
    checks: {
      newCanonicalVerified:
        canonicalA.identity.status === 'NEW_CANONICAL' && canonicalA.prospect.currentState === 'IDENTITY_VERIFIED',
      exactDomainDeduped:
        domainDuplicate.identity.status === 'EXACT_MATCH' &&
        domainDuplicate.prospect.id === canonicalA.prospect.id &&
        domainDuplicate.identity.deduplicated,
      exactPhoneDeduped:
        phoneDuplicate.identity.status === 'EXACT_MATCH' &&
        phoneDuplicate.prospect.id === canonicalA.prospect.id &&
        phoneDuplicate.identity.deduplicated,
      weakNameCityRequiresReview:
        weakReview.identity.status === 'REVIEW_REQUIRED' && weakReview.prospect.currentState === 'IDENTITY_PENDING',
      strongConflictRequiresReview:
        strongConflict.identity.status === 'CONFLICT' &&
        strongConflict.prospect.currentState === 'IDENTITY_PENDING' &&
        strongConflict.identity.candidateProspectIds.includes(canonicalA.prospect.id) &&
        strongConflict.identity.candidateProspectIds.includes(canonicalC.prospect.id),
      manualLinkTerminalDuplicate:
        linkedReview.prospect.currentState === 'DUPLICATE' &&
        linkedReview.canonical.id === canonicalA.prospect.id &&
        alias?.canonicalProspectId === canonicalA.prospect.id,
      manualDistinctVerified:
        distinctReview.prospect.currentState === 'IDENTITY_VERIFIED' && distinctReview.canonical.id === weakDistinct.prospect.id,
      strongConflictCannotStayDistinct,
      crossUserKeyRejected,
      canonicalKeysRegistered:
        canonicalAKeys.some((key) => key.keyType === 'DOMAIN' && key.keyStrength === 'STRONG') &&
        canonicalAKeys.some((key) => key.keyType === 'PHONE' && key.keyStrength === 'STRONG'),
      observationsAuditable: canonicalAObservations.length >= 4,
      exactDedupDidNotCreateExtraActiveProspects:
        prospects.filter((prospect) => prospect.currentState !== 'DUPLICATE').length === 4,
      foreignKeyViolations: foreignKeyViolations.results.length,
    },
  });
});

export default integration;
