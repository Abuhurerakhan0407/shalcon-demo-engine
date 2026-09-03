import { describe, expect, it } from 'vitest';

import {
  canonicalResearchUrl,
  parseResearchResultForJob,
  playwrightResearchResultSchema,
} from './research-result';

function validResult() {
  const pages = [
    {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      capturedAt: '2026-09-03T14:30:00.000Z',
      httpStatus: 200,
      title: 'Example',
      text: 'Rendered source text',
      html: '<html><body>Rendered source text</body></html>',
      screenshotPath: 'artifacts/research/job/page.png',
      navigationError: null,
      console: [],
      requestFailures: [],
      httpErrors: [],
      discoveredLinks: ['https://example.com/contact'],
    },
  ];
  return {
    schemaVersion: 'playwright-research.v1',
    jobId: 'job_phase9',
    prospectId: 'prospect_phase9',
    requestedUrl: 'https://example.com/',
    capturedAt: '2026-09-03T14:30:00.000Z',
    pages,
    pageCount: pages.length,
    sourceOnly: true,
  };
}

describe('Phase 9 research result contract', () => {
  it('accepts bounded source-only browser output', () => {
    expect(
      parseResearchResultForJob(
        validResult(),
        'job_phase9',
        'prospect_phase9',
        'HTTPS://Example.COM/#operator-fragment',
      ),
    ).toMatchObject({ sourceOnly: true, pageCount: 1 });
  });

  it('binds a result to the exact claimed job and requested website', () => {
    expect(() =>
      parseResearchResultForJob(validResult(), 'different_job', 'prospect_phase9'),
    ).toThrow('does not match');
    expect(() =>
      parseResearchResultForJob(validResult(), 'job_phase9', 'different_prospect'),
    ).toThrow('does not match');
    expect(() =>
      parseResearchResultForJob(
        validResult(),
        'job_phase9',
        'prospect_phase9',
        'https://different.example/',
      ),
    ).toThrow('requested URL does not match');
  });

  it('canonicalizes safe web URLs and rejects unsafe cloud provenance URLs', () => {
    expect(canonicalResearchUrl(' HTTPS://Example.COM/path#fragment ')).toBe(
      'https://example.com/path',
    );
    expect(canonicalResearchUrl('https://user:pass@example.com/')).toBeNull();
    expect(canonicalResearchUrl('http://localhost/')).toBeNull();
    expect(canonicalResearchUrl('https://service.internal/')).toBeNull();
    expect(canonicalResearchUrl('https://example.com:8443/')).toBeNull();
    expect(canonicalResearchUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects inconsistent page counts, empty results, and unsupported protocols', () => {
    expect(
      playwrightResearchResultSchema.safeParse({ ...validResult(), pageCount: 2 }).success,
    ).toBe(false);
    expect(
      playwrightResearchResultSchema.safeParse({ ...validResult(), pages: [], pageCount: 0 }).success,
    ).toBe(false);
    expect(
      playwrightResearchResultSchema.safeParse({
        ...validResult(),
        requestedUrl: 'file:///etc/passwd',
      }).success,
    ).toBe(false);
  });

  it('requires the first captured page to represent the requested URL', () => {
    const result = validResult();
    result.pages[0]!.requestedUrl = 'https://different.example/';
    expect(playwrightResearchResultSchema.safeParse(result).success).toBe(false);
  });

  it('rejects duplicate canonical final URLs so source persistence stays deterministic', () => {
    const result = validResult();
    result.pages.push({
      ...result.pages[0]!,
      requestedUrl: 'https://example.com/redirect',
      finalUrl: 'https://EXAMPLE.com/#duplicate-fragment',
      title: 'Redirected duplicate',
    });
    result.pageCount = result.pages.length;
    expect(playwrightResearchResultSchema.safeParse(result).success).toBe(false);
  });

  it('rejects oversized extracted source data', () => {
    const result = validResult();
    result.pages[0]!.text = 'x'.repeat(60_001);
    expect(playwrightResearchResultSchema.safeParse(result).success).toBe(false);
  });
});
