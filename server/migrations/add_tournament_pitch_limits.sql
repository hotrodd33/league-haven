-- Add tournament pitch limit controls.
-- Safe to rerun.

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS pitch_limit_mode TEXT NOT NULL DEFAULT 'league_default'
  CHECK(pitch_limit_mode IN ('league_default','tournament_custom'));
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS pitch_limit_per_day INTEGER
  CHECK(pitch_limit_per_day IS NULL OR pitch_limit_per_day > 0);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS pitch_limit_per_tournament INTEGER
  CHECK(pitch_limit_per_tournament IS NULL OR pitch_limit_per_tournament > 0);
