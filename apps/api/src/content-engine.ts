import {
  EvidenceRepository,
  ProspectRepository,
  type D1DatabaseLike,
  type EvidenceRecord,
} from '@shalcon/db';
import { assertProspectTransition } from '@shalcon/state-machine';
import { z } from 'zod';

export const CONTENT_ENGINE_VERSION = 'content-engine.v1' as const;
export const CONTENT_PROMPT_VERSION = 'content-safe.v1' as const;
export const CONTENT_MODEL = 'deterministic-evidence-rules' as const;
export const CONTENT_SCHEMA_VERSION = 'prospect-content.v1' as const;

const copyBlockSchema = z.object({
  kind: z.enum(['HEADLINE', 'SERVICE_DESCRIPTION', 'ABOUT', 'CTA']),
  text: z.string().trim().min(1).max(320),
  inputEvidenceIds: z.array(z.string().trim().min(1)).max(32),
  promptVersion: z.literal(CONTENT_PROMPT_VERSION),
  model: z.literal(CONTENT_MODEL),
  confidence: z.number().min(0).max(1),
  qaStatus: z.literal('PASS'),
}).strict();

const serviceCopySchema = z.object({
  serviceName: z.string().trim().min(1).max(500),
  serviceEvidenceId: z.string().trim().min(1),
  description: copyBlockSchema,
}).strict();

export const contentPackageSchema = z.object({
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  headline: copyBlockSchema.optional(),
  services: z.array(serviceCopySchema).max(24),
  about: copyBlockSchema.optional(),
  cta: copyBlockSchema.extend({
    channel: z.enum(['BOOKING', 'WHATSAPP', 'CALL', 'EMAIL', 'PLACEHOLDER']),
  }).strict(),
  hiddenSections: z.array(z.enum(['HEADLINE', 'SERVICES', 'ABOUT'])),
}).strict();

export type GeneratedCopyBlock = z.infer<typeof copyBlockSchema>;
export type GeneratedContentPackage = z.infer<typeof contentPackageSchema>;

export interface StoredContentRun {
  id: string;
  prospectId: string;
  templateMatchId: string;
  engineVersion: string;
  promptVersion: string;
  model: string;
  schemaVersion: string;
  status: 'COMPLETED';
  content: GeneratedContentPackage;
  evidenceIds: string[];
  createdAt: string;
}

interface ContentRunRow {
  id: string;
  prospect_id: string;
  template_match_id: string;
  engine_version: string;
  prompt_version: string;
  model: string;
  schema_version: string;
  status: 'COMPLETED';
  content_json: string;
  evidence_ids_json: string;
  created_at: string;
}

interface TemplateMatchRow {
  id: string;
}

const CATEGORY_FIELDS = new Set(['category', 'business_category', 'descriptor']);
const CITY_FIELDS = new Set(['city']);
const DESCRIPTION_FIELDS = new Set(['description', 'business_description', 'about']);
const SERVICE_FIELDS = new Set(['service', 'services']);
const BOOKING_FIELDS = new Set(['booking', 'booking_url', 'appointment_url']);
const WHATSAPP_FIELDS = new Set(['whatsapp', 'whatsapp_phone']);
const PHONE_FIELDS = new Set(['phone']);
const EMAIL_FIELDS = new Set(['email']);

function normalizeField(field: string): string {
  return field.trim().toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/gu, ' ').trim();
  if (clean.length <= max) return clean;
  if (max <= 1) return clean.slice(0, max);
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function scoreEvidence(item: EvidenceRecord): number {
  return item.confidence * 0.75 + item.sourceQuality * 0.25;
}

function pickBestEvidence(
  evidence: EvidenceRecord[],
  acceptedFields: ReadonlySet<string>,
): EvidenceRecord | undefined {
  return evidence
    .filter(
      (item) =>
        item.verificationStatus === 'VERIFIED' &&
        acceptedFields.has(normalizeField(item.field)) &&
        item.value.trim().length > 0,
    )
    .sort((left, right) => scoreEvidence(right) - scoreEvidence(left))[0];
}

function parseServiceValues(item: EvidenceRecord): string[] {
  const raw = item.value.trim();
  if (!raw) return [];
  if (normalizeField(item.field) === 'service') return [raw];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean);
    }
  } catch {
    // A non-JSON verified field remains usable as one source-backed value.
  }
  return raw
    .split(/\r?\n|;/gu)
    .map((value) => value.trim())
    .filter(Boolean);
}

