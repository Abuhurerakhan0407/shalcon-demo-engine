PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS demo_builder_states (
  demo_id TEXT PRIMARY KEY REFERENCES demos(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_demo_builder_states_user ON demo_builder_states(user_id, updated_at);
