import { assertProspectTransition, type ProspectState } from '@shalcon/state-machine';
import type { D1DatabaseLike } from '../d1';
import type { ProspectRecord, ProspectStateEventRecord } from '../types';

interface ProspectRow {
  id: string;
  campaign_id: string;
  canonical_name: string;
  normalized_name: string;
  domain: string | null;
  phone_normalized: string | null;
  city: string | null;
  address_normalized: string | null;
  niche: string;
  source_first_seen: string;
  current_state: ProspectState;
  created_at: string;
  updated_at: string;
}

interface StateEventRow {
  id: number;
  prospect_id: string;
  from_state: ProspectState;
  to_state: ProspectState;
  occurred_at: string;
}

function mapProspect(row: ProspectRow): ProspectRecord {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    canonicalName: row.canonical_name,
    normalizedName: row.normalized_name,
    domain: row.domain,
    phoneNormalized: row.phone_normalized,
    city: row.city,
    addressNormalized: row.address_normalized,
    niche: row.niche,
    sourceFirstSeen: row.source_first_seen,
    currentState: row.current_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_PROSPECT = `
  SELECT id, campaign_id, canonical_name, normalized_name, domain, phone_normalized,
    city, address_normalized, niche, source_first_seen, current_state, created_at, updated_at
  FROM prospects
`;

export class ProspectRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: ProspectRecord): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO prospects(
          id, campaign_id, canonical_name, normalized_name, domain, phone_normalized, city,
          address_normalized, niche, archetype, source_first_seen, current_state,
          identity_confidence, demo_score, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?)
      `)
      .bind(
        record.id,
        record.campaignId,
        record.canonicalName,
        record.normalizedName,
        record.domain,
        record.phoneNormalized,
        record.city,
        record.addressNormalized ?? null,
        record.niche,
        record.sourceFirstSeen,
        record.currentState,
        record.createdAt,
        record.updatedAt,
      )
      .run();
  }

  async getById(id: string): Promise<ProspectRecord | null> {
    const row = await this.db.prepare(`${SELECT_PROSPECT} WHERE id = ?`).bind(id).first<ProspectRow>();
    return row ? mapProspect(row) : null;
  }

  async getByIdForUser(id: string, userId: string): Promise<ProspectRecord | null> {
    const row = await this.db
      .prepare(`
        SELECT prospect.id, prospect.campaign_id, prospect.canonical_name, prospect.normalized_name,
          prospect.domain, prospect.phone_normalized, prospect.city, prospect.address_normalized,
          prospect.niche, prospect.source_first_seen, prospect.current_state,
          prospect.created_at, prospect.updated_at
        FROM prospects prospect
        JOIN campaigns campaign ON campaign.id = prospect.campaign_id
        WHERE prospect.id = ? AND campaign.user_id = ?
        LIMIT 1
      `)
      .bind(id, userId)
      .first<ProspectRow>();
    return row ? mapProspect(row) : null;
  }

  async listForUser(userId: string, limit = 100): Promise<ProspectRecord[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
    const result = await this.db
      .prepare(`
        SELECT prospect.id, prospect.campaign_id, prospect.canonical_name, prospect.normalized_name,
          prospect.domain, prospect.phone_normalized, prospect.city, prospect.address_normalized,
          prospect.niche, prospect.source_first_seen, prospect.current_state,
          prospect.created_at, prospect.updated_at
        FROM prospects prospect
        JOIN campaigns campaign ON campaign.id = prospect.campaign_id
        WHERE campaign.user_id = ?
        ORDER BY prospect.updated_at DESC, prospect.id DESC
        LIMIT ?
      `)
      .bind(userId, safeLimit)
      .all<ProspectRow>();
    return result.results.map(mapProspect);
  }

  async updateProfile(
    id: string,
    values: Pick<
      ProspectRecord,
      'canonicalName' | 'normalizedName' | 'domain' | 'phoneNormalized' | 'city' | 'addressNormalized'
    >,
    at: string,
  ): Promise<ProspectRecord> {
    const row = await this.db
      .prepare(`
        UPDATE prospects SET
          canonical_name = ?, normalized_name = ?, domain = ?, phone_normalized = ?,
          city = ?, address_normalized = ?, updated_at = ?
        WHERE id = ?
        RETURNING id, campaign_id, canonical_name, normalized_name, domain, phone_normalized,
          city, address_normalized, niche, source_first_seen, current_state, created_at, updated_at
      `)
      .bind(
        values.canonicalName,
        values.normalizedName,
        values.domain,
        values.phoneNormalized,
        values.city,
        values.addressNormalized ?? null,
        at,
        id,
      )
      .first<ProspectRow>();
    if (!row) throw new Error(`Prospect ${id} was not found.`);
    return mapProspect(row);
  }

  async delete(id: string): Promise<boolean> {
    const row = await this.db
      .prepare('DELETE FROM prospects WHERE id = ? RETURNING id')
      .bind(id)
      .first<{ id: string }>();
    return row !== null;
  }

  async transition(id: string, to: ProspectState, at: string): Promise<ProspectRecord> {
    const current = await this.getById(id);
    if (!current) throw new Error(`Prospect ${id} was not found.`);
    assertProspectTransition(current.currentState, to);

    const updated = await this.db
      .prepare(`
        UPDATE prospects
        SET current_state = ?, updated_at = ?
        WHERE id = ? AND current_state = ?
        RETURNING id, campaign_id, canonical_name, normalized_name, domain, phone_normalized,
          city, address_normalized, niche, source_first_seen, current_state, created_at, updated_at
      `)
      .bind(to, at, id, current.currentState)
      .first<ProspectRow>();

    if (!updated) throw new Error(`Prospect ${id} changed concurrently; transition was not applied.`);
    return mapProspect(updated);
  }

  async listStateEvents(id: string): Promise<ProspectStateEventRecord[]> {
    const result = await this.db
      .prepare(`
        SELECT id, prospect_id, from_state, to_state, occurred_at
        FROM prospect_state_events
        WHERE prospect_id = ?
        ORDER BY id ASC
      `)
      .bind(id)
      .all<StateEventRow>();

    return result.results.map((row) => ({
      id: row.id,
      prospectId: row.prospect_id,
      fromState: row.from_state,
      toState: row.to_state,
      occurredAt: row.occurred_at,
    }));
  }
}
