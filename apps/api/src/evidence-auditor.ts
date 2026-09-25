import {
  EvidenceRepository,
  ProspectFactRepository,
  ProspectRepository,
  type D1DatabaseLike,
  type EvidenceRecord,
  type ProspectFactRecord,
  type ProspectRecord,
} from '@shalcon/db';
import { normalizeAddress, normalizeBusinessName } from '@shalcon/evidence';

import {
  EvidenceReviewError,
  reviewEvidenceCandidate,
} from './evidence-verification';

export type EvidenceAuditAction = 'AUTO_REJECT' | 'AUTO_VERIFY' | 'HUMAN_REQUIRED';

export interface EvidenceAuditRecommendation {
  prospectId: string;
  evidenceId: string;
  field: string;
  value: string;
  action: EvidenceAuditAction;
  promoteToFact: boolean;
  reasonCode:
    | 'MALFORMED_TEXT'
    | 'LOCKED_IDENTITY_CONFLICT'
    | 'MATCHES_LOCKED_IDENTITY'
    | 'MATCHES_VERIFIED_FACT'
    | 'MATCHES_VERIFIED_EVIDENCE'
    | 'MULTI_SOURCE_CORROBORATION'
    | 'CRITICAL_CONFLICT_REQUIRES_HUMAN'
    | 'INSUFFICIENT_CORROBORATION';
  supportCount: number;
}

export interface ProspectEvidenceAuditPlan {
  prospect: Pick<ProspectRecord, 'id' | 'canonicalName' | 'currentState'>;
  recommendations: EvidenceAuditRecommendation[];
  autoRejectCount: number;
  autoVerifyCount: number;
  humanRequiredCount: number;
}

export interface EvidenceAuditPreview {
  prospectCount: number;
  safeActionCount: number;
  autoRejectCount: number;
  autoVerifyCount: number;
  humanRequiredCount: number;
  plans: ProspectEvidenceAuditPlan[];
}

export interface EvidenceAuditApplyResult extends EvidenceAuditPreview {
  appliedCount: number;
  skippedCount: number;
}

const REVIEWABLE = new Set(['PROBABLE', 'UNVERIFIED']);
const CRITICAL_FIELDS = new Set(['businessname', 'phone', 'address']);
const MULTI_VALUE_FIELDS = new Set(['service', 'services', 'openinghours', 'sociallink', 'sociallinks']);

function fieldKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/gu, '');
}

