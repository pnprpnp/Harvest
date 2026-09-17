CREATE TABLE IF NOT EXISTS relay_batches (
  batch_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  payload_json TEXT,
  result_json TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'forwarding', 'forwarded', 'retry', 'completed', 'failed')
  ),
  accepted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  forwarded_at TEXT,
  completed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS relay_batches_pending_idx
  ON relay_batches (status, updated_at, accepted_at);
