import { describe, expect, it } from 'vitest';

import {
  ELANE_RUNTIME_MARKER,
  SALON_QA_FIXTURE_LONG,
  SALON_QA_FIXTURE_MINIMAL,
  SALON_QA_FIXTURE_SHORT,
  deriveSalonSections,
  renderElaneDocument,
  resolveSalonThemeTokens,
  validateSalonTemplateConfig,
} from './index';

const SOURCE = `<!doctype html><html><head><meta name="robots" content="noindex,nofollow,noarchive"></head><body>${ELANE_RUNTIME_MARKER}<script>window.__source=true</script></body></html>`;

describe('ÉLANE v8 runtime', () => {
  it('validates the three QA fixture shapes', () => {
    expect(validateSalonTemplateConfig(SALON_QA_FIXTURE_LONG)).toEqual({ ok: true, errors: [] });
    expect(validateSalonTemplateConfig(SALON_QA_FIXTURE_SHORT)).toEqual({ ok: true, errors: [] });
    expect(validateSalonTemplateConfig(SALON_QA_FIXTURE_MINIMAL)).toEqual({ ok: true, errors: [] });
  });

  it('rejects an indexable prospect demo', () => {
    const invalid = {
      ...SALON_QA_FIXTURE_LONG,
      noindex: false,
    } as unknown as typeof SALON_QA_FIXTURE_LONG;
    expect(validateSalonTemplateConfig(invalid).ok).toBe(false);
  });

  it('derives safe fallback sections when evidence is sparse', () => {
    expect(deriveSalonSections(SALON_QA_FIXTURE_LONG)).toContain('rituals');
    expect(deriveSalonSections(SALON_QA_FIXTURE_LONG)).toContain('finder');
    expect(deriveSalonSections(SALON_QA_FIXTURE_MINIMAL)).toContain('services-fallback');
    expect(deriveSalonSections(SALON_QA_FIXTURE_MINIMAL)).toContain('contact-fallback');
    expect(deriveSalonSections(SALON_QA_FIXTURE_MINIMAL)).not.toContain('rituals');
    expect(deriveSalonSections(SALON_QA_FIXTURE_MINIMAL)).not.toContain('testimonials');
  });

  it('maps ThemeDNA into the source template CSS variable contract', () => {
    expect(resolveSalonThemeTokens(SALON_QA_FIXTURE_LONG.theme)).toMatchObject({
      '--paper': '#f2eee8',
      '--ink': '#171512',
      '--accent': '#a67d6c',
    });
  });

  it('injects config safely without removing the original source script', () => {
    const rendered = renderElaneDocument(SOURCE, SALON_QA_FIXTURE_LONG);
    expect(rendered).not.toContain(ELANE_RUNTIME_MARKER);
    expect(rendered).toContain('id="shalcon-runtime-config"');
    expect(rendered).toContain('Fictional QA fixture');
    expect(rendered).toContain('window.__source=true');
  });

  it('escapes closing HTML/script-shaped config content', () => {
    const malicious = {
      ...SALON_QA_FIXTURE_MINIMAL,
      business: { name: '</script><script>globalThis.compromised=true</script>' },
    };
    const rendered = renderElaneDocument(SOURCE, malicious);
    expect(rendered).not.toContain('</script><script>globalThis.compromised=true</script>');
    expect(rendered).toContain('\\u003c/script\\u003e');
  });

  it('fails closed if the source marker is missing', () => {
    expect(() => renderElaneDocument('<html></html>', SALON_QA_FIXTURE_LONG)).toThrow(
      'runtime marker is missing',
    );
  });
});