function verifiedServices(evidence: EvidenceRecord[]) {
  const seen = new Set<string>();
  const services: Array<{ name: string; evidenceId: string; confidence: number }> = [];
  for (const item of evidence) {
    if (
      item.verificationStatus !== 'VERIFIED' ||
      !SERVICE_FIELDS.has(normalizeField(item.field))
    ) continue;
    for (const value of parseServiceValues(item)) {
      const key = value.toLocaleLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      services.push({ name: value, evidenceId: item.id, confidence: item.confidence });
      if (services.length >= 24) return services;
    }
  }
  return services;
}

function block(
  kind: GeneratedCopyBlock['kind'],
  text: string,
  evidenceIds: string[],
  confidence: number,
): GeneratedCopyBlock {
  return copyBlockSchema.parse({
    kind,
    text,
    inputEvidenceIds: unique(evidenceIds),
    promptVersion: CONTENT_PROMPT_VERSION,
    model: CONTENT_MODEL,
    confidence,
    qaStatus: 'PASS',
  });
}

function safeHeadline(
  category: EvidenceRecord | undefined,
  city: EvidenceRecord | undefined,
): GeneratedCopyBlock | undefined {
  if (!category) return undefined;
  const categoryText = clip(category.value, 92);
  if (city) {
    return block(
      'HEADLINE',
      `${categoryText} in ${clip(city.value, 56)}`,
      [category.id, city.id],
      Math.min(category.confidence, city.confidence),
    );
  }
  return block('HEADLINE', `Explore ${categoryText}`, [category.id], category.confidence);
}

function safeAbout(
  description: EvidenceRecord | undefined,
  category: EvidenceRecord | undefined,
  city: EvidenceRecord | undefined,
): GeneratedCopyBlock | undefined {
  if (description) {
    return block('ABOUT', clip(description.value, 280), [description.id], description.confidence);
  }
  if (!category) return undefined;
  const evidenceIds = [category.id, ...(city ? [city.id] : [])];
  const text = `${clip(category.value, 120)}${city ? ` in ${clip(city.value, 56)}` : ''}.`;
  const confidence = city ? Math.min(category.confidence, city.confidence) : category.confidence;
  return block('ABOUT', text, evidenceIds, confidence);
}

function safeCta(evidence: EvidenceRecord[]): GeneratedContentPackage['cta'] {
  const options = [
    { item: pickBestEvidence(evidence, BOOKING_FIELDS), channel: 'BOOKING' as const, text: 'Book an appointment' },
    { item: pickBestEvidence(evidence, WHATSAPP_FIELDS), channel: 'WHATSAPP' as const, text: 'Enquire on WhatsApp' },
    { item: pickBestEvidence(evidence, PHONE_FIELDS), channel: 'CALL' as const, text: 'Call to enquire' },
    { item: pickBestEvidence(evidence, EMAIL_FIELDS), channel: 'EMAIL' as const, text: 'Email to enquire' },
  ];
  const selected = options.find((option) => option.item !== undefined);
  if (selected?.item) {
    return {
      ...block('CTA', selected.text, [selected.item.id], selected.item.confidence),
      channel: selected.channel,
    };
  }
  return {
    ...block('CTA', 'Request an appointment', [], 1),
    channel: 'PLACEHOLDER',
  };
}

export function buildContentPackageFromVerifiedEvidence(
  evidence: EvidenceRecord[],
): GeneratedContentPackage {
  const verified = evidence.filter((item) => item.verificationStatus === 'VERIFIED');
  const category = pickBestEvidence(verified, CATEGORY_FIELDS);
  const city = pickBestEvidence(verified, CITY_FIELDS);
  const description = pickBestEvidence(verified, DESCRIPTION_FIELDS);
  const headline = safeHeadline(category, city);
  const about = safeAbout(description, category, city);
  const services = verifiedServices(verified).map((service) => ({
    serviceName: service.name,
    serviceEvidenceId: service.evidenceId,
    description: block(
      'SERVICE_DESCRIPTION',
      `Learn more about ${clip(service.name, 96)}.`,
      [service.evidenceId],
      service.confidence,
    ),
  }));
  const hiddenSections: GeneratedContentPackage['hiddenSections'] = [];
  if (!headline) hiddenSections.push('HEADLINE');
  if (services.length === 0) hiddenSections.push('SERVICES');
  if (!about) hiddenSections.push('ABOUT');

  return contentPackageSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    ...(headline ? { headline } : {}),
    services,
    ...(about ? { about } : {}),
    cta: safeCta(verified),
    hiddenSections,
  });
}

function parseEvidenceIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function parseRun(row: ContentRunRow): StoredContentRun {
  const parsedContent: unknown = JSON.parse(row.content_json);
  return {
    id: row.id,
    prospectId: row.prospect_id,
    templateMatchId: row.template_match_id,
    engineVersion: row.engine_version,
    promptVersion: row.prompt_version,
    model: row.model,
    schemaVersion: row.schema_version,
    status: row.status,
    content: contentPackageSchema.parse(parsedContent),
    evidenceIds: parseEvidenceIds(row.evidence_ids_json),
    createdAt: row.created_at,
  };
}

function randomId(): string {
  return `content_${crypto.randomUUID().replaceAll('-', '')}`;
}

async function latestTemplateMatch(
  db: D1DatabaseLike,
  prospectId: string,
): Promise<TemplateMatchRow | null> {
  return db
    .prepare(`
      SELECT id
      FROM template_match_runs
      WHERE prospect_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `)
    .bind(prospectId)
    .first<TemplateMatchRow>();
}

export async function getContentHistory(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
): Promise<StoredContentRun[]> {
  const prospect = await new ProspectRepository(db).getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  const rows = await db
    .prepare(`
      SELECT run.*
      FROM content_generation_runs run
      JOIN prospects prospect ON prospect.id = run.prospect_id
      JOIN campaigns campaign ON campaign.id = prospect.campaign_id
      WHERE run.prospect_id = ? AND campaign.user_id = ?
      ORDER BY run.created_at DESC, run.id DESC
      LIMIT 50
    `)
    .bind(prospectId, userId)
    .all<ContentRunRow>();
  return rows.results.map(parseRun);
}

export async function runContentGeneration(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
  now = new Date().toISOString(),
): Promise<StoredContentRun> {
  const prospects = new ProspectRepository(db);
  const prospect = await prospects.getByIdForUser(prospectId, userId);
  if (!prospect) throw new Error('Prospect not found.');
  if (prospect.currentState !== 'TEMPLATE_MATCHED' && prospect.currentState !== 'CONTENT_PENDING') {
    throw new Error(
      `Content generation requires TEMPLATE_MATCHED or CONTENT_PENDING state; found ${prospect.currentState}.`,
    );
  }
  if (prospect.currentState === 'TEMPLATE_MATCHED') {
    assertProspectTransition('TEMPLATE_MATCHED', 'CONTENT_PENDING');
  }

  const match = await latestTemplateMatch(db, prospect.id);
  if (!match) throw new Error('A template match is required before content generation.');
  const evidence = await new EvidenceRepository(db).listForProspect(prospect.id);
  const content = buildContentPackageFromVerifiedEvidence(evidence);
  const evidenceIds = unique([
    ...(content.headline?.inputEvidenceIds ?? []),
    ...content.services.flatMap((service) => [service.serviceEvidenceId, ...service.description.inputEvidenceIds]),
    ...(content.about?.inputEvidenceIds ?? []),
    ...content.cta.inputEvidenceIds,
  ]);
  const runId = randomId();
  const insert = db
    .prepare(`
      INSERT INTO content_generation_runs(
        id, prospect_id, template_match_id, engine_version, prompt_version, model,
        schema_version, status, content_json, evidence_ids_json, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?
      WHERE EXISTS (
        SELECT 1
        FROM prospects prospect
        JOIN campaigns campaign ON campaign.id = prospect.campaign_id
        WHERE prospect.id = ?
          AND campaign.user_id = ?
          AND prospect.current_state = ?
      )
    `)
    .bind(
      runId,
      prospect.id,
      match.id,
      CONTENT_ENGINE_VERSION,
      CONTENT_PROMPT_VERSION,
      CONTENT_MODEL,
      CONTENT_SCHEMA_VERSION,
      JSON.stringify(content),
      JSON.stringify(evidenceIds),
      now,
      prospect.id,
      userId,
      prospect.currentState,
    );

  const statements = [insert];
  if (prospect.currentState === 'TEMPLATE_MATCHED') {
    statements.push(
      db
        .prepare(`
          UPDATE prospects
          SET current_state = 'CONTENT_PENDING', updated_at = ?
          WHERE id = ? AND current_state = 'TEMPLATE_MATCHED'
            AND campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)
        `)
        .bind(now, prospect.id, userId),
    );
  }
  const writes = await db.batch(statements);
  if (Number(writes[0]?.meta?.changes ?? 0) < 1) {
    throw new Error('Prospect changed concurrently; content run was not persisted.');
  }
  if (prospect.currentState === 'TEMPLATE_MATCHED' && Number(writes[1]?.meta?.changes ?? 0) < 1) {
    throw new Error('Prospect changed concurrently; content state was not advanced.');
  }

  const history = await getContentHistory(db, userId, prospect.id);
  const run = history.find((item) => item.id === runId);
  if (!run) throw new Error('Content generation history could not be reloaded.');
  return run;
}
