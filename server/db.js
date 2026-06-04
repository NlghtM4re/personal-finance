/* ============================================================
   db.js — SQLite setup and schema
   ============================================================ */
const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'fintrack.db');
const db      = new Database(DB_PATH);

/* Enable WAL for better concurrent read performance */
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ---- Schema ---- */
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'bank',
    initial_balance REAL NOT NULL DEFAULT 0,
    color           TEXT NOT NULL DEFAULT '#6366f1',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    icon       TEXT NOT NULL DEFAULT '📦',
    type       TEXT NOT NULL DEFAULT 'expense',
    is_custom  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id            TEXT PRIMARY KEY,
    date          TEXT NOT NULL,
    amount        REAL NOT NULL,
    type          TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
    category_id   TEXT,
    account_id    TEXT NOT NULL,
    to_account_id TEXT,
    note          TEXT NOT NULL DEFAULT '',
    tags          TEXT NOT NULL DEFAULT '[]',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );

  CREATE INDEX IF NOT EXISTS idx_tx_date       ON transactions(date DESC);
  CREATE INDEX IF NOT EXISTS idx_tx_account    ON transactions(account_id);
  CREATE INDEX IF NOT EXISTS idx_tx_category   ON transactions(category_id);
  CREATE INDEX IF NOT EXISTS idx_tx_type       ON transactions(type);
`);

module.exports = db;
