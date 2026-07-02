-- Field Prep crew & per-task payment tracking. Idempotent and safe to re-run.

ALTER TABLE app_branding ADD COLUMN IF NOT EXISTS feature_field_prep BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS field_prep_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_prep_staff BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS prep_required BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS prep_task_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  default_rate NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO prep_task_types (name, default_rate, sort_order)
VALUES ('Lining', 20.00, 1), ('Dragging', 10.00, 2)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS field_prep_staff (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  venmo_id TEXT,
  default_rate_override NUMERIC(10, 2),
  notes TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prep_staff_organizations (
  staff_id INTEGER NOT NULL REFERENCES field_prep_staff(id) ON DELETE CASCADE,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, org_id)
);

CREATE TABLE IF NOT EXISTS prep_staff_task_eligibility (
  staff_id INTEGER NOT NULL REFERENCES field_prep_staff(id) ON DELETE CASCADE,
  task_type_id INTEGER NOT NULL REFERENCES prep_task_types(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, task_type_id)
);

CREATE TABLE IF NOT EXISTS game_prep_tasks (
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  task_type_id INTEGER NOT NULL REFERENCES prep_task_types(id) ON DELETE CASCADE,
  rate NUMERIC(10, 2) NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, task_type_id)
);

CREATE TABLE IF NOT EXISTS game_prep_task_assignments (
  game_id INTEGER NOT NULL,
  task_type_id INTEGER NOT NULL,
  staff_id INTEGER NOT NULL REFERENCES field_prep_staff(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  no_show BOOLEAN NOT NULL DEFAULT FALSE,
  fee_override NUMERIC(10, 2),
  PRIMARY KEY (game_id, task_type_id, staff_id),
  FOREIGN KEY (game_id, task_type_id) REFERENCES game_prep_tasks(game_id, task_type_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prep_staff_game_interests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  interested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_game_prep_tasks_game ON game_prep_tasks(game_id);
CREATE INDEX IF NOT EXISTS idx_game_prep_task_assignments_staff ON game_prep_task_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_game_prep_task_assignments_game ON game_prep_task_assignments(game_id);
CREATE INDEX IF NOT EXISTS idx_prep_staff_game_interests_user ON prep_staff_game_interests(user_id);
CREATE INDEX IF NOT EXISTS idx_prep_staff_game_interests_game ON prep_staff_game_interests(game_id);
