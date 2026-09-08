import { z } from 'zod';

const safeSourceUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password && !!url.hostname;
    } catch {
      return false;
    }
  }, 'Invalid source URL.');

const nullableBounded = (max: number) => z.string().trim().max(max).nullable();

export const businessExtractionSchema = z
  .object({
    businessName: z.string().trim().min(1).max(200),
    description: nullableBounded(2000),
    phone: nullableBounded(100),
    email: nullableBounded(320),
    address: nullableBounded(1000),
    openingHours: z.array(z.string().trim().min(1).max(200)).max(14),
    services: z.array(z.string().trim().min(1).max(200)).max(24),
    socialLinks: z.array(z.string().trim().min(1).max(2048)).max(20),
  })
  .strict();

export const aiExtractionResultSchema = z
  .object({
    schemaVersion: z.literal('business-extraction.v1'),
    sourceOnly: z.literal(true),
    verified: z.literal(false),
    provider: z.literal('ollama'),
    model: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
    adapter: z.enum(['ollama-direct', 'scrapegraphai']),
    extracted: businessExtractionSchema,
    provenance: z
      .array(
        z
          .object({
            sourceId: z.string().trim().min(1).max(160),
            url: safeSourceUrl,
          })
          .strict(),
      )
      .min(1)
      .max(6),
    telemetry: z
      .object({
        attempts: z.number().int().min(1).max(3),
        elapsedMs: z.number().int().min(0).max(3_600_000),
        sourceChars: z.number().int().min(1).max(40_000),
        promptChars: z.number().int().min(1).max(200_000),
      })
      .strict(),
  })
  .strict();

export type AiExtractionResult = z.infer<typeof aiExtractionResultSchema>;

export function parseAiExtractionResult(value: unknown): AiExtractionResult {
  return aiExtractionResultSchema.parse(value);
}
