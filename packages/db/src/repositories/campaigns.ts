import type { D1DatabaseLike } from '../d1';
import type { CampaignRecord } from '../types';

interface CampaignRow {
  id: string;
  user_id: string;
  name: string;
  niche: string;
  status: string;
  city: string | null;
  approval_mode: string;
  created_at: string;
  updated_at: string;
}

function mapCampaign(row: CampaignRow): CampaignRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    niche: row.niche,
    status: row.status,
    city: row.city,
    approvalMode: row.approval_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CampaignRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: CampaignRecord): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO campaigns(
          id, user_id, name, niche, archetype_filter_json, country, region, city, status,
          daily_discovery_limit, daily_demo_limit, daily_send_limit, min_demo_score,
          approval_mode, email_account_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, '[]', NULL, NULL, ?, ?, 0, 0, 0, 0, ?, NULL, ?, ?)
      `)
      .bind(
        record.id,
        record.userId,
        record.name,
        record.niche,
        record.city,
        record.status,
        record.approvalMode,
        record.createdAt,
        record.updatedAt,
      )
      .run();
  }

  async getById(id: string): Promise<CampaignRecord | null> {
    const row = await this.db
      .prepare(`
        SELECT id, user_id, name, niche, status, city, approval_mode, created_at, updated_at
        FROM campaigns WHERE id = ?
      `)
      .bind(id)
      .first<CampaignRow>();
    return row ? mapCampaign(row) : null;
  }

  async ensureManualSalonCampaign(userId: string, at: string): Promise<CampaignRecord> {
    const id = `cmp_manual_${userId}`;
    const row = await this.db
      .prepare(`
        INSERT INTO campaigns(
          id, user_id, name, niche, archetype_filter_json, country, region, city, status,
          daily_discovery_limit, daily_demo_limit, daily_send_limit, min_demo_score,
          approval_mode, email_account_id, created_at, updated_at
        ) VALUES (?, ?, 'Manual Salon & Spa', 'SALON_SPA', '[]', NULL, NULL, NULL, 'DRAFT',
          0, 0, 0, 0, 'MANUAL', NULL, ?, ?)
        ON CONFLICT(id) DO UPDATE SET updated_at = campaigns.updated_at
        RETURNING id, user_id, name, niche, status, city, approval_mode, created_at, updated_at
      `)
      .bind(id, userId, at, at)
      .first<CampaignRow>();
    if (!row) throw new Error('Manual campaign upsert did not return a row.');
    return mapCampaign(row);
  }
}
