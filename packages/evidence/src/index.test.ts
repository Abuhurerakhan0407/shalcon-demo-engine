import { describe, expect, it } from 'vitest';

import {
  canVerifyFact,
  normalizeAddress,
  normalizeBusinessName,
  normalizeCity,
  normalizeDomain,
  normalizePhone,
  normalizePublicUrl,
  summarizeFieldEvidence,
  type EvidenceCandidate,
} from './index';

const baseEvidence: EvidenceCandidate = {
  id: 'ev_1',
  prospectId: 'prospect_1',
  field: 'phone',
  value: '+919876543210',
  sourceUrl: 'https://example.com/contact',
  sourceQuality: 1,
  confidence: 0.99,
  verificationStatus: 'VERIFIED',
};

describe('normalization', () => {
  it('normalizes business identity fields without guessing missing values', () => {
    expect(normalizeBusinessName('  ÉLANE   Salon & Spa ')).toBe('élane salon & spa');
    expect(normalizeDomain('https://www.Example.com/path')).toBe('example.com');
    expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
    expect(normalizePhone('123')).toBeNull();
    expect(normalizeCity('  Mumbai ')).toBe('mumbai');
    expect(normalizeAddress('  1  Example Road,  Andheri ')).toBe('1 example road, andheri');
    expect(normalizePublicUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('evidence policy', () => {
  it('requires exact prospect, field, value, and VERIFIED evidence', () => {
    expect(
      canVerifyFact(
        { prospectId: 'prospect_1', field: 'phone', value: '+919876543210' },
        baseEvidence,
      ),
    ).toBe(true);
    expect(
      canVerifyFact(
        { prospectId: 'prospect_2', field: 'phone', value: '+919876543210' },
        baseEvidence,
      ),
    ).toBe(false);
    expect(
      canVerifyFact(
        { prospectId: 'prospect_1', field: 'email', value: '+919876543210' },
        baseEvidence,
      ),
    ).toBe(false);
  });

  it('flags distinct non-rejected values as a deterministic conflict', () => {
    const summary = summarizeFieldEvidence('phone', [
      baseEvidence,
      { ...baseEvidence, id: 'ev_2', value: '+919111111111', sourceQuality: 0.8 },
      { ...baseEvidence, id: 'ev_3', value: '+919876543210', confidence: 0.8 },
      { ...baseEvidence, id: 'ev_4', value: '+919222222222', verificationStatus: 'REJECTED' },
    ]);
    expect(summary.conflicted).toBe(true);
    expect(summary.candidates).toHaveLength(2);
    expect(summary.candidates[0]?.value).toBe('+919876543210');
    expect(summary.candidates[0]?.evidenceIds).toEqual(['ev_1', 'ev_3']);
  });
});
