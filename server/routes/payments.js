// Unified payments report: umpire (officials) + field-prep crew assignments.
// Read-only with optional bulk mark-paid. Returns a flat row list for tabular
// display + CSV export.

const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireRole, getUserPermissions } = require('../auth');

const router = express.Router();

function toDateStr(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// GET /api/payments
//   ?from=YYYY-MM-DD            (default: 90 days ago)
//   &to=YYYY-MM-DD              (default: today)
//   &org_id=N                   (filter by home team org)
//   &season_id=N
//   &kind=umpire|prep|all       (default: all)
//   &status=all|unpaid|paid     (default: all)
//   &person_id=N                (filter to a specific person — interpretation
//                                depends on kind: official_id if kind=umpire,
//                                staff_id if kind=prep; ignored when kind=all)
//   &include_no_show=true|false (default: false — no-shows excluded by default)
router.get('/', authMiddleware, requireRole('super_admin', 'accountant', 'org_admin'), async (req, res) => {
  // Accounting data must always reflect the latest writes.
  res.set('Cache-Control', 'no-store');
  try {
    const today = new Date();
    const ninetyAgo = new Date(today.getTime() - 90 * 86400_000);
    const from = req.query.from ? String(req.query.from).slice(0, 10) : toDateStr(ninetyAgo);
    const to = req.query.to ? String(req.query.to).slice(0, 10) : toDateStr(today);
    const kind = ['umpire', 'prep'].includes(req.query.kind) ? req.query.kind : 'all';
    const status = ['unpaid', 'paid'].includes(req.query.status) ? req.query.status : 'all';
    const orgId = req.query.org_id ? Number(req.query.org_id) : null;
    const seasonId = req.query.season_id ? Number(req.query.season_id) : null;
    const personId = req.query.person_id ? Number(req.query.person_id) : null;
    const includeNoShow = String(req.query.include_no_show || '').toLowerCase() === 'true';

    // Restrict org-admin to their own org(s) only.
    let allowedOrgIds = null; // null = no restriction (super_admin / accountant)
    if (req.user.role === 'org_admin') {
      const perms = await getUserPermissions(req.user.id);
      allowedOrgIds = perms.org_ids || [];
      if (!allowedOrgIds.length) return res.json({ rows: [], summary: emptySummary() });
      if (orgId && !allowedOrgIds.includes(orgId)) {
        return res.status(403).json({ error: 'No permission for that organization' });
      }
    }

    const params = [from, to];
    let p = 2;

    const buildCommonFilters = (homeOrgAlias = 'ht.org_id', seasonAlias = 'g.season_id') => {
      let sql = '';
      if (orgId) { sql += ` AND ${homeOrgAlias} = $${++p}`; params.push(orgId); }
      else if (allowedOrgIds && allowedOrgIds.length) {
        sql += ` AND ${homeOrgAlias} = ANY($${++p})`; params.push(allowedOrgIds);
      }
      if (seasonId) { sql += ` AND ${seasonAlias} = $${++p}`; params.push(seasonId); }
      return sql;
    };

    const queries = [];

    if (kind === 'all' || kind === 'umpire') {
      const noShowClause = includeNoShow ? '' : ' AND NOT goa.no_show';
      const statusClause = status === 'paid' ? ' AND goa.is_paid' : status === 'unpaid' ? ' AND NOT goa.is_paid' : '';
      const personClause = (kind === 'umpire' && personId) ? ` AND goa.official_id = $${++p}` : '';
      if (kind === 'umpire' && personId) params.push(personId);

      const filters = buildCommonFilters('ht.org_id', 'g.season_id');

      queries.push(pool.query(
        `SELECT
           'umpire'::TEXT AS kind,
           goa.official_id AS person_id,
           o.name AS person_name,
           o.email AS person_email,
           o.venmo_id AS person_venmo,
           g.id AS game_id,
           g.game_date,
           g.game_time,
           g.status AS game_status,
           ht.name AS home_team_name,
           at_t.name AS away_team_name,
           ht.org_id AS org_id,
           org.name AS org_name,
           fl.name AS location_name,
           ls.name AS season_name,
           'Umpire'::TEXT AS task_name,
           COALESCE(
             goa.game_fee,
             o.rate_per_game,
             (SELECT lag.umpire_rate FROM league_age_groups lag
              WHERE LOWER(TRIM(lag.name)) = LOWER(TRIM(ht.age_group)) LIMIT 1),
             50
           )::NUMERIC AS amount,
           goa.is_paid,
           goa.paid_at,
           goa.no_show
         FROM game_official_assignments goa
         JOIN games g ON g.id = goa.game_id AND g.deleted_at IS NULL AND g.status != 'cancelled'
         JOIN teams ht ON ht.id = g.home_team_id
         JOIN teams at_t ON at_t.id = g.away_team_id
         LEFT JOIN organizations org ON org.id = ht.org_id
         LEFT JOIN officials o ON o.id = goa.official_id
         LEFT JOIN field_locations fl ON fl.id = g.location_id
         LEFT JOIN league_seasons ls ON ls.id = g.season_id
         WHERE g.game_date BETWEEN $1 AND $2
           ${filters}
           ${noShowClause}
           ${statusClause}
           ${personClause}`,
        params.slice()
      ));
      // Reset shared params view per query (each runs with its accumulated $1..$p)
    }

    if (kind === 'all' || kind === 'prep') {
      // Use a fresh param accumulator scoped to this query
      const params2 = [from, to];
      let p2 = 2;
      const buildCommonFilters2 = (homeOrgAlias, seasonAlias) => {
        let sql = '';
        if (orgId) { sql += ` AND ${homeOrgAlias} = $${++p2}`; params2.push(orgId); }
        else if (allowedOrgIds && allowedOrgIds.length) {
          sql += ` AND ${homeOrgAlias} = ANY($${++p2})`; params2.push(allowedOrgIds);
        }
        if (seasonId) { sql += ` AND ${seasonAlias} = $${++p2}`; params2.push(seasonId); }
        return sql;
      };

      const filters2 = buildCommonFilters2('ht.org_id', 'g.season_id');
      const noShowClause = includeNoShow ? '' : ' AND NOT a.no_show';
      const statusClause = status === 'paid' ? ' AND a.is_paid' : status === 'unpaid' ? ' AND NOT a.is_paid' : '';
      const personClause = (kind === 'prep' && personId) ? ` AND a.staff_id = $${++p2}` : '';
      if (kind === 'prep' && personId) params2.push(personId);

      queries.push(pool.query(
        `SELECT
           'prep'::TEXT AS kind,
           a.staff_id AS person_id,
           fps.name AS person_name,
           fps.email AS person_email,
           fps.venmo_id AS person_venmo,
           g.id AS game_id,
           g.game_date,
           g.game_time,
           g.status AS game_status,
           ht.name AS home_team_name,
           at_t.name AS away_team_name,
           ht.org_id AS org_id,
           org.name AS org_name,
           fl.name AS location_name,
           ls.name AS season_name,
           tt.name AS task_name,
           a.task_type_id,
           COALESCE(
             a.fee_override,
             ROUND(t.rate / GREATEST(
               (SELECT COUNT(*) FROM game_prep_task_assignments aa
                WHERE aa.game_id = a.game_id AND aa.task_type_id = a.task_type_id AND NOT aa.no_show),
               1
             ), 2)
           )::NUMERIC AS amount,
           a.is_paid,
           a.paid_at,
           a.no_show
         FROM game_prep_task_assignments a
         JOIN games g ON g.id = a.game_id AND g.deleted_at IS NULL AND g.status != 'cancelled'
         JOIN game_prep_tasks t ON t.game_id = a.game_id AND t.task_type_id = a.task_type_id
         JOIN teams ht ON ht.id = g.home_team_id
         JOIN teams at_t ON at_t.id = g.away_team_id
         LEFT JOIN organizations org ON org.id = ht.org_id
         LEFT JOIN field_prep_staff fps ON fps.id = a.staff_id
         LEFT JOIN prep_task_types tt ON tt.id = a.task_type_id
         LEFT JOIN field_locations fl ON fl.id = g.location_id
         LEFT JOIN league_seasons ls ON ls.id = g.season_id
         WHERE g.game_date BETWEEN $1 AND $2
           ${filters2}
           ${noShowClause}
           ${statusClause}
           ${personClause}`,
        params2
      ));
    }

    const results = await Promise.all(queries);
    const rows = results
      .flatMap(r => r.rows)
      .map(r => ({
        ...r,
        amount: Number(r.amount || 0),
        is_paid: !!r.is_paid,
        no_show: !!r.no_show,
        game_date: toDateStr(r.game_date),
        game_time: r.game_time ? String(r.game_time).slice(0, 5) : null,
      }))
      .sort((a, b) => {
        // Newest game date first, then person name, then kind
        if (a.game_date !== b.game_date) return (b.game_date || '').localeCompare(a.game_date || '');
        const an = (a.person_name || '').localeCompare(b.person_name || '');
        if (an !== 0) return an;
        return a.kind.localeCompare(b.kind);
      });

    const summary = rows.reduce((acc, r) => {
      const amt = r.no_show ? 0 : r.amount;
      acc.total_assignments += 1;
      if (r.no_show) acc.no_show_count += 1;
      else {
        acc.total_earned += amt;
        if (r.is_paid) acc.total_paid += amt;
        else acc.total_unpaid += amt;
      }
      if (r.kind === 'umpire') acc.umpire_count += 1;
      else if (r.kind === 'prep') acc.prep_count += 1;
      return acc;
    }, emptySummary());

    res.json({
      filters: { from, to, kind, status, org_id: orgId, season_id: seasonId, person_id: personId, include_no_show: includeNoShow },
      rows,
      summary,
    });
  } catch (err) {
    console.error('Payments report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function emptySummary() {
  return {
    total_assignments: 0,
    umpire_count: 0,
    prep_count: 0,
    no_show_count: 0,
    total_earned: 0,
    total_paid: 0,
    total_unpaid: 0,
  };
}

// POST /api/payments/bulk-paid
//   body: { entries: [{ kind: 'umpire'|'prep', game_id, person_id, task_type_id? }] }
//   Marks each as paid (idempotent). Requires accountant or super_admin (or
//   org_admin for assignments on their org's games).
router.post('/bulk-paid', authMiddleware, requireRole('super_admin', 'accountant', 'org_admin'), async (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (!entries.length) return res.status(400).json({ error: 'entries[] required' });

    let allowedOrgIds = null;
    if (req.user.role === 'org_admin') {
      const perms = await getUserPermissions(req.user.id);
      allowedOrgIds = perms.org_ids || [];
    }

    let updated = 0;
    const errors = [];
    for (const e of entries) {
      try {
        if (!e || (e.kind !== 'umpire' && e.kind !== 'prep')) {
          errors.push({ entry: e, error: 'Invalid kind' }); continue;
        }
        const gameId = Number(e.game_id), personId = Number(e.person_id);
        if (!Number.isInteger(gameId) || !Number.isInteger(personId)) {
          errors.push({ entry: e, error: 'Invalid game_id/person_id' }); continue;
        }

        // Org check
        if (allowedOrgIds) {
          const { rows: gRows } = await pool.query(
            `SELECT ht.org_id FROM games g JOIN teams ht ON ht.id = g.home_team_id WHERE g.id = $1`,
            [gameId]
          );
          if (!gRows.length || !allowedOrgIds.includes(gRows[0].org_id)) {
            errors.push({ entry: e, error: 'No permission' }); continue;
          }
        }

        if (e.kind === 'umpire') {
          const r = await pool.query(
            `UPDATE game_official_assignments
               SET is_paid = TRUE, paid_at = NOW()
             WHERE game_id = $1 AND official_id = $2 AND NOT is_paid`,
            [gameId, personId]
          );
          updated += r.rowCount;
        } else {
          const taskTypeId = Number(e.task_type_id);
          if (!Number.isInteger(taskTypeId)) {
            errors.push({ entry: e, error: 'task_type_id required for prep' }); continue;
          }
          const r = await pool.query(
            `UPDATE game_prep_task_assignments
               SET is_paid = TRUE, paid_at = NOW()
             WHERE game_id = $1 AND task_type_id = $2 AND staff_id = $3 AND NOT is_paid`,
            [gameId, taskTypeId, personId]
          );
          updated += r.rowCount;
        }
      } catch (err) {
        errors.push({ entry: e, error: err.message });
      }
    }

    res.json({ updated, errors });
  } catch (err) {
    console.error('Bulk paid error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
