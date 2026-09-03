import type { ProspectFactRecord, ProspectRecord } from '@shalcon/db';
import {
  SALON_QA_FIXTURE_LONG,
  SALON_QA_FIXTURE_MINIMAL,
  validateSalonTemplateConfig,
  type SalonTemplateConfig,
} from '@shalcon/template-runtime';
import { z } from 'zod';

export const PHASE7_THEME_PRESETS = ['WARM_STONE', 'ELANE_PAPER'] as const;
export const PHASE7_HIDEABLE_FIELDS = [
  'descriptor',
  'city',
  'area',
  'address',
  'hours',
  'contact',
] as const;

export const manualDemoBuilderInputSchema = z.object({
  themePreset: z.enum(PHASE7_THEME_PRESETS).default('WARM_STONE'),
  headline: z.string().trim().min(2).max(72).default('A sharper'),
  accentHeadline: z.string().trim().min(2).max(72).default('first impression.'),
  subhead: z
    .string()
    .trim()
    .min(12)
    .max(220)
    .default('A private website concept built around a cleaner, more confident first impression.'),
  hiddenFields: z.array(z.enum(PHASE7_HIDEABLE_FIELDS)).max(PHASE7_HIDEABLE_FIELDS.length).default([]),
});

export type ManualDemoBuilderInput = z.infer<typeof manualDemoBuilderInputSchema>;

export interface VisibleVerifiedField {
  field: string;
  value: string;
  evidenceId: string;
  confidence: number;
}

export interface ManualDemoBuildResult {
  config: SalonTemplateConfig;
  input: ManualDemoBuilderInput;
  visibleFields: VisibleVerifiedField[];
  evidenceMap: Record<string, string[]>;
  contactMode: 'WHATSAPP' | 'CALL' | 'EMAIL' | 'BOOKING_PLACEHOLDER';
}

const FIELD_ALIASES = {
  descriptor: ['category', 'business_category', 'descriptor'],
  city: ['city'],
  area: ['area', 'locality', 'neighborhood'],
  address: ['address'],
  hours: ['hours', 'opening_hours'],
  whatsapp: ['whatsapp', 'whatsapp_phone'],
  phone: ['phone'],
  email: ['email'],
} as const;

function normalizeField(field: string): string {
  return field.trim().toLowerCase();
}

function verifiedFact(
  facts: ProspectFactRecord[],
  aliases: readonly string[],
): ProspectFactRecord | undefined {
  const wanted = new Set(aliases.map(normalizeField));
  return facts.find(
    (fact) =>
      fact.verificationStatus === 'VERIFIED' &&
      Boolean(fact.evidenceId) &&
      wanted.has(normalizeField(fact.field)),
  );
}

function isHidden(input: ManualDemoBuilderInput, field: (typeof PHASE7_HIDEABLE_FIELDS)[number]) {
  return input.hiddenFields.includes(field);
}

function themeFor(preset: ManualDemoBuilderInput['themePreset']): SalonTemplateConfig['theme'] {
  return preset === 'ELANE_PAPER'
    ? { ...SALON_QA_FIXTURE_LONG.theme }
    : { ...SALON_QA_FIXTURE_MINIMAL.theme };
}

function addVisible(
  visibleFields: VisibleVerifiedField[],
  evidenceMap: Record<string, string[]>,
  outputField: string,
  fact: ProspectFactRecord | undefined,
) {
  if (!fact?.evidenceId) return;
  visibleFields.push({
    field: outputField,
    value: fact.value,
    evidenceId: fact.evidenceId,
    confidence: fact.confidence,
  });
  evidenceMap[outputField] = [fact.evidenceId];
}

