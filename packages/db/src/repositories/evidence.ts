import type { D1DatabaseLike } from '../d1';
import type { EvidenceRecord, ProspectFactRecord, SourceRecord } from '../types';

interface SourceRow {
  id: string;
  prospect_id: string;
  provider: string;
  source_type: string;
  source_url: string;
  raw_json: string;
  captured_at: string;
}

interface EvidenceRow {
  id: string;
  prospect_id: string;
  field: string;
  value: string;
  source_record_id: string;
  source_url: string;
  source_quality: number;
  confidence: number;
  verification_status: EvidenceRecord['verificationStatus'];
  excerpt: string | null;
  captured_at: string;
}

interface FactRow {
  id: string;
  prospect_id: string;
  field: string;
  value: string;
  verification_status: ProspectFactRecord['verificationStatus'];
  confidence: number;
  evidence_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapSource(row: SourceRow): SourceRecord {
  return { id: row.id, prospectId: row.prospect_id, provider: row.provider, sourceType: row.source_type, sourceUrl: row.source_url, rawJson: row.raw_json, capturedAt: row.captured_at };
}
function mapEvidence(row: EvidenceRow): EvidenceRecord {
  return { id: row.id, prospectId: row.prospect_id, field: row.field, value: row.value, sourceRecordId: row.source_record_id, sourceUrl: row.source_url, sourceQuality: row.source_quality, confidence: row.confidence, verificationStatus: row.verification_status, excerpt: row.excerpt, capturedAt: row.captured_at };
}
function mapFact(row: FactRow): ProspectFactRecord {
  return { id: row.id, prospectId: row.prospect_id, field: row.field, value: row.value, verificationStatus: row.verification_status, confidence: row.confidence, evidenceId: row.evidence_id, createdAt: row.created_at, updatedAt: row.updated_at };
}

export class SourceRecordRepository {
  constructor(private readonly db: D1DatabaseLike) {}
  async create(record: SourceRecord): Promise<SourceRecord> {
    const row = await this.db.prepare(`INSERT INTO source_records(id, prospect_id, provider, source_type, source_url, raw_json, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(record.id, record.prospectId, record.provider, record.sourceType, record.sourceUrl, record.rawJson, record.capturedAt).first<SourceRow>();
    if (!row) throw new Error('Source record insert did not return a row.');
    return mapSource(row);
  }
  async getById(id: string): Promise<SourceRecord | null> {
    const row = await this.db.prepare('SELECT * FROM source_records WHERE id = ?').bind(id).first<SourceRow>();
    return row ? mapSource(row) : null;
  }
  async listForProspect(prospectId: string): Promise<SourceRecord[]> {
    const result = await this.db.prepare('SELECT * FROM source_records WHERE prospect_id = ? ORDER BY captured_at DESC, id DESC').bind(prospectId).all<SourceRow>();
    return result.results.map(mapSource);
  }
}

export class EvidenceRepository {
  constructor(private readonly db: D1DatabaseLike) {}
  async create(record: EvidenceRecord): Promise<EvidenceRecord> {
    const row = await this.db.prepare(`INSERT INTO evidence(id, prospect_id, field, value, source_record_id, source_url, source_quality, confidence, verification_status, excerpt, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(record.id, record.prospectId, record.field, record.value, record.sourceRecordId, record.sourceUrl, record.sourceQuality, record.confidence, record.verificationStatus, record.excerpt, record.capturedAt).first<EvidenceRow>();
    if (!row) throw new Error('Evidence insert did not return a row.');
    return mapEvidence(row);
  }
  async getById(id: string): Promise<EvidenceRecord | null> {
    const row = await this.db.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<EvidenceRow>();
    return row ? mapEvidence(row) : null;
  }
  async listForProspect(prospectId: string): Promise<EvidenceRecord[]> {
    const result = await this.db.prepare('SELECT * FROM evidence WHERE prospect_id = ? ORDER BY field ASC, captured_at DESC, id DESC').bind(prospectId).all<EvidenceRow>();
    return result.results.map(mapEvidence);
  }
}

export class ProspectFactRepository {
  constructor(private readonly db: D1DatabaseLike) {}
  async upsert(record: ProspectFactRecord): Promise<ProspectFactRecord> {
    const row = await this.db.prepare(`INSERT INTO prospect_facts(id, prospect_id, field, value, verification_status, confidence, evidence_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(prospect_id, field) DO UPDATE SET value = excluded.value, verification_status = excluded.verification_status, confidence = excluded.confidence, evidence_id = excluded.evidence_id, updated_at = excluded.updated_at RETURNING *`).bind(record.id, record.prospectId, record.field, record.value, record.verificationStatus, record.confidence, record.evidenceId, record.createdAt, record.updatedAt).first<FactRow>();
    if (!row) throw new Error('Prospect fact upsert did not return a row.');
    return mapFact(row);
  }
  async listForProspect(prospectId: string): Promise<ProspectFactRecord[]> {
    const result = await this.db.prepare('SELECT * FROM prospect_facts WHERE prospect_id = ? ORDER BY field ASC').bind(prospectId).all<FactRow>();
    return result.results.map(mapFact);
  }
}
