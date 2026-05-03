-- Performance indexes for the games schedule page
-- Run once against each Neon database (ZVBL, LCYSBA, etc.)
-- These cover the hot filter paths in GET /games

-- Primary schedule query filters (season + date ordering)
CREATE INDEX IF NOT EXISTS idx_games_season_date
  ON games (season_id, game_date, game_time NULLS LAST);

-- Team filter (home/away OR condition)
CREATE INDEX IF NOT EXISTS idx_games_home_team
  ON games (home_team_id, season_id);

CREATE INDEX IF NOT EXISTS idx_games_away_team
  ON games (away_team_id, season_id);

-- Status filter
CREATE INDEX IF NOT EXISTS idx_games_status
  ON games (status, season_id);

-- LATERAL JOIN: official assignments lookup per game
CREATE INDEX IF NOT EXISTS idx_game_official_assignments_game
  ON game_official_assignments (game_id);

-- LATERAL JOIN: umpire interest lookup per game
CREATE INDEX IF NOT EXISTS idx_umpire_game_interests_game
  ON umpire_game_interests (game_id);

-- LATERAL JOIN: gamechanger import log lookup per game
CREATE INDEX IF NOT EXISTS idx_game_import_log_game
  ON game_import_log (game_id);

-- LATERAL JOIN: team division lookup (used twice per game row)
CREATE INDEX IF NOT EXISTS idx_team_divisions_team
  ON team_divisions (team_id, division_id);

-- LATERAL JOIN: staff/coach lookups
CREATE INDEX IF NOT EXISTS idx_team_staff_team_role
  ON team_staff_assignments (team_id, role);

CREATE INDEX IF NOT EXISTS idx_team_staff_scheduling_contact
  ON team_staff_assignments (team_id, is_scheduling_contact) WHERE is_scheduling_contact = true;

-- Partial index for the deleted_at IS NULL filter (covers unfiltered / large scans)
CREATE INDEX IF NOT EXISTS idx_games_active
  ON games (game_date, game_time NULLS LAST) WHERE deleted_at IS NULL;

-- Multi-team filter: ANY(array) lookup
CREATE INDEX IF NOT EXISTS idx_games_home_team_id ON games (home_team_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_games_away_team_id ON games (away_team_id) WHERE deleted_at IS NULL;
