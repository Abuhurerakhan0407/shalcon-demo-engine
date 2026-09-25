import {
  CampaignRepository,
  EvidenceRepository,
  IdentityRepository,
  ProspectFactRepository,
  ProspectRepository,
  SourceRecordRepository,
  type D1DatabaseLike,
} from '@shalcon/db';
import {
  VERIFICATION_STATUSES,
  buildIdentityKeys,
  normalizeAddress,
  normalizeBusinessName,
  normalizeCity,
  normalizeDomain,
  normalizePhone,
  normalizePublicUrl,
  resolveIdentity,
  summarizeFieldEvidence,
} from '@shalcon/evidence';
import { Hono } from 'hono';
import { z } from 'zod';

import { randomToken } from './auth';
import type { Bindings } from './context';
import {
  ProspectIdentityError,
  createOrResolveProspectIdentity,
  resolvePendingProspectIdentity,
} from './prospect-identity';

const optionalText = z.string().trim().max(500).optional();
const createProspectSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  domain: optionalText,
  phone: optionalText,
  city: optionalText,
  address: optionalText,
});
const updateProspectSchema = createProspectSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field must be supplied.',
);
const resolveIdentitySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('LINK_TO_EXISTING'),
    canonicalProspectId: z.string().trim().min(1).max(120),
  }),
  z.object({ type: z.literal('KEEP_DISTINCT') }),
]);
const sourceSchema = z.object({
  provider: z.string().trim().min(1).max(80),
  sourceType: z.string().trim().min(1).max(80),
  sourceUrl: z.string().trim().url().max(2048),
  raw: z.unknown().optional(),
});
const evidenceSchema = z.object({
  field: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(1000),
  sourceRecordId: z.string().trim().min(1).max(120),
  sourceQuality: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  excerpt: z.string().trim().max(2000).nullable().optional(),
});
const factSchema = z.object({
  value: z.string().trim().min(1).max(1000),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  confidence: z.number().min(0).max(1),
  evidenceId: z.string().trim().min(1).max(120).nullable().optional(),
});

function requireDb(db: D1DatabaseLike | undefined): D1DatabaseLike {
  if (!db) throw new Error('D1 binding is not configured.');
  return db;
}

function validationError(issues: readonly { message: string }[]) {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((issue) => issue.message).join(' '),
    },
  };
}

function identityError(error: ProspectIdentityError) {
  return {
    error: {
      code: error.code,
      message: error.message,
    },
  };
}

async function ownedProspect(c: {
  env: Bindings['Bindings'];
  get: (key: 'authUser') => Bindings['Variables']['authUser'];
  req: { param: (name: string) => string };
}) {
  const db = requireDb(c.env.DB);
  return new ProspectRepository(db).getByIdForUser(c.req.param('id'), c.get('authUser').id);
}

export const prospectRoutes = new Hono<Bindings>();

prospectRoutes.get('/', async (c) => {
  const db = requireDb(c.env.DB);
  const allProspects = await new ProspectRepository(db).listForUser(c.get('authUser').id);
  const includeSuppressed = c.req.query('includeSuppressed') === 'true';
  const prospects = includeSuppressed
    ? allProspects
    : allProspects.filter((prospect) => prospect.currentState !== 'SUPPRESSED');
  return c.json({ prospects, suppressedCount: allProspects.length - prospects.length });
});

prospectRoutes.post('/', async (c) => {
  const parsed = createProspectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);

  const db = requireDb(c.env.DB);
  const user = c.get('authUser');
  const now = new Date().toISOString();
  const campaign = await new CampaignRepository(db).ensureManualSalonCampaign(user.id, now);
  const result = await createOrResolveProspectIdentity(
    db,
    {
      userId: user.id,
      campaignId: campaign.id,
      canonicalName: parsed.data.businessName,
      normalizedName: normalizeBusinessName(parsed.data.businessName),
      domain: normalizeDomain(parsed.data.domain),
      phoneNormalized: normalizePhone(parsed.data.phone),
      city: normalizeCity(parsed.data.city),
      addressNormalized: normalizeAddress(parsed.data.address),
      niche: 'SALON_SPA',
      sourceType: 'MANUAL',
    },
    now,
  );
  return c.json(result, result.identity.deduplicated ? 200 : 201);
});

prospectRoutes.get('/:id', async (c) => {
  const prospect = await ownedProspect(c);
  if (!prospect) return c.json({ error: { code: 'NOT_FOUND', message: 'Prospect not found.' } }, 404);
  return c.json({ prospect });
});

