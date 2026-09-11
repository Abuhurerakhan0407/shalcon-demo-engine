import type { EvidenceRecord } from '@shalcon/db';
import {
  TEMPLATE_REGISTRY,
  THEME_DNA_OPTIONS,
  findTemplateDefinition,
  parseThemeDNA,
  type TemplateDefinition,
  type ThemeDNA,
} from '@shalcon/templates';

export const BRAND_PROFILE_VERSION = 'brand-profile.v1' as const;
export const TEMPLATE_MATCHER_VERSION = 'template-matcher.v1' as const;

export type BrandPositioning =
  | 'luxury'
  | 'premium'
  | 'modern'
  | 'friendly'
  | 'minimal'
  | 'traditional'
  | 'unknown';

export interface BrandProfileDraft {
  positioning: BrandPositioning;
  confidence: number;
  detectedColors: string[];
  recommendedThemeIds: string[];
  recommendedArchetypeIds: string[];
  evidenceIds: string[];
  safeDefault: boolean;
}

export interface TemplateMatchSignals {
  niche: string;
  brandProfile: BrandProfileDraft;
  verifiedServiceCount: number;
  contentEvidenceIds: readonly string[];
  officialAssetCount: number;
  websiteOpportunity: 'SKIP_DEMO' | 'LOW_PRIORITY' | 'DEMO_WORTHY' | 'RESEARCH_NEEDED' | null;
  auditRunId: string | null;
}

export interface TemplateCandidateEvaluation {
  templateId: string;
  templateVersion: string;
  archetype: string;
  themeDNA: ThemeDNA;
  fitScore: number;
  confidence: number;
  reasons: string[];
  evidenceIds: string[];
  auditRunId: string | null;
  safeDefault: boolean;
  sparseContentMode: boolean;
}

const POSITIONING_FIELDS = new Set([
  'brandpositioning',
  'positioning',
  'brandtone',
  'businessdescription',
  'description',
]);
const COLOR_FIELDS = new Set([
  'brandcolor',
  'brandcolors',
  'logocolor',
  'logocolors',
  'primarycolor',
  'colorpalette',
]);
const POSITIONINGS: readonly Exclude<BrandPositioning, 'unknown'>[] = [
  'luxury',
  'premium',
  'modern',
  'friendly',
  'minimal',
  'traditional',
];
const NAMED_COLORS = [
  'black',
  'white',
  'gold',
  'silver',
  'beige',
  'cream',
  'brown',
  'pink',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'grey',
  'gray',
] as const;

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/gu, '');
}

function canonicalNiche(value: string): string {
  const compact = normalized(value);
  if (compact === 'salonandspa' || compact === 'salonspa') return 'salonspa';
  return compact;
}

function usableEvidence(item: EvidenceRecord): boolean {
  return item.verificationStatus !== 'REJECTED' && item.verificationStatus !== 'CONFLICTED';
}

function containsWord(value: string, word: string): boolean {
  return new RegExp(`(?:^|[^a-z])${word}(?:$|[^a-z])`, 'iu').test(value);
}

