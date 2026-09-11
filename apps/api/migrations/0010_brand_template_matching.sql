-- Phase 14: evidence-bound brand analysis and immutable template-match history.
-- Existing brand_profiles rows remain valid and receive conservative defaults.

ALTER TABLE brand_profiles ADD COLUMN profile_version TEXT NOT NULL DEFAULT 'brand-profile.v1';
ALTER TABLE brand_profiles ADD COLUMN recommended_archetypes_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE brand_profiles ADD COLUMN safe_default INTEGER NOT NULL DEFAULT 1 CHECK (safe_default IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_brand_profiles_prospect_created
  ON brand_profiles(prospect_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS template_match_runs (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  brand_profile_id TEXT NOT NULL REFERENCES brand_profiles(id) ON DELETE RESTRICT,
  matcher_version TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_version TEXT NOT NULL,
  archetype TEXT NOT NULL,
  theme_dna_json TEXT NOT NULL,
  fit_score INTEGER NOT NULL CHECK (fit_score BETWEEN 0 AND 100),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  reasons_json TEXT NOT NULL DEFAULT '[]',
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  audit_run_id TEXT REFERENCES website_audit_runs(id) ON DELETE SET NULL,
  safe_default INTEGER NOT NULL DEFAULT 0 CHECK (safe_default IN (0, 1)),
  sparse_content_mode INTEGER NOT NULL DEFAULT 0 CHECK (sparse_content_mode IN (0, 1)),
  selection_source TEXT NOT NULL CHECK (selection_source IN ('AUTO', 'MANUAL_OVERRIDE')),
  supersedes_match_id TEXT REFERENCES template_match_runs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_template_match_runs_prospect_created
  ON template_match_runs(prospect_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_template_match_runs_brand_profile
  ON template_match_runs(brand_profile_id, created_at DESC);