prospectRoutes.get('/:id/identity', async (c) => {
  const prospect = await ownedProspect(c);
  if (!prospect) return c.json({ error: { code: 'NOT_FOUND', message: 'Prospect not found.' } }, 404);
  const db = requireDb(c.env.DB);
  const user = c.get('authUser');
  const identity = new IdentityRepository(db);
  const keys = buildIdentityKeys({
    normalizedName: prospect.normalizedName,
    domain: prospect.domain,
    phoneNormalized: prospect.phoneNormalized,
    city: prospect.city,
    addressNormalized: prospect.addressNormalized ?? null,
  });
  const matches = await identity.findCandidateMatches(user.id, keys);
  const liveResolution = resolveIdentity(keys, matches.filter((match) => match.prospectId !== prospect.id));
  const [registeredKeys, latestResolution, observations, alias, aliases] = await Promise.all([
    identity.listKeysForProspect(prospect.id),
    identity.latestResolution(prospect.id),
    identity.listObservationsForProspect(prospect.id),
    identity.getAlias(prospect.id),
    identity.listAliasesForCanonical(prospect.id),
  ]);
  const candidateIds = [
    ...new Set([
      ...liveResolution.candidateProspectIds,
      ...(latestResolution ? (JSON.parse(latestResolution.candidateProspectIdsJson) as unknown[]) : []),
    ].filter((value): value is string => typeof value === 'string' && value !== prospect.id)),
  ];
  const candidateProspects = (
    await Promise.all(candidateIds.map((id) => new ProspectRepository(db).getByIdForUser(id, user.id)))
  ).filter((value) => value !== null);
  return c.json({
    prospect,
    liveResolution,
    registeredKeys,
    latestResolution,
    observations,
    alias,
    aliases,
    candidateProspects,
  });
});

prospectRoutes.post('/:id/identity/resolve', async (c) => {
  const parsed = resolveIdentitySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  try {
    const result = await resolvePendingProspectIdentity(
      requireDb(c.env.DB),
      c.get('authUser').id,
      c.req.param('id'),
      parsed.data,
      new Date().toISOString(),
    );
    return c.json(result);
  } catch (error) {
    if (error instanceof ProspectIdentityError) {
      return c.json(identityError(error), error.code === 'NOT_FOUND' ? 404 : 409);
    }
    throw error;
  }
});

prospectRoutes.patch('/:id', async (c) => {
  const current = await ownedProspect(c);
  if (!current) return c.json({ error: { code: 'NOT_FOUND', message: 'Prospect not found.' } }, 404);
  if (!['DISCOVERED', 'NORMALIZED', 'IDENTITY_PENDING'].includes(current.currentState)) {
    return c.json(
      {
        error: {
          code: 'IDENTITY_LOCKED',
          message: 'Canonical identity fields are locked after identity verification. Use evidence-backed correction workflows instead.',
        },
      },
      409,
    );
  }
  const parsed = updateProspectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const data = parsed.data;
  const updated = await new ProspectRepository(requireDb(c.env.DB)).updateProfile(
    current.id,
    {
      canonicalName: data.businessName ?? current.canonicalName,
      normalizedName: normalizeBusinessName(data.businessName ?? current.canonicalName),
      domain: data.domain === undefined ? current.domain : normalizeDomain(data.domain),
      phoneNormalized: data.phone === undefined ? current.phoneNormalized : normalizePhone(data.phone),
      city: data.city === undefined ? current.city : normalizeCity(data.city),
      addressNormalized:
        data.address === undefined ? (current.addressNormalized ?? null) : normalizeAddress(data.address),
    },
    new Date().toISOString(),
  );
  return c.json({ prospect: updated });
});

prospectRoutes.post('/:id/suppress', async (c) => {
  const prospect = await ownedProspect(c);
  if (!prospect) return c.json({ error: { code: 'NOT_FOUND', message: 'Prospect not found.' } }, 404);
  if (prospect.currentState === 'SUPPRESSED') return c.json({ prospect });
  try {
    const updated = await new ProspectRepository(requireDb(c.env.DB)).transition(
      prospect.id,
      'SUPPRESSED',
      new Date().toISOString(),
    );
    return c.json({ prospect: updated });
  } catch {
    return c.json(
      {
        error: {
          code: 'SUPPRESSION_NOT_ALLOWED',
          message: `Prospect cannot be suppressed from state ${prospect.currentState}.`,
        },
      },
      409,
    );
  }
});

prospectRoutes.delete('/:id', async (c) => {
  const prospect = await ownedProspect(c);
  if (!prospect) return c.json({ error: { code: 'NOT_FOUND', message: 'Prospect not found.' } }, 404);
  if (!['DISCOVERED', 'NORMALIZED'].includes(prospect.currentState)) {
    return c.json(
      {
        error: {
          code: 'IDENTITY_AUDIT_LOCKED',
          message: 'Prospects with identity history cannot be deleted; preserve the audit trail.',
        },
      },
      409,
    );
  }
  await new ProspectRepository(requireDb(c.env.DB)).delete(prospect.id);
  return c.body(null, 204);
});

