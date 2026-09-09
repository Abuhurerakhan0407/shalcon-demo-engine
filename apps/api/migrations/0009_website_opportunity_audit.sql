PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS website_audit_runs (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('COMPLETED')),
  website_presence TEXT NOT NULL CHECK (website_presence IN ('CAPTURED', 'NOT_FOUND')),
  quality_score INTEGER CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 100),
  quality_rating TEXT NOT NULL CHECK (quality_rating IN ('GOOD', 'FAIR', 'POOR', 'NOT_RATED')),
  recommendation TEXT NOT NULL CHECK (recommendation IN ('SKIP_DEMO', 'LOW_PRIORITY', 'DEMO_WORTHY', 'RESEARCH_NEEDED')),
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_website_audit_runs_prospect
  ON website_audit_runs(prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_audit_runs_user
  ON website_audit_runs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS website_audit_observations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES website_audit_runs(id) ON DELETE CASCADE,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'LOW', 'MEDIUM', 'HIGH')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  screenshot_path TEXT,
  viewport TEXT NOT NULL CHECK (viewport IN ('DESKTOP', 'MOBILE', 'BOTH', 'SOURCE')),
  penalty INTEGER NOT NULL CHECK (penalty BETWEEN 0 AND 100),
  supported_by_capture INTEGER NOT NULL DEFAULT 1 CHECK (supported_by_capture = 1),
  created_at TEXT NOT NULL,
  UNIQUE(run_id, code, source_record_id, viewport)
);

CREATE INDEX IF NOT EXISTS idx_website_audit_observations_run
  ON website_audit_observations(run_id, severity, code);
CREATE INDEX IF NOT EXISTS idx_website_audit_observations_source
  ON website_audit_observations(source_record_id, run_id);

CREATE TRIGGER IF NOT EXISTS website_audit_observation_validate_insert
BEFORE INSERT ON website_audit_observations
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM website_audit_runs run
    JOIN source_records source ON source.id = NEW.source_record_id
    WHERE run.id = NEW.run_id
      AND run.prospect_id = NEW.prospect_id
      AND source.prospect_id = run.prospect_id
      AND source.source_url = NEW.source_url
  ) THEN RAISE(ABORT, 'WEBSITE_AUDIT_OBSERVATION_SOURCE_MISMATCH') END;
END;
