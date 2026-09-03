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
