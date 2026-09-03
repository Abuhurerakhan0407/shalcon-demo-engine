import { describe, expect, it } from 'vitest';

import {
  buildIdentityKeys,
  canVerifyFact,
  normalizeAddress,
  normalizeBusinessName,
  normalizeCity,
  normalizeDomain,
  normalizePhone,
  normalizePublicUrl,
  resolveIdentity,
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

describe('identity resolution', () => {
  const domain = { type: 'DOMAIN' as const, value: 'elane.example' };
  const phone = { type: 'PHONE' as const, value: '+919876543210' };
  const nameCity = { type: 'NAME_CITY' as const, value: 'elane salon|mumbai' };

  it('builds strong and composite keys only when their inputs exist', () => {
    expect(
      buildIdentityKeys({
        normalizedName: 'elane salon',
        domain: 'elane.example',
        phoneNormalized: '+919876543210',
        city: 'mumbai',
        addressNormalized: '12 linking road, bandra',
      }),
    ).toEqual([
      domain,
      phone,
      nameCity,
      { type: 'ADDRESS_CITY', value: '12 linking road, bandra|mumbai' },
    ]);
  });

  it('auto-links an exact strong identifier', () => {
    expect(
      resolveIdentity([domain], [{ prospectId: 'pro_a', keyType: 'DOMAIN', keyValue: domain.value }]),
    ).toMatchObject({
      status: 'EXACT_MATCH',
      confidence: 0.99,
      candidateProspectIds: ['pro_a'],
      reasonCodes: ['DOMAIN_EXACT'],
    });
  });

  it('raises confidence when domain and phone agree on the same canonical prospect', () => {
    expect(
      resolveIdentity(
        [domain, phone],
        [
          { prospectId: 'pro_a', keyType: 'DOMAIN', keyValue: domain.value },
          { prospectId: 'pro_a', keyType: 'PHONE', keyValue: phone.value },
        ],
      ),
    ).toMatchObject({ status: 'EXACT_MATCH', confidence: 1, candidateProspectIds: ['pro_a'] });
  });

  it('never auto-resolves strong identifiers that point at different businesses', () => {
    expect(
      resolveIdentity(
        [domain, phone],
        [
          { prospectId: 'pro_a', keyType: 'DOMAIN', keyValue: domain.value },
          { prospectId: 'pro_b', keyType: 'PHONE', keyValue: phone.value },
        ],
      ),
    ).toMatchObject({
      status: 'CONFLICT',
      confidence: 0,
      candidateProspectIds: ['pro_a', 'pro_b'],
      reasonCodes: ['STRONG_IDENTIFIERS_DISAGREE'],
    });
  });

  it('requires review for name + city instead of merging', () => {
    expect(
      resolveIdentity(
        [nameCity],
        [{ prospectId: 'pro_a', keyType: 'NAME_CITY', keyValue: nameCity.value }],
      ),
    ).toMatchObject({
      status: 'REVIEW_REQUIRED',
      candidateProspectIds: ['pro_a'],
      reasonCodes: ['COMPOSITE_MATCH_REQUIRES_REVIEW'],
    });
  });

  it('creates a new canonical identity when no known key matches', () => {
    expect(resolveIdentity([domain, nameCity], [])).toEqual({
      status: 'NEW_CANONICAL',
      confidence: 1,
      candidateProspectIds: [],
      matchedKeys: [],
      reasonCodes: ['NO_EXISTING_IDENTITY_MATCH'],
    });
  });
});
