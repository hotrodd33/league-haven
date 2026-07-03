-- Tournament management schema. Idempotent and safe to re-run.
-- Mirrors the tournament section of server/db.js migrate().

-- ── Feature toggle ──
ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS feature_tournaments BOOLEAN NOT NULL DEFAULT TRUE;

-- ── Tournaments ──
CREATE TABLE IF NOT EXISTS tournaments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'single_elimination'
    CHECK(format IN ('single_elimination','double_elimination')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','active','completed','cancelled')),
  description TEXT,
  team_count INTEGER NOT NULL DEFAULT 8,
  start_date DATE,
  end_date DATE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_teams (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  seed INTEGER,
  temp_name TEXT,
  is_temp BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tournament_id, team_id)
);

CREATE TABLE IF NOT EXISTS tournament_rounds (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  round_type TEXT NOT NULL DEFAULT 'winners'
    CHECK(round_type IN ('winners','losers','final')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_id INTEGER NOT NULL REFERENCES tournament_rounds(id) ON DELETE CASCADE,
  match_number INTEGER NOT NULL,
  team_a_id INTEGER REFERENCES tournament_teams(id) ON DELETE SET NULL,
  team_b_id INTEGER REFERENCES tournament_teams(id) ON DELETE SET NULL,
  winner_team_id INTEGER REFERENCES tournament_teams(id) ON DELETE SET NULL,
  loser_team_id INTEGER REFERENCES tournament_teams(id) ON DELETE SET NULL,
  next_match_id INTEGER REFERENCES tournament_matches(id) ON DELETE SET NULL,
  loser_next_match_id INTEGER REFERENCES tournament_matches(id) ON DELETE SET NULL,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  is_bye BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Pool play tables ──
CREATE TABLE IF NOT EXISTS tournament_pools (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tournament_id, name),
  UNIQUE(tournament_id, sort_order)
);

CREATE TABLE IF NOT EXISTS tournament_pool_teams (
  id SERIAL PRIMARY KEY,
  pool_id INTEGER NOT NULL REFERENCES tournament_pools(id) ON DELETE CASCADE,
  tournament_team_id INTEGER NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pool_id, tournament_team_id),
  UNIQUE(tournament_team_id)
);

CREATE TABLE IF NOT EXISTS tournament_pool_matches (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  pool_id INTEGER NOT NULL REFERENCES tournament_pools(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  team_a_id INTEGER REFERENCES tournament_teams(id) ON DELETE SET NULL,
  team_b_id INTEGER REFERENCES tournament_teams(id) ON DELETE SET NULL,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pool_id, round_number, match_number)
);

CREATE INDEX IF NOT EXISTS idx_tournament_pool_matches_tournament ON tournament_pool_matches(tournament_id, pool_id);
CREATE INDEX IF NOT EXISTS idx_tournament_pool_teams_pool ON tournament_pool_teams(pool_id);

-- ── Link real games to tournaments ──
ALTER TABLE games ADD COLUMN IF NOT EXISTS tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS tournament_match_id INTEGER REFERENCES tournament_matches(id) ON DELETE SET NULL;
ALTER TABLE games ADD COLUMN IF NOT EXISTS tournament_pool_match_id INTEGER REFERENCES tournament_pool_matches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_games_tournament ON games(tournament_id) WHERE tournament_id IS NOT NULL;

-- Fix game_id fk so tournament_matches don't cascade-delete when a game is deleted
ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_game_id_fkey;
ALTER TABLE tournament_matches
  ADD CONSTRAINT tournament_matches_game_id_fkey
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL;

-- Deprecated table from earlier design
DROP TABLE IF EXISTS tournament_games CASCADE;

-- ── Tournament registration fields ──
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES field_locations(id) ON DELETE SET NULL;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS location_notes TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_open BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_deadline DATE;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS entry_fee NUMERIC(10,2);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS max_registrations INTEGER;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS pitch_limit_mode TEXT NOT NULL DEFAULT 'league_default'
  CHECK(pitch_limit_mode IN ('league_default','tournament_custom'));
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS pitch_limit_per_day INTEGER
  CHECK(pitch_limit_per_day IS NULL OR pitch_limit_per_day > 0);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS pitch_limit_per_tournament INTEGER
  CHECK(pitch_limit_per_tournament IS NULL OR pitch_limit_per_tournament > 0);

ALTER TABLE tournament_teams
  ADD COLUMN IF NOT EXISTS registration_status TEXT NOT NULL DEFAULT 'registered'
  CHECK(registration_status IN ('registered','waitlisted','withdrawn'));
ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS registered_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS registration_notes TEXT;
