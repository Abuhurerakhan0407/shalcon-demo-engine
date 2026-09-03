import type { IdentityCandidateMatch, IdentityKey } from '@shalcon/evidence';

import type { D1DatabaseLike } from '../d1';
import type {
  IdentityResolutionRecord,
  ProspectIdentityKeyRecord,
  ProspectObservationRecord,
} from '../types';

interface CandidateRow {
  prospect_id: string;
  key_type: IdentityCandidateMatch['keyType'];
  key_value: string;
}

interface ObservationRow {
  id: string;
  user_id: string;
  campaign_id: string;
  canonical_prospect_id: string | null;
  pending_prospect_id: string | null;
  observed_name: string;
  normalized_name: string;
  domain: string | null;
  phone_normalized: string | null;
  city: string | null;
  address_normalized: string | null;
  source_type: string;
  resolution_status: ProspectObservationRecord['resolutionStatus'];
  confidence: number;
  candidate_prospect_ids_json: string;
  matched_keys_json: string;
  reason_codes_json: string;
  created_at: string;
}

interface ResolutionRow {
  id: string;
  prospect_id: string;
  status: string;
  confidence: number;
  conflicts_json: string;
  evidence_ids_json: string;
  candidate_prospect_ids_json: string;
  matched_keys_json: string;
  reason_codes_json: string;
  created_at: string;
}

function parseStringArray(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
}

function parseIdentityKeys(value: string): IdentityKey[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as { type?: unknown; value?: unknown };
    if (
      (candidate.type === 'DOMAIN' ||
        candidate.type === 'PHONE' ||
        candidate.type === 'NAME_CITY' ||
        candidate.type === 'ADDRESS_CITY') &&
      typeof candidate.value === 'string'
    ) {
      return [{ type: candidate.type, value: candidate.value }];
    }
    return [];
  });
}

function mapObservation(row: ObservationRow): ProspectObservationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    campaignId: row.campaign_id,
    canonicalProspectId: row.canonical_prospect_id,
    pendingProspectId: row.pending_prospect_id,
    observedName: row.observed_name,
    normalizedName: row.normalized_name,
    domain: row.domain,
    phoneNormalized: row.phone_normalized,
    city: row.city,
    addressNormalized: row.address_normalized,
    sourceType: row.source_type,
    resolutionStatus: row.resolution_status,
    confidence: row.confidence,
    candidateProspectIds: parseStringArray(row.candidate_prospect_ids_json),
    matchedKeys: parseIdentityKeys(row.matched_keys_json),
    reasonCodes: parseStringArray(row.reason_codes_json),
    createdAt: row.created_at,
  };
}

function mapResolution(row: ResolutionRow): IdentityResolutionRecord {
  return {
    id: row.id,
    prospectId: row.prospect_id,
    status: row.status,
    confidence: row.confidence,
    conflictsJson: row.conflicts_json,
    evidenceIdsJson: row.evidence_ids_json,
    candidateProspectIdsJson: row.candidate_prospect_ids_json,
    matchedKeysJson: row.matched_keys_json,
    reasonCodesJson: row.reason_codes_json,
    createdAt: row.created_at,
  };
}

