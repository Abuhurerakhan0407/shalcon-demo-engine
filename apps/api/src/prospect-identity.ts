import {
  IdentityRepository,
  ProspectRepository,
  type D1DatabaseLike,
  type ProspectAliasRecord,
  type ProspectIdentityKeyRecord,
  type ProspectObservationRecord,
  type ProspectRecord,
} from '@shalcon/db';
import {
  buildIdentityKeys,
  resolveIdentity,
  type IdentityKey,
  type IdentityResolution,
} from '@shalcon/evidence';

import { randomToken } from './auth';

export interface IncomingProspectIdentity {
  userId: string;
  campaignId: string;
  canonicalName: string;
  normalizedName: string;
  domain: string | null;
  phoneNormalized: string | null;
  city: string | null;
  addressNormalized: string | null;
  niche: string;
  sourceType: string;
}

export interface ProspectIdentityResult {
  prospect: ProspectRecord;
  identity: IdentityResolution & {
    deduplicated: boolean;
    canonicalProspectId: string | null;
    pendingProspectId: string | null;
    aliasProspectId: string | null;
  };
  observation: ProspectObservationRecord;
}

export class ProspectIdentityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProspectIdentityError';
  }
}

function identityProfile(input: IncomingProspectIdentity) {
  return {
    normalizedName: input.normalizedName,
    domain: input.domain,
    phoneNormalized: input.phoneNormalized,
    city: input.city,
    addressNormalized: input.addressNormalized,
  };
}

function keyRecords(
  userId: string,
  prospectId: string,
  keys: readonly IdentityKey[],
  sourceType: string,
  now: string,
): ProspectIdentityKeyRecord[] {
  return keys.map((key) => ({
    id: `ikey_${randomToken(12)}`,
    userId,
    prospectId,
    keyType: key.type,
    keyValue: key.value,
    keyStrength: key.type === 'DOMAIN' || key.type === 'PHONE' ? 'STRONG' : 'WEAK',
    sourceType,
    createdAt: now,
  }));
}

async function recordResolution(
  identity: IdentityRepository,
  prospectId: string,
  resolution: IdentityResolution,
  now: string,
  status = resolution.status,
) {
  return identity.createResolution({
    id: `ires_${randomToken(12)}`,
    prospectId,
    status,
    confidence: resolution.confidence,
    conflictsJson: JSON.stringify(resolution.status === 'CONFLICT' ? resolution.candidateProspectIds : []),
    evidenceIdsJson: '[]',
    candidateProspectIdsJson: JSON.stringify(resolution.candidateProspectIds),
    matchedKeysJson: JSON.stringify(resolution.matchedKeys),
    reasonCodesJson: JSON.stringify(resolution.reasonCodes),
    createdAt: now,
  });
}

async function recordObservation(
  identity: IdentityRepository,
  input: IncomingProspectIdentity,
  resolution: IdentityResolution,
  now: string,
  canonicalProspectId: string | null,
  pendingProspectId: string | null,
  sourceType = input.sourceType,
) {
  return identity.createObservation({
    id: `obs_${randomToken(12)}`,
    userId: input.userId,
    campaignId: input.campaignId,
    canonicalProspectId,
    pendingProspectId,
    observedName: input.canonicalName,
    normalizedName: input.normalizedName,
    domain: input.domain,
    phoneNormalized: input.phoneNormalized,
    city: input.city,
    addressNormalized: input.addressNormalized,
    sourceType,
    resolutionStatus: resolution.status,
    confidence: resolution.confidence,
    candidateProspectIds: resolution.candidateProspectIds,
    matchedKeys: resolution.matchedKeys,
    reasonCodes: resolution.reasonCodes,
    createdAt: now,
  });
}

function isCanonicalState(state: ProspectRecord['currentState']): boolean {
  return !['DISCOVERED', 'NORMALIZED', 'IDENTITY_PENDING', 'DUPLICATE'].includes(state);
}

