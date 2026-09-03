import type { D1DatabaseLike } from '../d1';
import type { DemoRecord, DemoStatus } from '../types';

interface DemoRow {
  id: string;
  prospect_id: string;
  token_hash: string;
  template_id: string;
  template_version: string;
  schema_version: string;
  config_json: string;
  status: DemoStatus;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  last_qa_at: string | null;
  fact_qa_status: string;
  visual_qa_status: string;
  sales_qa_status: string;
}

const SELECT_DEMO = `
  SELECT demo.id, demo.prospect_id, demo.token_hash, demo.template_id, demo.template_version,
    demo.schema_version, demo.config_json, demo.status, demo.expires_at, demo.created_at,
    demo.updated_at, demo.last_qa_at, demo.fact_qa_status, demo.visual_qa_status,
    demo.sales_qa_status
  FROM demos demo
`;

function mapDemo(row: DemoRow): DemoRecord {
  return {
    id: row.id,
    prospectId: row.prospect_id,
    tokenHash: row.token_hash,
    templateId: row.template_id,
    templateVersion: row.template_version,
    schemaVersion: row.schema_version,
    configJson: row.config_json,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastQaAt: row.last_qa_at,
    factQaStatus: row.fact_qa_status,
    visualQaStatus: row.visual_qa_status,
    salesQaStatus: row.sales_qa_status,
  };
}

export class DemoRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: DemoRecord): Promise<DemoRecord> {
    const row = await this.db
      .prepare(`
        INSERT INTO demos(
          id, prospect_id, token_hash, template_id, template_version, schema_version,
          config_json, status, expires_at, created_at, updated_at, last_qa_at,
          fact_qa_status, visual_qa_status, sales_qa_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id, prospect_id, token_hash, template_id, template_version, schema_version,
          config_json, status, expires_at, created_at, updated_at, last_qa_at,
          fact_qa_status, visual_qa_status, sales_qa_status
      `)
      .bind(
        record.id,
        record.prospectId,
        record.tokenHash,
        record.templateId,
        record.templateVersion,
        record.schemaVersion,
        record.configJson,
        record.status,
        record.expiresAt,
        record.createdAt,
        record.updatedAt,
        record.lastQaAt,
        record.factQaStatus,
        record.visualQaStatus,
        record.salesQaStatus,
      )
      .first<DemoRow>();
    if (!row) throw new Error('Demo insert did not return a row.');
    return mapDemo(row);
  }

  async getByTokenHash(tokenHash: string): Promise<DemoRecord | null> {
    const row = await this.db
      .prepare(`
        ${SELECT_DEMO}
        JOIN templates template ON template.id = demo.template_id
        WHERE demo.token_hash = ?
          AND template.version = demo.template_version
          AND template.status = 'ACTIVE'
        LIMIT 1
      `)
      .bind(tokenHash)
      .first<DemoRow>();
    return row ? mapDemo(row) : null;
  }

  async getById(id: string): Promise<DemoRecord | null> {
    const row = await this.db
      .prepare(`${SELECT_DEMO} WHERE demo.id = ? LIMIT 1`)
      .bind(id)
      .first<DemoRow>();
    return row ? mapDemo(row) : null;
  }

  async updateStatus(id: string, status: DemoStatus, at: string): Promise<DemoRecord> {
    const row = await this.db
      .prepare(`
        UPDATE demos SET status = ?, updated_at = ?
        WHERE id = ?
        RETURNING id, prospect_id, token_hash, template_id, template_version, schema_version,
          config_json, status, expires_at, created_at, updated_at, last_qa_at,
          fact_qa_status, visual_qa_status, sales_qa_status
      `)
      .bind(status, at, id)
      .first<DemoRow>();
    if (!row) throw new Error(`Demo ${id} was not found.`);
    return mapDemo(row);
  }
}
