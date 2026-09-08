import { describe, expect, it } from 'vitest';

import { aiExtractionResultSchema } from './ai-result';

const validResult = {
  schemaVersion: 'business-extraction.v1' as const,
  sourceOnly: true as const,
  verified: false as const,
  provider: 'ollama' as const,
  model: 'qwen3:4b',
  adapter: 'ollama-direct' as const,
  extracted: {
    businessName: 'Élane Salon',
    description: 'Hair and beauty salon.',
    phone: null,
    email: null,
    address: 'Mumbai',
    openingHours: [],
    services: ['Haircut'],
    socialLinks: [],
  },
  provenance: [{ sourceId: 'source_1', url: 'https://example.com/' }],
  telemetry: { attempts: 1, elapsedMs: 250, sourceChars: 1200, promptChars: 3200 },
};

describe('Phase 10 AI extraction result schema', () => {
  it('accepts bounded source-only unverified output', () => {
    expect(aiExtractionResultSchema.parse(validResult)).toEqual(validResult);
  });

  it('rejects model output that claims verification', () => {
    expect(() => aiExtractionResultSchema.parse({ ...validResult, verified: true })).toThrow();
  });

  it('rejects unexpected extracted fields', () => {
    expect(() =>
      aiExtractionResultSchema.parse({
        ...validResult,
        extracted: { ...validResult.extracted, confidence: 0.99 },
      }),
    ).toThrow();
  });

  it('rejects missing provenance and oversized source text telemetry', () => {
    expect(() => aiExtractionResultSchema.parse({ ...validResult, provenance: [] })).toThrow();
    expect(() =>
      aiExtractionResultSchema.parse({
        ...validResult,
        telemetry: { ...validResult.telemetry, sourceChars: 40_001 },
      }),
    ).toThrow();
  });

  it('rejects unsafe model identifiers and source credentials', () => {
    expect(() => aiExtractionResultSchema.parse({ ...validResult, model: '../secret model' })).toThrow();
    expect(() =>
      aiExtractionResultSchema.parse({
        ...validResult,
        provenance: [{ sourceId: 'source_1', url: 'https://user:pass@example.com/' }],
      }),
    ).toThrow();
  });
});
