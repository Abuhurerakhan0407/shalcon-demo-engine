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

  async getById(id: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare('SELECT id, email, name, created_at FROM users WHERE id = ?')
      .bind(id)
      .first<UserRow>();
    return row ? mapUser(row) : null;
  }
}
