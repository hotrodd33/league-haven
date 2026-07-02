-- Per-age-group pitch count rules
-- Adds daily_pitch_limit, rest_thresholds (JSONB), max_consecutive_days to league_age_groups
-- and seeds historical defaults (Cal Ripken / Babe Ruth pitch counts) for any rows still NULL.
-- Idempotent and safe to re-run.

ALTER TABLE league_age_groups ADD COLUMN IF NOT EXISTS daily_pitch_limit INTEGER;
ALTER TABLE league_age_groups ADD COLUMN IF NOT EXISTS rest_thresholds JSONB;
ALTER TABLE league_age_groups ADD COLUMN IF NOT EXISTS max_consecutive_days INTEGER NOT NULL DEFAULT 2;

UPDATE league_age_groups
   SET daily_pitch_limit = 50,
       rest_thresholds   = '[{"min":56,"days":3},{"min":41,"days":2},{"min":21,"days":1},{"min":1,"days":0}]'::jsonb
 WHERE daily_pitch_limit IS NULL
   AND rest_thresholds   IS NULL
   AND LOWER(REGEXP_REPLACE(name, '\s+', '', 'g')) IN ('8u','9u','10u','11u','12u');

UPDATE league_age_groups
   SET daily_pitch_limit = 65,
       rest_thresholds   = '[{"min":61,"days":3},{"min":41,"days":2},{"min":26,"days":1},{"min":1,"days":0}]'::jsonb
 WHERE daily_pitch_limit IS NULL
   AND rest_thresholds   IS NULL
   AND LOWER(REGEXP_REPLACE(name, '\s+', '', 'g')) IN ('13u','14u','15u','14/15u');
