import { describe, expect, it } from 'vitest';

import {
  SALON_QA_FIXTURE_LONG,
  SALON_QA_FIXTURE_MINIMAL,
  SALON_QA_FIXTURE_SHORT,
  deriveSalonSections,
  resolveSalonThemeTokens,
  validateSalonTemplateConfig,
} from './index';

describe('salon template runtime', () => {
  it('accepts long, short, and minimal fixture configs', () => {
    for (const fixture of [
      SALON_QA_FIXTURE_LONG,
      SALON_QA_FIXTURE_SHORT,
      SALON_QA_FIXTURE_MINIMAL,
    ]) {
      expect(validateSalonTemplateConfig(fixture)).toEqual({ ok: true, errors: [] });
    }
  });

  it('uses safe fallback sections when optional data is absent', () => {
    expect(deriveSalonSections(SALON_QA_FIXTURE_MINIMAL)).toEqual([
      'hero',
      'services-fallback',
      'contact-fallback',
      'disclosure',
    ]);
    expect(deriveSalonSections(SALON_QA_FIXTURE_LONG)).toContain('gallery');
    expect(deriveSalonSections(SALON_QA_FIXTURE_LONG)).toContain('story');
  });

  it('resolves CSS token values from ThemeDNA', () => {
    const tokens = resolveSalonThemeTokens(SALON_QA_FIXTURE_LONG.theme);
    expect(tokens['--salon-bg']).toBeTruthy();
    expect(tokens['--salon-display']).toContain('serif');
    expect(tokens['--salon-radius']).toBe('18px');
  });

  it('rejects missing critical values', () => {
    expect(
      validateSalonTemplateConfig({
        ...SALON_QA_FIXTURE_MINIMAL,
        business: { name: '' },
      }),
    ).toMatchObject({ ok: false, errors: ['business.name is required'] });
  });
});
