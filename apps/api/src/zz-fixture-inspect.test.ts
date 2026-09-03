import { SALON_QA_FIXTURE_LONG, SALON_QA_FIXTURE_MINIMAL } from '@shalcon/template-runtime';
import { describe, expect, it } from 'vitest';

describe('temporary Phase 7 fixture inspection', () => {
  it('prints the generated salon config contract for Phase 7 wiring', () => {
    console.log('PHASE7_MINIMAL_CONFIG=' + JSON.stringify(SALON_QA_FIXTURE_MINIMAL));
    console.log('PHASE7_LONG_CONFIG=' + JSON.stringify(SALON_QA_FIXTURE_LONG));
    expect(SALON_QA_FIXTURE_MINIMAL.business.name.length).toBeGreaterThan(0);
  });
});
