PRAGMA foreign_keys = ON;

ALTER TABLE demo_qa_runs ADD COLUMN runner_job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL;
ALTER TABLE demo_qa_runs ADD COLUMN engine_version TEXT NOT NULL DEFAULT 'visual-qa.v1';
ALTER TABLE demo_qa_runs ADD COLUMN checks_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE demo_qa_runs ADD COLUMN viewport_results_json TEXT NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_qa_runs_runner_job
  ON demo_qa_runs(runner_job_id)
  WHERE runner_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_demo_qa_runs_demo_type_started
  ON demo_qa_runs(demo_id, qa_type, started_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS visual_qa_screenshots (
  id TEXT PRIMARY KEY,
  qa_run_id TEXT NOT NULL REFERENCES demo_qa_runs(id) ON DELETE CASCADE,
  demo_id TEXT NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('DESKTOP_FULL', 'DESKTOP_HERO', 'MOBILE_FULL', 'MOBILE_HERO')),
  storage_ref TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/png'),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_at TEXT NOT NULL,
  UNIQUE(qa_run_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_visual_qa_screenshots_demo
  ON visual_qa_screenshots(demo_id, created_at DESC, id DESC);

CREATE TRIGGER IF NOT EXISTS visual_qa_screenshot_demo_guard
BEFORE INSERT ON visual_qa_screenshots
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM demo_qa_runs run
    WHERE run.id = NEW.qa_run_id AND run.demo_id = NEW.demo_id
  ) THEN RAISE(ABORT, 'VISUAL_QA_SCREENSHOT_DEMO_MISMATCH') END;
END;
