-- Adds league-wide default game duration. Idempotent and safe to re-run.
ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS default_game_duration_minutes INTEGER NOT NULL DEFAULT 150;
