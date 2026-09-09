export type WebsitePresence = 'CAPTURED' | 'NOT_FOUND';
export type WebsiteQualityRating = 'GOOD' | 'FAIR' | 'POOR' | 'NOT_RATED';
export type WebsiteAuditRecommendation =
  | 'SKIP_DEMO'
  | 'LOW_PRIORITY'
  | 'DEMO_WORTHY'
  | 'RESEARCH_NEEDED';
export type WebsiteAuditSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
export type WebsiteAuditViewport = 'DESKTOP' | 'MOBILE' | 'BOTH' | 'SOURCE';

export interface WebsiteViewportMetrics {
  viewportWidth: number;
  documentWidth: number;
  hasHorizontalOverflow: boolean;
}

export interface WebsiteAuditSource {
  sourceId: string;
  sourceUrl: string;
  title: string;
  text: string;
  html: string;
  screenshotPath: string | null;
  mobileScreenshotPath: string | null;
  viewportAudit: {
    desktop: WebsiteViewportMetrics | null;
    mobile: WebsiteViewportMetrics | null;
  } | null;
  httpStatus: number | null;
  navigationError: string | null;
  consoleErrors: number;
  discoveredLinks: string[];
}

export interface WebsiteAuditObservation {
  code:
    | 'SITE_UNAVAILABLE'
    | 'CTA_NOT_DETECTED'
    | 'CONTACT_PATH_NOT_DETECTED'
    | 'BOOKING_PATH_NOT_DETECTED'
    | 'SERVICES_PRESENTATION_THIN'
    | 'DESKTOP_HORIZONTAL_OVERFLOW'
    | 'MOBILE_HORIZONTAL_OVERFLOW'
    | 'BROWSER_ERROR_SIGNAL'
    | 'DESKTOP_SCREENSHOT_MISSING'
    | 'MOBILE_SCREENSHOT_MISSING';
  severity: WebsiteAuditSeverity;
  title: string;
  detail: string;
  sourceId: string;
  sourceUrl: string;
  screenshotPath: string | null;
  viewport: WebsiteAuditViewport;
  penalty: number;
}

export interface WebsiteAuditAssessment {
  websitePresence: WebsitePresence;
  qualityScore: number | null;
  qualityRating: WebsiteQualityRating;
  recommendation: WebsiteAuditRecommendation;
  observations: WebsiteAuditObservation[];
  evidenceSourceIds: string[];
  summary: string;
}

