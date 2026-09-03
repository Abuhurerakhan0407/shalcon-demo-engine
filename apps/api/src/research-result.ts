import { z } from 'zod';

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal'] as const;

function isIpLiteralHostname(hostname: string): boolean {
  if (hostname.includes(':')) return true;
  const parts = hostname.split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) >= 0 && Number(part) <= 255)
  );
}

export function canonicalResearchUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (url.port !== '') return null;

    const hostname = url.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
    if (
      !hostname ||
      hostname === 'localhost' ||
      hostname.includes('%') ||
      isIpLiteralHostname(hostname) ||
      BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
    ) {
      return null;
    }

    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

const httpUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => canonicalResearchUrl(value) !== null, 'Expected a safe HTTP(S) web URL.');

const consoleSchema = z.object({
  type: z.enum(['warning', 'error']),
  text: z.string().max(1000),
});

const requestFailureSchema = z.object({
  url: z.string().max(2048),
  error: z.string().max(500),
});

const httpErrorSchema = z.object({
  url: z.string().max(2048),
  status: z.number().int().min(400).max(599),
});

export const researchPageResultSchema = z.object({
  requestedUrl: httpUrlSchema,
  finalUrl: httpUrlSchema,
  capturedAt: z.string().datetime({ offset: true }),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  title: z.string().max(500),
  text: z.string().max(60_000),
  html: z.string().max(120_000),
  screenshotPath: z.string().max(4096).nullable(),
  navigationError: z.string().max(500).nullable(),
  console: z.array(consoleSchema).max(100),
  requestFailures: z.array(requestFailureSchema).max(100),
  httpErrors: z.array(httpErrorSchema).max(100),
  discoveredLinks: z.array(httpUrlSchema).max(50),
});

export const playwrightResearchResultSchema = z
  .object({
    schemaVersion: z.literal('playwright-research.v1'),
    jobId: z.string().min(1).max(160),
    prospectId: z.string().min(1).max(160),
    requestedUrl: httpUrlSchema,
    capturedAt: z.string().datetime({ offset: true }),
    pages: z.array(researchPageResultSchema).min(1).max(6),
    pageCount: z.number().int().min(1).max(6),
    sourceOnly: z.literal(true),
  })
  .superRefine((value, context) => {
    if (value.pageCount !== value.pages.length) {
      context.addIssue({
        code: 'custom',
        path: ['pageCount'],
        message: 'pageCount must equal pages.length.',
      });
    }

    const requested = canonicalResearchUrl(value.requestedUrl);
    const firstRequested = canonicalResearchUrl(value.pages[0]?.requestedUrl ?? '');
    if (!requested || firstRequested !== requested) {
      context.addIssue({
        code: 'custom',
        path: ['pages', 0, 'requestedUrl'],
        message: 'First research page must represent the requested URL.',
      });
    }

    const seenFinalUrls = new Set<string>();
    value.pages.forEach((page, index) => {
      const canonicalFinal = canonicalResearchUrl(page.finalUrl);
      if (!canonicalFinal) return;
      if (seenFinalUrls.has(canonicalFinal)) {
        context.addIssue({
          code: 'custom',
          path: ['pages', index, 'finalUrl'],
          message: 'Research pages must have unique finalUrl values.',
        });
        return;
      }
      seenFinalUrls.add(canonicalFinal);
    });
  });

export type PlaywrightResearchResult = z.infer<typeof playwrightResearchResultSchema>;
export type ResearchPageResult = z.infer<typeof researchPageResultSchema>;

export function parseResearchResultForJob(
  raw: unknown,
  jobId: string,
  prospectId: string,
  expectedRequestedUrl?: string,
): PlaywrightResearchResult {
  const result = playwrightResearchResultSchema.parse(raw);
  if (result.jobId !== jobId || result.prospectId !== prospectId) {
    throw new Error('Research result does not match the claimed job and prospect.');
  }

  if (expectedRequestedUrl !== undefined) {
    const expected = canonicalResearchUrl(expectedRequestedUrl);
    const actual = canonicalResearchUrl(result.requestedUrl);
    if (!expected || !actual || actual !== expected) {
      throw new Error('Research result requested URL does not match the claimed job payload.');
    }
  }

  return result;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function researchSourceId(
  jobId: string,
  prospectId: string,
  finalUrl: string,
): Promise<string> {
  const canonicalUrl = canonicalResearchUrl(finalUrl);
  if (!canonicalUrl) throw new Error('Research source URL is invalid.');
  const input = new TextEncoder().encode(`phase9:${jobId}:${prospectId}:${canonicalUrl}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return `src_pw_${toHex(digest).slice(0, 32)}`;
}

export function researchPageRawJson(
  result: PlaywrightResearchResult,
  page: ResearchPageResult,
): string {
  return JSON.stringify({
    schemaVersion: result.schemaVersion,
    jobId: result.jobId,
    prospectId: result.prospectId,
    requestedUrl: result.requestedUrl,
    researchCapturedAt: result.capturedAt,
    sourceOnly: true,
    page,
  });
}
