export type TemplateDefinition = {
  readonly id: string;
  readonly niche: string;
  readonly archetype: string;
  readonly version: string;
  readonly supportedSections: readonly string[];
  readonly supportedFields: readonly string[];
  readonly requiredFields: readonly string[];
  readonly themeCapabilities: readonly string[];
};

export type ThemeDNA = {
  readonly paletteId: string;
  readonly typographyId: string;
  readonly radius: 'sharp' | 'soft' | 'rounded';
  readonly density: 'airy' | 'balanced' | 'dense';
  readonly heroVariant: 'editorial' | 'split' | 'immersive';
  readonly imageTreatment: 'full-bleed' | 'framed' | 'collage';
  readonly motionPreset: 'subtle' | 'editorial' | 'luxury';
};

export const TEMPLATE_REGISTRY: readonly TemplateDefinition[] = [];
