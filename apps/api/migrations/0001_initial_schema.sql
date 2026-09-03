PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  email TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  oauth_ref TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, email)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  niche TEXT NOT NULL,
  archetype_filter_json TEXT NOT NULL DEFAULT '[]',
  country TEXT,
  region TEXT,
  city TEXT,
  status TEXT NOT NULL,
  daily_discovery_limit INTEGER NOT NULL DEFAULT 0 CHECK (daily_discovery_limit >= 0),
  daily_demo_limit INTEGER NOT NULL DEFAULT 0 CHECK (daily_demo_limit >= 0),
  daily_send_limit INTEGER NOT NULL DEFAULT 0 CHECK (daily_send_limit >= 0),
  min_demo_score INTEGER NOT NULL DEFAULT 0 CHECK (min_demo_score BETWEEN 0 AND 100),
  approval_mode TEXT NOT NULL,
  email_account_id TEXT REFERENCES email_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  domain TEXT,
  phone_normalized TEXT,
  city TEXT,
  address_normalized TEXT,
  niche TEXT NOT NULL,
  archetype TEXT,
  source_first_seen TEXT NOT NULL,
  current_state TEXT NOT NULL,
  identity_confidence REAL,
  demo_score INTEGER CHECK (demo_score IS NULL OR demo_score BETWEEN 0 AND 100),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prospects_campaign_state ON prospects(campaign_id, current_state);
CREATE INDEX IF NOT EXISTS idx_prospects_domain ON prospects(domain);
CREATE INDEX IF NOT EXISTS idx_prospects_phone ON prospects(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_prospects_normalized_name_city ON prospects(normalized_name, city);

CREATE TABLE IF NOT EXISTS source_records (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_records_prospect ON source_records(prospect_id, captured_at);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_quality REAL NOT NULL,
  confidence REAL NOT NULL,
  verification_status TEXT NOT NULL,
  excerpt TEXT,
  captured_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_prospect_field ON evidence(prospect_id, field);
CREATE INDEX IF NOT EXISTS idx_evidence_source_record ON evidence(source_record_id);

CREATE TABLE IF NOT EXISTS identity_resolutions (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  confidence REAL NOT NULL,
  conflicts_json TEXT NOT NULL DEFAULT '[]',
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  category TEXT,
  services_json TEXT NOT NULL DEFAULT '[]',
  business_model TEXT,
  contacts_json TEXT NOT NULL DEFAULT '[]',
  socials_json TEXT NOT NULL DEFAULT '[]',
  booking_json TEXT NOT NULL DEFAULT '{}',
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT NOT NULL DEFAULT '{}',
  model TEXT,
  prompt_version TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS website_audits (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  website_url TEXT,
  issues_json TEXT NOT NULL DEFAULT '[]',
  opportunities_json TEXT NOT NULL DEFAULT '[]',
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  screenshots_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  score_type TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total BETWEEN 0 AND 100),
  breakdown_json TEXT NOT NULL DEFAULT '{}',
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brand_profiles (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  positioning TEXT,
  detected_colors_json TEXT NOT NULL DEFAULT '[]',
  recommended_themes_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  prospect_id TEXT REFERENCES prospects(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  storage_ref TEXT NOT NULL,
  usage_classification TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  niche TEXT NOT NULL,
  archetype TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(niche, archetype, version)
);

CREATE TABLE IF NOT EXISTS demos (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  template_id TEXT NOT NULL REFERENCES templates(id),
  template_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  config_json TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_demos_prospect ON demos(prospect_id, status);

CREATE TABLE IF NOT EXISTS demo_qa_runs (
  id TEXT PRIMARY KEY,
  demo_id TEXT NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  qa_type TEXT NOT NULL,
  status TEXT NOT NULL,
  issues_json TEXT NOT NULL DEFAULT '[]',
  screenshot_asset_ids_json TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  role TEXT,
  email TEXT,
  phone TEXT,
  verification_status TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_prospect ON contacts(prospect_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  demo_id TEXT REFERENCES demos(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  qa_status TEXT NOT NULL,
  approval_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS send_queue (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  email_account_id TEXT NOT NULL REFERENCES email_accounts(id),
  status TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_send_queue_due ON send_queue(status, scheduled_for);

CREATE TABLE IF NOT EXISTS sent_messages (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  provider_message_id TEXT NOT NULL,
  thread_id TEXT,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL,
  UNIQUE(provider_message_id)
);

CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  provider_message_id TEXT NOT NULL UNIQUE,
  thread_id TEXT,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  received_at TEXT NOT NULL,
  classification TEXT,
  confidence REAL,
  needs_human INTEGER NOT NULL DEFAULT 1 CHECK (needs_human IN (0, 1))
);

CREATE TABLE IF NOT EXISTS followups (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
  due_at TEXT NOT NULL,
  status TEXT NOT NULL,
  message_id TEXT REFERENCES messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_followups_due ON followups(status, due_at);

CREATE TABLE IF NOT EXISTS suppression_list (
  id TEXT PRIMARY KEY,
  normalized_email TEXT,
  normalized_domain TEXT,
  prospect_id TEXT REFERENCES prospects(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (normalized_email IS NOT NULL OR normalized_domain IS NOT NULL OR prospect_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppression_email ON suppression_list(normalized_email) WHERE normalized_email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppression_domain ON suppression_list(normalized_domain) WHERE normalized_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS pipeline (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL UNIQUE REFERENCES prospects(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  next_action TEXT,
  next_action_at TEXT,
  value_estimate REAL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD_LETTER', 'CANCELLED')),
  priority INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  lease_owner TEXT,
  lease_expires_at TEXT,
  scheduled_for TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  last_error_code TEXT,
  last_error_safe_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_claimable ON jobs(status, scheduled_for, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_lease ON jobs(status, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_entity ON jobs(job_type, entity_id);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  prospect_id TEXT REFERENCES prospects(id) ON DELETE SET NULL,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  demo_id TEXT REFERENCES demos(id) ON DELETE SET NULL,
  agent_name TEXT NOT NULL,
  agent_version TEXT NOT NULL,
  prompt_version TEXT,
  model TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  input_json TEXT NOT NULL,
  output_json TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT,
  safe_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_prospect ON agent_runs(prospect_id, started_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_campaign ON agent_runs(campaign_id, started_at);

CREATE TABLE IF NOT EXISTS demo_events (
  id TEXT PRIMARY KEY,
  demo_id TEXT NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_demo_events_demo_time ON demo_events(demo_id, occurred_at);

CREATE TABLE IF NOT EXISTS prospect_state_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prospect_state_events_prospect ON prospect_state_events(prospect_id, id);

CREATE TRIGGER IF NOT EXISTS trg_prospect_state_event
AFTER UPDATE OF current_state ON prospects
WHEN OLD.current_state <> NEW.current_state
BEGIN
  INSERT INTO prospect_state_events(prospect_id, from_state, to_state, occurred_at)
  VALUES (NEW.id, OLD.current_state, NEW.current_state, NEW.updated_at);
END;

CREATE TABLE IF NOT EXISTS metrics_daily (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  discovered INTEGER NOT NULL DEFAULT 0,
  identity_verified INTEGER NOT NULL DEFAULT 0,
  demo_qualified INTEGER NOT NULL DEFAULT 0,
  demos_generated INTEGER NOT NULL DEFAULT 0,
  demos_qa_passed INTEGER NOT NULL DEFAULT 0,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  demo_views INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0,
  interested_replies INTEGER NOT NULL DEFAULT 0,
  meetings INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  UNIQUE(campaign_id, date)
);

CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  applied_at TEXT
);
