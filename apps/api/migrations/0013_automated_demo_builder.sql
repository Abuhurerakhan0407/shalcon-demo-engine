PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS automated_demo_builds (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  demo_id TEXT NOT NULL UNIQUE REFERENCES demos(id) ON DELETE CASCADE,
  template_match_id TEXT NOT NULL REFERENCES template_match_runs(id) ON DELETE RESTRICT,
  content_run_id TEXT NOT NULL REFERENCES content_generation_runs(id) ON DELETE RESTRICT,
  asset_selection_run_id TEXT NOT NULL REFERENCES asset_selection_runs(id) ON DELETE RESTRICT,
  builder_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  upstream_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'FAILED')),
  created_at TEXT NOT NULL,
  UNIQUE(prospect_id, input_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_automated_demo_builds_prospect_created
  ON automated_demo_builds(prospect_id, created_at DESC, id DESC);