const CTA_PATTERN = /\b(book|call|contact|schedule|reserve|appointment|get started|enquire|inquire)\b/iu;
const CONTACT_PATTERN = /(mailto:|tel:|\/contact(?:[/?#]|$)|get-in-touch|reach-us)/iu;
const BOOKING_PATTERN = /(book(?:ing)?|appointment|reserve|fresha|calendly|mindbody|treatwell)/iu;
const SERVICES_PATTERN = /(services?|treatments?|price list|pricing|menu|haircut|styling|facial|massage|spa)/iu;

function sourceHaystack(source: WebsiteAuditSource): string {
  return [source.sourceUrl, source.title, source.text, source.html, ...source.discoveredLinks].join('\n');
}

function bestSource(sources: readonly WebsiteAuditSource[]): WebsiteAuditSource {
  const healthy = sources.find(
    (source) =>
      source.navigationError === null &&
      (source.httpStatus === null || source.httpStatus < 400) &&
      (source.text.trim().length > 0 || source.html.trim().length > 0),
  );
  if (healthy) return healthy;
  const fallback = sources[0];
  if (!fallback) throw new Error('Website audit requires a captured source.');
  return fallback;
}

function observation(
  source: WebsiteAuditSource,
  input: Omit<WebsiteAuditObservation, 'sourceId' | 'sourceUrl'>,
): WebsiteAuditObservation {
  return {
    ...input,
    sourceId: source.sourceId,
    sourceUrl: source.sourceUrl,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function qualityRating(score: number): WebsiteQualityRating {
  if (score >= 85) return 'GOOD';
  if (score >= 70) return 'FAIR';
  return 'POOR';
}

function recommendationFor(rating: WebsiteQualityRating): WebsiteAuditRecommendation {
  if (rating === 'GOOD') return 'SKIP_DEMO';
  if (rating === 'FAIR') return 'LOW_PRIORITY';
  if (rating === 'POOR') return 'DEMO_WORTHY';
  return 'RESEARCH_NEEDED';
}

export function assessWebsiteOpportunity(
  sources: readonly WebsiteAuditSource[],
): WebsiteAuditAssessment {
  if (sources.length === 0) {
    return {
      websitePresence: 'NOT_FOUND',
      qualityScore: null,
      qualityRating: 'NOT_RATED',
      recommendation: 'RESEARCH_NEEDED',
      observations: [],
      evidenceSourceIds: [],
      summary:
        'No captured official website source is available. Treat this as website-not-found evidence, not proof that the business has no website.',
    };
  }

  const anchor = bestSource(sources);
  const observations: WebsiteAuditObservation[] = [];
  const haystack = sources.map(sourceHaystack).join('\n');
  const healthyPages = sources.filter(
    (source) =>
      source.navigationError === null &&
      (source.httpStatus === null || source.httpStatus < 400) &&
      (source.text.trim().length > 0 || source.html.trim().length > 0),
  );

  if (healthyPages.length === 0) {
    observations.push(
      observation(anchor, {
        code: 'SITE_UNAVAILABLE',
        severity: 'HIGH',
        title: 'Captured website was unavailable',
        detail:
          'Every captured website page failed navigation, returned an HTTP error, or produced no usable page content during the audit.',
        screenshotPath: anchor.screenshotPath,
        viewport: 'SOURCE',
        penalty: 45,
      }),
    );
  }

  if (!CTA_PATTERN.test(haystack)) {
    observations.push(
      observation(anchor, {
        code: 'CTA_NOT_DETECTED',
        severity: 'MEDIUM',
        title: 'No recognized conversion CTA detected',
        detail:
          'The captured pages did not contain a recognized booking, calling, contact, scheduling, reservation, or enquiry call to action.',
        screenshotPath: anchor.screenshotPath,
        viewport: 'DESKTOP',
        penalty: 12,
      }),
    );
  }

  if (!CONTACT_PATTERN.test(haystack)) {
    observations.push(
      observation(anchor, {
        code: 'CONTACT_PATH_NOT_DETECTED',
        severity: 'MEDIUM',
        title: 'No clear contact path detected',
        detail:
          'The captured pages and discovered links did not expose a recognized contact page, telephone link, or email link.',
        screenshotPath: anchor.screenshotPath,
        viewport: 'SOURCE',
        penalty: 12,
      }),
    );
  }

  if (!BOOKING_PATTERN.test(haystack)) {
    observations.push(
      observation(anchor, {
        code: 'BOOKING_PATH_NOT_DETECTED',
        severity: 'LOW',
        title: 'No booking path detected',
        detail:
          'The captured Salon & Spa pages did not expose a recognized appointment, reservation, or booking path.',
        screenshotPath: anchor.screenshotPath,
        viewport: 'SOURCE',
        penalty: 8,
      }),
    );
  }

  if (!SERVICES_PATTERN.test(haystack)) {
    observations.push(
      observation(anchor, {
        code: 'SERVICES_PRESENTATION_THIN',
        severity: 'LOW',
        title: 'Service presentation was not detected',
        detail:
          'The captured Salon & Spa pages did not contain recognized service, treatment, pricing, menu, or common salon-service terms.',
        screenshotPath: anchor.screenshotPath,
        viewport: 'SOURCE',
        penalty: 8,
      }),
    );
  }

  for (const source of sources) {
    if (source.viewportAudit?.desktop?.hasHorizontalOverflow === true) {
      observations.push(
        observation(source, {
          code: 'DESKTOP_HORIZONTAL_OVERFLOW',
          severity: 'MEDIUM',
          title: 'Desktop horizontal overflow detected',
          detail: `The captured desktop layout measured ${source.viewportAudit.desktop.documentWidth}px wide inside a ${source.viewportAudit.desktop.viewportWidth}px viewport.`,
          screenshotPath: source.screenshotPath,
          viewport: 'DESKTOP',
          penalty: 10,
        }),
      );
    }
    if (source.viewportAudit?.mobile?.hasHorizontalOverflow === true) {
      observations.push(
        observation(source, {
          code: 'MOBILE_HORIZONTAL_OVERFLOW',
          severity: 'HIGH',
          title: 'Mobile horizontal overflow detected',
          detail: `The captured mobile layout measured ${source.viewportAudit.mobile.documentWidth}px wide inside a ${source.viewportAudit.mobile.viewportWidth}px viewport.`,
          screenshotPath: source.mobileScreenshotPath,
          viewport: 'MOBILE',
          penalty: 15,
        }),
      );
    }
    if (source.consoleErrors > 0) {
      observations.push(
        observation(source, {
          code: 'BROWSER_ERROR_SIGNAL',
          severity: 'LOW',
          title: 'Browser error signal captured',
          detail: `${source.consoleErrors} browser console error signal${source.consoleErrors === 1 ? '' : 's'} were captured on this page. This is a diagnostic signal, not proof of a user-visible defect.`,
          screenshotPath: source.screenshotPath,
          viewport: 'SOURCE',
          penalty: Math.min(5, source.consoleErrors),
        }),
      );
    }
    if (source.screenshotPath === null) {
      observations.push(
        observation(source, {
          code: 'DESKTOP_SCREENSHOT_MISSING',
          severity: 'INFO',
          title: 'Desktop screenshot unavailable',
          detail: 'The audit has source text and diagnostics but no desktop screenshot for this captured page.',
          screenshotPath: null,
          viewport: 'DESKTOP',
          penalty: 0,
        }),
      );
    }
    if (source.mobileScreenshotPath === null) {
      observations.push(
        observation(source, {
          code: 'MOBILE_SCREENSHOT_MISSING',
          severity: 'INFO',
          title: 'Mobile screenshot unavailable',
          detail: 'The audit has source text and diagnostics but no mobile screenshot for this captured page.',
          screenshotPath: null,
          viewport: 'MOBILE',
          penalty: 0,
        }),
      );
    }
  }

  const penalty = observations.reduce((total, item) => total + item.penalty, 0);
  const score = clampScore(100 - penalty);
  const rating = qualityRating(score);
  const recommendation = recommendationFor(rating);
  const evidenceSourceIds = [...new Set(sources.map((source) => source.sourceId))].sort();
  const supportedIssues = observations.filter((item) => item.penalty > 0).length;

  return {
    websitePresence: 'CAPTURED',
    qualityScore: score,
    qualityRating: rating,
    recommendation,
    observations,
    evidenceSourceIds,
    summary:
      supportedIssues === 0
        ? 'No supported website opportunity issues were detected in the captured audit evidence.'
        : `${supportedIssues} evidence-backed website opportunity issue${supportedIssues === 1 ? '' : 's'} detected across the captured pages.`,
  };
}
