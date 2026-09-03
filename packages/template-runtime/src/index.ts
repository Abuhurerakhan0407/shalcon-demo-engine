import type { TemplateSectionId, ThemeDNA } from '@shalcon/templates';

export type SalonVisualTone = 'portrait' | 'detail' | 'interior' | 'texture';

export interface SalonServiceItem {
  readonly name: string;
  readonly description?: string;
  readonly priceLabel?: string;
}

export interface SalonGalleryItem {
  readonly label: string;
  readonly tone: SalonVisualTone;
}

export interface SalonTemplateConfig {
  readonly templateId: 'salon-editorial';
  readonly templateVersion: '1.0.0';
  readonly fixtureLabel?: string;
  readonly business: {
    readonly name: string;
    readonly descriptor?: string;
    readonly city?: string;
  };
  readonly hero: {
    readonly eyebrow?: string;
    readonly headline: string;
    readonly subhead?: string;
    readonly primaryCtaLabel?: string;
  };
  readonly services?: readonly SalonServiceItem[];
  readonly story?: {
    readonly kicker?: string;
    readonly headline: string;
    readonly body?: string;
  };
  readonly gallery?: readonly SalonGalleryItem[];
  readonly contact?: {
    readonly phone?: string;
    readonly address?: string;
    readonly hours?: readonly string[];
    readonly ctaLabel?: string;
  };
  readonly disclosure: {
    readonly text: string;
  };
  readonly theme: ThemeDNA;
  readonly noindex: boolean;
}

export type SalonThemeTokens = Readonly<Record<`--salon-${string}`, string>>;

export interface SalonConfigValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateSalonTemplateConfig(config: SalonTemplateConfig): SalonConfigValidationResult {
  const errors: string[] = [];
  if (config.templateId !== 'salon-editorial') errors.push('templateId must be salon-editorial');
  if (config.templateVersion !== '1.0.0') errors.push('templateVersion must be 1.0.0');
  if (!nonEmpty(config.business.name)) errors.push('business.name is required');
  if (!nonEmpty(config.hero.headline)) errors.push('hero.headline is required');
  if (!nonEmpty(config.disclosure.text)) errors.push('disclosure.text is required');
  return { ok: errors.length === 0, errors };
}

export function deriveSalonSections(config: SalonTemplateConfig): readonly TemplateSectionId[] {
  const sections: TemplateSectionId[] = ['hero'];
  sections.push(config.services && config.services.length > 0 ? 'services' : 'services-fallback');
  if (config.story && nonEmpty(config.story.headline)) sections.push('story');
  if (config.gallery && config.gallery.length > 0) sections.push('gallery');
  sections.push(config.contact ? 'contact' : 'contact-fallback');
  sections.push('disclosure');
  return sections;
}

export function resolveSalonThemeTokens(theme: ThemeDNA): SalonThemeTokens {
  const palettes: Record<ThemeDNA['paletteId'], readonly [string, string, string, string, string]> = {
    'obsidian-ivory': ['#171512', '#f1eadf', '#d7c7b4', '#8f7c69', '#2b2722'],
    'warm-stone': ['#e8e0d5', '#201c18', '#7e624e', '#9c8d7c', '#d4c8ba'],
  };
  const [background, ink, accent, muted, surface] = palettes[theme.paletteId];
  const radius = theme.radius === 'sharp' ? '0px' : theme.radius === 'soft' ? '18px' : '34px';
  const spacing = theme.density === 'airy' ? 'clamp(28px, 6vw, 88px)' : theme.density === 'dense' ? '24px' : 'clamp(24px, 4vw, 56px)';
  const displayFont =
    theme.typographyId === 'editorial-serif'
      ? 'Iowan Old Style, Baskerville, Times New Roman, serif'
      : 'Georgia, Times New Roman, serif';

  return {
    '--salon-bg': background,
    '--salon-ink': ink,
    '--salon-accent': accent,
    '--salon-muted': muted,
    '--salon-surface': surface,
    '--salon-radius': radius,
    '--salon-space': spacing,
    '--salon-display': displayFont,
  };
}

