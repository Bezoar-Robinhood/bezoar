CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  target_key TEXT NOT NULL,
  registry TEXT,
  name TEXT,
  version TEXT,
  url TEXT,
  sha256 TEXT,
  verdict TEXT NOT NULL,
  rules_checked INTEGER NOT NULL DEFAULT 0,
  files_scanned INTEGER NOT NULL DEFAULT 0,
  findings_json TEXT NOT NULL DEFAULT '[]',
  incomplete_json TEXT NOT NULL DEFAULT '[]',
  meta_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'user',
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scans_target_key ON scans (target_key, created_at);
CREATE INDEX IF NOT EXISTS scans_created ON scans (created_at);
CREATE INDEX IF NOT EXISTS scans_verdict ON scans (verdict, created_at);

CREATE TABLE IF NOT EXISTS reviews (
  scan_id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  stance TEXT,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pins (
  url TEXT PRIMARY KEY,
  tools_hash TEXT NOT NULL,
  tools_json TEXT NOT NULL,
  pinned_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS crawl_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
