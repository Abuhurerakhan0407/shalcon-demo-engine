import type { EvidenceRecord } from '@shalcon/db';
import { ELANE_V8_TEMPLATE, THEME_DNA_OPTIONS } from '@shalcon/templates';
import { describe, expect, it } from 'vitest';

import {
  evaluateTemplateCandidate,
  inferBrandProfile,
  selectTemplateForBrand,
  validateManualTemplateSelection,
} from './brand-template-policy';

function evidence(
  id: string,
  field: string,
  value: string,
  confidence = 0.9,
): EvidenceRecord {
  return {
    id,
    prospectId: 'prospect_1',
    field,
    value,
    sourceRecordId: 'source_1',
    sourceUrl: 'https://example.com/',
    sourceQuality: 1,
    confidence,
    verificationStatus: 'VERIFIED',
    excerpt: value,
    capturedAt: '2026-09-12T00:00:00.000Z',
  };
}

describe('Phase 14 brand analyzer and template matcher policy', () => {
  it('keeps an unknown brand on a registry default without inventing a palette story', () => {
    const profile = inferBrandProfile([], 'SALON_SPA');
    const match = selectTemplateForBrand({
      niche: 'SALON_SPA',
      brandProfile: profile,
      verifiedServiceCount: 0,
      contentEvidenceIds: [],
      officialAssetCount: 0,
      websiteOpportunity: 'RESEARCH_NEEDED',
      auditRunId: 'audit_1',
    });

    expect(profile.positioning).toBe('unknown');
    expect(profile.detectedColors).toEqual([]);
    expect(profile.safeDefault).toBe(true);
    expect(match.templateId).toBe(ELANE_V8_TEMPLATE.id);
    expect(match.templateVersion).toBe(ELANE_V8_TEMPLATE.version);
    expect(match.themeDNA.paletteId).toBe(ELANE_V8_TEMPLATE.defaultTheme.paletteId);
    expect(match.safeDefault).toBe(true);
    expect(match.sparseContentMode).toBe(true);
    expect(match.reasons.join(' ')).toContain('without inventing a palette story');
  });

  it('uses only explicit evidence for positioning and colors', () => {
    const profile = inferBrandProfile(
      [
        evidence('ev_position', 'brand_positioning', 'A premium salon experience'),
        evidence('ev_color', 'logo_colors', 'Brand mark uses #C9A96E and black'),
        evidence('ev_noise', 'service', 'Gold facial package'),
      ],
      'SALON_SPA',
    );

    expect(profile.positioning).toBe('premium');
    expect(profile.detectedColors).toEqual(['#c9a96e', 'black']);
    expect(profile.evidenceIds).toEqual(['ev_position', 'ev_color']);
    expect(profile.safeDefault).toBe(false);
  });

  it('selects a compatible restrained layout when verified content or imagery is sparse', () => {
    const profile = inferBrandProfile(
      [evidence('ev_position', 'description', 'Modern unisex salon')],
      'SALON_SPA',
    );
    const match = evaluateTemplateCandidate(ELANE_V8_TEMPLATE, {
      niche: 'SALON_SPA',
      brandProfile: profile,
      verifiedServiceCount: 1,
      contentEvidenceIds: ['ev_service'],
      officialAssetCount: 0,
      websiteOpportunity: 'DEMO_WORTHY',
      auditRunId: 'audit_2',
    });

    expect(match.sparseContentMode).toBe(true);
    expect(match.themeDNA.heroVariant).toBe('split');
    expect(match.themeDNA.imageTreatment).toBe('framed');
    expect(match.themeDNA.motionPreset).toBe('subtle');
    expect(THEME_DNA_OPTIONS.heroVariant).toContain(match.themeDNA.heroVariant);
    expect(match.evidenceIds).toContain('ev_service');
  });

  it('rejects manual selections outside the allowed registry', () => {
    expect(() =>
      validateManualTemplateSelection(
        'SALON_SPA',
        'invented-template',
        '1.0.0',
        ELANE_V8_TEMPLATE.defaultTheme,
      ),
    ).toThrow('allowed template registry entry');
  });

  it('accepts a manual registry selection only with valid controlled ThemeDNA', () => {
    const result = validateManualTemplateSelection(
      'SALON_SPA',
      ELANE_V8_TEMPLATE.id,
      ELANE_V8_TEMPLATE.version,
      {
        ...ELANE_V8_TEMPLATE.defaultTheme,
        heroVariant: 'immersive',
      },
    );
    expect(result.template.id).toBe('elane-v8');
    expect(result.themeDNA.heroVariant).toBe('immersive');

    expect(() =>
      validateManualTemplateSelection('SALON_SPA', 'elane-v8', '8.0.0', {
        ...ELANE_V8_TEMPLATE.defaultTheme,
        paletteId: 'made-up-palette',
      }),
    ).toThrow('Invalid ThemeDNA payload');
  });
});
