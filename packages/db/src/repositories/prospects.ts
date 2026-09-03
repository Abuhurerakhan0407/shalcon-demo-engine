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
    niche: row.niche,
    sourceFirstSeen: row.source_first_seen,
    currentState: row.current_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProspectRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: ProspectRecord): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO prospects(
          id, campaign_id, canonical_name, normalized_name, domain, phone_normalized, city,
          address_normalized, niche, archetype, source_first_seen, current_state,
          identity_confidence, demo_score, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, NULL, NULL, ?, ?)
      `)
      .bind(
        record.id,
        record.campaignId,
        record.canonicalName,
        record.normalizedName,
        record.domain,
        record.phoneNormalized,
        record.city,
        record.niche,
        record.sourceFirstSeen,
        record.currentState,
        record.createdAt,
        record.updatedAt,
      )
      .run();
  }

  async getById(id: string): Promise<ProspectRecord | null> {
    const row = await this.db
      .prepare(`
        SELECT id, campaign_id, canonical_name, normalized_name, domain, phone_normalized,
          city, niche, source_first_seen, current_state, created_at, updated_at
        FROM prospects WHERE id = ?
      `)
      .bind(id)
      .first<ProspectRow>();
    return row ? mapProspect(row) : null;
  }

  async transition(id: string, to: ProspectState, at: string): Promise<ProspectRecord> {
    const current = await this.getById(id);
    if (!current) {
      throw new Error(`Prospect ${id} was not found.`);
    }

    assertProspectTransition(current.currentState, to);

    const updated = await this.db
      .prepare(`
        UPDATE prospects
        SET current_state = ?, updated_at = ?
        WHERE id = ? AND current_state = ?
        RETURNING id, campaign_id, canonical_name, normalized_name, domain, phone_normalized,
          city, niche, source_first_seen, current_state, created_at, updated_at
      `)
      .bind(to, at, id, current.currentState)
      .first<ProspectRow>();

    if (!updated) {
      throw new Error(`Prospect ${id} changed concurrently; transition was not applied.`);
    }

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
