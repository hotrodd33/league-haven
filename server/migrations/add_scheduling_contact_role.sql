-- Migration: add 'scheduling_contact' to team_staff_assignments role CHECK constraint
-- Run once against the Neon production database before deploying the scheduling contact feature.

ALTER TABLE team_staff_assignments
  DROP CONSTRAINT IF EXISTS team_staff_assignments_role_check;

ALTER TABLE team_staff_assignments
  ADD CONSTRAINT team_staff_assignments_role_check
    CHECK (role IN ('head_coach', 'assistant_coach', 'scorekeeper', 'org_admin', 'scheduling_contact'));
