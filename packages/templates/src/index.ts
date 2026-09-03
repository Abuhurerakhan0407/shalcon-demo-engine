export const TEMPLATE_SECTION_IDS = [
  'hero',
  'belief',
  'rituals',
  'services-fallback',
  'interlude',
  'finder',
  'process',
  'space',
  'testimonials',
  'faq',
  'booking',
  'contact-fallback',
  'disclosure',
] as const;

export type TemplateSectionId = (typeof TEMPLATE_SECTION_IDS)[number];

export const THEME_DNA_OPTIONS = {
  paletteId: ['elane-paper', 'warm-stone'] as const,
  typographyId: ['instrument-editorial', 'modern-contrast'] as const,
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
  readonly sourceFingerprint: string;
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
  return typeof value === 'string' && options.some((option) => option === value);
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

export const ELANE_V8_TEMPLATE = {
  id: 'elane-v8',
  niche: 'salon-and-spa',
  archetype: 'premium-cinematic-salon-spa',
  version: '8.0.0',
  sourceFingerprint: 'ed9e8d651e0d24a759968f10febdb43d8ea7d036e53727d3cee8521ad7886dbf',
  supportedSections: [
    'hero',
    'belief',
    'rituals',
    'services-fallback',
    'interlude',
    'finder',
    'process',
    'space',
    'testimonials',
    'faq',
    'booking',
    'contact-fallback',
    'disclosure',
  ],
  supportedFields: [
    'business.name',
    'business.descriptor',
    'business.city',
    'business.area',
    'hero.eyebrow',
    'hero.headline',
    'hero.accentHeadline',
    'hero.resolveHeadline',
    'hero.resolveAccentHeadline',
    'hero.subhead',
    'hero.primaryCtaLabel',
    'belief.headline',
    'belief.body',
    'services',
    'finderOptions',
    'process',
    'space',
    'testimonials',
    'faq',
    'contact.phone',
    'contact.whatsapp',
    'contact.email',
    'contact.address',
    'contact.hoursSummary',
    'contact.bookingUrl',
    'images',
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
    paletteId: 'elane-paper',
    typographyId: 'instrument-editorial',
    radius: 'soft',
    density: 'airy',
    heroVariant: 'editorial',
    imageTreatment: 'collage',
    motionPreset: 'luxury',
  },
  noindexSupported: true,
  conceptDisclosureRequired: true,
} as const satisfies TemplateDefinition;

export const TEMPLATE_REGISTRY: readonly TemplateDefinition[] = [ELANE_V8_TEMPLATE];

export function findTemplateDefinition(id: string, version?: string): TemplateDefinition | null {
  return (
    TEMPLATE_REGISTRY.find(
      (template) => template.id === id && (version === undefined || template.version === version),
    ) ?? null
  );
}
