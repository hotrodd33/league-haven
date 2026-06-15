-- Adds scoring-lock columns to games table.
-- Fixes 500 in expireStaleScorers sweep on production DBs that never ran migrate().
ALTER TABLE games ADD COLUMN IF NOT EXISTS scoring_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE games ADD COLUMN IF NOT EXISTS scoring_started_at TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN IF NOT EXISTS scoring_last_active_at TIMESTAMPTZ;
