PRAGMA foreign_keys = ON;

ALTER TABLE demos ADD COLUMN last_qa_at TEXT;
ALTER TABLE demos ADD COLUMN fact_qa_status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE demos ADD COLUMN visual_qa_status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE demos ADD COLUMN sales_qa_status TEXT NOT NULL DEFAULT 'PENDING';

CREATE INDEX IF NOT EXISTS idx_demos_token_status ON demos(token_hash, status, expires_at);

INSERT OR IGNORE INTO templates(
  id, niche, archetype, version, status, definition_json, created_at
) VALUES (
  'elane-v8',
  'salon-and-spa',
  'premium-cinematic-salon-spa',
  '8.0.0',
  'ACTIVE',
  '{"id":"elane-v8","version":"8.0.0","renderer":"template-runtime","configOnly":true}',
  '2026-09-03T00:00:00.000Z'
);
