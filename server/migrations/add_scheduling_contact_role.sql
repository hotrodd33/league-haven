-- Migration: add is_scheduling_contact flag to team_staff_assignments
-- Run once against the Neon production database before deploying the scheduling contact feature.

ALTER TABLE team_staff_assignments
  ADD COLUMN IF NOT EXISTS is_scheduling_contact BOOLEAN NOT NULL DEFAULT FALSE;
