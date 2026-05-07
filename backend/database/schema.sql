CREATE TABLE IF NOT EXISTS asset_groups (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  brand         TEXT NOT NULL,
  campaign_type TEXT NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assets (
  id           TEXT PRIMARY KEY,
  group_id     TEXT NOT NULL REFERENCES asset_groups(id) ON DELETE CASCADE,
  market       TEXT NOT NULL,
  language     TEXT NOT NULL,
  type         TEXT NOT NULL,
  content      TEXT NOT NULL,
  char_count   INTEGER NOT NULL,
  is_approved  INTEGER DEFAULT 0,
  is_base      INTEGER DEFAULT 0,
  generated_by TEXT DEFAULT 'manual',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Feed Monitor ─────────────────────────────────────────
-- Daily snapshot of the full Merchant Center feed (overwritten each run).
CREATE TABLE IF NOT EXISTS products_current (
  brand          TEXT NOT NULL,
  market         TEXT NOT NULL,
  product_id     TEXT NOT NULL,
  attributes     TEXT NOT NULL,
  snapshot_date  DATE NOT NULL,
  PRIMARY KEY (brand, market, product_id)
);

-- Append-only history of detected diffs.
CREATE TABLE IF NOT EXISTS diffs_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  brand          TEXT NOT NULL,
  market         TEXT NOT NULL,
  product_id     TEXT NOT NULL,
  product_title  TEXT,
  change_type    TEXT NOT NULL,        -- 'ADDED' | 'REMOVED' | 'MODIFIED'
  attribute      TEXT,
  old_value      TEXT,
  new_value      TEXT,
  detected_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_critical    INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_diffs_brand_date ON diffs_history (brand, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_diffs_critical  ON diffs_history (is_critical, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_diffs_attribute ON diffs_history (attribute);
CREATE INDEX IF NOT EXISTS idx_diffs_market    ON diffs_history (brand, market, detected_at DESC);

CREATE TABLE IF NOT EXISTS snapshot_runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  brand             TEXT NOT NULL,
  market            TEXT NOT NULL,
  run_date          DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_products    INTEGER,
  products_added    INTEGER,
  products_removed  INTEGER,
  products_modified INTEGER,
  trigger_type      TEXT NOT NULL,     -- 'auto' | 'manual'
  duration_ms       INTEGER,
  status            TEXT NOT NULL      -- 'success' | 'partial' | 'failed'
);

CREATE INDEX IF NOT EXISTS idx_runs_brand_date ON snapshot_runs (brand, run_date DESC);
