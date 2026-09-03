export const IDENTITY_KEY_TYPES = ['DOMAIN', 'PHONE', 'NAME_CITY', 'ADDRESS_CITY'] as const;
export type IdentityKeyType = (typeof IDENTITY_KEY_TYPES)[number];

export const STRONG_IDENTITY_KEY_TYPES = ['DOMAIN', 'PHONE'] as const satisfies readonly IdentityKeyType[];
export type StrongIdentityKeyType = (typeof STRONG_IDENTITY_KEY_TYPES)[number];

export type IdentityResolutionStatus =
  | 'NEW_CANONICAL'
  | 'EXACT_MATCH'
  | 'REVIEW_REQUIRED'
  | 'CONFLICT';

export interface IdentityKey {
  type: IdentityKeyType;
  value: string;
}

export interface IdentityProfile {
  normalizedName: string;
  domain: string | null;
  phoneNormalized: string | null;
  city: string | null;
  addressNormalized: string | null;
}

export interface IdentityCandidateMatch {
  prospectId: string;
  keyType: IdentityKeyType;
  keyValue: string;
}

export interface IdentityResolution {
  status: IdentityResolutionStatus;
  confidence: number;
  candidateProspectIds: string[];
  matchedKeys: IdentityKey[];
  reasonCodes: string[];
}

function composite(...parts: Array<string | null>): string | null {
  if (parts.some((part) => !part)) return null;
  return parts.join('|');
}

export function buildIdentityKeys(profile: IdentityProfile): IdentityKey[] {
  const keys: IdentityKey[] = [];
  if (profile.domain) keys.push({ type: 'DOMAIN', value: profile.domain });
  if (profile.phoneNormalized) keys.push({ type: 'PHONE', value: profile.phoneNormalized });

  const nameCity = composite(profile.normalizedName, profile.city);
  if (nameCity) keys.push({ type: 'NAME_CITY', value: nameCity });

  const addressCity = composite(profile.addressNormalized, profile.city);
  if (addressCity) keys.push({ type: 'ADDRESS_CITY', value: addressCity });

  return keys;
}

function isStrong(type: IdentityKeyType): type is StrongIdentityKeyType {
  return (STRONG_IDENTITY_KEY_TYPES as readonly IdentityKeyType[]).includes(type);
}

export function resolveIdentity(
  incomingKeys: readonly IdentityKey[],
  candidateMatches: readonly IdentityCandidateMatch[],
): IdentityResolution {
  const incoming = new Set(incomingKeys.map((key) => `${key.type}:${key.value}`));
  const relevantMatches = candidateMatches.filter((candidate) =>
    incoming.has(`${candidate.keyType}:${candidate.keyValue}`),
  );

  const matchedKeys = incomingKeys.filter((key) =>
    relevantMatches.some(
      (candidate) => candidate.keyType === key.type && candidate.keyValue === key.value,
    ),
  );

  const strongMatches = relevantMatches.filter((candidate) => isStrong(candidate.keyType));
  const strongProspectIds = [...new Set(strongMatches.map((candidate) => candidate.prospectId))].sort();

  if (strongProspectIds.length > 1) {
    return {
      status: 'CONFLICT',
      confidence: 0,
      candidateProspectIds: strongProspectIds,
      matchedKeys,
      reasonCodes: ['STRONG_IDENTIFIERS_DISAGREE'],
    };
  }

  if (strongProspectIds.length === 1) {
    const prospectId = strongProspectIds[0];
    if (!prospectId) throw new Error('Strong identity match is missing a prospect id.');
    const strongTypes = new Set(
      strongMatches.filter((match) => match.prospectId === prospectId).map((match) => match.keyType),
    );
    return {
      status: 'EXACT_MATCH',
      confidence: strongTypes.has('DOMAIN') && strongTypes.has('PHONE') ? 1 : 0.99,
      candidateProspectIds: [prospectId],
      matchedKeys,
      reasonCodes: [strongTypes.has('DOMAIN') ? 'DOMAIN_EXACT' : 'PHONE_EXACT'],
    };
  }

  const weakProspectIds = [...new Set(relevantMatches.map((candidate) => candidate.prospectId))].sort();
  if (weakProspectIds.length > 0) {
    return {
      status: 'REVIEW_REQUIRED',
      confidence: 0.65,
      candidateProspectIds: weakProspectIds,
      matchedKeys,
      reasonCodes: ['COMPOSITE_MATCH_REQUIRES_REVIEW'],
    };
  }

  return {
    status: 'NEW_CANONICAL',
    confidence: 1,
    candidateProspectIds: [],
    matchedKeys: [],
    reasonCodes: ['NO_EXISTING_IDENTITY_MATCH'],
  };
}
