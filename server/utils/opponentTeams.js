/* ═══════════════════════════════════════════════════════
   Opponent team helpers
   ═══════════════════════════════════════════════════════
   Shared logic for placing external/opponent teams that
   don't exist on this site into a single catch-all org.

   Used by schedule imports (Data Manager games CSV,
   /api/import/schedule) and the GameChanger box-score
   import so that an unknown team referenced by an import
   is created on the fly instead of leaving the game
   pointing at no team ("(Deleted Team)").
   ═══════════════════════════════════════════════════════ */

const { pool } = require('../db');

/** Name of the organization that holds opposing/external teams. */
const OPPOSING_TEAMS_ORG_NAME = 'Opposing Teams';

/**
 * Find-or-create the "Opposing Teams" organization.
 * @param {object} db - a pg pool or transaction client (anything with .query)
 * @returns {Promise<number>} the organization id
 */
async function ensureOpposingTeamsOrg(db = pool) {
  const { rows } = await db.query(
    `SELECT id FROM organizations WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [OPPOSING_TEAMS_ORG_NAME]
  );
  if (rows.length) return rows[0].id;
  const { rows: created } = await db.query(
    `INSERT INTO organizations (name, notes)
     VALUES ($1, $2) RETURNING id`,
    [OPPOSING_TEAMS_ORG_NAME, 'Holds opposing/external teams imported from schedules.']
  );
  return created[0].id;
}

/**
 * Resolve a team by name, creating it in the given org if it doesn't exist.
 * Case-insensitive so a name that exists but was skipped by a unique-name
 * lookup (because it is non-unique) still resolves rather than duplicating.
 * @param {object} db - a pg pool or transaction client
 * @param {string} name - the external team name
 * @param {number} orgId - org to create the team in if missing
 * @returns {Promise<{id: number, created: boolean}|null>} null if name is blank
 */
async function resolveOrCreateOpponentTeam(db, name, orgId) {
  const clean = (name || '').trim();
  if (!clean) return null;

  const existing = await db.query(
    `SELECT id FROM teams WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [clean]
  );
  if (existing.rows.length) return { id: existing.rows[0].id, created: false };

  try {
    const { rows } = await db.query(
      `INSERT INTO teams (org_id, name) VALUES ($1, $2) RETURNING id`,
      [orgId, clean]
    );
    return { id: rows[0].id, created: true };
  } catch (err) {
    // Lost a race against a concurrent insert (idx_teams_name_unique_ci) —
    // fall back to the row that won.
    const again = await db.query(
      `SELECT id FROM teams WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [clean]
    );
    if (again.rows.length) return { id: again.rows[0].id, created: false };
    throw err;
  }
}

module.exports = {
  OPPOSING_TEAMS_ORG_NAME,
  ensureOpposingTeamsOrg,
  resolveOrCreateOpponentTeam,
};
