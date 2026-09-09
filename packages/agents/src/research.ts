export type ResearchPageRole =
  | 'HOME'
  | 'SERVICES'
  | 'CONTACT'
  | 'ABOUT'
  | 'BOOKING'
  | 'LOCATION'
  | 'HOURS'
  | 'OTHER';

export interface ResearchSourceInput {
  sourceId: string;
  url: string;
  title: string;
  text: string;
  provider: string;
  sourceType: string;
}

export interface PrioritizedResearchSource extends ResearchSourceInput {
  role: ResearchPageRole;
  priority: number;
  rank: number;
}

export interface BusinessExtraction {
  businessName: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  openingHours: string[];
  services: string[];
  socialLinks: string[];
}

export interface AutomatedEvidenceCandidate {
  field: string;
  value: string;
  confidence: number;
  verificationStatus: 'PROBABLE' | 'UNVERIFIED';
}

export interface ResearchConflict {
  field: string;
  values: string[];
  critical: boolean;
}

const ROLE_PATTERNS: ReadonlyArray<{
  role: ResearchPageRole;
  score: number;
  patterns: readonly RegExp[];
}> = [
  { role: 'CONTACT', score: 100, patterns: [/contact/u, /reach-us/u, /get-in-touch/u] },
  { role: 'SERVICES', score: 95, patterns: [/services?/u, /treatments?/u, /menu/u] },
  { role: 'BOOKING', score: 90, patterns: [/book/u, /appointment/u, /reserve/u] },
  { role: 'LOCATION', score: 85, patterns: [/location/u, /find-us/u, /directions/u] },
  { role: 'HOURS', score: 82, patterns: [/hours?/u, /opening/u, /timings?/u] },
  { role: 'ABOUT', score: 75, patterns: [/about/u, /our-story/u, /who-we-are/u] },
];

function normalizedHaystack(source: ResearchSourceInput): string {
  return `${source.url} ${source.title}`.toLocaleLowerCase('en-US');
}

export function classifyResearchPage(source: ResearchSourceInput): ResearchPageRole {
  const haystack = normalizedHaystack(source);
  for (const rule of ROLE_PATTERNS) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) return rule.role;
  }
  try {
    const url = new URL(source.url);
    if (url.pathname === '/' || url.pathname === '') return 'HOME';
  } catch {
    return 'OTHER';
  }
  return 'OTHER';
}

export function scoreResearchPage(source: ResearchSourceInput): number {
  const role = classifyResearchPage(source);
  const ruleScore = ROLE_PATTERNS.find((rule) => rule.role === role)?.score ?? (role === 'HOME' ? 88 : 40);
  const textScore = Math.min(12, Math.floor(source.text.trim().length / 2500));
  const officialBonus = source.provider === 'PLAYWRIGHT' && source.sourceType === 'WEBSITE_PAGE' ? 5 : 0;
  return Math.min(120, ruleScore + textScore + officialBonus);
}

export function prioritizeResearchSources(
  sources: readonly ResearchSourceInput[],
  limit = 6,
): PrioritizedResearchSource[] {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 6));
  return sources
    .filter((source) => source.text.trim().length > 0)
    .map((source) => ({ ...source, role: classifyResearchPage(source), priority: scoreResearchPage(source) }))
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        left.url.localeCompare(right.url),
    )
    .slice(0, safeLimit)
    .map((source, index) => ({ ...source, rank: index + 1 }));
}

function confidenceFor(field: string, role: ResearchPageRole): number {
  const aligned =
    (field === 'service' && role === 'SERVICES') ||
    ((field === 'phone' || field === 'email') && role === 'CONTACT') ||
    (field === 'address' && (role === 'CONTACT' || role === 'LOCATION')) ||
    (field === 'openingHours' && (role === 'HOURS' || role === 'CONTACT')) ||
    (field === 'socialLink' && (role === 'CONTACT' || role === 'HOME')) ||
    (field === 'businessName' && role === 'HOME');
  return aligned ? 0.9 : 0.78;
}

function candidate(field: string, value: string, role: ResearchPageRole): AutomatedEvidenceCandidate | null {
  const cleaned = value.trim();
  if (!cleaned || cleaned.toLocaleLowerCase('en-US') === 'null') return null;
  const confidence = confidenceFor(field, role);
  return {
    field,
    value: cleaned,
    confidence,
    verificationStatus: confidence >= 0.8 ? 'PROBABLE' : 'UNVERIFIED',
  };
}

export function extractionToEvidenceCandidates(
  extraction: BusinessExtraction,
  role: ResearchPageRole,
): AutomatedEvidenceCandidate[] {
  const results: AutomatedEvidenceCandidate[] = [];
  const scalarPairs: Array<[string, string | null]> = [
    ['businessName', extraction.businessName],
    ['description', extraction.description],
    ['phone', extraction.phone],
    ['email', extraction.email],
    ['address', extraction.address],
  ];
  for (const [field, value] of scalarPairs) {
    if (value === null) continue;
    const item = candidate(field, value, role);
    if (item) results.push(item);
  }
  for (const value of extraction.openingHours) {
    const item = candidate('openingHours', value, role);
    if (item) results.push(item);
  }
  for (const value of extraction.services) {
    const item = candidate('service', value, role);
    if (item) results.push(item);
  }
  for (const value of extraction.socialLinks) {
    const item = candidate('socialLink', value, role);
    if (item) results.push(item);
  }
  return results;
}

const CRITICAL_FIELDS = new Set(['businessName', 'phone', 'address']);
const MULTI_VALUE_FIELDS = new Set(['service', 'openingHours', 'socialLink']);

function normalizeCandidateValue(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-IN');
}

export function detectResearchConflicts(
  candidates: readonly Pick<AutomatedEvidenceCandidate, 'field' | 'value'>[],
): ResearchConflict[] {
  const byField = new Map<string, Set<string>>();
  for (const item of candidates) {
    if (MULTI_VALUE_FIELDS.has(item.field)) continue;
    const values = byField.get(item.field) ?? new Set<string>();
    values.add(normalizeCandidateValue(item.value));
    byField.set(item.field, values);
  }
  return [...byField.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([field, values]) => ({
      field,
      values: [...values].sort(),
      critical: CRITICAL_FIELDS.has(field),
    }))
    .sort((left, right) => Number(right.critical) - Number(left.critical) || left.field.localeCompare(right.field));
}

export function hasCriticalResearchConflict(conflicts: readonly ResearchConflict[]): boolean {
  return conflicts.some((conflict) => conflict.critical);
}
