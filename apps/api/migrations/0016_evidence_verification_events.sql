PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS evidence_verification_events (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('VERIFY', 'REJECT')),
  from_status TEXT NOT NULL CHECK (from_status IN ('PROBABLE', 'UNVERIFIED')),
  to_status TEXT NOT NULL CHECK (to_status IN ('VERIFIED', 'REJECTED')),
  promoted_to_fact INTEGER NOT NULL DEFAULT 0 CHECK (promoted_to_fact IN (0, 1)),
  note TEXT,
  created_at TEXT NOT NULL,
  CHECK (
    (decision = 'VERIFY' AND to_status = 'VERIFIED') OR
    (decision = 'REJECT' AND to_status = 'REJECTED')
  ),
  CHECK (decision = 'VERIFY' OR promoted_to_fact = 0)
);

CREATE INDEX IF NOT EXISTS idx_evidence_verification_events_prospect
  ON evidence_verification_events(prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_verification_events_user
  ON evidence_verification_events(user_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS evidence_verification_event_guard
BEFORE INSERT ON evidence_verification_events
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM evidence item
      JOIN prospects prospect ON prospect.id = item.prospect_id
      JOIN campaigns campaign ON campaign.id = prospect.campaign_id
      WHERE item.id = NEW.evidence_id
        AND item.prospect_id = NEW.prospect_id
        AND campaign.user_id = NEW.user_id
        AND item.verification_status = NEW.to_status
    ) THEN RAISE(ABORT, 'EVIDENCE_REVIEW_MISMATCH')
  END;
END;

CREATE TRIGGER IF NOT EXISTS evidence_verification_events_immutable
BEFORE UPDATE ON evidence_verification_events
BEGIN
  SELECT RAISE(ABORT, 'EVIDENCE_REVIEW_IMMUTABLE');
END;
