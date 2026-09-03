import { describe, expect, it } from 'vitest';

import {
  ELANE_V8_TEMPLATE,
  TEMPLATE_REGISTRY,
  findTemplateDefinition,
  isThemeDNA,
} from './index';

describe('ÉLANE v8 template registry', () => {
  it('registers the user-provided Salon & Spa master as an immutable version', () => {
    expect(TEMPLATE_REGISTRY).toHaveLength(1);
    expect(ELANE_V8_TEMPLATE.id).toBe('elane-v8');
    expect(ELANE_V8_TEMPLATE.version).toBe('8.0.0');
    expect(ELANE_V8_TEMPLATE.sourceFingerprint).toBe(
      'ed9e8d651e0d24a759968f10febdb43d8ea7d036e53727d3cee8521ad7886dbf',
    );
    expect(findTemplateDefinition('elane-v8', '8.0.0')).toEqual(ELANE_V8_TEMPLATE);
  });

  it('accepts only registered ThemeDNA values', () => {
    expect(isThemeDNA(ELANE_V8_TEMPLATE.defaultTheme)).toBe(true);
    expect(isThemeDNA({ ...ELANE_V8_TEMPLATE.defaultTheme, paletteId: 'made-up' })).toBe(false);
  });
});
