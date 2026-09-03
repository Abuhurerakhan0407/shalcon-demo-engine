import { describe, expect, it } from 'vitest';

import {
  SALON_TEMPLATE_V1,
  TEMPLATE_REGISTRY,
  findTemplateDefinition,
  isThemeDNA,
  parseThemeDNA,
} from './index';

describe('template registry', () => {
  it('registers the versioned salon template', () => {
    expect(TEMPLATE_REGISTRY).toContainEqual(SALON_TEMPLATE_V1);
    expect(findTemplateDefinition('salon-editorial', '1.0.0')).toEqual(SALON_TEMPLATE_V1);
    expect(findTemplateDefinition('salon-editorial', '9.9.9')).toBeNull();
  });
});

describe('ThemeDNA schema', () => {
  it('accepts the salon default DNA and rejects invalid capabilities', () => {
    expect(isThemeDNA(SALON_TEMPLATE_V1.defaultTheme)).toBe(true);
    expect(
      isThemeDNA({ ...SALON_TEMPLATE_V1.defaultTheme, motionPreset: 'chaotic' }),
    ).toBe(false);
    expect(() => parseThemeDNA({ paletteId: 'obsidian-ivory' })).toThrow('Invalid ThemeDNA');
  });
});
