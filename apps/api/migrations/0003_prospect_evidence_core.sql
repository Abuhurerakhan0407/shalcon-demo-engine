PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS prospect_facts (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  verification_status TEXT NOT NULL
    CHECK (verification_status IN ('VERIFIED', 'PROBABLE', 'CONFLICTED', 'UNVERIFIED', 'REJECTED')),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(prospect_id, field),
  CHECK (verification_status <> 'VERIFIED' OR evidence_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_prospect_facts_prospect ON prospect_facts(prospect_id, field);
CREATE INDEX IF NOT EXISTS idx_prospect_facts_evidence ON prospect_facts(evidence_id);

CREATE TRIGGER IF NOT EXISTS evidence_validate_insert
BEFORE INSERT ON evidence
BEGIN
  SELECT CASE
    WHEN NEW.confidence < 0 OR NEW.confidence > 1 THEN RAISE(ABORT, 'EVIDENCE_CONFIDENCE_OUT_OF_RANGE')
    WHEN NEW.source_quality < 0 OR NEW.source_quality > 1 THEN RAISE(ABORT, 'EVIDENCE_SOURCE_QUALITY_OUT_OF_RANGE')
    WHEN NEW.verification_status NOT IN ('VERIFIED', 'PROBABLE', 'CONFLICTED', 'UNVERIFIED', 'REJECTED')
      THEN RAISE(ABORT, 'EVIDENCE_STATUS_INVALID')
    WHEN NOT EXISTS (
      SELECT 1 FROM source_records source
      WHERE source.id = NEW.source_record_id
        AND source.prospect_id = NEW.prospect_id
    ) THEN RAISE(ABORT, 'EVIDENCE_SOURCE_PROSPECT_MISMATCH')
  END;
END;

CREATE TRIGGER IF NOT EXISTS evidence_validate_update
BEFORE UPDATE OF prospect_id, source_record_id, confidence, source_quality, verification_status ON evidence
BEGIN
  SELECT CASE
    WHEN NEW.confidence < 0 OR NEW.confidence > 1 THEN RAISE(ABORT, 'EVIDENCE_CONFIDENCE_OUT_OF_RANGE')
    WHEN NEW.source_quality < 0 OR NEW.source_quality > 1 THEN RAISE(ABORT, 'EVIDENCE_SOURCE_QUALITY_OUT_OF_RANGE')
    WHEN NEW.verification_status NOT IN ('VERIFIED', 'PROBABLE', 'CONFLICTED', 'UNVERIFIED', 'REJECTED')
      THEN RAISE(ABORT, 'EVIDENCE_STATUS_INVALID')
    WHEN NOT EXISTS (
      SELECT 1 FROM source_records source
      WHERE source.id = NEW.source_record_id
        AND source.prospect_id = NEW.prospect_id
    ) THEN RAISE(ABORT, 'EVIDENCE_SOURCE_PROSPECT_MISMATCH')
  END;
END;

CREATE TRIGGER IF NOT EXISTS prospect_fact_validate_insert
BEFORE INSERT ON prospect_facts
WHEN NEW.evidence_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM evidence item
    WHERE item.id = NEW.evidence_id
      AND item.prospect_id = NEW.prospect_id
      AND item.field = NEW.field
      AND item.value = NEW.value
      AND (NEW.verification_status <> 'VERIFIED' OR item.verification_status = 'VERIFIED')
  ) THEN RAISE(ABORT, 'FACT_EVIDENCE_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS prospect_fact_validate_update
BEFORE UPDATE OF prospect_id, field, value, verification_status, evidence_id ON prospect_facts
WHEN NEW.evidence_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM evidence item
    WHERE item.id = NEW.evidence_id
      AND item.prospect_id = NEW.prospect_id
      AND item.field = NEW.field
      AND item.value = NEW.value
      AND (NEW.verification_status <> 'VERIFIED' OR item.verification_status = 'VERIFIED')
  ) THEN RAISE(ABORT, 'FACT_EVIDENCE_MISMATCH') END;
END;
