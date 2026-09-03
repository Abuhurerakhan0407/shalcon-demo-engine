import type { D1DatabaseLike } from '../d1';
import type { UserRecord } from '../types';

interface UserRow {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

function mapUser(row: UserRow): UserRecord {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
}

export class UserRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: UserRecord): Promise<void> {
    await this.db
      .prepare('INSERT INTO users(id, email, name, created_at) VALUES (?, ?, ?, ?)')
      .bind(record.id, record.email, record.name, record.createdAt)
      .run();
  }

  async upsertByEmail(record: UserRecord): Promise<UserRecord> {
    const row = await this.db
      .prepare(`
        INSERT INTO users(id, email, name, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET name = excluded.name
        RETURNING id, email, name, created_at
      `)
      .bind(record.id, record.email, record.name, record.createdAt)
      .first<UserRow>();
    if (!row) throw new Error('User upsert did not return a row.');
    return mapUser(row);
  }

  async getById(id: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare('SELECT id, email, name, created_at FROM users WHERE id = ?')
      .bind(id)
      .first<UserRow>();
    return row ? mapUser(row) : null;
  }

  async getByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare('SELECT id, email, name, created_at FROM users WHERE email = ? LIMIT 1')
      .bind(email)
      .first<UserRow>();
    return row ? mapUser(row) : null;
  }
}