function explicitColors(value: string): string[] {
  const colors = new Set<string>();
  for (const match of value.matchAll(/#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?\b/giu)) {
    colors.add(match[0].toLowerCase());
  }
  const lower = value.toLowerCase();
  for (const color of NAMED_COLORS) {
    if (containsWord(lower, color)) colors.add(color === 'gray' ? 'grey' : color);
  }
  return [...colors];
}

function eligibleRegistry(niche: string): TemplateDefinition[] {
  const normalizedNiche = canonicalNiche(niche);
  return TEMPLATE_REGISTRY.filter((template) => canonicalNiche(template.niche) === normalizedNiche);
}

export function inferBrandProfile(
  evidence: readonly EvidenceRecord[],
  niche: string,
): BrandProfileDraft {
  const usable = evidence.filter(usableEvidence);
  const evidenceIds = new Set<string>();
  let positioning: BrandPositioning = 'unknown';
  let positioningConfidence = 0;

  for (const item of usable) {
    if (!POSITIONING_FIELDS.has(normalized(item.field))) continue;
    const match = POSITIONINGS.find((candidate) => containsWord(item.value.toLowerCase(), candidate));
    if (!match) continue;
    if (item.confidence >= positioningConfidence) {
      positioning = match;
      positioningConfidence = item.confidence;
    }
    evidenceIds.add(item.id);
  }

  const colors = new Set<string>();
  let colorConfidence = 0;
  for (const item of usable) {
    if (!COLOR_FIELDS.has(normalized(item.field))) continue;
    const found = explicitColors(item.value);
    if (found.length === 0) continue;
    found.forEach((color) => colors.add(color));
    colorConfidence = Math.max(colorConfidence, item.confidence);
    evidenceIds.add(item.id);
  }

  const eligible = eligibleRegistry(niche);
  const recommendedThemeIds = [
    ...new Set(eligible.map((template) => template.defaultTheme.paletteId)),
  ];
  const recommendedArchetypeIds = [...new Set(eligible.map((template) => template.archetype))];
  const safeDefault = positioning === 'unknown' && colors.size === 0;
  const confidence = safeDefault
    ? 0.2
    : Math.max(0.35, Math.min(1, Math.max(positioningConfidence, colorConfidence)));

  return {
    positioning,
    confidence,
    detectedColors: [...colors],
    recommendedThemeIds,
    recommendedArchetypeIds,
    evidenceIds: [...evidenceIds],
    safeDefault,
  };
}

function compatibleTheme(
  template: TemplateDefinition,
  profile: BrandProfileDraft,
  sparseContentMode: boolean,
): ThemeDNA {
  const base = template.defaultTheme;
  if (sparseContentMode) {
    return parseThemeDNA({
      ...base,
      density: 'balanced',
      heroVariant: 'split',
      imageTreatment: 'framed',
      motionPreset: 'subtle',
    });
  }
  if (profile.positioning === 'modern' || profile.positioning === 'minimal') {
    return parseThemeDNA({
      ...base,
      typographyId: 'modern-contrast',
      radius: profile.positioning === 'minimal' ? 'sharp' : 'soft',
      imageTreatment: 'framed',
      motionPreset: 'subtle',
    });
  }
  return base;
}

function candidateScore(template: TemplateDefinition, signals: TemplateMatchSignals): number {
  if (canonicalNiche(template.niche) !== canonicalNiche(signals.niche)) return 0;
  let score = 50;
  score += Math.min(20, Math.max(0, signals.verifiedServiceCount) * 5);
  if (signals.brandProfile.evidenceIds.length > 0) score += 10;
  if (signals.officialAssetCount > 0) score += 10;
  if (signals.websiteOpportunity === 'DEMO_WORTHY') score += 5;
  else if (signals.websiteOpportunity === 'LOW_PRIORITY') score += 3;
  return Math.min(100, score);
}

export function evaluateTemplateCandidate(
  template: TemplateDefinition,
  signals: TemplateMatchSignals,
): TemplateCandidateEvaluation {
  if (canonicalNiche(template.niche) !== canonicalNiche(signals.niche)) {
    throw new Error('Template is not eligible for this prospect niche.');
  }
  const sparseContentMode = signals.verifiedServiceCount < 3 || signals.officialAssetCount === 0;
  const safeDefault = signals.brandProfile.safeDefault;
  const themeDNA = compatibleTheme(template, signals.brandProfile, sparseContentMode);
  const fitScore = candidateScore(template, signals);
  const reasons = [
    `Template ${template.id}@${template.version} is registered for the prospect niche.`,
    signals.verifiedServiceCount > 0
      ? `${signals.verifiedServiceCount} verified service${signals.verifiedServiceCount === 1 ? '' : 's'} can populate the supported service layout.`
      : 'No verified services are available, so the template must rely on its documented sparse-data fallbacks.',
    sparseContentMode
      ? 'Sparse content or missing official imagery activates a restrained compatible layout instead of inventing content.'
      : 'Available verified content and official assets support the standard registered layout.',
    safeDefault
      ? 'No explicit brand positioning or color evidence was found; the registered template default is used without inventing a palette story.'
      : `Brand choices are limited to explicit source-backed signals; positioning is ${signals.brandProfile.positioning}.`,
  ];
  if (signals.brandProfile.detectedColors.length > 0) {
    reasons.push('Observed colors are recorded as evidence, but no unregistered palette values are generated from them.');
  }
  if (signals.websiteOpportunity) {
    reasons.push(`The evidence-backed website audit recommendation is ${signals.websiteOpportunity}.`);
  }
  const evidenceIds = [
    ...new Set([...signals.brandProfile.evidenceIds, ...signals.contentEvidenceIds]),
  ];
  const confidence = Math.max(
    0.25,
    Math.min(1, 0.45 + (signals.verifiedServiceCount > 0 ? 0.2 : 0) + (safeDefault ? 0 : 0.2) + (signals.officialAssetCount > 0 ? 0.15 : 0)),
  );
  return {
    templateId: template.id,
    templateVersion: template.version,
    archetype: template.archetype,
    themeDNA,
    fitScore,
    confidence,
    reasons,
    evidenceIds,
    auditRunId: signals.auditRunId,
    safeDefault,
    sparseContentMode,
  };
}

export function selectTemplateForBrand(signals: TemplateMatchSignals): TemplateCandidateEvaluation {
  const eligible = eligibleRegistry(signals.niche);
  if (eligible.length === 0) throw new Error('No registered template is eligible for this prospect niche.');
  const evaluated = eligible.map((template) => evaluateTemplateCandidate(template, signals));
  evaluated.sort((a, b) => b.fitScore - a.fitScore || a.templateId.localeCompare(b.templateId));
  const selected = evaluated[0];
  if (!selected) throw new Error('No registered template is eligible for this prospect niche.');
  return selected;
}

export function validateManualTemplateSelection(
  niche: string,
  templateId: string,
  templateVersion: string,
  themeDNA: unknown,
): { template: TemplateDefinition; themeDNA: ThemeDNA } {
  const template = findTemplateDefinition(templateId, templateVersion);
  if (!template) throw new Error('Manual selection must use an allowed template registry entry.');
  if (canonicalNiche(template.niche) !== canonicalNiche(niche)) {
    throw new Error('Manual selection template is not eligible for this prospect niche.');
  }
  return { template, themeDNA: parseThemeDNA(themeDNA) };
}

export function publicTemplateRegistry() {
  return {
    templates: TEMPLATE_REGISTRY.map((template) => ({
      id: template.id,
      version: template.version,
      niche: template.niche,
      archetype: template.archetype,
      defaultTheme: template.defaultTheme,
      requiredFields: [...template.requiredFields],
    })),
    themeOptions: {
      paletteId: [...THEME_DNA_OPTIONS.paletteId],
      typographyId: [...THEME_DNA_OPTIONS.typographyId],
      radius: [...THEME_DNA_OPTIONS.radius],
      density: [...THEME_DNA_OPTIONS.density],
      heroVariant: [...THEME_DNA_OPTIONS.heroVariant],
      imageTreatment: [...THEME_DNA_OPTIONS.imageTreatment],
      motionPreset: [...THEME_DNA_OPTIONS.motionPreset],
    },
  };
}