function cleanValue(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

function phoneKey(value: string): string {
  return value.replace(/\D/gu, '');
}

function valueKey(field: string, value: string): string {
  const key = fieldKey(field);
  if (key === 'businessname') return normalizeBusinessName(value);
  if (key === 'phone') return phoneKey(value);
  if (key === 'address') return normalizeAddress(value) ?? cleanValue(value).toLocaleLowerCase('en-IN');
  return cleanValue(value).toLocaleLowerCase('en-IN');
}

function identityValue(prospect: ProspectRecord, field: string): string | null {
  const key = fieldKey(field);
  if (key === 'businessname') return normalizeBusinessName(prospect.canonicalName);
  if (key === 'phone') return prospect.phoneNormalized ? phoneKey(prospect.phoneNormalized) : null;
  if (key === 'address') {
    return prospect.addressNormalized
      ? normalizeAddress(prospect.addressNormalized) ?? prospect.addressNormalized
      : null;
  }
  return null;
}

function looksMalformed(field: string, value: string): boolean {
  const normalizedField = fieldKey(field);
  const cleaned = cleanValue(value);
  if (!cleaned) return true;
  if (/[\uFFFD]/u.test(cleaned)) return true;
  if (/\b\d+\s+points?\s+away\s+from\s+level\s+\d+\b/iu.test(cleaned)) return true;

  if (normalizedField === 'description') {
    const lower = cleaned.toLocaleLowerCase('en-IN');
    const chromeTokens = ['directions', 'save', 'nearby', 'send to phone', 'share'];
    if (chromeTokens.filter((token) => lower.includes(token)).length >= 3) return true;
  }

  if (normalizedField === 'openinghours') {
    if (/\b(?:directions|nearby|send to phone|share)\b/iu.test(cleaned)) return true;
  }

  return false;
}

function verifiedValueKeys(evidence: EvidenceRecord[], field: string): Set<string> {
  return new Set(
    evidence
      .filter((item) => item.field === field && item.verificationStatus === 'VERIFIED')
      .map((item) => valueKey(field, item.value)),
  );
}

function verifiedFactValue(facts: ProspectFactRecord[], field: string): string | null {
  const fact = facts.find((item) => item.field === field && item.verificationStatus === 'VERIFIED');
  return fact ? valueKey(field, fact.value) : null;
}

interface Group {
  key: string;
  items: EvidenceRecord[];
  sourceIds: Set<string>;
  bestConfidence: number;
  bestSourceQuality: number;
  containsVerified: boolean;
}

function groupsForField(evidence: EvidenceRecord[], field: string): Group[] {
  const groups = new Map<string, Group>();
  for (const item of evidence) {
    if (item.field !== field || item.verificationStatus === 'REJECTED') continue;
    const key = valueKey(field, item.value);
    const group = groups.get(key) ?? {
      key,
      items: [],
      sourceIds: new Set<string>(),
      bestConfidence: 0,
      bestSourceQuality: 0,
      containsVerified: false,
    };
    group.items.push(item);
    group.sourceIds.add(item.sourceRecordId);
    group.bestConfidence = Math.max(group.bestConfidence, item.confidence);
    group.bestSourceQuality = Math.max(group.bestSourceQuality, item.sourceQuality);
    group.containsVerified ||= item.verificationStatus === 'VERIFIED';
    groups.set(key, group);
  }
  return [...groups.values()];
}

function recommendation(
  prospectId: string,
  item: EvidenceRecord,
  action: EvidenceAuditAction,
  reasonCode: EvidenceAuditRecommendation['reasonCode'],
  supportCount: number,
  promoteToFact = false,
): EvidenceAuditRecommendation {
  return {
    prospectId,
    evidenceId: item.id,
    field: item.field,
    value: item.value,
    action,
    promoteToFact,
    reasonCode,
    supportCount,
  };
}

function pickFactEvidence(items: EvidenceRecord[]): EvidenceRecord | null {
  return (
    [...items].sort(
      (left, right) =>
        right.sourceQuality - left.sourceQuality ||
        right.confidence - left.confidence ||
        left.id.localeCompare(right.id),
    )[0] ?? null
  );
}

export async function planProspectEvidenceAudit(
  db: D1DatabaseLike,
  userId: string,
  prospectId: string,
): Promise<ProspectEvidenceAuditPlan> {
  const prospects = new ProspectRepository(db);
  const prospect = await prospects.getByIdForUser(prospectId, userId);
  if (!prospect) throw new EvidenceReviewError('NOT_FOUND', 'Prospect not found.', 404);

  const evidence = await new EvidenceRepository(db).listForProspect(prospect.id);
  const facts = await new ProspectFactRepository(db).listForProspect(prospect.id);
  const pending = evidence.filter((item) => REVIEWABLE.has(item.verificationStatus));
  const fields = [...new Set(evidence.map((item) => item.field))];

  const recommendations = new Map<string, EvidenceAuditRecommendation>();

  for (const item of pending) {
    if (looksMalformed(item.field, item.value)) {
      recommendations.set(
        item.id,
        recommendation(prospect.id, item, 'AUTO_REJECT', 'MALFORMED_TEXT', 1),
      );
    }
  }

  for (const field of fields) {
    const normalizedField = fieldKey(field);
    const critical = CRITICAL_FIELDS.has(normalizedField);
    const groups = groupsForField(evidence, field);
    const activeGroups = groups.filter((group) =>
      group.items.some((item) => item.verificationStatus !== 'REJECTED'),
    );
    const identity = critical ? identityValue(prospect, field) : null;
    const identityGroup = identity ? activeGroups.find((group) => group.key === identity) : undefined;
    const verifiedGroups = activeGroups.filter((group) => group.containsVerified);
    const verifiedFact = verifiedFactValue(facts, field);

    if (critical && identityGroup) {
      const verifiedConflict = verifiedGroups.some((group) => group.key !== identityGroup.key);

      if (!verifiedConflict) {
        for (const group of activeGroups) {
          if (group.key === identityGroup.key) continue;
          for (const item of group.items) {
            if (!REVIEWABLE.has(item.verificationStatus) || recommendations.has(item.id)) continue;
            recommendations.set(
              item.id,
              recommendation(
                prospect.id,
                item,
                'AUTO_REJECT',
                'LOCKED_IDENTITY_CONFLICT',
                group.sourceIds.size,
              ),
            );
          }
        }

        const promotable = pickFactEvidence(
          identityGroup.items.filter((item) => REVIEWABLE.has(item.verificationStatus)),
        );
        for (const item of identityGroup.items) {
          if (!REVIEWABLE.has(item.verificationStatus) || recommendations.has(item.id)) continue;
          if (item.sourceQuality < 0.65 || item.confidence < 0.78) {
            recommendations.set(
              item.id,
              recommendation(
                prospect.id,
                item,
                'HUMAN_REQUIRED',
                'INSUFFICIENT_CORROBORATION',
                identityGroup.sourceIds.size,
              ),
            );
            continue;
          }
          recommendations.set(
            item.id,
            recommendation(
              prospect.id,
              item,
              'AUTO_VERIFY',
              'MATCHES_LOCKED_IDENTITY',
              identityGroup.sourceIds.size,
              promotable?.id === item.id && verifiedFact !== identityGroup.key,
            ),
          );
        }
        continue;
      }
    }

    if (critical && activeGroups.length > 1) {
      for (const group of activeGroups) {
        for (const item of group.items) {
          if (!REVIEWABLE.has(item.verificationStatus) || recommendations.has(item.id)) continue;
          recommendations.set(
            item.id,
            recommendation(
              prospect.id,
              item,
              'HUMAN_REQUIRED',
              'CRITICAL_CONFLICT_REQUIRES_HUMAN',
              group.sourceIds.size,
            ),
          );
        }
      }
      continue;
    }

    for (const group of activeGroups) {
      const unresolved = group.items.filter(
        (item) => REVIEWABLE.has(item.verificationStatus) && !recommendations.has(item.id),
      );
      if (!unresolved.length) continue;

      if (verifiedFact === group.key) {
        for (const item of unresolved) {
          recommendations.set(
            item.id,
            recommendation(
              prospect.id,
              item,
              'AUTO_VERIFY',
              'MATCHES_VERIFIED_FACT',
              group.sourceIds.size,
            ),
          );
        }
        continue;
      }

      const verifiedValues = verifiedValueKeys(evidence, field);
      if (verifiedValues.has(group.key)) {
        for (const item of unresolved) {
          recommendations.set(
            item.id,
            recommendation(
              prospect.id,
              item,
              'AUTO_VERIFY',
              'MATCHES_VERIFIED_EVIDENCE',
              group.sourceIds.size,
            ),
          );
        }
        continue;
      }

      if (
        group.sourceIds.size >= 2 &&
        group.bestConfidence >= 0.9 &&
        group.bestSourceQuality >= 0.9
      ) {
        const promotable = critical ? pickFactEvidence(unresolved) : null;
        for (const item of unresolved) {
          recommendations.set(
            item.id,
            recommendation(
              prospect.id,
              item,
              'AUTO_VERIFY',
              'MULTI_SOURCE_CORROBORATION',
              group.sourceIds.size,
              promotable?.id === item.id && verifiedFact !== group.key,
            ),
          );
        }
        continue;
      }

      for (const item of unresolved) {
        recommendations.set(
          item.id,
          recommendation(
            prospect.id,
            item,
            'HUMAN_REQUIRED',
            critical && activeGroups.length > 1
              ? 'CRITICAL_CONFLICT_REQUIRES_HUMAN'
              : 'INSUFFICIENT_CORROBORATION',
            group.sourceIds.size,
          ),
        );
      }
    }
  }

  for (const item of pending) {
    if (!recommendations.has(item.id)) {
      recommendations.set(
        item.id,
        recommendation(
          prospect.id,
          item,
          'HUMAN_REQUIRED',
          'INSUFFICIENT_CORROBORATION',
          1,
        ),
      );
    }
  }

  const ordered = [...recommendations.values()].sort((left, right) => {
    const rank = (action: EvidenceAuditAction) =>
      action === 'AUTO_REJECT' ? 0 : action === 'AUTO_VERIFY' ? 1 : 2;
    return (
      rank(left.action) - rank(right.action) ||
      left.field.localeCompare(right.field) ||
      left.evidenceId.localeCompare(right.evidenceId)
    );
  });

  return {
    prospect: {
      id: prospect.id,
      canonicalName: prospect.canonicalName,
      currentState: prospect.currentState,
    },
    recommendations: ordered,
    autoRejectCount: ordered.filter((item) => item.action === 'AUTO_REJECT').length,
    autoVerifyCount: ordered.filter((item) => item.action === 'AUTO_VERIFY').length,
    humanRequiredCount: ordered.filter((item) => item.action === 'HUMAN_REQUIRED').length,
  };
}

export async function previewEvidenceAudit(
  db: D1DatabaseLike,
  userId: string,
  prospectIds?: readonly string[],
): Promise<EvidenceAuditPreview> {
  const prospects = await new ProspectRepository(db).listForUser(userId);
  const allowed = prospectIds ? new Set(prospectIds) : null;
  const selected = allowed ? prospects.filter((prospect) => allowed.has(prospect.id)) : prospects;

  if (allowed && selected.length !== allowed.size) {
    throw new EvidenceReviewError('NOT_FOUND', 'One or more prospects were not found.', 404);
  }

  const plans: ProspectEvidenceAuditPlan[] = [];
  for (const prospect of selected) {
    plans.push(await planProspectEvidenceAudit(db, userId, prospect.id));
  }

  const autoRejectCount = plans.reduce((sum, plan) => sum + plan.autoRejectCount, 0);
  const autoVerifyCount = plans.reduce((sum, plan) => sum + plan.autoVerifyCount, 0);
  const humanRequiredCount = plans.reduce((sum, plan) => sum + plan.humanRequiredCount, 0);

  return {
    prospectCount: plans.length,
    safeActionCount: autoRejectCount + autoVerifyCount,
    autoRejectCount,
    autoVerifyCount,
    humanRequiredCount,
    plans,
  };
}

function auditNote(item: EvidenceAuditRecommendation): string {
  return `AI Evidence Auditor · ${item.reasonCode} · support=${item.supportCount}`;
}

export async function applySafeEvidenceAudit(
  db: D1DatabaseLike,
  userId: string,
  prospectIds?: readonly string[],
  now = new Date().toISOString(),
): Promise<EvidenceAuditApplyResult> {
  const preview = await previewEvidenceAudit(db, userId, prospectIds);
  const safe = preview.plans
    .flatMap((plan) => plan.recommendations)
    .filter(
      (item): item is EvidenceAuditRecommendation =>
        item.action === 'AUTO_REJECT' || item.action === 'AUTO_VERIFY',
    )
    .sort((left, right) => {
      const rank = (item: EvidenceAuditRecommendation) => (item.action === 'AUTO_REJECT' ? 0 : 1);
      return rank(left) - rank(right) || left.evidenceId.localeCompare(right.evidenceId);
    });

  let appliedCount = 0;
  let skippedCount = 0;

  for (const item of safe) {
    try {
      await reviewEvidenceCandidate(
        db,
        userId,
        item.prospectId,
        item.evidenceId,
        item.action === 'AUTO_REJECT'
          ? { decision: 'REJECT', note: auditNote(item) }
          : {
              decision: 'VERIFY',
              promoteToFact: item.promoteToFact,
              note: auditNote(item),
            },
        now,
      );
      appliedCount += 1;
    } catch (error) {
      if (error instanceof EvidenceReviewError && error.code === 'EVIDENCE_ALREADY_REVIEWED') {
        skippedCount += 1;
        continue;
      }
      throw error;
    }
  }

  const remaining = await previewEvidenceAudit(db, userId, prospectIds);
  return {
    ...remaining,
    appliedCount,
    skippedCount,
  };
}