async function exactMatchResult(
  db: D1DatabaseLike,
  identity: IdentityRepository,
  input: IncomingProspectIdentity,
  resolution: IdentityResolution,
  now: string,
  aliasProspectId: string | null,
): Promise<ProspectIdentityResult> {
  const canonicalProspectId = resolution.candidateProspectIds[0];
  if (!canonicalProspectId) throw new ProspectIdentityError('IDENTITY_MATCH_MISSING', 'Exact identity match has no canonical prospect.');
  const prospect = await new ProspectRepository(db).getByIdForUser(canonicalProspectId, input.userId);
  if (!prospect || !isCanonicalState(prospect.currentState)) {
    throw new ProspectIdentityError('IDENTITY_MATCH_INVALID', 'Identity key points to a non-canonical prospect.');
  }
  await recordResolution(identity, aliasProspectId ?? prospect.id, resolution, now, aliasProspectId ? 'RACE_DUPLICATE' : 'EXACT_MATCH');
  const observation = await recordObservation(identity, input, resolution, now, prospect.id, null);
  return {
    prospect,
    identity: {
      ...resolution,
      deduplicated: true,
      canonicalProspectId: prospect.id,
      pendingProspectId: null,
      aliasProspectId,
    },
    observation,
  };
}

export async function createOrResolveProspectIdentity(
  db: D1DatabaseLike,
  input: IncomingProspectIdentity,
  now: string,
): Promise<ProspectIdentityResult> {
  const identity = new IdentityRepository(db);
  const prospects = new ProspectRepository(db);
  const keys = buildIdentityKeys(identityProfile(input));
  const initialResolution = resolveIdentity(keys, await identity.findCandidateMatches(input.userId, keys));

  if (initialResolution.status === 'EXACT_MATCH') {
    return exactMatchResult(db, identity, input, initialResolution, now, null);
  }

  const prospectId = `pro_${randomToken(12)}`;
  const discovered: ProspectRecord = {
    id: prospectId,
    campaignId: input.campaignId,
    canonicalName: input.canonicalName,
    normalizedName: input.normalizedName,
    domain: input.domain,
    phoneNormalized: input.phoneNormalized,
    city: input.city,
    addressNormalized: input.addressNormalized,
    niche: input.niche,
    sourceFirstSeen: input.sourceType,
    currentState: 'DISCOVERED',
    createdAt: now,
    updatedAt: now,
  };
  await prospects.create(discovered);
  await prospects.transition(prospectId, 'NORMALIZED', now);
  const pending = await prospects.transition(prospectId, 'IDENTITY_PENDING', now);

  if (initialResolution.status !== 'NEW_CANONICAL') {
    await recordResolution(identity, pending.id, initialResolution, now);
    const observation = await recordObservation(identity, input, initialResolution, now, null, pending.id);
    return {
      prospect: pending,
      identity: {
        ...initialResolution,
        deduplicated: false,
        canonicalProspectId: null,
        pendingProspectId: pending.id,
        aliasProspectId: null,
      },
      observation,
    };
  }

  try {
    await identity.registerCanonicalKeys(keyRecords(input.userId, pending.id, keys, input.sourceType, now));
  } catch (error) {
    const raceResolution = resolveIdentity(keys, await identity.findCandidateMatches(input.userId, keys));
    if (raceResolution.status === 'EXACT_MATCH') {
      const canonicalProspectId = raceResolution.candidateProspectIds[0];
      if (!canonicalProspectId) throw error;
      const duplicate = await prospects.transition(pending.id, 'DUPLICATE', now);
      const alias: ProspectAliasRecord = {
        duplicateProspectId: duplicate.id,
        canonicalProspectId,
        userId: input.userId,
        reasonCode: 'STRONG_KEY_RACE_DEDUPLICATED',
        confidence: raceResolution.confidence,
        createdAt: now,
      };
      await identity.createAlias(alias);
      return exactMatchResult(db, identity, input, raceResolution, now, duplicate.id);
    }
    if (raceResolution.status === 'REVIEW_REQUIRED' || raceResolution.status === 'CONFLICT') {
      await recordResolution(identity, pending.id, raceResolution, now, 'RACE_REVIEW_REQUIRED');
      const observation = await recordObservation(identity, input, raceResolution, now, null, pending.id);
      return {
        prospect: pending,
        identity: {
          ...raceResolution,
          deduplicated: false,
          canonicalProspectId: null,
          pendingProspectId: pending.id,
          aliasProspectId: null,
        },
        observation,
      };
    }
    throw error;
  }

  const verified = await prospects.transition(pending.id, 'IDENTITY_VERIFIED', now);
  await recordResolution(identity, verified.id, initialResolution, now);
  const observation = await recordObservation(identity, input, initialResolution, now, verified.id, null);
  return {
    prospect: verified,
    identity: {
      ...initialResolution,
      deduplicated: false,
      canonicalProspectId: verified.id,
      pendingProspectId: null,
      aliasProspectId: null,
    },
    observation,
  };
}

