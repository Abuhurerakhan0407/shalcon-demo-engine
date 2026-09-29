import { describe, expect, it } from 'vitest';

import {
  buildPermissionFirstDraft,
  extractVerifiedPhoneCandidates,
  qaPermissionFirstDraft,
} from './phase21-outreach';

describe('Phase 21 permission-first outreach', () => {
  it('extracts each verified phone candidate without inventing channel reachability', () => {
    expect(extractVerifiedPhoneCandidates('+91 9870719161 / +91 9870419161')).toEqual([
      '+919870719161',
      '+919870419161',
    ]);
  });

  it('builds concise evidence-bound Bandra copy without a fake public demo URL', () => {
    const draft = buildPermissionFirstDraft({
      businessName: 'Savio John Pereira Salon',
      businessNameEvidenceId: 'ev_name',
      address: 'Anand Villa, Pali Hill, Bandra West, Mumbai 400050',
      addressEvidenceId: 'ev_address',
    });
    expect(draft.body).toContain('Savio John Pereira Salon in Bandra');
    expect(draft.body).not.toMatch(/https?:\/\//u);
    expect(draft.evidenceIds).toEqual(['ev_name', 'ev_address']);
    expect(
      qaPermissionFirstDraft({
        draft,
        businessName: 'Savio John Pereira Salon',
        address: 'Bandra West',
      }).passed,
    ).toBe(true);
  });

  it('fails QA if a location claim is not backed by the verified address', () => {
    const draft = buildPermissionFirstDraft({
      businessName: 'Example Salon',
      businessNameEvidenceId: 'ev_name',
    });
    const tampered = { ...draft, body: `${draft.body} Bandra.` };
    expect(
      qaPermissionFirstDraft({
        draft: tampered,
        businessName: 'Example Salon',
        address: 'Andheri West',
      }).passed,
    ).toBe(false);
  });
});
