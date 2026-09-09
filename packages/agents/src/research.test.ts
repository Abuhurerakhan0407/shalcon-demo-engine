import { describe, expect, it } from 'vitest';

import {
  detectResearchConflicts,
  extractionToEvidenceCandidates,
  hasCriticalResearchConflict,
  prioritizeResearchSources,
} from './research';

describe('Phase 11 research decision engine', () => {
  it('prioritizes contact/services/home research pages deterministically', () => {
    const pages = prioritizeResearchSources([
      { sourceId: '1', url: 'https://example.com/blog', title: 'Blog', text: 'x'.repeat(5000), provider: 'PLAYWRIGHT', sourceType: 'WEBSITE_PAGE' },
      { sourceId: '2', url: 'https://example.com/services', title: 'Services', text: 'Haircut and styling', provider: 'PLAYWRIGHT', sourceType: 'WEBSITE_PAGE' },
      { sourceId: '3', url: 'https://example.com/contact', title: 'Contact', text: 'hello@example.com', provider: 'PLAYWRIGHT', sourceType: 'WEBSITE_PAGE' },
      { sourceId: '4', url: 'https://example.com/', title: 'Home', text: 'Élane Salon', provider: 'PLAYWRIGHT', sourceType: 'WEBSITE_PAGE' },
    ]);
    expect(pages.map((page) => page.sourceId)).toEqual(['3', '2', '4', '1']);
    expect(pages.map((page) => page.rank)).toEqual([1, 2, 3, 4]);
  });

  it('creates only probable/unverified AI candidates and never auto-verifies', () => {
    const candidates = extractionToEvidenceCandidates(
      {
        businessName: 'Élane Salon',
        description: null,
        phone: null,
        email: 'hello@example.com',
        address: null,
        openingHours: [],
        services: ['Haircut'],
        socialLinks: [],
      },
      'CONTACT',
    );
    expect(candidates.some((item) => item.verificationStatus === 'PROBABLE')).toBe(true);
    expect(candidates.every((item) => item.verificationStatus !== ('VERIFIED' as never))).toBe(true);
  });

  it('blocks on critical scalar conflicts but not additive service evidence', () => {
    const conflicts = detectResearchConflicts([
      { field: 'phone', value: '+91 1111111111' },
      { field: 'phone', value: '+91 2222222222' },
      { field: 'service', value: 'Haircut' },
      { field: 'service', value: 'Styling' },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.field).toBe('phone');
    expect(hasCriticalResearchConflict(conflicts)).toBe(true);
  });
});
