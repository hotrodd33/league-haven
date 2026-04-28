const { Pool } = require('pg');

function buildConnectionString(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('sslmode', 'verify-full');
    return u.toString();
  } catch {
    return url;
  }
}

const pool = new Pool({
  connectionString: buildConnectionString(process.env.DATABASE_URL),
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
      officials_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_branding (
      id INTEGER PRIMARY KEY,
      app_name TEXT NOT NULL DEFAULT 'LeagueHaven',
      logo_url TEXT,
      game_start_time TIME NOT NULL DEFAULT '08:00',
      game_end_time TIME NOT NULL DEFAULT '20:00',
      game_time_increment_minutes INTEGER NOT NULL DEFAULT 30,
      updated_at TIMESTAMPTZ DEFAULT NOW()
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
      grade TEXT CHECK(grade IN ('Pre K','K','1','2','3','4','5','6','7','8','9','10','11','12') OR grade IS NULL),
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
      role TEXT NOT NULL CHECK(role IN ('head_coach','assistant_coach')),
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
      role TEXT NOT NULL CHECK(role IN ('head_coach','assistant_coach','scorekeeper','org_admin')),
      is_scheduling_contact BOOLEAN NOT NULL DEFAULT FALSE,
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

    CREATE TABLE IF NOT EXISTS field_reservations (
      id SERIAL PRIMARY KEY,
      location_id INTEGER NOT NULL REFERENCES field_locations(id) ON DELETE CASCADE,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'practice' CHECK(event_type IN ('practice','game_hold','event','maintenance')),
      event_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS officials (
      id SERIAL PRIMARY KEY,
      org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      venmo_id TEXT,
      rate_per_game NUMERIC(10, 2) NOT NULL DEFAULT 50,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS game_official_assignments (
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      official_id INTEGER NOT NULL REFERENCES officials(id) ON DELETE CASCADE,
      added_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (game_id, official_id)
    );

    CREATE TABLE IF NOT EXISTS umpire_game_interests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      interested_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, game_id)
    );
  `);

  // Add level column to teams if missing
  await pool.query(`
    ALTER TABLE teams ADD COLUMN IF NOT EXISTS level TEXT;
  `);

  // Link umpires to user accounts
  await pool.query(`
    ALTER TABLE officials ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
  `);

  // Umpire profile fields
  await pool.query(`
    ALTER TABLE officials ADD COLUMN IF NOT EXISTS date_of_birth DATE;
    ALTER TABLE officials ADD COLUMN IF NOT EXISTS is_certified BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE officials ADD COLUMN IF NOT EXISTS years_of_experience INTEGER;
  `);

  // Officials feature toggle on organizations
  await pool.query(`
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS officials_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  // Org-level scheduling contact flag (uses org contact_name/email/phone as fallback scheduler)
  await pool.query(`
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS scheduling_contact_is_org_contact BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  // Ensure app branding defaults exist
  await pool.query(`
    INSERT INTO app_branding (id, app_name)
    VALUES (1, 'LeagueHaven')
    ON CONFLICT (id) DO NOTHING;
  `);

  // Ensure schedule time settings exist for older databases
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS game_start_time TIME NOT NULL DEFAULT '08:00';`);
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS game_end_time TIME NOT NULL DEFAULT '20:00';`);
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS game_time_increment_minutes INTEGER NOT NULL DEFAULT 30;`);
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago';`);

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

  // Enforce globally unique team names (case-insensitive). Skipped with a warning
  // if duplicates already exist so the migration doesn't crash existing leagues.
  try {
    const { rows: dupes } = await pool.query(
      `SELECT array_agg(name ORDER BY id) AS names, array_agg(id ORDER BY id) AS ids, COUNT(*) AS n
       FROM teams WHERE name IS NOT NULL
       GROUP BY LOWER(name) HAVING COUNT(*) > 1`
    );
    if (dupes.length === 0) {
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_name_unique_ci ON teams (LOWER(name));`);
    } else {
      console.warn(`[migration] ${dupes.length} duplicate team name(s) found; unique index NOT added. Resolve and restart to enforce uniqueness:`);
      for (const d of dupes) {
        console.warn(`  - "${d.names[0]}" appears ${d.n} times (team ids: ${d.ids.join(', ')})`);
      }
    }
  } catch (err) {
    console.error('[migration] team name uniqueness check failed:', err.message);
  }

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

  // Allow unscheduled games (no date yet) and add 'unscheduled' status
  await pool.query(`ALTER TABLE games ALTER COLUMN game_date DROP NOT NULL;`);
  await pool.query(`
    DO $$
    DECLARE c TEXT;
    BEGIN
      SELECT con.conname INTO c FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'games' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) LIKE '%status%';
      IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE games DROP CONSTRAINT ' || c; END IF;
    END $$;
    ALTER TABLE games DROP CONSTRAINT IF EXISTS games_status_check;
    ALTER TABLE games ADD CONSTRAINT games_status_check
      CHECK(status IN ('unscheduled','scheduled','in_progress','completed','cancelled','postponed'));
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

  // Fix: Change game_pitch_counts team FK from CASCADE to SET NULL.
  // Guard this for fresh databases so startup does not fail before the table exists.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'game_pitch_counts'
      ) THEN
        ALTER TABLE game_pitch_counts ALTER COLUMN team_id DROP NOT NULL;
        ALTER TABLE game_pitch_counts DROP CONSTRAINT IF EXISTS game_pitch_counts_team_id_fkey;
        ALTER TABLE game_pitch_counts ADD CONSTRAINT game_pitch_counts_team_id_fkey
          FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
      END IF;
    END $$;
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

  // Add is_umpire flag — allows a user to have umpire access alongside any primary role
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_umpire BOOLEAN NOT NULL DEFAULT FALSE;`);
  // Back-fill: existing umpire-role accounts get is_umpire=true
  await pool.query(`UPDATE users SET is_umpire = TRUE WHERE role = 'umpire' AND is_umpire = FALSE;`);

  // Track last login timestamp
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;`);

  // Email confirmation
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmed BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmation_token TEXT;`);
  // Back-fill: existing users are considered confirmed
  await pool.query(`UPDATE users SET email_confirmed = TRUE WHERE email_confirmed = FALSE AND created_at < NOW() - INTERVAL '1 minute';`);


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

  // ── Team name aliases (for GameChanger / external imports) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_name_aliases (
      id SERIAL PRIMARY KEY,
      external_name TEXT NOT NULL,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      source TEXT DEFAULT 'gamechanger',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (external_name, source)
    );
  `);

  // ── Game import audit log ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_import_log (
      id SERIAL PRIMARY KEY,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT DEFAULT 'gamechanger',
      home_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      away_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      home_score INTEGER,
      away_score INTEGER,
      pitch_counts JSONB,
      was_existing BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Official assignment payment tracking ──
  await pool.query(`ALTER TABLE game_official_assignments ADD COLUMN IF NOT EXISTS game_fee NUMERIC(10, 2);`);
  await pool.query(`ALTER TABLE game_official_assignments ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE game_official_assignments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;`);

  // ── Umpire rate per age group ──
  await pool.query(`ALTER TABLE league_age_groups ADD COLUMN IF NOT EXISTS umpire_rate NUMERIC(10, 2) NOT NULL DEFAULT 50;`);

  // ── Allow nullable ump rate (level rate is the default driver) ──
  await pool.query(`ALTER TABLE officials ALTER COLUMN rate_per_game DROP NOT NULL;`);
  await pool.query(`ALTER TABLE officials ALTER COLUMN rate_per_game DROP DEFAULT;`);

  // ── Age-group ump_required flag (e.g. 8U does not need an ump) ──
  await pool.query(`ALTER TABLE league_age_groups ADD COLUMN IF NOT EXISTS ump_required BOOLEAN NOT NULL DEFAULT TRUE;`);

  // ── Official age-group eligibility ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS official_age_groups (
      official_id INTEGER NOT NULL REFERENCES officials(id) ON DELETE CASCADE,
      age_group_id INTEGER NOT NULL REFERENCES league_age_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (official_id, age_group_id)
    );
  `);

  // ── Player contacts (multiple per player) ── (LEGACY — kept for migration)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_contacts (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      relationship TEXT NOT NULL DEFAULT 'parent',
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Guardians (standalone people, linkable to multiple players) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guardians (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Player ↔ Guardian junction ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_guardians (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      guardian_id INTEGER NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
      relationship TEXT NOT NULL DEFAULT 'parent',
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (player_id, guardian_id)
    );
  `);

  // ── Volunteer roles (configurable list) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS volunteer_roles (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  // ── Guardian ↔ Volunteer role junction (interest tracking) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guardian_volunteers (
      guardian_id INTEGER NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
      role_id INTEGER NOT NULL REFERENCES volunteer_roles(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (guardian_id, role_id)
    );
  `);

  // ── Player notes ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_notes (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Player documents (birth cert, etc.) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_documents (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL DEFAULT 'birth_certificate',
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data_url TEXT NOT NULL,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Configurable stat definitions ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stat_definitions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      abbreviation TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'batting' CHECK(category IN ('batting','pitching','fielding','other')),
      data_type TEXT NOT NULL DEFAULT 'integer' CHECK(data_type IN ('integer','decimal','text')),
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      gc_column_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Player game stats (per-game stat values) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_game_stats (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      stat_definition_id INTEGER NOT NULL REFERENCES stat_definitions(id) ON DELETE CASCADE,
      value TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(player_id, game_id, stat_definition_id)
    );
  `);

  // ── No-show tracking for umpire assignments ──
  await pool.query(`ALTER TABLE game_official_assignments ADD COLUMN IF NOT EXISTS no_show BOOLEAN NOT NULL DEFAULT FALSE;`);

  // ── League fee per age group ──
  await pool.query(`ALTER TABLE league_age_groups ADD COLUMN IF NOT EXISTS league_fee NUMERIC(10, 2);`);

  // ── Official ↔ Organization many-to-many ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS official_organizations (
      official_id INTEGER NOT NULL REFERENCES officials(id) ON DELETE CASCADE,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      PRIMARY KEY (official_id, org_id)
    );
  `);
  // Migrate legacy officials.org_id into the join table
  await pool.query(`
    INSERT INTO official_organizations (official_id, org_id)
    SELECT id, org_id FROM officials WHERE org_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  `);

  // ── Team registrations & fee tracking ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_registrations (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      season_id INTEGER NOT NULL REFERENCES league_seasons(id) ON DELETE CASCADE,
      fee NUMERIC(10, 2),
      is_paid BOOLEAN NOT NULL DEFAULT FALSE,
      paid_at TIMESTAMPTZ,
      paid_amount NUMERIC(10, 2),
      payment_method TEXT DEFAULT 'check',
      check_number TEXT,
      payment_notes TEXT,
      status TEXT NOT NULL DEFAULT 'registered',
      registered_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(team_id, season_id)
    );
  `);

  // ── User approval workflow ──
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_rejected_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_notes TEXT;`);
  await pool.query(`ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;`);

  // ── Remove travel_director role: convert existing to assistant_coach ──
  await pool.query(`UPDATE team_staff_assignments SET role = 'assistant_coach' WHERE role = 'travel_director'`);

  // ── Expand team_staff_assignments role CHECK to include 'scorekeeper' ──
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE team_staff_assignments DROP CONSTRAINT IF EXISTS team_staff_assignments_role_check;
      ALTER TABLE team_staff_assignments ADD CONSTRAINT team_staff_assignments_role_check
        CHECK (role IN ('head_coach','assistant_coach','scorekeeper','org_admin'));
    EXCEPTION WHEN undefined_object THEN NULL;
    END $$;
  `);

  // ── Backfill staff records for existing users ──
  // Coaches & scorekeepers: create staff_members + team_staff_assignments from user_permissions
  await pool.query(`
    INSERT INTO staff_members (name, email)
    SELECT u.name, u.email FROM users u
    WHERE u.role IN ('team_manager', 'score_reporter')
      AND u.email IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM staff_members sm WHERE LOWER(sm.email) = LOWER(u.email))
  `);
  await pool.query(`
    INSERT INTO team_staff_assignments (team_id, staff_id, role)
    SELECT up.team_id, sm.id,
           CASE WHEN u.role = 'team_manager' THEN 'head_coach' ELSE 'scorekeeper' END
    FROM users u
    JOIN user_permissions up ON up.user_id = u.id AND up.team_id IS NOT NULL
    JOIN staff_members sm ON LOWER(sm.email) = LOWER(u.email)
    WHERE u.role IN ('team_manager', 'score_reporter')
    ON CONFLICT (team_id, staff_id) DO NOTHING
  `);
  // Org admins: add as org_admin to all teams in their orgs
  await pool.query(`
    INSERT INTO staff_members (name, email)
    SELECT u.name, u.email FROM users u
    WHERE u.role = 'org_admin'
      AND u.email IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM staff_members sm WHERE LOWER(sm.email) = LOWER(u.email))
  `);
  await pool.query(`
    INSERT INTO team_staff_assignments (team_id, staff_id, role)
    SELECT t.id, sm.id, 'org_admin'
    FROM users u
    JOIN user_permissions up ON up.user_id = u.id AND up.org_id IS NOT NULL
    JOIN teams t ON t.org_id = up.org_id
    JOIN staff_members sm ON LOWER(sm.email) = LOWER(u.email)
    WHERE u.role = 'org_admin'
    ON CONFLICT (team_id, staff_id) DO UPDATE SET role = 'org_admin'
  `);

  // ── Push notification subscriptions ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      keys_p256dh TEXT NOT NULL,
      keys_auth TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)`);

  // ── Notification preferences (per-user, category toggles) ──
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB
    DEFAULT '{"schedule_changes":true,"cancellations":true,"announcements":true}'::jsonb
  `);

  // ── Feature toggles (on app_branding singleton) ──
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS feature_live_scoring BOOLEAN NOT NULL DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS feature_pitch_tracking BOOLEAN NOT NULL DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS feature_officials BOOLEAN NOT NULL DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS feature_stats BOOLEAN NOT NULL DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS feature_documents BOOLEAN NOT NULL DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS feature_financials BOOLEAN NOT NULL DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS feature_registration BOOLEAN NOT NULL DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS feature_public_site BOOLEAN NOT NULL DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS feature_push_notifications BOOLEAN NOT NULL DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS public_site_url TEXT;`);
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS feature_game_delete BOOLEAN NOT NULL DEFAULT FALSE;`);

  // ── Field ↔ Age-group eligibility ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS field_age_groups (
      field_id INTEGER NOT NULL REFERENCES field_locations(id) ON DELETE CASCADE,
      age_group_id INTEGER NOT NULL REFERENCES league_age_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (field_id, age_group_id)
    );
  `);

  // ── Normalize existing DOB values to YYYY-MM-DD ──
  await pool.query(`
    UPDATE players
    SET date_of_birth = CASE
      WHEN date_of_birth ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN
        LPAD(SPLIT_PART(date_of_birth,'/',3), 4, '0') || '-' ||
        LPAD(SPLIT_PART(date_of_birth,'/',1), 2, '0') || '-' ||
        LPAD(SPLIT_PART(date_of_birth,'/',2), 2, '0')
      WHEN date_of_birth ~ '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}$' THEN
        LPAD(SPLIT_PART(date_of_birth,'-',3), 4, '0') || '-' ||
        LPAD(SPLIT_PART(date_of_birth,'-',1), 2, '0') || '-' ||
        LPAD(SPLIT_PART(date_of_birth,'-',2), 2, '0')
      ELSE date_of_birth
    END
    WHERE date_of_birth IS NOT NULL
      AND date_of_birth !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  `);

  // ── Player jersey & hat sizing ──
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS jersey_size TEXT;`);
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS hat_size TEXT;`);
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS needs_new_jersey BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS needs_new_hat BOOLEAN NOT NULL DEFAULT FALSE;`);

  // ── Deduplicate player_contacts (keep newest per player + name combo) ──
  await pool.query(`
    DELETE FROM player_contacts
    WHERE id NOT IN (
      SELECT DISTINCT ON (player_id, LOWER(COALESCE(first_name,'')), LOWER(COALESCE(last_name,''))) id
      FROM player_contacts
      ORDER BY player_id, LOWER(COALESCE(first_name,'')), LOWER(COALESCE(last_name,'')), created_at DESC
    )
  `);

  // ── Player own contact info ──
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS email TEXT;`);
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS phone TEXT;`);

  // ── Migrate player_contacts → guardians + player_guardians (one-time) ──
  await pool.query(`
    INSERT INTO guardians (first_name, last_name, email, phone, created_at)
    SELECT TRIM(first_name), TRIM(last_name),
           MAX(NULLIF(TRIM(email),'')),
           MAX(NULLIF(TRIM(phone),'')),
           MIN(created_at)
    FROM player_contacts
    WHERE NOT EXISTS (SELECT 1 FROM guardians LIMIT 1)
    GROUP BY TRIM(first_name), TRIM(last_name), LOWER(COALESCE(TRIM(email),''))
  `);
  await pool.query(`
    INSERT INTO player_guardians (player_id, guardian_id, relationship, is_primary, notes, created_at)
    SELECT pc.player_id, g.id, pc.relationship, pc.is_primary, pc.notes, pc.created_at
    FROM player_contacts pc
    JOIN guardians g ON LOWER(TRIM(g.first_name)) = LOWER(TRIM(pc.first_name))
                    AND LOWER(TRIM(g.last_name)) = LOWER(TRIM(pc.last_name))
                    AND LOWER(COALESCE(TRIM(g.email),'')) = LOWER(COALESCE(TRIM(pc.email),''))
    WHERE NOT EXISTS (SELECT 1 FROM player_guardians LIMIT 1)
    ON CONFLICT (player_id, guardian_id) DO NOTHING
  `);

  // ── Announcements ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      persistent BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS persistent BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcement_reads (
      id SERIAL PRIMARY KEY,
      announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(announcement_id, user_id)
    );
  `);

  // Organization geolocation for travel distance calculation
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;`);
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;`);

  // Cached travel distances between organizations (Haversine or driving API)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS travel_distances (
      org_a_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      org_b_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      distance_miles NUMERIC NOT NULL,
      method TEXT NOT NULL DEFAULT 'haversine',
      calculated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (org_a_id, org_b_id)
    );
  `);

  // Driving distance API settings (super admin only)
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS driving_distance_enabled BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS driving_distance_api_key TEXT;`);

  // ── Force-password-change flag (set for admin-created / invited accounts) ──
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;`);
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
