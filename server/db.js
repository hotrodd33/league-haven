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
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
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

    -- Many-to-many: players can belong to multiple teams
    CREATE TABLE IF NOT EXISTS team_players (
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      jersey_number INTEGER,
      added_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (team_id, player_id)
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

    -- Standalone staff members (decoupled from teams)
    CREATE TABLE IF NOT EXISTS staff_members (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Many-to-many: staff can be on multiple teams with different roles
    CREATE TABLE IF NOT EXISTS team_staff_assignments (
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      staff_id INTEGER NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('head_coach','assistant_coach','travel_director')),
      added_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (team_id, staff_id)
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- League structure lookup tables
    CREATE TABLE IF NOT EXISTS league_age_groups (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS league_levels (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS league_seasons (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_active BOOLEAN DEFAULT false,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS league_divisions (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER REFERENCES league_divisions(id) ON DELETE CASCADE,
      season_id INTEGER REFERENCES league_seasons(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    -- Many-to-many: teams can belong to multiple divisions
    CREATE TABLE IF NOT EXISTS team_divisions (
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      division_id INTEGER NOT NULL REFERENCES league_divisions(id) ON DELETE CASCADE,
      PRIMARY KEY (team_id, division_id)
    );

    CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      season_id INTEGER REFERENCES league_seasons(id) ON DELETE SET NULL,
      home_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      away_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      location_id INTEGER REFERENCES field_locations(id) ON DELETE SET NULL,
      game_date DATE NOT NULL,
      game_time TIME,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','in_progress','completed','cancelled','postponed')),
      home_score INTEGER,
      away_score INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Add level column to teams if missing
  await pool.query(`
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS level TEXT;
  `);

  // Add parent_id to league_divisions if missing (hierarchy support)
  await pool.query(`
    ALTER TABLE league_divisions ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES league_divisions(id) ON DELETE CASCADE;
  `);

  // Add season_id to league_divisions if missing
  await pool.query(`
    ALTER TABLE league_divisions ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES league_seasons(id) ON DELETE CASCADE;
  `);

  // Add logo_url to organizations and teams
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;`);
  await pool.query(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS logo_url TEXT;`);

  // Team name components: city, color, mascot, abbreviation
  await pool.query(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_city TEXT;`);
  await pool.query(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_color TEXT;`);
  await pool.query(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_mascot TEXT;`);
  await pool.query(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS abbreviation TEXT;`);

  // Team UI colors (hex)
  await pool.query(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS primary_color TEXT;`);
  await pool.query(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS secondary_color TEXT;`);

  // Drop unique constraint on league_divisions.name if it exists (allow duplicate names in different branches)
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE league_divisions DROP CONSTRAINT IF EXISTS league_divisions_name_key;
    EXCEPTION WHEN undefined_object THEN NULL;
    END $$;
  `);

  // Promote seed admin user to super_admin role (legacy migration)
  await pool.query("UPDATE users SET role = 'super_admin' WHERE username = 'admin' AND role = 'manager'");

  // Migrate players from old team_id/jersey_number columns to team_players junction table
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'players' AND column_name = 'team_id') THEN
        INSERT INTO team_players (team_id, player_id, jersey_number)
        SELECT team_id, id, jersey_number FROM players WHERE team_id IS NOT NULL
        ON CONFLICT DO NOTHING;
        ALTER TABLE players DROP COLUMN IF EXISTS team_id;
        ALTER TABLE players DROP COLUMN IF EXISTS jersey_number;
      END IF;
    END $$;
  `);

  // Migrate staff from old team_staff to staff_members + team_staff_assignments
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team_staff')
         AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staff_members')
         AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_staff' AND column_name = 'name') THEN
        -- Insert unique staff members (deduplicate by name+email+phone)
        INSERT INTO staff_members (name, email, phone, created_at)
        SELECT DISTINCT ON (name, COALESCE(email,''), COALESCE(phone,''))
               name, email, phone, MIN(created_at) OVER (PARTITION BY name, COALESCE(email,''), COALESCE(phone,''))
        FROM team_staff
        ON CONFLICT DO NOTHING;
        -- Create team assignments from old records
        INSERT INTO team_staff_assignments (team_id, staff_id, role)
        SELECT ts.team_id, sm.id, ts.role
        FROM team_staff ts
        JOIN staff_members sm ON sm.name = ts.name
          AND COALESCE(sm.email,'') = COALESCE(ts.email,'')
          AND COALESCE(sm.phone,'') = COALESCE(ts.phone,'')
        ON CONFLICT DO NOTHING;
        -- Drop old table
        DROP TABLE team_staff;
      END IF;
    END $$;
  `);

  // Add innings_played column to games if missing
  await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS innings_played INTEGER;`);

  // Fix: Change games team FKs from CASCADE to SET NULL so deleting a team
  // doesn't wipe out all its games (and cascading pitch counts).
  await pool.query(`
    ALTER TABLE games ALTER COLUMN home_team_id DROP NOT NULL;
    ALTER TABLE games ALTER COLUMN away_team_id DROP NOT NULL;
    ALTER TABLE games DROP CONSTRAINT IF EXISTS games_home_team_id_fkey;
    ALTER TABLE games ADD CONSTRAINT games_home_team_id_fkey
      FOREIGN KEY (home_team_id) REFERENCES teams(id) ON DELETE SET NULL;
    ALTER TABLE games DROP CONSTRAINT IF EXISTS games_away_team_id_fkey;
    ALTER TABLE games ADD CONSTRAINT games_away_team_id_fkey
      FOREIGN KEY (away_team_id) REFERENCES teams(id) ON DELETE SET NULL;
  `);

  // Fix: Change game_pitch_counts team FK from CASCADE to SET NULL
  await pool.query(`
    ALTER TABLE game_pitch_counts ALTER COLUMN team_id DROP NOT NULL;
    ALTER TABLE game_pitch_counts DROP CONSTRAINT IF EXISTS game_pitch_counts_team_id_fkey;
    ALTER TABLE game_pitch_counts ADD CONSTRAINT game_pitch_counts_team_id_fkey
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  `);

  // Pitch counts per game per pitcher
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_pitch_counts (
      id SERIAL PRIMARY KEY,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      pitch_count INTEGER NOT NULL,
      innings_pitched TEXT,
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

  // ── Auth system v2: email, 4-tier roles, password reset tokens ──

  // Add email column to users
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`);

  // Password reset tokens table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Migrate roles: admin → super_admin, user → team_manager, manager → team_manager
  await pool.query(`
    UPDATE users SET role = 'super_admin' WHERE role = 'admin';
    UPDATE users SET role = 'team_manager' WHERE role IN ('user', 'manager');
  `);
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