function safeContact(
  facts: ProspectFactRecord[],
  input: ManualDemoBuilderInput,
  address: ProspectFactRecord | undefined,
  hours: ProspectFactRecord | undefined,
): {
  contact?: NonNullable<SalonTemplateConfig['contact']>;
  primaryCtaLabel?: string;
  contactMode: ManualDemoBuildResult['contactMode'];
  contactFact?: ProspectFactRecord;
} {
  if (isHidden(input, 'contact')) {
    return { contactMode: 'BOOKING_PLACEHOLDER' };
  }

  const whatsapp = verifiedFact(facts, FIELD_ALIASES.whatsapp);
  const phone = verifiedFact(facts, FIELD_ALIASES.phone);
  const email = verifiedFact(facts, FIELD_ALIASES.email);
  const hasContactBlock = Boolean(address || hours || whatsapp || phone || email);
  if (!hasContactBlock) return { contactMode: 'BOOKING_PLACEHOLDER' };

  let contactMode: ManualDemoBuildResult['contactMode'] = 'BOOKING_PLACEHOLDER';
  let contactFact: ProspectFactRecord | undefined;
  let ctaLabel = 'Request appointment ↗';
  let bookingNote = 'Concept demo — booking remains inactive until a verified production channel is connected.';
  let verifiedChannel: Partial<NonNullable<SalonTemplateConfig['contact']>> = {};

  if (whatsapp) {
    contactMode = 'WHATSAPP';
    contactFact = whatsapp;
    ctaLabel = 'WhatsApp to enquire ↗';
    bookingNote = `Concept demo — verified WhatsApp: ${whatsapp.value}. Production can connect this CTA after approval.`;
    verifiedChannel = { whatsapp: whatsapp.value };
  } else if (phone) {
    contactMode = 'CALL';
    contactFact = phone;
    ctaLabel = 'Call to enquire ↗';
    bookingNote = `Concept demo — verified phone: ${phone.value}. Production can connect this CTA after approval.`;
    verifiedChannel = { phone: phone.value };
  } else if (email) {
    contactMode = 'EMAIL';
    contactFact = email;
    ctaLabel = 'Email to enquire ↗';
    bookingNote = `Concept demo — verified email: ${email.value}. Production can connect this CTA after approval.`;
    verifiedChannel = { email: email.value };
  }

  return {
    contactMode,
    ...(contactFact ? { contactFact } : {}),
    primaryCtaLabel: ctaLabel,
    contact: {
      ...(address && !isHidden(input, 'address') ? { address: address.value } : {}),
      ...(hours && !isHidden(input, 'hours') ? { hoursSummary: hours.value } : {}),
      ...verifiedChannel,
      ctaLabel,
      bookingNote,
    },
  };
}

export function defaultManualDemoBuilderInput(): ManualDemoBuilderInput {
  return manualDemoBuilderInputSchema.parse({});
}

export function buildManualSalonDemoConfig(
  prospect: ProspectRecord,
  facts: ProspectFactRecord[],
  rawInput: unknown,
): ManualDemoBuildResult {
  const input = manualDemoBuilderInputSchema.parse(rawInput);
  const visibleFields: VisibleVerifiedField[] = [];
  const evidenceMap: Record<string, string[]> = {};

  const descriptor = verifiedFact(facts, FIELD_ALIASES.descriptor);
  const city = verifiedFact(facts, FIELD_ALIASES.city);
  const area = verifiedFact(facts, FIELD_ALIASES.area);
  const address = verifiedFact(facts, FIELD_ALIASES.address);
  const hours = verifiedFact(facts, FIELD_ALIASES.hours);

  const business: SalonTemplateConfig['business'] = {
    name: prospect.canonicalName,
    ...(descriptor && !isHidden(input, 'descriptor') ? { descriptor: descriptor.value } : {}),
    ...(city && !isHidden(input, 'city') ? { city: city.value } : {}),
    ...(area && !isHidden(input, 'area') ? { area: area.value } : {}),
  };

  if (!isHidden(input, 'descriptor')) addVisible(visibleFields, evidenceMap, 'descriptor', descriptor);
  if (!isHidden(input, 'city')) addVisible(visibleFields, evidenceMap, 'city', city);
  if (!isHidden(input, 'area')) addVisible(visibleFields, evidenceMap, 'area', area);

  const contactResult = safeContact(facts, input, address, hours);
  if (contactResult.contact) {
    if (!isHidden(input, 'address')) addVisible(visibleFields, evidenceMap, 'address', address);
    if (!isHidden(input, 'hours')) addVisible(visibleFields, evidenceMap, 'hours', hours);
    if (contactResult.contactFact) {
      addVisible(
        visibleFields,
        evidenceMap,
        `contact.${contactResult.contactMode.toLowerCase()}`,
        contactResult.contactFact,
      );
    }
  }

  const config: SalonTemplateConfig = {
    ...SALON_QA_FIXTURE_MINIMAL,
    fixtureLabel: 'Private prospect concept preview',
    business,
    hero: {
      ...SALON_QA_FIXTURE_MINIMAL.hero,
      headline: input.headline,
      accentHeadline: input.accentHeadline,
      subhead: input.subhead,
      ...(contactResult.primaryCtaLabel ? { primaryCtaLabel: contactResult.primaryCtaLabel } : {}),
    },
    ...(contactResult.contact ? { contact: contactResult.contact } : {}),
    disclosure: {
      text: 'Concept preview prepared by Shalcon Intelligence · unofficial design concept',
    },
    theme: themeFor(input.themePreset),
    noindex: true,
  };

  const validation = validateSalonTemplateConfig(config);
  if (!validation.ok) {
    throw new Error(`Manual demo configuration is invalid: ${validation.errors.join(' · ')}`);
  }

  return {
    config,
    input,
    visibleFields,
    evidenceMap,
    contactMode: contactResult.contactMode,
  };
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function deriveManualDemoToken(secret: string, demoId: string): Promise<string> {
  if (secret.length < 16) throw new Error('Demo token secret is not configured.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`shalcon-demo-preview:v1:${demoId}`),
  );
  return bytesToBase64Url(signature);
}

export function phase7Expiry(from: Date): string {
  return new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
}
