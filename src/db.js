const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const dbPath = process.env.DB_FILE || path.join(DATA_DIR, 'tracker.db');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  api_key_enc TEXT NOT NULL,
  endpoint_token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, slug)
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider_id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  day TEXT NOT NULL,
  ts INTEGER NOT NULL,
  requests INTEGER NOT NULL DEFAULT 1,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  endpoint TEXT,
  model TEXT
);

CREATE INDEX IF NOT EXISTS idx_usage_user_day ON usage_logs(user_id, day);
CREATE INDEX IF NOT EXISTS idx_usage_user_ts ON usage_logs(user_id, ts);

CREATE TABLE IF NOT EXISTS balance_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider_id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  balance REAL,
  currency TEXT,
  credits_used INTEGER,
  credits_limit INTEGER,
  raw TEXT
);

CREATE INDEX IF NOT EXISTS idx_snap_provider_ts ON balance_snapshots(user_id, provider_id, ts);
`);

module.exports = db;
