import { z } from 'zod';

const httpUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Expected an HTTP(S) URL.');

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
  });

export type PlaywrightResearchResult = z.infer<typeof playwrightResearchResultSchema>;
export type ResearchPageResult = z.infer<typeof researchPageResultSchema>;

export function parseResearchResultForJob(
  raw: unknown,
  jobId: string,
  prospectId: string,
): PlaywrightResearchResult {
  const result = playwrightResearchResultSchema.parse(raw);
  if (result.jobId !== jobId || result.prospectId !== prospectId) {
    throw new Error('Research result does not match the claimed job and prospect.');
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
  const input = new TextEncoder().encode(`phase9:${jobId}:${prospectId}:${finalUrl}`);
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
