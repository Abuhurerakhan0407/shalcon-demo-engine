PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS demo_qa_issues (
  id TEXT PRIMARY KEY,
  qa_run_id TEXT NOT NULL REFERENCES demo_qa_runs(id) ON DELETE CASCADE,
  demo_id TEXT NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  qa_type TEXT NOT NULL CHECK (qa_type IN ('FACT_PHASE19', 'SALES_PHASE19')),
  code TEXT NOT NULL,
  field TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('BLOCKING', 'REVIEW')),
  message TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'WAIVED')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_demo_qa_issues_demo_status
  ON demo_qa_issues(demo_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_qa_issues_run
  ON demo_qa_issues(qa_run_id, created_at ASC);

CREATE TRIGGER IF NOT EXISTS demo_qa_issue_run_demo_guard
BEFORE INSERT ON demo_qa_issues
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM demo_qa_runs run
    WHERE run.id = NEW.qa_run_id
      AND run.demo_id = NEW.demo_id
      AND run.qa_type = NEW.qa_type
  ) THEN RAISE(ABORT, 'DEMO_QA_ISSUE_RUN_MISMATCH') END;
END;

CREATE TABLE IF NOT EXISTS demo_sales_approvals (
  id TEXT PRIMARY KEY,
  demo_id TEXT NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  qa_run_id TEXT NOT NULL REFERENCES demo_qa_runs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  checklist_json TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(qa_run_id)
);

CREATE INDEX IF NOT EXISTS idx_demo_sales_approvals_demo
  ON demo_sales_approvals(demo_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS demo_sales_approval_run_guard
BEFORE INSERT ON demo_sales_approvals
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM demo_qa_runs run
    WHERE run.id = NEW.qa_run_id
      AND run.demo_id = NEW.demo_id
      AND run.qa_type = 'SALES_PHASE19'
  ) THEN RAISE(ABORT, 'SALES_APPROVAL_RUN_MISMATCH') END;
END;
