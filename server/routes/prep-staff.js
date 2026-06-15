const express = require('express');
const { pool } = require('../db');
const { authMiddleware, canEditOrg, getUserPermissions } = require('../auth');
const cache = require('../cache');

const router = express.Router();

function toMoney(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  if (value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return { error: true };
  return Math.round(num * 100) / 100;
}

function normalizeStaff(row) {
  const org_ids = row.org_ids || [];
  const org_names = row.org_names || [];
  const task_type_ids = row.task_type_ids || [];
  return {
    ...row,
    org_ids,
    org_names,
    task_type_ids, // empty array means "eligible for all tasks"
    scope: org_ids.length ? 'org' : 'league',
    default_rate_override: row.default_rate_override != null ? Number(row.default_rate_override) : null,
  };
}

// Get prep-staff role users + whether linked to a profile already
router.get('/prep-users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super admin only' });
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.name, u.email, s.id AS staff_id
       FROM users u
       LEFT JOIN field_prep_staff s ON s.user_id = u.id
       WHERE u.is_prep_staff = TRUE
       ORDER BY u.name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get assignable prep staff for an org+task (or just an org)
// Query: ?org_id=N&task_type_id=M
// task_type_id is optional; when present, filters to staff eligible for that task.
router.get('/assignable', authMiddleware, async (req, res) => {
  try {
    const { org_id, task_type_id } = req.query;
    if (!org_id) return res.json([]);

    if (req.user.role !== 'super_admin') {
      const canEdit = await canEditOrg(req.user, org_id);
      if (!canEdit) {
        const perms = await getUserPermissions(req.user.id);
        const teamIds = perms.team_ids || [];
        if (!teamIds.length) {
          return res.status(403).json({ error: 'No permission for this organization' });
        }
        const { rows: teamRows } = await pool.query(
          'SELECT 1 FROM teams WHERE id = ANY($1) AND org_id = $2 LIMIT 1',
          [teamIds, Number(org_id)]
        );
        if (!teamRows.length) {
          return res.status(403).json({ error: 'No permission for this organization' });
        }
      }
    }

    const { rows: orgRows } = await pool.query(
      'SELECT id, field_prep_enabled FROM organizations WHERE id = $1', [org_id]
    );
    if (!orgRows.length) return res.status(404).json({ error: 'Organization not found' });
    const orgEnabled = !!orgRows[0].field_prep_enabled;

    const params = [];
    const filters = [];
    // Always include league-level staff (no org assignments); include org-scoped only if enabled for that org
    if (orgEnabled) {
      params.push(Number(org_id));
      filters.push(`(NOT EXISTS (SELECT 1 FROM prep_staff_organizations po WHERE po.staff_id = s.id)
                     OR EXISTS (SELECT 1 FROM prep_staff_organizations po WHERE po.staff_id = s.id AND po.org_id = $${params.length}))`);
    } else {
      filters.push(`NOT EXISTS (SELECT 1 FROM prep_staff_organizations po WHERE po.staff_id = s.id)`);
    }

    if (task_type_id) {
      params.push(Number(task_type_id));
      // Eligible if no eligibility rows OR an explicit row for this task.
      filters.push(`(NOT EXISTS (SELECT 1 FROM prep_staff_task_eligibility pe WHERE pe.staff_id = s.id)
                     OR EXISTS (SELECT 1 FROM prep_staff_task_eligibility pe WHERE pe.staff_id = s.id AND pe.task_type_id = $${params.length}))`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT s.*,
         COALESCE(po_agg.org_ids, ARRAY[]::INTEGER[]) AS org_ids,
         COALESCE(po_agg.org_names, ARRAY[]::TEXT[]) AS org_names,
         COALESCE(pe_agg.task_type_ids, ARRAY[]::INTEGER[]) AS task_type_ids
       FROM field_prep_staff s
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(po.org_id) AS org_ids,
                ARRAY_AGG(orgs.name ORDER BY orgs.name) AS org_names
         FROM prep_staff_organizations po
         JOIN organizations orgs ON orgs.id = po.org_id
         WHERE po.staff_id = s.id
       ) po_agg ON true
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(pe.task_type_id) AS task_type_ids
         FROM prep_staff_task_eligibility pe
         WHERE pe.staff_id = s.id
       ) pe_agg ON true
       ${where}
       ORDER BY CASE WHEN COALESCE(array_length(po_agg.org_ids, 1), 0) = 0 THEN 0 ELSE 1 END, s.name`,
      params
    );
    const canSeeFinancials = ['super_admin', 'accountant', 'org_admin'].includes(req.user.role);
    res.json(rows.map((r) => {
      const s = normalizeStaff(r);
      if (!canSeeFinancials) {
        delete s.default_rate_override;
        delete s.venmo_id;
      }
      return s;
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List prep staff
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { org_id, scope, search } = req.query;
    const cacheKey = `prep-staff:${req.user.id}:${org_id||''}:${scope||''}:${search||''}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const params = [];
    const clauses = [];

    if (org_id) {
      params.push(Number(org_id));
      clauses.push(`EXISTS (SELECT 1 FROM prep_staff_organizations po WHERE po.staff_id = s.id AND po.org_id = $${params.length})`);
    }
    if (scope === 'league') clauses.push('NOT EXISTS (SELECT 1 FROM prep_staff_organizations po WHERE po.staff_id = s.id)');
    if (scope === 'org') clauses.push('EXISTS (SELECT 1 FROM prep_staff_organizations po WHERE po.staff_id = s.id)');
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(s.name ILIKE $${params.length} OR COALESCE(s.email, '') ILIKE $${params.length})`);
    }

    let userOrgIds = null;
    if (req.user.role !== 'super_admin' && req.user.role !== 'accountant') {
      const perms = await getUserPermissions(req.user.id);
      const orgIds = perms.org_ids || [];
      userOrgIds = orgIds;
      if (orgIds.length) {
        params.push(orgIds);
        clauses.push(`(EXISTS (SELECT 1 FROM prep_staff_organizations po WHERE po.staff_id = s.id AND po.org_id = ANY($${params.length})) OR NOT EXISTS (SELECT 1 FROM prep_staff_organizations po WHERE po.staff_id = s.id))`);
      } else {
        clauses.push('NOT EXISTS (SELECT 1 FROM prep_staff_organizations po WHERE po.staff_id = s.id)');
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT s.*, u.username AS linked_username,
         COALESCE(po_agg.org_ids, ARRAY[]::INTEGER[]) AS org_ids,
         COALESCE(po_agg.org_names, ARRAY[]::TEXT[]) AS org_names,
         COALESCE(pe_agg.task_type_ids, ARRAY[]::INTEGER[]) AS task_type_ids,
         COALESCE(stats.assigned_games, 0) AS assigned_games,
         COALESCE(stats.completed_games, 0) AS completed_games,
         COALESCE(stats.total_owed, 0) AS total_owed,
         COALESCE(interest_stats.interested_games, 0) AS interested_games
       FROM field_prep_staff s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(po.org_id) AS org_ids,
                ARRAY_AGG(orgs.name ORDER BY orgs.name) AS org_names
         FROM prep_staff_organizations po
         JOIN organizations orgs ON orgs.id = po.org_id
         WHERE po.staff_id = s.id
       ) po_agg ON true
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(pe.task_type_id) AS task_type_ids
         FROM prep_staff_task_eligibility pe
         WHERE pe.staff_id = s.id
       ) pe_agg ON true
       LEFT JOIN LATERAL (
         SELECT
           COUNT(DISTINCT a.game_id) FILTER (WHERE NOT (g.status = 'completed' OR g.game_date < CURRENT_DATE)) AS assigned_games,
           COUNT(DISTINCT a.game_id) FILTER (WHERE g.status = 'completed' OR g.game_date < CURRENT_DATE) AS completed_games,
           COALESCE(SUM(
             CASE
               WHEN (g.status = 'completed' OR g.game_date < CURRENT_DATE) AND NOT a.is_paid AND NOT a.no_show THEN
                 COALESCE(
                   a.fee_override,
                   t.rate / NULLIF((SELECT COUNT(*) FROM game_prep_task_assignments aa
                                    WHERE aa.game_id = a.game_id
                                      AND aa.task_type_id = a.task_type_id
                                      AND NOT aa.no_show), 0)
                 )
               ELSE 0
             END
           ), 0) AS total_owed
         FROM game_prep_task_assignments a
         JOIN games g ON g.id = a.game_id AND g.deleted_at IS NULL
         JOIN game_prep_tasks t ON t.game_id = a.game_id AND t.task_type_id = a.task_type_id
         WHERE a.staff_id = s.id
       ) stats ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS interested_games
         FROM prep_staff_game_interests pgi
         WHERE pgi.user_id = s.user_id AND s.user_id IS NOT NULL
       ) interest_stats ON true
       ${where}
       ORDER BY CASE WHEN COALESCE(array_length(po_agg.org_ids, 1), 0) = 0 THEN 0 ELSE 1 END, s.name`,
      params
    );

    const isGlobalFinancial = ['super_admin', 'accountant'].includes(req.user.role);
    const result = rows.map((r) => {
      const s = normalizeStaff(r);
      s.total_owed = Number(s.total_owed);
      const canSeeThisFinancial = isGlobalFinancial || (userOrgIds && s.org_ids?.some(oid => userOrgIds.includes(oid)));
      if (!canSeeThisFinancial) {
        delete s.total_owed;
        delete s.default_rate_override;
        delete s.venmo_id;
      }
      return s;
    });
    cache.set(cacheKey, result, 120_000);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      org_id, org_ids: rawOrgIds,
      name, email, phone, venmo_id,
      default_rate_override, notes, user_id,
      task_type_ids: rawTaskTypeIds,
    } = req.body;

    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });

    const orgIds = Array.isArray(rawOrgIds)
      ? rawOrgIds.map(Number).filter(Number.isFinite)
      : (org_id ? [Number(org_id)] : []);

    if (orgIds.length) {
      for (const oid of orgIds) {
        if (!(await canEditOrg(req.user, oid))) return res.status(403).json({ error: 'No permission for organization ' + oid });
      }
    } else if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can create league prep staff' });
    }

    const rate = toMoney(default_rate_override, null);
    if (rate?.error) return res.status(400).json({ error: 'default_rate_override must be a non-negative number' });

    const { rows } = await pool.query(
      `INSERT INTO field_prep_staff (name, email, phone, venmo_id, default_rate_override, notes, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        String(name).trim(),
        email || null,
        phone || null,
        venmo_id || null,
        rate,
        notes || null,
        user_id || null,
      ]
    );
    const row = rows[0];

    const insertedOrgNames = [];
    for (const oid of orgIds) {
      await pool.query('INSERT INTO prep_staff_organizations (staff_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [row.id, oid]);
      const { rows: orgRows } = await pool.query('SELECT name FROM organizations WHERE id = $1', [oid]);
      if (orgRows[0]) insertedOrgNames.push(orgRows[0].name);
    }

    const taskTypeIds = Array.isArray(rawTaskTypeIds)
      ? rawTaskTypeIds.map(Number).filter(Number.isFinite)
      : [];
    for (const tid of taskTypeIds) {
      await pool.query('INSERT INTO prep_staff_task_eligibility (staff_id, task_type_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [row.id, tid]);
    }

    cache.invalidatePrefix('prep-staff:');
    res.status(201).json(normalizeStaff({ ...row, org_ids: orgIds, org_names: insertedOrgNames, task_type_ids: taskTypeIds }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existingRows } = await pool.query('SELECT * FROM field_prep_staff WHERE id = $1', [id]);
    if (!existingRows.length) return res.status(404).json({ error: 'Prep staff not found' });
    const existing = existingRows[0];

    const {
      org_id, org_ids: rawOrgIds,
      name, email, phone, venmo_id,
      default_rate_override, notes, user_id,
      task_type_ids: rawTaskTypeIds,
    } = req.body;

    const { rows: currentOrgRows } = await pool.query(
      'SELECT org_id FROM prep_staff_organizations WHERE staff_id = $1', [id]
    );
    const currentOrgIds = currentOrgRows.map(r => r.org_id);

    let nextOrgIds;
    if (rawOrgIds !== undefined) {
      nextOrgIds = Array.isArray(rawOrgIds) ? rawOrgIds.map(Number).filter(Number.isFinite) : [];
    } else if (org_id !== undefined) {
      nextOrgIds = org_id ? [Number(org_id)] : [];
    } else {
      nextOrgIds = currentOrgIds;
    }

    if (currentOrgIds.length) {
      const hasPermForAny = (await Promise.all(currentOrgIds.map(oid => canEditOrg(req.user, oid)))).some(Boolean);
      if (!hasPermForAny) return res.status(403).json({ error: 'No permission for this prep staff' });
    } else if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'No permission for this prep staff' });
    }

    if (nextOrgIds.length) {
      for (const oid of nextOrgIds) {
        if (!(await canEditOrg(req.user, oid))) return res.status(403).json({ error: 'No permission for organization ' + oid });
      }
    } else if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can assign league prep staff' });
    }

    const rate = toMoney(default_rate_override, existing.default_rate_override ?? null);
    if (rate?.error) return res.status(400).json({ error: 'default_rate_override must be a non-negative number' });

    const { rows } = await pool.query(
      `UPDATE field_prep_staff SET
         name = $1, email = $2, phone = $3, venmo_id = $4,
         default_rate_override = $5, notes = $6, user_id = $7,
         updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [
        name !== undefined ? String(name).trim() : existing.name,
        email !== undefined ? (email || null) : existing.email,
        phone !== undefined ? (phone || null) : existing.phone,
        venmo_id !== undefined ? (venmo_id || null) : existing.venmo_id,
        rate,
        notes !== undefined ? (notes || null) : existing.notes,
        user_id !== undefined ? (user_id || null) : existing.user_id,
        id,
      ]
    );

    await pool.query('DELETE FROM prep_staff_organizations WHERE staff_id = $1', [id]);
    const orgNames = [];
    for (const oid of nextOrgIds) {
      await pool.query('INSERT INTO prep_staff_organizations (staff_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, oid]);
      const { rows: orgRow } = await pool.query('SELECT name FROM organizations WHERE id = $1', [oid]);
      if (orgRow[0]) orgNames.push(orgRow[0].name);
    }

    let nextTaskTypeIds;
    if (rawTaskTypeIds !== undefined) {
      nextTaskTypeIds = Array.isArray(rawTaskTypeIds) ? rawTaskTypeIds.map(Number).filter(Number.isFinite) : [];
      await pool.query('DELETE FROM prep_staff_task_eligibility WHERE staff_id = $1', [id]);
      for (const tid of nextTaskTypeIds) {
        await pool.query('INSERT INTO prep_staff_task_eligibility (staff_id, task_type_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, tid]);
      }
    } else {
      const { rows: peRows } = await pool.query('SELECT task_type_id FROM prep_staff_task_eligibility WHERE staff_id = $1', [id]);
      nextTaskTypeIds = peRows.map(r => r.task_type_id);
    }

    const row = rows[0];
    const { rows: userRows } = await pool.query('SELECT username FROM users WHERE id = $1', [row.user_id]);
    cache.invalidatePrefix('prep-staff:');
    res.json(normalizeStaff({ ...row, org_ids: nextOrgIds, org_names: orgNames, task_type_ids: nextTaskTypeIds, linked_username: userRows[0]?.username || null }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id FROM field_prep_staff WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Prep staff not found' });

    const { rows: orgRows } = await pool.query('SELECT org_id FROM prep_staff_organizations WHERE staff_id = $1', [id]);
    const orgIds = orgRows.map(r => r.org_id);
    if (orgIds.length) {
      const hasPermForAny = (await Promise.all(orgIds.map(oid => canEditOrg(req.user, oid)))).some(Boolean);
      if (!hasPermForAny) return res.status(403).json({ error: 'No permission for this prep staff' });
    } else if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can delete league prep staff' });
    }

    await pool.query('DELETE FROM field_prep_staff WHERE id = $1', [id]);
    cache.invalidatePrefix('prep-staff:');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Detail
router.get('/:id/detail', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT s.*, u.username AS linked_username,
         COALESCE(po_agg.org_ids, ARRAY[]::INTEGER[]) AS org_ids,
         COALESCE(po_agg.org_names, ARRAY[]::TEXT[]) AS org_names,
         COALESCE(pe_agg.task_type_ids, ARRAY[]::INTEGER[]) AS task_type_ids
       FROM field_prep_staff s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(po.org_id) AS org_ids,
                ARRAY_AGG(orgs.name ORDER BY orgs.name) AS org_names
         FROM prep_staff_organizations po
         JOIN organizations orgs ON orgs.id = po.org_id
         WHERE po.staff_id = s.id
       ) po_agg ON true
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(pe.task_type_id) AS task_type_ids
         FROM prep_staff_task_eligibility pe
         WHERE pe.staff_id = s.id
       ) pe_agg ON true
       WHERE s.id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Prep staff not found' });
    const staff = rows[0];
    const staffOrgIds = staff.org_ids || [];

    let canSeeFinancials = req.user.role === 'super_admin' || req.user.role === 'accountant';
    if (!canSeeFinancials) {
      if (staffOrgIds.length) {
        const orgAccessChecks = await Promise.all(staffOrgIds.map(oid => canEditOrg(req.user, oid)));
        if (!orgAccessChecks.some(Boolean)) {
          const perms = await getUserPermissions(req.user.id);
          if (perms.team_ids?.length) {
            const orgTeamCheck = await pool.query(
              'SELECT 1 FROM teams WHERE id = ANY($1) AND org_id = ANY($2) LIMIT 1',
              [perms.team_ids, staffOrgIds]
            );
            if (!orgTeamCheck.rows.length) return res.status(403).json({ error: 'No permission' });
          } else {
            return res.status(403).json({ error: 'No permission' });
          }
        }
        canSeeFinancials = true;
      }
    }

    const result = normalizeStaff(staff);
    if (!canSeeFinancials) {
      delete result.default_rate_override;
      delete result.venmo_id;
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Games for a prep staff (per-task assignments)
router.get('/:id/games', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: sRows } = await pool.query('SELECT id, default_rate_override FROM field_prep_staff WHERE id = $1', [id]);
    if (!sRows.length) return res.status(404).json({ error: 'Prep staff not found' });

    const { rows: poRows } = await pool.query('SELECT org_id FROM prep_staff_organizations WHERE staff_id = $1', [id]);
    const staffOrgIds = poRows.map(r => r.org_id);

    let canSeeFinancials = req.user.role === 'super_admin' || req.user.role === 'accountant';
    if (!canSeeFinancials) {
      if (staffOrgIds.length) {
        const orgAccessChecks = await Promise.all(staffOrgIds.map(oid => canEditOrg(req.user, oid)));
        if (!orgAccessChecks.some(Boolean)) {
          const perms = await getUserPermissions(req.user.id);
          const orgTeamCheck = perms.team_ids?.length
            ? await pool.query('SELECT 1 FROM teams WHERE id = ANY($1) AND org_id = ANY($2) LIMIT 1', [perms.team_ids, staffOrgIds])
            : { rows: [] };
          if (!orgTeamCheck.rows.length) return res.status(403).json({ error: 'No permission' });
        }
        canSeeFinancials = true;
      }
    }

    // Per-task assignment rows with computed share
    const { rows } = await pool.query(
      `SELECT
         g.id AS game_id,
         g.game_date,
         g.game_time,
         g.status,
         (g.status = 'completed' OR g.game_date < CURRENT_DATE) AS is_prep_complete,
         g.home_score,
         g.away_score,
         g.season_id,
         a.task_type_id,
         tt.name AS task_name,
         t.rate AS task_rate,
         a.fee_override,
         a.is_paid,
         a.paid_at,
         a.no_show,
         (SELECT COUNT(*) FROM game_prep_task_assignments aa
          WHERE aa.game_id = a.game_id AND aa.task_type_id = a.task_type_id AND NOT aa.no_show) AS active_helpers,
         ht.name AS home_team_name,
         at.name AS away_team_name,
         ht.team_city AS home_team_city, ht.team_mascot AS home_team_mascot, ht.team_color AS home_team_color,
         at.team_city AS away_team_city, at.team_mascot AS away_team_mascot, at.team_color AS away_team_color,
         fl.name AS location_name,
         ls.name AS season_name
       FROM game_prep_task_assignments a
       JOIN games g ON g.id = a.game_id AND g.deleted_at IS NULL
       JOIN game_prep_tasks t ON t.game_id = a.game_id AND t.task_type_id = a.task_type_id
       LEFT JOIN prep_task_types tt ON tt.id = a.task_type_id
       LEFT JOIN teams ht ON ht.id = g.home_team_id
       LEFT JOIN teams at ON at.id = g.away_team_id
       LEFT JOIN field_locations fl ON fl.id = g.location_id
       LEFT JOIN league_seasons ls ON ls.id = g.season_id
       WHERE a.staff_id = $1
       ORDER BY g.game_date DESC, g.game_time DESC NULLS LAST, tt.sort_order`,
      [id]
    );

    const items = rows.map((r) => {
      const taskRate = Number(r.task_rate);
      const helpers = Math.max(1, Number(r.active_helpers) || 1);
      const computedShare = r.no_show ? 0 : (r.fee_override != null ? Number(r.fee_override) : Math.round((taskRate / helpers) * 100) / 100);
      const homeName = r.home_team_city
        ? [r.home_team_city, r.home_team_mascot, r.home_team_color].filter(Boolean).join(' ')
        : (r.home_team_name || '(TBD)');
      const awayName = r.away_team_city
        ? [r.away_team_city, r.away_team_mascot, r.away_team_color].filter(Boolean).join(' ')
        : (r.away_team_name || '(TBD)');
      return {
        ...r,
        home_team_name: homeName,
        away_team_name: awayName,
        task_rate: taskRate,
        fee_override: r.fee_override != null ? Number(r.fee_override) : null,
        share: computedShare,
        is_paid: !!r.is_paid,
        no_show: !!r.no_show,
        is_prep_complete: !!r.is_prep_complete,
        game_date: r.game_date instanceof Date ? r.game_date.toISOString().slice(0, 10) : (r.game_date || '').slice(0, 10),
      };
    });

    // Group by game for summary display
    const completed = items.filter(i => i.is_prep_complete && !i.no_show);
    const totalEarnings = completed.reduce((sum, i) => sum + i.share, 0);
    const totalPayments = completed.filter(i => i.is_paid).reduce((sum, i) => sum + i.share, 0);

    res.json({
      assignments: canSeeFinancials ? items : items.map(({ task_rate, fee_override, share, is_paid, paid_at, ...rest }) => rest),
      summary: canSeeFinancials ? {
        total_assignments: items.length,
        completed_assignments: completed.length,
        total_earnings: Math.round(totalEarnings * 100) / 100,
        total_payments: Math.round(totalPayments * 100) / 100,
        total_due: Math.round((totalEarnings - totalPayments) * 100) / 100,
      } : {
        total_assignments: items.length,
        completed_assignments: completed.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update payment for a specific (game, task_type, staff) row
router.put('/:id/games/:gameId/tasks/:taskTypeId/payment', authMiddleware, async (req, res) => {
  try {
    const { id, gameId, taskTypeId } = req.params;
    const { fee_override, is_paid, no_show } = req.body;

    const { rows: sRows } = await pool.query('SELECT id FROM field_prep_staff WHERE id = $1', [id]);
    if (!sRows.length) return res.status(404).json({ error: 'Prep staff not found' });

    if (req.user.role !== 'super_admin' && req.user.role !== 'accountant') {
      const { rows: poRows } = await pool.query('SELECT org_id FROM prep_staff_organizations WHERE staff_id = $1', [id]);
      const orgIds = poRows.map(r => r.org_id);
      if (orgIds.length) {
        const hasPermForAny = (await Promise.all(orgIds.map(oid => canEditOrg(req.user, oid)))).some(Boolean);
        if (!hasPermForAny) return res.status(403).json({ error: 'No permission' });
      } else {
        return res.status(403).json({ error: 'No permission' });
      }
    }

    const { rows: assignRows } = await pool.query(
      'SELECT * FROM game_prep_task_assignments WHERE game_id = $1 AND task_type_id = $2 AND staff_id = $3',
      [gameId, taskTypeId, id]
    );
    if (!assignRows.length) return res.status(404).json({ error: 'Assignment not found' });

    const updates = [];
    const params = [];

    if (fee_override !== undefined) {
      const fee = toMoney(fee_override, null);
      if (fee?.error) return res.status(400).json({ error: 'fee_override must be a non-negative number' });
      params.push(fee);
      updates.push(`fee_override = $${params.length}`);
    }

    if (is_paid !== undefined) {
      params.push(!!is_paid);
      updates.push(`is_paid = $${params.length}`);
      if (is_paid) {
        params.push(new Date());
        updates.push(`paid_at = $${params.length}`);
      } else {
        updates.push(`paid_at = NULL`);
      }
    }

    if (no_show !== undefined) {
      params.push(!!no_show);
      updates.push(`no_show = $${params.length}`);
    }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    params.push(gameId, taskTypeId, id);
    await pool.query(
      `UPDATE game_prep_task_assignments SET ${updates.join(', ')}
       WHERE game_id = $${params.length - 2} AND task_type_id = $${params.length - 1} AND staff_id = $${params.length}`,
      params
    );

    cache.invalidatePrefix('prep-staff:');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
