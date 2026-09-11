import { describe, expect, it } from 'vitest';

import {
  calculateDemoWorthiness,
  classifyDemoWorthiness,
  type ScoreReference,
} from './index';

const evidence = (id: string): ScoreReference => ({ kind: 'EVIDENCE', id });
const source = (id: string): ScoreReference => ({ kind: 'SOURCE', id });
const audit = (id: string): ScoreReference => ({ kind: 'AUDIT_RUN', id });

describe('Phase 13 demo worthiness scoring', () => {
  it('calculates a deterministic 100-point score from evidence-linked components', () => {
    const score = calculateDemoWorthiness({
      nicheMatched: true,
      nicheReferences: [evidence('ev_service')],
      websiteRecommendation: 'DEMO_WORTHY',
      websiteReferences: [audit('audit_1'), source('src_1')],
      verifiedDataReferences: [1, 2, 3, 4, 5].map((value) => evidence(`ev_verified_${value}`)),
      brandSignalReferences: [evidence('ev_brand_1'), evidence('ev_brand_2')],
      abilityToPaySignalReferences: [
        evidence('ev_capacity_1'),
        evidence('ev_capacity_2'),
        evidence('ev_capacity_3'),
      ],
      directContactReferences: [evidence('ev_phone')],
      socialContactReferences: [],
      recentActivityReferences: [evidence('ev_recent')],
    });

    expect(score.total).toBe(100);
    expect(score.band).toBe('PRIORITY_DEMO');
    expect(score.decision).toBe('DEMO_QUALIFIED');
    expect(Object.values(score.components).every((item) => item.references.length > 0)).toBe(true);
  });

  it('gives missing evidence zero points instead of fabricating support', () => {
    const score = calculateDemoWorthiness({
      nicheMatched: true,
      nicheReferences: [],
      websiteRecommendation: 'DEMO_WORTHY',
      websiteReferences: [],
      verifiedDataReferences: [],
      brandSignalReferences: [],
      abilityToPaySignalReferences: [],
      directContactReferences: [],
      socialContactReferences: [],
      recentActivityReferences: [],
    });

    expect(score.total).toBe(0);
    expect(score.decision).toBe('REJECTED');
    expect(score.components.businessNicheFit.points).toBe(0);
    expect(score.components.websiteNeed.points).toBe(0);
  });

  it('enforces master thresholds in code', () => {
    expect(classifyDemoWorthiness(85)).toEqual({ band: 'PRIORITY_DEMO', decision: 'DEMO_QUALIFIED' });
    expect(classifyDemoWorthiness(84)).toEqual({ band: 'GENERATE_DEMO', decision: 'DEMO_QUALIFIED' });
    expect(classifyDemoWorthiness(70)).toEqual({ band: 'GENERATE_DEMO', decision: 'DEMO_QUALIFIED' });
    expect(classifyDemoWorthiness(69)).toEqual({ band: 'RESEARCH_MORE', decision: 'RESEARCH_MORE' });
    expect(classifyDemoWorthiness(50)).toEqual({ band: 'RESEARCH_MORE', decision: 'RESEARCH_MORE' });
    expect(classifyDemoWorthiness(49)).toEqual({ band: 'SKIP', decision: 'REJECTED' });
  });

  it('deduplicates evidence before awarding count-based points', () => {
    const score = calculateDemoWorthiness({
      nicheMatched: false,
      nicheReferences: [],
      websiteRecommendation: null,
      websiteReferences: [],
      verifiedDataReferences: [evidence('ev_1'), evidence('ev_1')],
      brandSignalReferences: [],
      abilityToPaySignalReferences: [],
      directContactReferences: [],
      socialContactReferences: [],
      recentActivityReferences: [],
    });
    expect(score.components.verifiedData.points).toBe(3);
    expect(score.components.verifiedData.references).toHaveLength(1);
  });
});