export class IdentityRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async findCandidateMatches(userId: string, keys: readonly IdentityKey[]): Promise<IdentityCandidateMatch[]> {
    if (keys.length === 0) return [];
    const clauses = keys.map(() => '(key_type = ? AND key_value = ?)').join(' OR ');
    const bindings: unknown[] = [userId];
    for (const key of keys) bindings.push(key.type, key.value);
    const result = await this.db
      .prepare(`
        SELECT prospect_id, key_type, key_value
        FROM prospect_identity_keys
        WHERE user_id = ? AND (${clauses})
        ORDER BY prospect_id ASC, key_type ASC, key_value ASC
      `)
      .bind(...bindings)
      .all<CandidateRow>();
    return result.results.map((row) => ({
      prospectId: row.prospect_id,
      keyType: row.key_type,
      keyValue: row.key_value,
    }));
  }

  async registerCanonicalKeys(records: readonly ProspectIdentityKeyRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.db.batch(
      records.map((record) =>
        this.db
          .prepare(`
            INSERT INTO prospect_identity_keys(
              id, user_id, prospect_id, key_type, key_value, key_strength, source_type, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            record.id,
            record.userId,
            record.prospectId,
            record.keyType,
            record.keyValue,
            record.keyStrength,
            record.sourceType,
            record.createdAt,
          ),
      ),
    );
  }

  async listKeysForProspect(prospectId: string): Promise<ProspectIdentityKeyRecord[]> {
    const result = await this.db
      .prepare(`
        SELECT id, user_id, prospect_id, key_type, key_value, key_strength, source_type, created_at
        FROM prospect_identity_keys
        WHERE prospect_id = ?
        ORDER BY key_type ASC, key_value ASC
      `)
      .bind(prospectId)
      .all<{
        id: string;
        user_id: string;
        prospect_id: string;
        key_type: ProspectIdentityKeyRecord['keyType'];
        key_value: string;
        key_strength: ProspectIdentityKeyRecord['keyStrength'];
        source_type: string;
        created_at: string;
      }>();
    return result.results.map((row) => ({
      id: row.id,
      userId: row.user_id,
      prospectId: row.prospect_id,
      keyType: row.key_type,
      keyValue: row.key_value,
      keyStrength: row.key_strength,
      sourceType: row.source_type,
      createdAt: row.created_at,
    }));
  }

  async createObservation(record: ProspectObservationRecord): Promise<ProspectObservationRecord> {
    const row = await this.db
      .prepare(`
        INSERT INTO prospect_observations(
          id, user_id, campaign_id, canonical_prospect_id, pending_prospect_id,
          observed_name, normalized_name, domain, phone_normalized, city, address_normalized,
          source_type, resolution_status, confidence, candidate_prospect_ids_json,
          matched_keys_json, reason_codes_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `)
      .bind(
        record.id,
        record.userId,
        record.campaignId,
        record.canonicalProspectId,
        record.pendingProspectId,
        record.observedName,
        record.normalizedName,
        record.domain,
        record.phoneNormalized,
        record.city,
        record.addressNormalized,
        record.sourceType,
        record.resolutionStatus,
        record.confidence,
        JSON.stringify(record.candidateProspectIds),
        JSON.stringify(record.matchedKeys),
        JSON.stringify(record.reasonCodes),
        record.createdAt,
      )
      .first<ObservationRow>();
    if (!row) throw new Error('Prospect observation insert did not return a row.');
    return mapObservation(row);
  }

  async listObservationsForProspect(prospectId: string): Promise<ProspectObservationRecord[]> {
    const result = await this.db
      .prepare(`
        SELECT * FROM prospect_observations
        WHERE canonical_prospect_id = ? OR pending_prospect_id = ?
        ORDER BY created_at DESC, id DESC
      `)
      .bind(prospectId, prospectId)
      .all<ObservationRow>();
    return result.results.map(mapObservation);
  }

  async createResolution(record: IdentityResolutionRecord): Promise<IdentityResolutionRecord> {
    const row = await this.db
      .prepare(`
        INSERT INTO identity_resolutions(
          id, prospect_id, status, confidence, conflicts_json, evidence_ids_json,
          candidate_prospect_ids_json, matched_keys_json, reason_codes_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `)
      .bind(
        record.id,
        record.prospectId,
        record.status,
        record.confidence,
        record.conflictsJson,
        record.evidenceIdsJson,
        record.candidateProspectIdsJson,
        record.matchedKeysJson,
        record.reasonCodesJson,
        record.createdAt,
      )
      .first<ResolutionRow>();
    if (!row) throw new Error('Identity resolution insert did not return a row.');
    return mapResolution(row);
  }

  async latestResolution(prospectId: string): Promise<IdentityResolutionRecord | null> {
    const row = await this.db
      .prepare(`
        SELECT id, prospect_id, status, confidence, conflicts_json, evidence_ids_json,
          candidate_prospect_ids_json, matched_keys_json, reason_codes_json, created_at
        FROM identity_resolutions
        WHERE prospect_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `)
      .bind(prospectId)
      .first<ResolutionRow>();
    return row ? mapResolution(row) : null;
  }
}
