// SQLite storage using Node's built-in driver (no native build step needed).
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'vidhya.db'));
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  -- One birth profile per user: everything personal in the app is derived from this.
  CREATE TABLE IF NOT EXISTS profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    nwaran_name TEXT,
    birth_date TEXT NOT NULL,
    birth_time TEXT NOT NULL,
    city TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  -- What the person chose to care about, most important first. Everything ranked in
  -- the app is filtered through this. primary_topic is kept as its own indexed column
  -- so users can be segmented by what they came for with plain SQL.
  CREATE TABLE IF NOT EXISTS focus (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    topics TEXT NOT NULL,
    primary_topic TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS focus_primary_topic ON focus(primary_topic);
  -- A practice someone has chosen to keep. One row per person per action; the action id is
  -- stable (act.Saturn), so the same practice is never started twice.
  CREATE TABLE IF NOT EXISTS commitments (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_id TEXT NOT NULL,
    planet TEXT NOT NULL,
    topic TEXT,
    day TEXT NOT NULL,
    started_on TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    PRIMARY KEY (user_id, action_id)
  );
  -- One row per day a practice was done. The streak is derived from these, never stored.
  CREATE TABLE IF NOT EXISTS checkins (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_id TEXT NOT NULL,
    day_done TEXT NOT NULL,
    PRIMARY KEY (user_id, action_id, day_done)
  );
  -- What people look for, as routing metadata only. The question text is never stored.
  CREATE TABLE IF NOT EXISTS asks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asked_at TEXT NOT NULL DEFAULT (datetime('now')),
    kind TEXT NOT NULL,
    boundary TEXT,
    topic TEXT,
    intent TEXT,
    models TEXT
  );
  CREATE TABLE IF NOT EXISTS priests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    speciality TEXT NOT NULL,
    languages TEXT NOT NULL,
    experience_years INTEGER NOT NULL,
    bio TEXT NOT NULL,
    fee_npr INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    priest_id INTEGER NOT NULL REFERENCES priests(id),
    slot_start TEXT NOT NULL,
    topic TEXT NOT NULL,
    question TEXT,
    status TEXT NOT NULL DEFAULT 'requested',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (priest_id, slot_start)
  );
`);

// Sample priests so the consultation flow works out of the box.
if (!db.prepare('SELECT COUNT(*) AS n FROM priests').get().n) {
  const insert = db.prepare('INSERT INTO priests (name, title, speciality, languages, experience_years, bio, fee_npr) VALUES (?, ?, ?, ?, ?, ?, ?)');
  [
    ['Ram Prasad Sharma', 'Jyotishacharya', 'Kundli reading, dasha analysis', 'Nepali, Hindi', 28, 'Third-generation jyotishi from Bhaktapur. Reads charts in the parashari tradition and explains remedies in plain language.', 1500],
    ['Sita Devi Acharya', 'Jyotish Shastri', 'Marriage matching, family matters', 'Nepali, Newari, English', 16, 'Specialises in kundli matching and family consultations. Known for direct, practical guidance.', 1200],
    ['Bishnu Bhattarai', 'Pandit', 'Muhurta, puja and rituals', 'Nepali, Hindi, English', 21, 'Fixes auspicious timings for weddings, housewarming and business openings, and performs the pujas himself.', 1000],
    ['Krishna Gautam', 'Jyotishacharya', 'Career and business guidance', 'Nepali, English', 12, 'Works with students and business owners on timing decisions using dasha and transit analysis.', 1800],
  ].forEach((p) => insert.run(...p));
}

module.exports = db;
