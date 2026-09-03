import type { D1DatabaseLike } from '../d1';

interface DemoBuilderStateRow {
  demo_id: string;
  user_id: string;
  state_json: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface DemoBuilderStateRecord {
  demoId: string;
  userId: string;
  stateJson: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

function mapState(row: DemoBuilderStateRow): DemoBuilderStateRecord {
  return {
    demoId: row.demo_id,
    userId: row.user_id,
    stateJson: row.state_json,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class DemoBuilderStateRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: DemoBuilderStateRecord): Promise<DemoBuilderStateRecord> {
    const row = await this.db
      .prepare(`
        INSERT INTO demo_builder_states(demo_id, user_id, state_json, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        RETURNING demo_id, user_id, state_json, revision, created_at, updated_at
      `)
      .bind(
        record.demoId,
        record.userId,
        record.stateJson,
        record.revision,
        record.createdAt,
        record.updatedAt,
      )
      .first<DemoBuilderStateRow>();
    if (!row) throw new Error('Demo builder state insert did not return a row.');
    return mapState(row);
  }

  async getForUser(demoId: string, userId: string): Promise<DemoBuilderStateRecord | null> {
    const row = await this.db
      .prepare(`
        SELECT demo_id, user_id, state_json, revision, created_at, updated_at
        FROM demo_builder_states
        WHERE demo_id = ? AND user_id = ?
        LIMIT 1
      `)
      .bind(demoId, userId)
      .first<DemoBuilderStateRow>();
    return row ? mapState(row) : null;
  }

  async update(
    demoId: string,
    userId: string,
    stateJson: string,
    updatedAt: string,
  ): Promise<DemoBuilderStateRecord> {
    const row = await this.db
      .prepare(`
        UPDATE demo_builder_states
        SET state_json = ?, revision = revision + 1, updated_at = ?
        WHERE demo_id = ? AND user_id = ?
        RETURNING demo_id, user_id, state_json, revision, created_at, updated_at
      `)
      .bind(stateJson, updatedAt, demoId, userId)
      .first<DemoBuilderStateRow>();
    if (!row) throw new Error(`Demo builder state ${demoId} was not found.`);
    return mapState(row);
  }
}
