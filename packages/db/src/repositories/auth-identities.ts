import type { D1DatabaseLike } from '../d1';
import type { AuthIdentityRecord } from '../types';

interface AuthIdentityRow {
  id: string;
  user_id: string;
  provider: string;
  provider_subject: string;
  email_at_link: string;
  created_at: string;
  updated_at: string;
}

function mapIdentity(row: AuthIdentityRow): AuthIdentityRecord {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    providerSubject: row.provider_subject,
    emailAtLink: row.email_at_link,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AuthIdentityRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async getByProviderSubject(
    provider: string,
    providerSubject: string,
  ): Promise<AuthIdentityRecord | null> {
    const row = await this.db
      .prepare(`
        SELECT id, user_id, provider, provider_subject, email_at_link, created_at, updated_at
        FROM auth_identities
        WHERE provider = ? AND provider_subject = ?
        LIMIT 1
      `)
      .bind(provider, providerSubject)
      .first<AuthIdentityRow>();
    return row ? mapIdentity(row) : null;
  }

  async createOrGet(
    record: AuthIdentityRecord,
  ): Promise<{ identity: AuthIdentityRecord; created: boolean }> {
    const created = await this.db
      .prepare(`
        INSERT OR IGNORE INTO auth_identities(
          id, user_id, provider, provider_subject, email_at_link, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING id, user_id, provider, provider_subject, email_at_link, created_at, updated_at
      `)
      .bind(
        record.id,
        record.userId,
        record.provider,
        record.providerSubject,
        record.emailAtLink,
        record.createdAt,
        record.updatedAt,
      )
      .first<AuthIdentityRow>();

    if (created) return { identity: mapIdentity(created), created: true };

    const existing = await this.getByProviderSubject(record.provider, record.providerSubject);
    if (!existing) throw new Error('Auth identity insert was ignored without an existing row.');
    return { identity: existing, created: false };
  }

  async updateEmail(id: string, email: string, at: string): Promise<AuthIdentityRecord> {
    const row = await this.db
      .prepare(`
        UPDATE auth_identities
        SET email_at_link = ?, updated_at = ?
        WHERE id = ?
        RETURNING id, user_id, provider, provider_subject, email_at_link, created_at, updated_at
      `)
      .bind(email, at, id)
      .first<AuthIdentityRow>();
    if (!row) throw new Error(`Auth identity ${id} was not found.`);
    return mapIdentity(row);
  }
}
