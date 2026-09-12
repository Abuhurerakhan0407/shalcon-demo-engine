import type { EvidenceRecord } from '@shalcon/db';
import { describe, expect, it } from 'vitest';

import {
  CONTENT_MODEL,
  CONTENT_PROMPT_VERSION,
  buildContentPackageFromVerifiedEvidence,
} from './content-engine';

function evidence(
  id: string,
  field: string,
  value: string,
  verificationStatus: EvidenceRecord['verificationStatus'] = 'VERIFIED',
): EvidenceRecord {
  return {
    id,
    prospectId: 'p_content_test',
    field,
    value,
    sourceRecordId: 'src_content_test',
    sourceUrl: 'https://example.com/',
    sourceQuality: 1,
    confidence: verificationStatus === 'VERIFIED' ? 0.95 : 0.55,
    verificationStatus,
    excerpt: value,
    capturedAt: '2026-09-12T00:00:00.000Z',
  };
}

describe('Phase 15 content engine', () => {
  it('uses only verified source evidence and never invents an unverified service', () => {
    const content = buildContentPackageFromVerifiedEvidence([
      evidence('ev_category', 'category', 'Hair & beauty salon'),
      evidence('ev_city', 'city', 'Mumbai'),
      evidence('ev_haircut', 'service', 'Haircut'),
      evidence('ev_styling', 'service', 'Hair styling'),
      evidence('ev_unverified', 'service', 'Tattoo removal', 'UNVERIFIED'),
      evidence('ev_phone', 'phone', '+91 98765 43210'),
    ]);

    expect(content.headline?.text).toBe('Hair & beauty salon in Mumbai');
    expect(content.services.map((service) => service.serviceName)).toEqual(['Haircut', 'Hair styling']);
    expect(content.services.map((service) => service.serviceName)).not.toContain('Tattoo removal');
    expect(content.services.every((service) => service.description.inputEvidenceIds.includes(service.serviceEvidenceId))).toBe(true);
    expect(content.cta.channel).toBe('CALL');
    expect(content.cta.inputEvidenceIds).toEqual(['ev_phone']);
  });

  it('does not generate unsupported social proof or superlative claims', () => {
    const content = buildContentPackageFromVerifiedEvidence([
      evidence('ev_category', 'category', 'Salon & spa'),
      evidence('ev_service', 'service', 'Haircut'),
    ]);
    const output = JSON.stringify(content).toLowerCase();
    for (const unsupported of ['award-winning', 'best salon', 'trusted by', '5-star', 'thousands of clients']) {
      expect(output).not.toContain(unsupported);
    }
  });

  it('hides factual sections safely when verified inputs are missing', () => {
    const content = buildContentPackageFromVerifiedEvidence([]);
    expect(content.headline).toBeUndefined();
    expect(content.services).toEqual([]);
    expect(content.about).toBeUndefined();
    expect(content.hiddenSections).toEqual(['HEADLINE', 'SERVICES', 'ABOUT']);
    expect(content.cta.channel).toBe('PLACEHOLDER');
    expect(content.cta.inputEvidenceIds).toEqual([]);
  });

  it('stores prompt/model provenance on every generated copy block', () => {
    const content = buildContentPackageFromVerifiedEvidence([
      evidence('ev_category', 'category', 'Salon'),
      evidence('ev_service', 'service', 'Haircut'),
    ]);
    const blocks = [content.headline, ...content.services.map((service) => service.description), content.about, content.cta]
      .filter((item): item is NonNullable<typeof item> => item !== undefined);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((item) => item.promptVersion === CONTENT_PROMPT_VERSION)).toBe(true);
    expect(blocks.every((item) => item.model === CONTENT_MODEL)).toBe(true);
  });

  it('handles long verified service names without overflowing generated copy bounds', () => {
    const longService = `Advanced restorative hair and scalp consultation ${'with personalized care '.repeat(14)}`.trim();
    const content = buildContentPackageFromVerifiedEvidence([
      evidence('ev_service_long', 'service', longService),
    ]);
    expect(content.services).toHaveLength(1);
    expect(content.services[0]?.serviceName).toBe(longService);
    expect(content.services[0]?.description.text.length).toBeLessThanOrEqual(120);
    expect(content.services[0]?.description.inputEvidenceIds).toEqual(['ev_service_long']);
  });
});
