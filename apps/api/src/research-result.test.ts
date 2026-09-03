import { describe, expect, it } from 'vitest';

import { parseResearchResultForJob, playwrightResearchResultSchema } from './research-result';

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
      parseResearchResultForJob(validResult(), 'job_phase9', 'prospect_phase9'),
    ).toMatchObject({ sourceOnly: true, pageCount: 1 });
  });

  it('rejects wrong job or prospect identity', () => {
    expect(() =>
      parseResearchResultForJob(validResult(), 'different_job', 'prospect_phase9'),
    ).toThrow('does not match');
    expect(() =>
      parseResearchResultForJob(validResult(), 'job_phase9', 'different_prospect'),
    ).toThrow('does not match');
  });

  it('rejects inconsistent page counts and unsupported protocols', () => {
    expect(
      playwrightResearchResultSchema.safeParse({ ...validResult(), pageCount: 2 }).success,
    ).toBe(false);
    expect(
      playwrightResearchResultSchema.safeParse({
        ...validResult(),
        requestedUrl: 'file:///etc/passwd',
      }).success,
    ).toBe(false);
  });

  it('rejects oversized extracted source data', () => {
    const result = validResult();
    result.pages[0]!.text = 'x'.repeat(60_001);
    expect(playwrightResearchResultSchema.safeParse(result).success).toBe(false);
  });
});
