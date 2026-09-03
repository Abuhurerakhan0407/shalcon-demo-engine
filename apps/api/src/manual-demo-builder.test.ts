import type { ProspectFactRecord, ProspectRecord } from '@shalcon/db';
import { validateSalonTemplateConfig } from '@shalcon/template-runtime';
import { describe, expect, it } from 'vitest';

import {
  buildManualSalonDemoConfig,
  defaultManualDemoBuilderInput,
  deriveManualDemoToken,
} from './manual-demo-builder';

const prospect: ProspectRecord = {
  id: 'prospect_phase7',
  campaignId: 'campaign_phase7',
  canonicalName: 'Aura Salon & Spa',
  normalizedName: 'aura salon spa',
  domain: 'aura.example',
  phoneNormalized: '+919876543210',
  city: 'Mumbai',
  addressNormalized: 'bandra west mumbai',
  niche: 'salon-and-spa',
  sourceFirstSeen: 'MANUAL',
  currentState: 'IDENTITY_VERIFIED',
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
};

function fact(
  field: string,
  value: string,
  verificationStatus: ProspectFactRecord['verificationStatus'] = 'VERIFIED',
): ProspectFactRecord {
  return {
    id: `fact_${field}`,
    prospectId: prospect.id,
    field,
    value,
    verificationStatus,
    confidence: 0.96,
    evidenceId: verificationStatus === 'VERIFIED' ? `evidence_${field}` : null,
    createdAt: '2026-09-03T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
  };
}

describe('manual Phase 7 demo builder', () => {
  it('builds a valid config from verified facts without copying unverified facts', () => {
    const result = buildManualSalonDemoConfig(
      prospect,
      [
        fact('category', 'Premium Salon & Spa'),
        fact('city', 'Mumbai'),
        fact('address', 'Bandra West, Mumbai'),
        fact('hours', '10 AM–8 PM'),
        fact('whatsapp', '+91 98765 43210'),
        fact('instagram', '@unverified_example', 'UNVERIFIED'),
      ],
      defaultManualDemoBuilderInput(),
    );

    expect(validateSalonTemplateConfig(result.config).ok).toBe(true);
    expect(result.config.business.name).toBe('Aura Salon & Spa');
    expect(result.config.business.city).toBe('Mumbai');
    expect(result.config.contact?.address).toBe('Bandra West, Mumbai');
    expect(result.config.contact?.bookingNote).toContain('+91 98765 43210');
    expect(result.contactMode).toBe('WHATSAPP');
    expect(JSON.stringify(result.config)).not.toContain('@unverified_example');
    expect(result.evidenceMap.city).toEqual(['evidence_city']);
  });

  it('hides verified facts on operator request instead of replacing them with guesses', () => {
    const result = buildManualSalonDemoConfig(
      prospect,
      [fact('city', 'Mumbai'), fact('address', 'Bandra West, Mumbai'), fact('phone', '+91 22222 33333')],
      {
        ...defaultManualDemoBuilderInput(),
        hiddenFields: ['city', 'address', 'contact'],
      },
    );

    expect(result.config.business.city).toBeUndefined();
    expect(result.config.contact).toBeUndefined();
    expect(result.visibleFields).toEqual([]);
    expect(JSON.stringify(result.config)).not.toContain('+91 22222 33333');
  });

  it('uses only known controlled DNA presets', () => {
    const warm = buildManualSalonDemoConfig(prospect, [], defaultManualDemoBuilderInput());
    const paper = buildManualSalonDemoConfig(prospect, [], {
      ...defaultManualDemoBuilderInput(),
      themePreset: 'ELANE_PAPER',
    });

    expect(warm.config.theme.paletteId).toBe('warm-stone');
    expect(paper.config.theme.paletteId).toBe('elane-paper');
    expect(paper.config.templateId).toBe('elane-v8');
    expect(paper.config.templateVersion).toBe('8.0.0');
  });

  it('derives stable high-entropy preview tokens without storing the raw token', async () => {
    const first = await deriveManualDemoToken('phase7-test-secret-with-enough-entropy', 'demo_123');
    const second = await deriveManualDemoToken('phase7-test-secret-with-enough-entropy', 'demo_123');
    const other = await deriveManualDemoToken('phase7-test-secret-with-enough-entropy', 'demo_456');

    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^[A-Za-z0-9_-]{32,128}$/u);
  });
});
