const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
});

// ── Schema migration ──

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'manager',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS field_locations (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      comments TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      age_group TEXT,
      division TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS positions (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      abbreviation TEXT
    );

    CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      jersey_number INTEGER,
      date_of_birth TEXT,
      batting_hand TEXT CHECK(batting_hand IN ('R','L','S') OR batting_hand IS NULL),
      throwing_hand TEXT CHECK(throwing_hand IN ('R','L') OR throwing_hand IS NULL),
      parent_email TEXT,
      parent_phone TEXT,
      grade TEXT CHECK(grade IN ('K','1','2','3','4','5','6','7','8','9') OR grade IS NULL),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS player_positions (
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
      PRIMARY KEY (player_id, position_id)
    );

    CREATE TABLE IF NOT EXISTS team_staff (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('head_coach','assistant_coach','travel_director')),
      email TEXT,
      phone TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed default positions if empty
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM positions');
  if (rows[0].count === 0) {
    const positions = [
      ['Pitcher', 'P'], ['Catcher', 'C'], ['First Base', '1B'],
      ['Second Base', '2B'], ['Third Base', '3B'], ['Shortstop', 'SS'],
      ['Left Field', 'LF'], ['Center Field', 'CF'], ['Right Field', 'RF'],
      ['Designated Hitter', 'DH'], ['Utility', 'UTIL'],
    ];
    for (const [name, abbr] of positions) {
      await pool.query('INSERT INTO positions (name, abbreviation) VALUES ($1, $2) ON CONFLICT DO NOTHING', [name, abbr]);
    }
  }
}

// Lazy migration: retries on each request until it succeeds
let migrated = false;
let migrating = null;

async function ensureReady() {
  if (migrated) return;
  if (!migrating) {
    migrating = migrate()
      .then(() => { migrated = true; })
      .catch((err) => {
        migrating = null; // allow retry on next request
        throw err;
      });
  }
  return migrating;
}

module.exports = { pool, ensureReady };
