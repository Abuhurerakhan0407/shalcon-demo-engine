PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS research_runs (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'BLOCKED', 'FAILED')),
  selected_sources_json TEXT NOT NULL DEFAULT '[]',
  conflicts_json TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_runs_prospect
  ON research_runs(prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_runs_user_status
  ON research_runs(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS research_run_jobs (
  run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
  source_role TEXT NOT NULL,
  source_rank INTEGER NOT NULL CHECK (source_rank BETWEEN 1 AND 6),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(run_id, job_id),
  UNIQUE(run_id, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_research_run_jobs_job ON research_run_jobs(job_id);

CREATE TABLE IF NOT EXISTS research_run_evidence (
  run_id TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(run_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_research_run_evidence_source
  ON research_run_evidence(run_id, source_record_id);

CREATE TRIGGER IF NOT EXISTS research_run_job_validate_insert
BEFORE INSERT ON research_run_jobs
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM research_runs run
    JOIN jobs job ON job.id = NEW.job_id
    JOIN source_records source ON source.id = NEW.source_record_id
    WHERE run.id = NEW.run_id
      AND job.entity_id = run.prospect_id
      AND source.prospect_id = run.prospect_id
  ) THEN RAISE(ABORT, 'RESEARCH_RUN_JOB_PROSPECT_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS research_run_evidence_validate_insert
BEFORE INSERT ON research_run_evidence
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM research_runs run
    JOIN evidence item ON item.id = NEW.evidence_id
    JOIN source_records source ON source.id = NEW.source_record_id
    WHERE run.id = NEW.run_id
      AND item.prospect_id = run.prospect_id
      AND item.source_record_id = NEW.source_record_id
      AND source.prospect_id = run.prospect_id
  ) THEN RAISE(ABORT, 'RESEARCH_RUN_EVIDENCE_PROSPECT_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS research_run_job_terminal_failure
AFTER UPDATE OF status ON jobs
WHEN NEW.status IN ('DEAD_LETTER', 'CANCELLED')
BEGIN
  UPDATE research_run_jobs
  SET status = 'FAILED', updated_at = NEW.updated_at
  WHERE job_id = NEW.id AND status = 'PENDING';

  UPDATE research_runs
  SET status = 'FAILED', completed_at = COALESCE(completed_at, NEW.updated_at), updated_at = NEW.updated_at
  WHERE id IN (SELECT run_id FROM research_run_jobs WHERE job_id = NEW.id)
    AND status IN ('QUEUED', 'RUNNING');
END;

CREATE TRIGGER IF NOT EXISTS research_run_job_block_completion_after_failure
BEFORE UPDATE OF status ON research_run_jobs
WHEN NEW.status = 'COMPLETED'
  AND EXISTS (
    SELECT 1 FROM research_runs run
    WHERE run.id = NEW.run_id AND run.status = 'FAILED'
  )
BEGIN
  SELECT RAISE(ABORT, 'RESEARCH_RUN_ALREADY_FAILED');
END;
