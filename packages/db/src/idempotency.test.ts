import { describe, expect, it } from 'vitest';
import { buildIdempotencyKey } from './idempotency';

describe('buildIdempotencyKey', () => {
  it('is stable across object key order', () => {
    const a = buildIdempotencyKey({
      namespace: 'job',
      action: 'research',
      entityId: 'prospect-1',
      payload: { city: 'Mumbai', niche: 'salon' },
    });
    const b = buildIdempotencyKey({
      namespace: 'JOB',
      action: 'RESEARCH',
      entityId: 'prospect-1',
      payload: { niche: 'salon', city: 'Mumbai' },
    });
    expect(a).toBe(b);
  });

  it('changes when meaningful input changes', () => {
    const a = buildIdempotencyKey({ namespace: 'job', action: 'research', entityId: 'p1' });
    const b = buildIdempotencyKey({ namespace: 'job', action: 'research', entityId: 'p2' });
    expect(a).not.toBe(b);
  });

  it('rejects empty identity parts', () => {
    expect(() =>
      buildIdempotencyKey({ namespace: 'job', action: 'research', entityId: '   ' }),
    ).toThrow('Idempotency namespace, action, and entityId are required.');
  });
});
