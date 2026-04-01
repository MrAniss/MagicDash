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
