-- Only Google-confirmed read responses are cached. Never store client tokens.
CREATE TABLE IF NOT EXISTS relay_record_sync_state (
  id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO relay_record_sync_state (id, generation) VALUES ('current', 0);

CREATE TABLE IF NOT EXISTS relay_record_sync_pages (
  cache_key TEXT PRIMARY KEY,
  scope_key TEXT NOT NULL,
  generation INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  checked_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS relay_record_sync_pages_checked_idx
  ON relay_record_sync_pages (checked_at);
