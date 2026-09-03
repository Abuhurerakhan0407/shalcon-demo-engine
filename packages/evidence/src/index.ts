export const VERIFICATION_STATUSES = [
  'VERIFIED',
  'PROBABLE',
  'CONFLICTED',
  'UNVERIFIED',
  'REJECTED',
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const SOURCE_QUALITY = {
  OFFICIAL_WEBSITE: 1,
  OFFICIAL_PROFILE: 0.95,
  OFFICIAL_BOOKING: 0.9,
  REPUTABLE_DIRECTORY: 0.8,
  ASSOCIATION_DIRECTORY: 0.75,
  LOCAL_LISTING: 0.65,
  THIRD_PARTY_MENTION: 0.45,
  AI_INFERENCE: 0,
} as const;

export type SourceQualityType = keyof typeof SOURCE_QUALITY;

export interface EvidenceCandidate {
  id: string;
  prospectId: string;
  field: string;
  value: string;
  sourceUrl: string;
  sourceQuality: number;
  confidence: number;
  verificationStatus: VerificationStatus;
}

export interface FieldConflictSummary {
  field: string;
  conflicted: boolean;
  candidates: readonly {
    value: string;
    evidenceIds: readonly string[];
    bestConfidence: number;
    bestSourceQuality: number;
  }[];
}

function cleanWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function normalizeBusinessName(value: string): string {
  return cleanWhitespace(value).toLocaleLowerCase('en-IN');
}

export function normalizeCity(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = cleanWhitespace(value);
  return cleaned.length > 0 ? cleaned.toLocaleLowerCase('en-IN') : null;
}

export function normalizeAddress(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = cleanWhitespace(value)
    .replace(/\s*,\s*/gu, ', ')
    .replace(/\s+-\s+/gu, '-');
  return cleaned.length > 0 ? cleaned.toLocaleLowerCase('en-IN') : null;
}

export function normalizePhone(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const plus = trimmed.startsWith('+') ? '+' : '';
  const digits = trimmed.replace(/\D/gu, '');
  return digits.length >= 7 ? `${plus}${digits}` : null;
}

export function normalizeDomain(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return url.hostname.toLocaleLowerCase('en-US').replace(/^www\./u, '');
  } catch {
    return null;
  }
}

export function normalizePublicUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function summarizeFieldEvidence(
  field: string,
  evidence: readonly EvidenceCandidate[],
): FieldConflictSummary {
  const accepted = evidence.filter(
    (item) => item.field === field && item.verificationStatus !== 'REJECTED',
  );
  const groups = new Map<
    string,
    { evidenceIds: string[]; bestConfidence: number; bestSourceQuality: number }
  >();

  for (const item of accepted) {
    const normalized = cleanWhitespace(item.value).toLocaleLowerCase('en-IN');
    const existing = groups.get(normalized) ?? {
      evidenceIds: [],
      bestConfidence: 0,
      bestSourceQuality: 0,
    };
    existing.evidenceIds.push(item.id);
    existing.bestConfidence = Math.max(existing.bestConfidence, item.confidence);
    existing.bestSourceQuality = Math.max(existing.bestSourceQuality, item.sourceQuality);
    groups.set(normalized, existing);
  }

  const candidates = [...groups.entries()]
    .map(([value, stats]) => ({ value, ...stats }))
    .sort(
      (left, right) =>
        right.bestSourceQuality - left.bestSourceQuality ||
        right.bestConfidence - left.bestConfidence ||
        left.value.localeCompare(right.value),
    );

  return { field, conflicted: candidates.length > 1, candidates };
}

export function canVerifyFact(
  fact: { prospectId: string; field: string; value: string },
  evidence: EvidenceCandidate | undefined,
): boolean {
  return Boolean(
    evidence &&
      evidence.prospectId === fact.prospectId &&
      evidence.field === fact.field &&
      evidence.value === fact.value &&
      evidence.verificationStatus === 'VERIFIED',
  );
}

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