prospectRoutes.post('/:id/sources', async (c) => {
  const prospect = await ownedProspect(c);
  if (!prospect) return c.json({ error: { code: 'NOT_FOUND', message: 'Prospect not found.' } }, 404);
  if (prospect.currentState === 'DUPLICATE') {
    return c.json({ error: { code: 'DUPLICATE_PROSPECT', message: 'Evidence belongs on the canonical prospect.' } }, 409);
  }
  const parsed = sourceSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const sourceUrl = normalizePublicUrl(parsed.data.sourceUrl);
  if (!sourceUrl) {
    return c.json(
      { error: { code: 'INVALID_SOURCE_URL', message: 'Source URL must be public HTTP(S).' } },
      400,
    );
  }
  const source = await new SourceRecordRepository(requireDb(c.env.DB)).create({
    id: `src_${randomToken(12)}`,
    prospectId: prospect.id,
    provider: parsed.data.provider,
    sourceType: parsed.data.sourceType,
    sourceUrl,
    rawJson: JSON.stringify(parsed.data.raw ?? {}),
    capturedAt: new Date().toISOString(),
  });
  return c.json({ source }, 201);
});

prospectRoutes.post('/:id/evidence', async (c) => {
  const prospect = await ownedProspect(c);
  if (!prospect) return c.json({ error: { code: 'NOT_FOUND', message: 'Prospect not found.' } }, 404);
  if (prospect.currentState === 'DUPLICATE') {
    return c.json({ error: { code: 'DUPLICATE_PROSPECT', message: 'Evidence belongs on the canonical prospect.' } }, 409);
  }
  const parsed = evidenceSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const db = requireDb(c.env.DB);
  const source = await new SourceRecordRepository(db).getById(parsed.data.sourceRecordId);
  if (!source || source.prospectId !== prospect.id) {
    return c.json(
      {
        error: {
          code: 'SOURCE_PROSPECT_MISMATCH',
          message: 'Evidence source does not belong to this prospect.',
        },
      },
      400,
    );
  }
  const evidence = await new EvidenceRepository(db).create({
    id: `ev_${randomToken(12)}`,
    prospectId: prospect.id,
    field: parsed.data.field,
    value: parsed.data.value,
    sourceRecordId: source.id,
    sourceUrl: source.sourceUrl,
    sourceQuality: parsed.data.sourceQuality,
    confidence: parsed.data.confidence,
    verificationStatus: parsed.data.verificationStatus,
    excerpt: parsed.data.excerpt ?? null,
    capturedAt: new Date().toISOString(),
  });
  return c.json({ evidence }, 201);
});

prospectRoutes.put('/:id/facts/:field', async (c) => {
  const prospect = await ownedProspect(c);
  if (!prospect) return c.json({ error: { code: 'NOT_FOUND', message: 'Prospect not found.' } }, 404);
  if (prospect.currentState === 'DUPLICATE') {
    return c.json({ error: { code: 'DUPLICATE_PROSPECT', message: 'Facts belong on the canonical prospect.' } }, 409);
  }
  const parsed = factSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const db = requireDb(c.env.DB);
  const field = c.req.param('field');
  const evidenceId = parsed.data.evidenceId ?? null;
  if (parsed.data.verificationStatus === 'VERIFIED' && !evidenceId) {
    return c.json(
      {
        error: {
          code: 'VERIFIED_EVIDENCE_REQUIRED',
          message: 'Verified facts require matching verified evidence.',
        },
      },
      400,
    );
  }
  if (evidenceId) {
    const evidence = await new EvidenceRepository(db).getById(evidenceId);
    if (
      !evidence ||
      evidence.prospectId !== prospect.id ||
      evidence.field !== field ||
      evidence.value !== parsed.data.value ||
      (parsed.data.verificationStatus === 'VERIFIED' && evidence.verificationStatus !== 'VERIFIED')
    ) {
      return c.json(
        {
          error: {
            code: 'FACT_EVIDENCE_MISMATCH',
            message: 'Selected evidence does not support this fact.',
          },
        },
        400,
      );
    }
  }
  const now = new Date().toISOString();
  const fact = await new ProspectFactRepository(db).upsert({
    id: `fact_${randomToken(12)}`,
    prospectId: prospect.id,
    field,
    value: parsed.data.value,
    verificationStatus: parsed.data.verificationStatus,
    confidence: parsed.data.confidence,
    evidenceId,
    createdAt: now,
    updatedAt: now,
  });
  return c.json({ fact });
});

prospectRoutes.get('/:id/evidence-bundle', async (c) => {
  const prospect = await ownedProspect(c);
  if (!prospect) return c.json({ error: { code: 'NOT_FOUND', message: 'Prospect not found.' } }, 404);
  const db = requireDb(c.env.DB);
  const sourceRepository = new SourceRecordRepository(db);
  const evidenceRepository = new EvidenceRepository(db);
  const factRepository = new ProspectFactRepository(db);
  const [sources, evidence, facts] = await Promise.all([
    sourceRepository.listForProspect(prospect.id),
    evidenceRepository.listForProspect(prospect.id),
    factRepository.listForProspect(prospect.id),
  ]);
  const fields = [...new Set(evidence.map((item) => item.field))];
  const conflicts = fields.map((field) => summarizeFieldEvidence(field, evidence));
  return c.json({ prospect, sources, evidence, facts, conflicts });
});
