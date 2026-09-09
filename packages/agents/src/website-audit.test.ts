import { describe, expect, it } from 'vitest';

import {
  assessWebsiteOpportunity,
  type WebsiteAuditSource,
} from './website-audit';

function source(overrides: Partial<WebsiteAuditSource> = {}): WebsiteAuditSource {
  return {
    sourceId: 'src_home',
    sourceUrl: 'https://example.com/',
    title: 'Example Salon',
    text: 'Example Salon offers Haircut and Styling. Book an appointment or contact us.',
    html: '<a href="/contact">Contact</a><a href="/book">Book appointment</a>',
    screenshotPath: '/audit/desktop.png',
    mobileScreenshotPath: '/audit/mobile.png',
    viewportAudit: {
      desktop: { viewportWidth: 1440, documentWidth: 1440, hasHorizontalOverflow: false },
      mobile: { viewportWidth: 390, documentWidth: 390, hasHorizontalOverflow: false },
    },
    httpStatus: 200,
    navigationError: null,
    consoleErrors: 0,
    discoveredLinks: ['https://example.com/contact', 'https://example.com/book'],
    ...overrides,
  };
}

describe('assessWebsiteOpportunity', () => {
  it('treats a strong captured website as a skip rather than manufacturing criticism', () => {
    const result = assessWebsiteOpportunity([source()]);

    expect(result.websitePresence).toBe('CAPTURED');
    expect(result.qualityScore).toBe(100);
    expect(result.qualityRating).toBe('GOOD');
    expect(result.recommendation).toBe('SKIP_DEMO');
    expect(result.observations.filter((item) => item.penalty > 0)).toEqual([]);
  });

  it('does not turn missing website evidence into a factual no-website claim', () => {
    const result = assessWebsiteOpportunity([]);

    expect(result.websitePresence).toBe('NOT_FOUND');
    expect(result.qualityScore).toBeNull();
    expect(result.qualityRating).toBe('NOT_RATED');
    expect(result.recommendation).toBe('RESEARCH_NEEDED');
    expect(result.summary).toContain('not proof');
  });

  it('links supported mobile layout criticism to the captured mobile screenshot', () => {
    const result = assessWebsiteOpportunity([
      source({
        viewportAudit: {
          desktop: { viewportWidth: 1440, documentWidth: 1440, hasHorizontalOverflow: false },
          mobile: { viewportWidth: 390, documentWidth: 620, hasHorizontalOverflow: true },
        },
      }),
    ]);

    const overflow = result.observations.find((item) => item.code === 'MOBILE_HORIZONTAL_OVERFLOW');
    expect(overflow).toMatchObject({
      sourceId: 'src_home',
      sourceUrl: 'https://example.com/',
      screenshotPath: '/audit/mobile.png',
      viewport: 'MOBILE',
      penalty: 15,
    });
    expect(result.qualityScore).toBe(85);
    expect(result.qualityRating).toBe('GOOD');
  });

  it('scores only captured-scope observations and keeps source provenance', () => {
    const result = assessWebsiteOpportunity([
      source({
        title: 'Salon',
        text: 'Welcome to our studio.',
        html: '<main>Welcome to our studio.</main>',
        discoveredLinks: [],
      }),
    ]);

    expect(result.observations.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'CTA_NOT_DETECTED',
        'CONTACT_PATH_NOT_DETECTED',
        'BOOKING_PATH_NOT_DETECTED',
        'SERVICES_PRESENTATION_THIN',
      ]),
    );
    expect(result.evidenceSourceIds).toEqual(['src_home']);
    expect(result.qualityRating).toBe('FAIR');
    expect(result.recommendation).toBe('LOW_PRIORITY');
  });

  it('rates captured site failure as a supported opportunity without inventing content defects', () => {
    const result = assessWebsiteOpportunity([
      source({
        text: '',
        html: '',
        httpStatus: 503,
        navigationError: 'navigation failed safely',
        discoveredLinks: [],
      }),
    ]);

    expect(result.observations.some((item) => item.code === 'SITE_UNAVAILABLE')).toBe(true);
    expect(result.qualityRating).toBe('POOR');
    expect(result.recommendation).toBe('DEMO_WORTHY');
  });
});
