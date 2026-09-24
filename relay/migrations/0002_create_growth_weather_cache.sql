CREATE TABLE IF NOT EXISTS growth_weather_cache (
  location_key TEXT PRIMARY KEY,
  location_json TEXT NOT NULL,
  requested_start_date TEXT NOT NULL,
  station_id TEXT,
  station_name TEXT,
  station_amedas_code TEXT,
  daily_json TEXT NOT NULL DEFAULT '[]',
  normal_json TEXT,
  forecast_end_date TEXT,
  history_start_date TEXT,
  history_through TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  failure_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  refreshed_at TEXT,
  last_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS growth_weather_cache_refresh_idx
  ON growth_weather_cache (status, refreshed_at, updated_at);
