export const TEMPLATE_SECTION_IDS = [
  'hero',
  'services',
  'services-fallback',
  'story',
  'gallery',
  'contact',
  'contact-fallback',
  'disclosure',
] as const;

export type TemplateSectionId = (typeof TEMPLATE_SECTION_IDS)[number];

export const THEME_DNA_OPTIONS = {
  paletteId: ['obsidian-ivory', 'warm-stone'] as const,
  typographyId: ['editorial-serif', 'modern-contrast'] as const,
  radius: ['sharp', 'soft', 'rounded'] as const,
  density: ['airy', 'balanced', 'dense'] as const,
  heroVariant: ['editorial', 'split', 'immersive'] as const,
  imageTreatment: ['full-bleed', 'framed', 'collage'] as const,
  motionPreset: ['subtle', 'editorial', 'luxury'] as const,
} as const;

export type ThemeDNA = {
  readonly paletteId: (typeof THEME_DNA_OPTIONS.paletteId)[number];
  readonly typographyId: (typeof THEME_DNA_OPTIONS.typographyId)[number];
  readonly radius: (typeof THEME_DNA_OPTIONS.radius)[number];
  readonly density: (typeof THEME_DNA_OPTIONS.density)[number];
  readonly heroVariant: (typeof THEME_DNA_OPTIONS.heroVariant)[number];
  readonly imageTreatment: (typeof THEME_DNA_OPTIONS.imageTreatment)[number];
  readonly motionPreset: (typeof THEME_DNA_OPTIONS.motionPreset)[number];
};

export type TemplateDefinition = {
  readonly id: string;
  readonly niche: string;
  readonly archetype: string;
  readonly version: string;
  readonly supportedSections: readonly TemplateSectionId[];
  readonly supportedFields: readonly string[];
  readonly requiredFields: readonly string[];
  readonly themeCapabilities: readonly (keyof ThemeDNA)[];
  readonly defaultTheme: ThemeDNA;
  readonly noindexSupported: boolean;
  readonly conceptDisclosureRequired: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === 'string' && options.includes(value as T[number]);
}

export function isThemeDNA(value: unknown): value is ThemeDNA {
  if (!isRecord(value)) return false;
  return (
    isOneOf(value.paletteId, THEME_DNA_OPTIONS.paletteId) &&
    isOneOf(value.typographyId, THEME_DNA_OPTIONS.typographyId) &&
    isOneOf(value.radius, THEME_DNA_OPTIONS.radius) &&
    isOneOf(value.density, THEME_DNA_OPTIONS.density) &&
    isOneOf(value.heroVariant, THEME_DNA_OPTIONS.heroVariant) &&
    isOneOf(value.imageTreatment, THEME_DNA_OPTIONS.imageTreatment) &&
    isOneOf(value.motionPreset, THEME_DNA_OPTIONS.motionPreset)
  );
}

export function parseThemeDNA(value: unknown): ThemeDNA {
  if (!isThemeDNA(value)) throw new Error('Invalid ThemeDNA payload.');
  return value;
}

export const SALON_TEMPLATE_V1 = {
  id: 'salon-editorial',
  niche: 'salon-and-spa',
  archetype: 'premium-local-service',
  version: '1.0.0',
  supportedSections: [
    'hero',
    'services',
    'services-fallback',
    'story',
    'gallery',
    'contact',
    'contact-fallback',
    'disclosure',
  ],
  supportedFields: [
    'business.name',
    'business.descriptor',
    'business.city',
    'hero.eyebrow',
    'hero.headline',
    'hero.subhead',
    'services',
    'story.kicker',
    'story.headline',
    'story.body',
    'gallery',
    'contact.phone',
    'contact.address',
    'contact.hours',
    'disclosure.text',
  ],
  requiredFields: ['business.name', 'hero.headline', 'disclosure.text'],
  themeCapabilities: [
    'paletteId',
    'typographyId',
    'radius',
    'density',
    'heroVariant',
    'imageTreatment',
    'motionPreset',
  ],
  defaultTheme: {
    paletteId: 'obsidian-ivory',
    typographyId: 'editorial-serif',
    radius: 'soft',
    density: 'airy',
    heroVariant: 'editorial',
    imageTreatment: 'collage',
    motionPreset: 'luxury',
  },
  noindexSupported: true,
  conceptDisclosureRequired: true,
} as const satisfies TemplateDefinition;

export const TEMPLATE_REGISTRY: readonly TemplateDefinition[] = [SALON_TEMPLATE_V1];

export function findTemplateDefinition(id: string, version?: string): TemplateDefinition | null {
  return (
    TEMPLATE_REGISTRY.find(
      (template) => template.id === id && (version === undefined || template.version === version),
    ) ?? null
  );
}
