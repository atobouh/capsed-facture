-- Latest state of every record, and the full history of every version (nothing is ever deleted).
CREATE TABLE records (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  rev INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  device TEXT,
  PRIMARY KEY (collection, id)
);
CREATE INDEX records_rev ON records(rev);
CREATE TABLE versions (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  change_id TEXT NOT NULL UNIQUE,
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  client_at TEXT,
  received_at TEXT NOT NULL,
  by TEXT,
  device TEXT,
  note TEXT
);
CREATE INDEX versions_record ON versions(collection, id, seq);
-- Direction sign-in on the website.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
-- Office computers, enrolled with a one-time code from the Direction.
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  letter TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  created_by TEXT,
  last_push TEXT,
  last_pull TEXT,
  pending INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT
);
CREATE TABLE device_codes (
  code_hash TEXT PRIMARY KEY,
  letter TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE login_failures (
  key TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX login_failures_key ON login_failures(key, at);
