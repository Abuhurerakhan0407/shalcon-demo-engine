import type { D1DatabaseLike } from '../d1';
import type { AuthSessionRecord } from '../types';

interface AuthSessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

function mapSession(row: AuthSessionRow): AuthSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
  };
}

export class AuthSessionRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: AuthSessionRecord): Promise<AuthSessionRecord> {
    const row = await this.db
      .prepare(`
        INSERT INTO auth_sessions(
          id, user_id, token_hash, expires_at, created_at, last_seen_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `)
      .bind(
        record.id,
        record.userId,
        record.tokenHash,
        record.expiresAt,
        record.createdAt,
        record.lastSeenAt,
        record.revokedAt,
      )
      .first<AuthSessionRow>();

    if (!row) throw new Error('Auth session insert did not return a row.');
    return mapSession(row);
  }

  async getActiveByTokenHash(tokenHash: string, now: string): Promise<AuthSessionRecord | null> {
    const row = await this.db
      .prepare(`
        SELECT * FROM auth_sessions
        WHERE token_hash = ?
          AND revoked_at IS NULL
          AND expires_at > ?
        LIMIT 1
      `)
      .bind(tokenHash, now)
      .first<AuthSessionRow>();
    return row ? mapSession(row) : null;
  }

  async touch(id: string, at: string): Promise<void> {
    await this.db
      .prepare(`
        UPDATE auth_sessions
        SET last_seen_at = ?
        WHERE id = ? AND revoked_at IS NULL
      `)
      .bind(at, id)
      .run();
  }

  async revokeByTokenHash(tokenHash: string, at: string): Promise<boolean> {
    const row = await this.db
      .prepare(`
        UPDATE auth_sessions
        SET revoked_at = ?
        WHERE token_hash = ? AND revoked_at IS NULL
        RETURNING id
      `)
      .bind(at, tokenHash)
      .first<{ id: string }>();
    return row !== null;
  }

  async deleteExpired(now: string): Promise<void> {
    await this.db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').bind(now).run();
  }
}
