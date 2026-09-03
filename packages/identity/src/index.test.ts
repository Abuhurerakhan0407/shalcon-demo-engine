import { describe, expect, it } from 'vitest';

import { buildIdentityKeys, resolveIdentity } from './index';

describe('identity key generation', () => {
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
      { type: 'DOMAIN', value: 'elane.example' },
      { type: 'PHONE', value: '+919876543210' },
      { type: 'NAME_CITY', value: 'elane salon|mumbai' },
      { type: 'ADDRESS_CITY', value: '12 linking road, bandra|mumbai' },
    ]);
  });
});

describe('identity resolution', () => {
  const domain = { type: 'DOMAIN' as const, value: 'elane.example' };
  const phone = { type: 'PHONE' as const, value: '+919876543210' };
  const nameCity = { type: 'NAME_CITY' as const, value: 'elane salon|mumbai' };

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
