PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS content_generation_runs (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  template_match_id TEXT NOT NULL REFERENCES template_match_runs(id) ON DELETE RESTRICT,
  engine_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('COMPLETED')),
  content_json TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_generation_runs_prospect
  ON content_generation_runs(prospect_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_content_generation_runs_match
  ON content_generation_runs(template_match_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS content_generation_validate_insert
BEFORE INSERT ON content_generation_runs
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM template_match_runs match
    WHERE match.id = NEW.template_match_id
      AND match.prospect_id = NEW.prospect_id
  ) THEN RAISE(ABORT, 'CONTENT_TEMPLATE_MATCH_PROSPECT_MISMATCH') END;
END;
