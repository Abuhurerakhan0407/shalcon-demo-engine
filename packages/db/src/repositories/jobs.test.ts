import { describe, expect, it } from 'vitest';
import { isLeaseExpired, nextFailureStatus } from './jobs';

describe('job state helpers', () => {
  it('dead-letters at max attempts', () => {
    expect(nextFailureStatus(1, 3)).toBe('FAILED');
    expect(nextFailureStatus(3, 3)).toBe('DEAD_LETTER');
  });

  it('detects expired leases using UTC timestamps', () => {
    expect(isLeaseExpired({ leaseExpiresAt: '2026-09-03T06:00:00.000Z' }, '2026-09-03T06:01:00.000Z')).toBe(true);
    expect(isLeaseExpired({ leaseExpiresAt: '2026-09-03T07:00:00.000Z' }, '2026-09-03T06:01:00.000Z')).toBe(false);
    expect(isLeaseExpired({ leaseExpiresAt: null }, '2026-09-03T06:01:00.000Z')).toBe(false);
  });
});
