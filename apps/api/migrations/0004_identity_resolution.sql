PRAGMA foreign_keys = ON;

ALTER TABLE identity_resolutions ADD COLUMN candidate_prospect_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE identity_resolutions ADD COLUMN matched_keys_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE identity_resolutions ADD COLUMN reason_codes_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS prospect_identity_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  key_type TEXT NOT NULL CHECK (key_type IN ('DOMAIN', 'PHONE', 'NAME_CITY', 'ADDRESS_CITY')),
  key_value TEXT NOT NULL,
  key_strength TEXT NOT NULL CHECK (key_strength IN ('STRONG', 'WEAK')),
  source_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(prospect_id, key_type, key_value)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_strong_unique
  ON prospect_identity_keys(user_id, key_type, key_value)
  WHERE key_type IN ('DOMAIN', 'PHONE');

CREATE INDEX IF NOT EXISTS idx_identity_candidate_lookup
  ON prospect_identity_keys(user_id, key_type, key_value, prospect_id);

CREATE TRIGGER IF NOT EXISTS trg_identity_key_user_ownership_insert
BEFORE INSERT ON prospect_identity_keys
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM prospects prospect
  JOIN campaigns campaign ON campaign.id = prospect.campaign_id
  WHERE prospect.id = NEW.prospect_id AND campaign.user_id = NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'IDENTITY_KEY_USER_MISMATCH');
END;

CREATE TABLE IF NOT EXISTS prospect_observations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  canonical_prospect_id TEXT REFERENCES prospects(id) ON DELETE CASCADE,
  pending_prospect_id TEXT REFERENCES prospects(id) ON DELETE CASCADE,
  observed_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  domain TEXT,
  phone_normalized TEXT,
  city TEXT,
  address_normalized TEXT,
  source_type TEXT NOT NULL,
  resolution_status TEXT NOT NULL CHECK (
    resolution_status IN ('NEW_CANONICAL', 'EXACT_MATCH', 'REVIEW_REQUIRED', 'CONFLICT')
  ),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  candidate_prospect_ids_json TEXT NOT NULL DEFAULT '[]',
  matched_keys_json TEXT NOT NULL DEFAULT '[]',
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  CHECK (
    (resolution_status IN ('NEW_CANONICAL', 'EXACT_MATCH') AND canonical_prospect_id IS NOT NULL AND pending_prospect_id IS NULL)
    OR
    (resolution_status IN ('REVIEW_REQUIRED', 'CONFLICT') AND pending_prospect_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_observations_user_created
  ON prospect_observations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_canonical
  ON prospect_observations(canonical_prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_pending
  ON prospect_observations(pending_prospect_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_observation_campaign_owner_insert
BEFORE INSERT ON prospect_observations
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM campaigns WHERE id = NEW.campaign_id AND user_id = NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'OBSERVATION_CAMPAIGN_USER_MISMATCH');
END;

CREATE TRIGGER IF NOT EXISTS trg_observation_canonical_owner_insert
BEFORE INSERT ON prospect_observations
FOR EACH ROW
WHEN NEW.canonical_prospect_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM prospects prospect
  JOIN campaigns campaign ON campaign.id = prospect.campaign_id
  WHERE prospect.id = NEW.canonical_prospect_id AND campaign.user_id = NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'OBSERVATION_CANONICAL_USER_MISMATCH');
END;

CREATE TRIGGER IF NOT EXISTS trg_observation_pending_owner_insert
BEFORE INSERT ON prospect_observations
FOR EACH ROW
WHEN NEW.pending_prospect_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM prospects prospect
  JOIN campaigns campaign ON campaign.id = prospect.campaign_id
  WHERE prospect.id = NEW.pending_prospect_id AND campaign.user_id = NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'OBSERVATION_PENDING_USER_MISMATCH');
END;
