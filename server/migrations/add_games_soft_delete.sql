-- Add soft delete support to games table
-- Run once on the Neon database

ALTER TABLE games ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_games_deleted_at ON games (deleted_at) WHERE deleted_at IS NOT NULL;