export async function resolvePendingProspectIdentity(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
  decision: { type: 'LINK_TO_EXISTING'; canonicalProspectId: string } | { type: 'KEEP_DISTINCT' },
  now: string,
) {
  const prospects = new ProspectRepository(db);
  const identity = new IdentityRepository(db);
  const pending = await prospects.getByIdForUser(prospectId, userId);
  if (!pending) throw new ProspectIdentityError('NOT_FOUND', 'Prospect not found.');
  if (pending.currentState !== 'IDENTITY_PENDING') {
    throw new ProspectIdentityError('IDENTITY_NOT_PENDING', 'Only identity-pending prospects can be resolved.');
  }

  if (decision.type === 'LINK_TO_EXISTING') {
    if (decision.canonicalProspectId === pending.id) {
      throw new ProspectIdentityError('IDENTITY_SELF_LINK', 'A prospect cannot be linked to itself.');
    }
    const canonical = await prospects.getByIdForUser(decision.canonicalProspectId, userId);
    if (!canonical || !isCanonicalState(canonical.currentState)) {
      throw new ProspectIdentityError('CANONICAL_NOT_FOUND', 'Selected canonical prospect is not available.');
    }
    const duplicate = await prospects.transition(pending.id, 'DUPLICATE', now);
    const alias = await identity.createAlias({
      duplicateProspectId: duplicate.id,
      canonicalProspectId: canonical.id,
      userId,
      reasonCode: 'OPERATOR_CONFIRMED_DUPLICATE',
      confidence: 1,
      createdAt: now,
    });
    const resolution: IdentityResolution = {
      status: 'EXACT_MATCH',
      confidence: 1,
      candidateProspectIds: [canonical.id],
      matchedKeys: [],
      reasonCodes: ['OPERATOR_CONFIRMED_DUPLICATE'],
    };
    await recordResolution(identity, duplicate.id, resolution, now, 'MANUAL_LINKED');
    const input: IncomingProspectIdentity = {
      userId,
      campaignId: pending.campaignId,
      canonicalName: pending.canonicalName,
      normalizedName: pending.normalizedName,
      domain: pending.domain,
      phoneNormalized: pending.phoneNormalized,
      city: pending.city,
      addressNormalized: pending.addressNormalized ?? null,
      niche: pending.niche,
      sourceType: 'MANUAL_REVIEW',
    };
    const observation = await recordObservation(identity, input, resolution, now, canonical.id, null, 'MANUAL_REVIEW');
    return { prospect: duplicate, canonical, alias, observation, decision: 'LINK_TO_EXISTING' as const };
  }

  const keys = buildIdentityKeys({
    normalizedName: pending.normalizedName,
    domain: pending.domain,
    phoneNormalized: pending.phoneNormalized,
    city: pending.city,
    addressNormalized: pending.addressNormalized ?? null,
  });
  const resolution = resolveIdentity(keys, await identity.findCandidateMatches(userId, keys));
  if (resolution.status === 'EXACT_MATCH' || resolution.status === 'CONFLICT') {
    throw new ProspectIdentityError(
      'STRONG_IDENTITY_COLLISION',
      'A verified domain or phone already belongs to another canonical prospect. Correct the pending record or link it to the existing business.',
    );
  }

  await identity.registerCanonicalKeys(keyRecords(userId, pending.id, keys, 'MANUAL_REVIEW', now));
  const verified = await prospects.transition(pending.id, 'IDENTITY_VERIFIED', now);
  const distinctResolution: IdentityResolution = {
    status: 'NEW_CANONICAL',
    confidence: 1,
    candidateProspectIds: resolution.candidateProspectIds,
    matchedKeys: resolution.matchedKeys,
    reasonCodes: ['OPERATOR_CONFIRMED_DISTINCT'],
  };
  await recordResolution(identity, verified.id, distinctResolution, now, 'MANUAL_DISTINCT');
  const input: IncomingProspectIdentity = {
    userId,
    campaignId: verified.campaignId,
    canonicalName: verified.canonicalName,
    normalizedName: verified.normalizedName,
    domain: verified.domain,
    phoneNormalized: verified.phoneNormalized,
    city: verified.city,
    addressNormalized: verified.addressNormalized ?? null,
    niche: verified.niche,
    sourceType: 'MANUAL_REVIEW',
  };
  const observation = await recordObservation(identity, input, distinctResolution, now, verified.id, null, 'MANUAL_REVIEW');
  return { prospect: verified, canonical: verified, alias: null, observation, decision: 'KEEP_DISTINCT' as const };
}
