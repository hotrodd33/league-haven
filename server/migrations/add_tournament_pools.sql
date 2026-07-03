-- Add pool-play schema for tournaments.
-- Safe to rerun.

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

ALTER TABLE games ADD COLUMN IF NOT EXISTS tournament_pool_match_id INTEGER REFERENCES tournament_pool_matches(id) ON DELETE SET NULL;
