import type { D1DatabaseLike } from '../d1';
import type { LocalRunnerRecord } from '../types';

interface LocalRunnerRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  version: string | null;
  capabilities_json: string;
  status: LocalRunnerRecord['status'];
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}

function mapRunner(row: LocalRunnerRow): LocalRunnerRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    tokenHash: row.token_hash,
    version: row.version,
    capabilitiesJson: row.capabilities_json,
    status: row.status,
    lastHeartbeatAt: row.last_heartbeat_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
  };
}

export class LocalRunnerRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: LocalRunnerRecord): Promise<LocalRunnerRecord> {
    const row = await this.db
      .prepare(`
        INSERT INTO local_runners(
          id, user_id, name, token_hash, version, capabilities_json, status,
          last_heartbeat_at, created_at, updated_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `)
      .bind(
        record.id,
        record.userId,
        record.name,
        record.tokenHash,
        record.version,
        record.capabilitiesJson,
        record.status,
        record.lastHeartbeatAt,
        record.createdAt,
        record.updatedAt,
        record.revokedAt,
      )
      .first<LocalRunnerRow>();
    if (!row) throw new Error('Local runner insert did not return a row.');
    return mapRunner(row);
  }

  async getById(id: string): Promise<LocalRunnerRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM local_runners WHERE id = ?')
      .bind(id)
      .first<LocalRunnerRow>();
    return row ? mapRunner(row) : null;
  }

  async getActiveByTokenHash(tokenHash: string): Promise<LocalRunnerRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM local_runners WHERE token_hash = ? AND status = 'ACTIVE' AND revoked_at IS NULL")
      .bind(tokenHash)
      .first<LocalRunnerRow>();
    return row ? mapRunner(row) : null;
  }

  async listForUser(userId: string): Promise<LocalRunnerRecord[]> {
    const result = await this.db
      .prepare('SELECT * FROM local_runners WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC')
      .bind(userId)
      .all<LocalRunnerRow>();
    return result.results.map(mapRunner);
  }

  async heartbeat(
    id: string,
    version: string | null,
    capabilitiesJson: string,
    now: string,
  ): Promise<LocalRunnerRecord> {
    const row = await this.db
      .prepare(`
        UPDATE local_runners
        SET version = ?, capabilities_json = ?, last_heartbeat_at = ?, updated_at = ?
        WHERE id = ? AND status = 'ACTIVE' AND revoked_at IS NULL
        RETURNING *
      `)
      .bind(version, capabilitiesJson, now, now, id)
      .first<LocalRunnerRow>();
    if (!row) throw new Error(`Local runner ${id} is not active.`);
    return mapRunner(row);
  }

  async revoke(id: string, userId: string, now: string): Promise<LocalRunnerRecord> {
    const row = await this.db
      .prepare(`
        UPDATE local_runners
        SET status = 'REVOKED', revoked_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND status = 'ACTIVE'
        RETURNING *
      `)
      .bind(now, now, id, userId)
      .first<LocalRunnerRow>();
    if (!row) throw new Error(`Local runner ${id} could not be revoked.`);
    return mapRunner(row);
  }
}
