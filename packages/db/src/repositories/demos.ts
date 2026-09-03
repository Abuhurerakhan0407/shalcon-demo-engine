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

  async getByIdForUser(id: string, userId: string): Promise<DemoRecord | null> {
    const row = await this.db
      .prepare(`
        ${SELECT_DEMO}
        JOIN prospects prospect ON prospect.id = demo.prospect_id
        JOIN campaigns campaign ON campaign.id = prospect.campaign_id
        WHERE demo.id = ? AND campaign.user_id = ?
        LIMIT 1
      `)
      .bind(id, userId)
      .first<DemoRow>();
    return row ? mapDemo(row) : null;
  }

  async listForProspectForUser(prospectId: string, userId: string): Promise<DemoRecord[]> {
    const result = await this.db
      .prepare(`
        ${SELECT_DEMO}
        JOIN prospects prospect ON prospect.id = demo.prospect_id
        JOIN campaigns campaign ON campaign.id = prospect.campaign_id
        WHERE demo.prospect_id = ? AND campaign.user_id = ?
        ORDER BY demo.updated_at DESC
      `)
      .bind(prospectId, userId)
      .all<DemoRow>();
    return result.results.map(mapDemo);
  }

  async updateConfigurationForUser(
    id: string,
    userId: string,
    configJson: string,
    status: DemoStatus,
    expiresAt: string | null,
    at: string,
  ): Promise<DemoRecord> {
    const row = await this.db
      .prepare(`
        UPDATE demos
        SET config_json = ?, status = ?, expires_at = ?, updated_at = ?, last_qa_at = NULL,
          fact_qa_status = 'MANUAL_PHASE7', visual_qa_status = 'PENDING_PHASE18',
          sales_qa_status = 'MANUAL_PHASE7'
        WHERE id = ? AND prospect_id IN (
          SELECT prospect.id
          FROM prospects prospect
          JOIN campaigns campaign ON campaign.id = prospect.campaign_id
          WHERE campaign.user_id = ?
        )
        RETURNING id, prospect_id, token_hash, template_id, template_version, schema_version,
          config_json, status, expires_at, created_at, updated_at, last_qa_at,
          fact_qa_status, visual_qa_status, sales_qa_status
      `)
      .bind(configJson, status, expiresAt, at, id, userId)
      .first<DemoRow>();
    if (!row) throw new Error(`Demo ${id} was not found for this operator.`);
    return mapDemo(row);
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

  async updateStatusForUser(
    id: string,
    userId: string,
    status: DemoStatus,
    at: string,
  ): Promise<DemoRecord> {
    const row = await this.db
      .prepare(`
        UPDATE demos SET status = ?, updated_at = ?
        WHERE id = ? AND prospect_id IN (
          SELECT prospect.id
          FROM prospects prospect
          JOIN campaigns campaign ON campaign.id = prospect.campaign_id
          WHERE campaign.user_id = ?
        )
        RETURNING id, prospect_id, token_hash, template_id, template_version, schema_version,
          config_json, status, expires_at, created_at, updated_at, last_qa_at,
          fact_qa_status, visual_qa_status, sales_qa_status
      `)
      .bind(status, at, id, userId)
      .first<DemoRow>();
    if (!row) throw new Error(`Demo ${id} was not found for this operator.`);
    return mapDemo(row);
  }
}
