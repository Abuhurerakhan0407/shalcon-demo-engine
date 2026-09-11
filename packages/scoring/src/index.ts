export const DEMO_WORTHINESS_MAX_POINTS = {
  businessNicheFit: 20,
  websiteNeed: 25,
  verifiedData: 15,
  brandSignals: 10,
  abilityToPaySignals: 15,
  contactability: 10,
  recentActivity: 5,
} as const;

export type DemoWorthinessComponentKey = keyof typeof DEMO_WORTHINESS_MAX_POINTS;
export type ScoreReferenceKind = 'EVIDENCE' | 'AUDIT_RUN' | 'SOURCE';
export type DemoWorthinessBand = 'PRIORITY_DEMO' | 'GENERATE_DEMO' | 'RESEARCH_MORE' | 'SKIP';
export type DemoWorthinessDecision = 'DEMO_QUALIFIED' | 'RESEARCH_MORE' | 'REJECTED';

export interface ScoreReference {
  kind: ScoreReferenceKind;
  id: string;
}

export interface DemoWorthinessSignals {
  nicheMatched: boolean;
  nicheReferences: readonly ScoreReference[];
  websiteRecommendation: 'SKIP_DEMO' | 'LOW_PRIORITY' | 'DEMO_WORTHY' | 'RESEARCH_NEEDED' | null;
  websiteReferences: readonly ScoreReference[];
  verifiedDataReferences: readonly ScoreReference[];
  brandSignalReferences: readonly ScoreReference[];
  abilityToPaySignalReferences: readonly ScoreReference[];
  directContactReferences: readonly ScoreReference[];
  socialContactReferences: readonly ScoreReference[];
  recentActivityReferences: readonly ScoreReference[];
}

export interface DemoWorthinessComponentResult {
  key: DemoWorthinessComponentKey;
  points: number;
  maxPoints: number;
  references: ScoreReference[];
  reason: string;
}

export interface DemoWorthinessScore {
  total: number;
  band: DemoWorthinessBand;
  decision: DemoWorthinessDecision;
  components: Record<DemoWorthinessComponentKey, DemoWorthinessComponentResult>;
}

function uniqueReferences(input: readonly ScoreReference[]): ScoreReference[] {
  const seen = new Set<string>();
  const output: ScoreReference[] = [];
  for (const item of input) {
    const id = item.id.trim();
    if (!id) continue;
    const key = `${item.kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ kind: item.kind, id });
  }
  return output;
}

function component(
  key: DemoWorthinessComponentKey,
  points: number,
  refs: readonly ScoreReference[],
  reason: string,
): DemoWorthinessComponentResult {
  const references = uniqueReferences(refs);
  const maxPoints = DEMO_WORTHINESS_MAX_POINTS[key];
  const safePoints = references.length === 0 ? 0 : Math.max(0, Math.min(maxPoints, Math.round(points)));
  return {
    key,
    points: safePoints,
    maxPoints,
    references,
    reason: safePoints === 0 && references.length === 0 ? 'No supporting evidence is available, so this component receives 0 points.' : reason,
  };
}

export function classifyDemoWorthiness(total: number): {
  band: DemoWorthinessBand;
  decision: DemoWorthinessDecision;
} {
  const score = Math.max(0, Math.min(100, Math.round(total)));
  if (score >= 85) return { band: 'PRIORITY_DEMO', decision: 'DEMO_QUALIFIED' };
  if (score >= 70) return { band: 'GENERATE_DEMO', decision: 'DEMO_QUALIFIED' };
  if (score >= 50) return { band: 'RESEARCH_MORE', decision: 'RESEARCH_MORE' };
  return { band: 'SKIP', decision: 'REJECTED' };
}

function websiteNeedPoints(
  recommendation: DemoWorthinessSignals['websiteRecommendation'],
): number {
  if (recommendation === 'DEMO_WORTHY') return 25;
  if (recommendation === 'LOW_PRIORITY') return 12;
  return 0;
}

export function calculateDemoWorthiness(input: DemoWorthinessSignals): DemoWorthinessScore {
  const nicheReferences = uniqueReferences(input.nicheReferences);
  const verifiedReferences = uniqueReferences(input.verifiedDataReferences);
  const brandReferences = uniqueReferences(input.brandSignalReferences);
  const abilityReferences = uniqueReferences(input.abilityToPaySignalReferences);
  const directContactReferences = uniqueReferences(input.directContactReferences);
  const socialContactReferences = uniqueReferences(input.socialContactReferences);
  const recentReferences = uniqueReferences(input.recentActivityReferences);

  const components: Record<DemoWorthinessComponentKey, DemoWorthinessComponentResult> = {
    businessNicheFit: component(
      'businessNicheFit',
      input.nicheMatched ? 20 : 0,
      nicheReferences,
      input.nicheMatched
        ? 'The prospect matches the supported Salon & Spa niche and has source-linked niche evidence.'
        : 'The prospect does not match the supported niche.',
    ),
    websiteNeed: component(
      'websiteNeed',
      websiteNeedPoints(input.websiteRecommendation),
      input.websiteReferences,
      input.websiteRecommendation === 'DEMO_WORTHY'
        ? 'The latest evidence-backed website audit found a strong demo opportunity.'
        : input.websiteRecommendation === 'LOW_PRIORITY'
          ? 'The latest website audit found a lower-priority improvement opportunity.'
          : input.websiteRecommendation === 'SKIP_DEMO'
            ? 'The latest website audit rated the current site strongly enough to skip a demo.'
            : 'The website audit does not yet support opportunity points.',
    ),
    verifiedData: component(
      'verifiedData',
      Math.min(15, verifiedReferences.length * 3),
      verifiedReferences,
      `${verifiedReferences.length} verified, evidence-linked fact${verifiedReferences.length === 1 ? '' : 's'} are available for safe personalization.`,
    ),
    brandSignals: component(
      'brandSignals',
      brandReferences.length >= 2 ? 10 : brandReferences.length === 1 ? 5 : 0,
      brandReferences,
      `${brandReferences.length} source-linked brand or positioning signal${brandReferences.length === 1 ? '' : 's'} are available.`,
    ),
    abilityToPaySignals: component(
      'abilityToPaySignals',
      Math.min(15, abilityReferences.length * 5),
      abilityReferences,
      `${abilityReferences.length} explicit business-capacity signal${abilityReferences.length === 1 ? '' : 's'} are supported by evidence; these are signals, not financial facts.`,
    ),
    contactability: component(
      'contactability',
      directContactReferences.length > 0 ? 10 : socialContactReferences.length > 0 ? 5 : 0,
      directContactReferences.length > 0 ? directContactReferences : socialContactReferences,
      directContactReferences.length > 0
        ? 'At least one evidence-backed direct contact path is available.'
        : 'Only an evidence-backed social contact path is available.',
    ),
    recentActivity: component(
      'recentActivity',
      recentReferences.length > 0 ? 5 : 0,
      recentReferences,
      'Explicit evidence of recent business activity is available.',
    ),
  };

  const total = Object.values(components).reduce((sum, item) => sum + item.points, 0);
  const classification = classifyDemoWorthiness(total);
  return { total, ...classification, components };
}
