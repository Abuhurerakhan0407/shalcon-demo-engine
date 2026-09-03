import { type DemoRecord } from '@shalcon/db';
import { SALON_QA_FIXTURE_MINIMAL } from '@shalcon/template-runtime';
import { describe, expect, it } from 'vitest';

import {
  hashDemoToken,
  isDemoPubliclyAvailable,
  isValidDemoToken,
  renderDemoRecord,
} from './demo-renderer';

const NOW = '2026-09-03T11:00:00.000Z';

function fixture(overrides: Partial<DemoRecord> = {}): DemoRecord {
  return {
    id: 'demo_fixture',
    prospectId: 'prospect_fixture',
    tokenHash: 'hash',
    templateId: 'elane-v8',
    templateVersion: '8.0.0',
    schemaVersion: 'salon-template-config.v1',
    configJson: JSON.stringify({
      ...SALON_QA_FIXTURE_MINIMAL,
      business: { ...SALON_QA_FIXTURE_MINIMAL.business, name: 'Renderer Fixture Salon' },
    }),
    status: 'READY',
    expiresAt: '2099-09-03T11:00:00.000Z',
    createdAt: NOW,
    updatedAt: NOW,
    lastQaAt: NOW,
    factQaStatus: 'PASS',
    visualQaStatus: 'PASS',
    salesQaStatus: 'PASS',
    ...overrides,
  };
}

describe('demo token security', () => {
  it('accepts only high-entropy URL-safe token shapes and stores a SHA-256 hash', async () => {
    const token = 'phase6_valid_token_0123456789abcdefXYZ';
    expect(isValidDemoToken(token)).toBe(true);
    expect(isValidDemoToken('short')).toBe(false);
    const hash = await hashDemoToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(hash).not.toContain(token);
  });
});

describe('public demo availability', () => {
  it('allows only release-safe statuses before expiry', () => {
    expect(isDemoPubliclyAvailable(fixture({ status: 'READY' }), NOW)).toBe(true);
    expect(isDemoPubliclyAvailable(fixture({ status: 'SENT' }), NOW)).toBe(true);
    expect(isDemoPubliclyAvailable(fixture({ status: 'CONVERTED' }), NOW)).toBe(true);
    for (const status of ['DRAFT', 'RENDERED', 'QA_FAILED', 'EXPIRED', 'DISABLED'] as const) {
      expect(isDemoPubliclyAvailable(fixture({ status }), NOW)).toBe(false);
    }
    expect(isDemoPubliclyAvailable(fixture({ expiresAt: '2020-01-01T00:00:00.000Z' }), NOW)).toBe(false);
  });
});

describe('universal render contract', () => {
  it('renders the exact template version from config', () => {
    const result = renderDemoRecord(fixture(), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected fixture demo to render.');
    expect(result.html).toContain('Renderer Fixture Salon');
    expect(result.html).toContain('data-template-id="elane-v8"');
    expect(result.html).toContain('data-template-version="8.0.0"');
    expect(result.html).toContain('Concept preview prepared by Shalcon Intelligence');
  });

  it('fails closed for malformed config and unknown template versions', () => {
    expect(renderDemoRecord(fixture({ configJson: '{"business":{}' }), NOW)).toEqual({
      ok: false,
      reason: 'INVALID_CONFIG',
    });
    expect(renderDemoRecord(fixture({ configJson: '{"business":{"name":"Broken"}}' }), NOW)).toEqual({
      ok: false,
      reason: 'INVALID_CONFIG',
    });
    expect(renderDemoRecord(fixture({ templateVersion: '999.0.0' }), NOW)).toEqual({
      ok: false,
      reason: 'UNKNOWN_TEMPLATE',
    });
  });
});