const DEFAULT_THEME: ThemeDNA = {
  paletteId: 'obsidian-ivory',
  typographyId: 'editorial-serif',
  radius: 'soft',
  density: 'airy',
  heroVariant: 'editorial',
  imageTreatment: 'collage',
  motionPreset: 'luxury',
};

export const SALON_QA_FIXTURE_LONG: SalonTemplateConfig = {
  templateId: 'salon-editorial',
  templateVersion: '1.0.0',
  fixtureLabel: 'Fictional QA fixture — not a real business',
  business: {
    name: 'Aster & Ash',
    descriptor: 'Hair atelier & quiet beauty studio',
    city: 'Mumbai',
  },
  hero: {
    eyebrow: 'Cut / colour / ritual',
    headline: 'Beauty, edited with restraint.',
    subhead:
      'A deliberately calm salon concept built around shape, tone, texture, and unhurried appointments.',
    primaryCtaLabel: 'Request an appointment',
  },
  services: [
    {
      name: 'Cut & Shape',
      description: 'Consultation-led cutting with a soft, wearable finish.',
      priceLabel: 'Fixture ₹2,400+',
    },
    {
      name: 'Gloss Ritual',
      description: 'Tone refresh and shine treatment for dimensional colour.',
      priceLabel: 'Fixture ₹3,100+',
    },
    {
      name: 'Scalp Reset',
      description: 'A focused cleanse, massage, and finishing ritual.',
      priceLabel: 'Fixture ₹1,900+',
    },
    {
      name: 'Event Finish',
      description: 'Polished styling designed around the outfit and occasion.',
      priceLabel: 'Fixture ₹2,800+',
    },
  ],
  story: {
    kicker: 'The point of view',
    headline: 'Less noise. Better attention.',
    body:
      'This fictional fixture demonstrates a premium local-service story section without claiming awards, years in business, ratings, staff counts, or other unverifiable facts.',
  },
  gallery: [
    { label: 'Shape study', tone: 'portrait' },
    { label: 'Material detail', tone: 'detail' },
    { label: 'Quiet interior', tone: 'interior' },
    { label: 'Texture study', tone: 'texture' },
  ],
  contact: {
    phone: '+91 90000 00000',
    address: 'Fixture address · Bandra West, Mumbai',
    hours: ['Tue–Sat · 10:00–19:00', 'Sun · 11:00–17:00'],
    ctaLabel: 'Plan your visit',
  },
  disclosure: {
    text: 'Shalcon Intelligence concept preview. Fictional fixture content is shown only to validate the template system and must be replaced by verified prospect evidence before outreach.',
  },
  theme: DEFAULT_THEME,
  noindex: true,
};

export const SALON_QA_FIXTURE_SHORT: SalonTemplateConfig = {
  templateId: 'salon-editorial',
  templateVersion: '1.0.0',
  fixtureLabel: 'Fictional short-data QA fixture',
  business: { name: 'Mora Studio' },
  hero: { headline: 'A quieter way to book beauty.' },
  services: [{ name: 'Signature appointment' }],
  contact: { ctaLabel: 'Request details' },
  disclosure: {
    text: 'Shalcon Intelligence concept preview. Fixture content only.',
  },
  theme: { ...DEFAULT_THEME, density: 'balanced', imageTreatment: 'framed' },
  noindex: true,
};

export const SALON_QA_FIXTURE_MINIMAL: SalonTemplateConfig = {
  templateId: 'salon-editorial',
  templateVersion: '1.0.0',
  fixtureLabel: 'Fictional missing-data QA fixture',
  business: { name: 'Field Studio' },
  hero: { headline: 'Considered care, without the clutter.' },
  disclosure: {
    text: 'Shalcon Intelligence concept preview. Missing optional fields intentionally exercise safe fallback sections.',
  },
  theme: { ...DEFAULT_THEME, paletteId: 'warm-stone', heroVariant: 'split' },
  noindex: true,
};
