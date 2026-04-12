const express = require('express');
const { pool } = require('../db');
const { authMiddleware, canEditOrg, getUserPermissions } = require('../auth');

const router = express.Router();

function toMoney(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  if (value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return { error: true };
  return Math.round(num * 100) / 100;
}

function normalizeOfficial(row) {
  const org_ids = row.org_ids || [];
  const org_names = row.org_names || [];
  return {
    ...row,
    org_ids,
    org_names,
    scope: org_ids.length ? 'org' : 'league',
    rate_per_game: row.rate_per_game != null ? Number(row.rate_per_game) : null,
  };
}

// Get umpire-role users and whether they're already linked to an official profile
router.get('/umpire-users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super admin only' });
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.name, u.email, o.id AS official_id
       FROM users u
       LEFT JOIN officials o ON o.user_id = u.id
       WHERE u.role = 'umpire' OR u.is_umpire = TRUE
       ORDER BY u.name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get assignable officials for an organization (league + org scoped), respecting org toggle
router.get('/assignable', authMiddleware, async (req, res) => {
  try {
    const { org_id } = req.query;
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

    const { rows: orgRows } = await pool.query('SELECT id, officials_enabled FROM organizations WHERE id = $1', [org_id]);
    if (!orgRows.length) return res.status(404).json({ error: 'Organization not found' });
    const orgOfficialsEnabled = !!orgRows[0].officials_enabled;

    // Always include league-level officials (no org assignments); include org officials only if enabled
    const { rows } = await pool.query(
      `SELECT o.*,
         COALESCE(oo_agg.org_ids, ARRAY[]::INTEGER[]) AS org_ids,
         COALESCE(oo_agg.org_names, ARRAY[]::TEXT[]) AS org_names
       FROM officials o
       LEFT JOIN LATERAL (
         SELECT
           ARRAY_AGG(oo.org_id) AS org_ids,
           ARRAY_AGG(orgs.name ORDER BY orgs.name) AS org_names
         FROM official_organizations oo
         JOIN organizations orgs ON orgs.id = oo.org_id
         WHERE oo.official_id = o.id
       ) oo_agg ON true
       WHERE NOT EXISTS (SELECT 1 FROM official_organizations oo WHERE oo.official_id = o.id)
         ${orgOfficialsEnabled ? 'OR EXISTS (SELECT 1 FROM official_organizations oo WHERE oo.official_id = o.id AND oo.org_id = $1)' : ''}
       ORDER BY CASE WHEN COALESCE(array_length(oo_agg.org_ids, 1), 0) = 0 THEN 0 ELSE 1 END, o.name`,
      orgOfficialsEnabled ? [org_id] : []
    );
    const canSeeFinancials = ['super_admin', 'accountant', 'org_admin'].includes(req.user.role);
    res.json(rows.map(r => {
      const o = normalizeOfficial(r);
      if (!canSeeFinancials) {
        delete o.rate_per_game;
        delete o.venmo_id;
      }
      return o;
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List officials (all for super admin; scoped for other users)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { org_id, scope, search } = req.query;
    const params = [];
    const clauses = [];

    if (org_id) {
      params.push(Number(org_id));
      clauses.push(`EXISTS (SELECT 1 FROM official_organizations oo WHERE oo.official_id = o.id AND oo.org_id = $${params.length})`);
    }
    if (scope === 'league') clauses.push('NOT EXISTS (SELECT 1 FROM official_organizations oo WHERE oo.official_id = o.id)');
    if (scope === 'org') clauses.push('EXISTS (SELECT 1 FROM official_organizations oo WHERE oo.official_id = o.id)');
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(o.name ILIKE $${params.length} OR COALESCE(o.email, '') ILIKE $${params.length})`);
    }

    let userOrgIds = null;
    if (req.user.role !== 'super_admin' && req.user.role !== 'accountant') {
      const perms = await getUserPermissions(req.user.id);
      const orgIds = perms.org_ids || [];
      userOrgIds = orgIds;
      if (orgIds.length) {
        params.push(orgIds);
        clauses.push(`(EXISTS (SELECT 1 FROM official_organizations oo WHERE oo.official_id = o.id AND oo.org_id = ANY($${params.length})) OR NOT EXISTS (SELECT 1 FROM official_organizations oo WHERE oo.official_id = o.id))`);
      } else {
        clauses.push('NOT EXISTS (SELECT 1 FROM official_organizations oo WHERE oo.official_id = o.id)');
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT o.*, u.username AS linked_username,
         COALESCE(oo_agg.org_ids, ARRAY[]::INTEGER[]) AS org_ids,
         COALESCE(oo_agg.org_names, ARRAY[]::TEXT[]) AS org_names,
         COALESCE(stats.assigned_games, 0) AS assigned_games,
         COALESCE(stats.completed_games, 0) AS completed_games,
         COALESCE(stats.total_owed, 0) AS total_owed,
         COALESCE(interest_stats.interested_games, 0) AS interested_games,
         ag_list.age_group_ids
       FROM officials o
       LEFT JOIN LATERAL (
         SELECT
           ARRAY_AGG(oo.org_id) AS org_ids,
           ARRAY_AGG(orgs.name ORDER BY orgs.name) AS org_names
         FROM official_organizations oo
         JOIN organizations orgs ON orgs.id = oo.org_id
         WHERE oo.official_id = o.id
       ) oo_agg ON true
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE g.status != 'completed') AS assigned_games,
           COUNT(*) FILTER (WHERE g.status = 'completed') AS completed_games,
           COALESCE(SUM(
             CASE WHEN g.status = 'completed' AND NOT goa.is_paid AND NOT goa.no_show THEN
               COALESCE(goa.game_fee, o.rate_per_game, (SELECT lag.umpire_rate FROM league_age_groups lag WHERE LOWER(TRIM(lag.name)) = LOWER(TRIM(ht.age_group)) LIMIT 1), 50)
             ELSE 0 END
           ), 0) AS total_owed
         FROM game_official_assignments goa
         JOIN games g ON g.id = goa.game_id
         LEFT JOIN teams ht ON ht.id = g.home_team_id
         WHERE goa.official_id = o.id
       ) stats ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS interested_games
         FROM umpire_game_interests ugi
         WHERE ugi.user_id = o.user_id AND o.user_id IS NOT NULL
       ) interest_stats ON true
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(oag.age_group_id) AS age_group_ids
         FROM official_age_groups oag
         WHERE oag.official_id = o.id
       ) ag_list ON true
       ${where}
       ORDER BY CASE WHEN COALESCE(array_length(oo_agg.org_ids, 1), 0) = 0 THEN 0 ELSE 1 END, o.name`,
      params
    );

    const isGlobalFinancial = ['super_admin', 'accountant'].includes(req.user.role);
    res.json(rows.map(r => {
      const o = normalizeOfficial(r);
      // Admin/accountant see all financials; org_admin sees only their own org's officials
      const canSeeThisFinancial = isGlobalFinancial || (userOrgIds && o.org_ids?.some(oid => userOrgIds.includes(oid)));
      if (!canSeeThisFinancial) {
        delete o.total_owed;
        delete o.rate_per_game;
        delete o.venmo_id;
      }
      return o;
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create official
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      org_id,
      org_ids: rawOrgIds,
      name,
      email,
      phone,
      address,
      city,
      state,
      zip,
      venmo_id,
      rate_per_game,
      notes,
    } = req.body;

    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });

    // Accept org_ids array or fall back to single org_id
    const orgIds = Array.isArray(rawOrgIds)
      ? rawOrgIds.map(Number).filter(Number.isFinite)
      : (org_id ? [Number(org_id)] : []);

    if (orgIds.length) {
      for (const oid of orgIds) {
        if (!(await canEditOrg(req.user, oid))) return res.status(403).json({ error: 'No permission for organization ' + oid });
      }
    } else if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can create league officials' });
    }

    const rate = toMoney(rate_per_game, null);
    if (rate?.error) return res.status(400).json({ error: 'rate_per_game must be a non-negative number' });

    const { rows } = await pool.query(
      `INSERT INTO officials
        (name, email, phone, address, city, state, zip, venmo_id, rate_per_game, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        String(name).trim(),
        email || null,
        phone || null,
        address || null,
        city || null,
        state || null,
        zip || null,
        venmo_id || null,
        rate,
        notes || null,
      ]
    );

    const row = rows[0];
    // Insert org associations
    const insertedOrgNames = [];
    for (const oid of orgIds) {
      await pool.query('INSERT INTO official_organizations (official_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [row.id, oid]);
      const { rows: orgRows } = await pool.query('SELECT name FROM organizations WHERE id = $1', [oid]);
      if (orgRows[0]) insertedOrgNames.push(orgRows[0].name);
    }
    res.status(201).json(normalizeOfficial({ ...row, org_ids: orgIds, org_names: insertedOrgNames }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update official
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existingRows } = await pool.query('SELECT * FROM officials WHERE id = $1', [id]);
    if (!existingRows.length) return res.status(404).json({ error: 'Official not found' });
    const existing = existingRows[0];

    const {
      org_id,
      org_ids: rawOrgIds,
      name,
      email,
      phone,
      address,
      city,
      state,
      zip,
      venmo_id,
      rate_per_game,
      notes,
      date_of_birth,
      is_certified,
      years_of_experience,
      user_id,
    } = req.body;

    // Current org associations
    const { rows: currentOrgRows } = await pool.query(
      'SELECT org_id FROM official_organizations WHERE official_id = $1', [id]
    );
    const currentOrgIds = currentOrgRows.map(r => r.org_id);

    // Determine next org IDs (support org_ids array or legacy org_id)
    let nextOrgIds;
    if (rawOrgIds !== undefined) {
      nextOrgIds = Array.isArray(rawOrgIds) ? rawOrgIds.map(Number).filter(Number.isFinite) : [];
    } else if (org_id !== undefined) {
      nextOrgIds = org_id ? [Number(org_id)] : [];
    } else {
      nextOrgIds = currentOrgIds;
    }

    // Permission: user must have access to existing orgs (or be super_admin for league officials)
    if (currentOrgIds.length) {
      const hasPermForAny = (await Promise.all(currentOrgIds.map(oid => canEditOrg(req.user, oid)))).some(Boolean);
      if (!hasPermForAny) return res.status(403).json({ error: 'No permission for this official' });
    } else if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'No permission for this official' });
    }

    // Permission: user must have access to all target orgs
    if (nextOrgIds.length) {
      for (const oid of nextOrgIds) {
        if (!(await canEditOrg(req.user, oid))) return res.status(403).json({ error: 'No permission for organization ' + oid });
      }
    } else if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can assign league officials' });
    }

    const rate = toMoney(rate_per_game, existing.rate_per_game ?? null);
    if (rate?.error) return res.status(400).json({ error: 'rate_per_game must be a non-negative number' });

    const { rows } = await pool.query(
      `UPDATE officials SET
         name = $1,
         email = $2,
         phone = $3,
         address = $4,
         city = $5,
         state = $6,
         zip = $7,
         venmo_id = $8,
         rate_per_game = $9,
         notes = $10,
         date_of_birth = $11,
         is_certified = $12,
         years_of_experience = $13,
         user_id = $14,
         updated_at = NOW()
       WHERE id = $15
       RETURNING *`,
      [
        name !== undefined ? String(name).trim() : existing.name,
        email !== undefined ? (email || null) : existing.email,
        phone !== undefined ? (phone || null) : existing.phone,
        address !== undefined ? (address || null) : existing.address,
        city !== undefined ? (city || null) : existing.city,
        state !== undefined ? (state || null) : existing.state,
        zip !== undefined ? (zip || null) : existing.zip,
        venmo_id !== undefined ? (venmo_id || null) : existing.venmo_id,
        rate,
        notes !== undefined ? (notes || null) : existing.notes,
        date_of_birth !== undefined ? (date_of_birth || null) : existing.date_of_birth,
        is_certified !== undefined ? Boolean(is_certified) : existing.is_certified,
        years_of_experience !== undefined ? (years_of_experience != null && years_of_experience !== '' ? Number(years_of_experience) : null) : existing.years_of_experience,
        user_id !== undefined ? (user_id || null) : existing.user_id,
        id,
      ]
    );

    // Update org associations
    await pool.query('DELETE FROM official_organizations WHERE official_id = $1', [id]);
    const orgNames = [];
    for (const oid of nextOrgIds) {
      await pool.query('INSERT INTO official_organizations (official_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, oid]);
      const { rows: orgRow } = await pool.query('SELECT name FROM organizations WHERE id = $1', [oid]);
      if (orgRow[0]) orgNames.push(orgRow[0].name);
    }

    const row = rows[0];
    const { rows: userRows } = await pool.query('SELECT username FROM users WHERE id = $1', [row.user_id]);
    res.json(normalizeOfficial({ ...row, org_ids: nextOrgIds, org_names: orgNames, linked_username: userRows[0]?.username || null }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete official
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id FROM officials WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Official not found' });

    const { rows: orgRows } = await pool.query('SELECT org_id FROM official_organizations WHERE official_id = $1', [id]);
    const orgIds = orgRows.map(r => r.org_id);
    if (orgIds.length) {
      const hasPermForAny = (await Promise.all(orgIds.map(oid => canEditOrg(req.user, oid)))).some(Boolean);
      if (!hasPermForAny) return res.status(403).json({ error: 'No permission for this official' });
    } else if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can delete league officials' });
    }

    await pool.query('DELETE FROM officials WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Official detail: single official profile ──
router.get('/:id/detail', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT o.*, u.username AS linked_username,
         COALESCE(oo_agg.org_ids, ARRAY[]::INTEGER[]) AS org_ids,
         COALESCE(oo_agg.org_names, ARRAY[]::TEXT[]) AS org_names
       FROM officials o
       LEFT JOIN LATERAL (
         SELECT
           ARRAY_AGG(oo.org_id) AS org_ids,
           ARRAY_AGG(orgs.name ORDER BY orgs.name) AS org_names
         FROM official_organizations oo
         JOIN organizations orgs ON orgs.id = oo.org_id
         WHERE oo.official_id = o.id
       ) oo_agg ON true
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Official not found' });
    const official = rows[0];
    const officialOrgIds = official.org_ids || [];

    // Permission: super admin/accountant see all; others must have org access or be in same org
    let canSeeFinancials = req.user.role === 'super_admin' || req.user.role === 'accountant';
    if (!canSeeFinancials) {
      if (officialOrgIds.length) {
        // Check if user has access to ANY of the official's orgs
        const orgAccessChecks = await Promise.all(officialOrgIds.map(oid => canEditOrg(req.user, oid)));
        if (!orgAccessChecks.some(Boolean)) {
          // Also allow coaches (team-level permissions) if they're in any of the same orgs
          const perms = await getUserPermissions(req.user.id);
          if (perms.team_ids?.length) {
            const orgTeamCheck = await pool.query(
              'SELECT 1 FROM teams WHERE id = ANY($1) AND org_id = ANY($2) LIMIT 1',
              [perms.team_ids, officialOrgIds]
            );
            if (!orgTeamCheck.rows.length) return res.status(403).json({ error: 'No permission' });
          } else {
            return res.status(403).json({ error: 'No permission' });
          }
        }
        canSeeFinancials = true; // user has permission for at least one of this official's orgs
      }
      // League-scoped officials: visible to all authenticated users, but no financial data
    }

    const result = normalizeOfficial(official);
    if (!canSeeFinancials) {
      delete result.rate_per_game;
      delete result.venmo_id;
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Official games: all assigned games with fee/payment info ──
router.get('/:id/games', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify official exists and user has permission
    const { rows: offRows } = await pool.query('SELECT id, rate_per_game FROM officials WHERE id = $1', [id]);
    if (!offRows.length) return res.status(404).json({ error: 'Official not found' });
    const official = offRows[0];

    const { rows: ooRows } = await pool.query('SELECT org_id FROM official_organizations WHERE official_id = $1', [id]);
    const officialOrgIds = ooRows.map(r => r.org_id);

    let canSeeFinancials = req.user.role === 'super_admin' || req.user.role === 'accountant';
    if (!canSeeFinancials) {
      if (officialOrgIds.length) {
        const orgAccessChecks = await Promise.all(officialOrgIds.map(oid => canEditOrg(req.user, oid)));
        if (!orgAccessChecks.some(Boolean)) {
          const perms = await getUserPermissions(req.user.id);
          const orgTeamCheck = perms.team_ids?.length
            ? await pool.query('SELECT 1 FROM teams WHERE id = ANY($1) AND org_id = ANY($2) LIMIT 1', [perms.team_ids, officialOrgIds])
            : { rows: [] };
          if (!orgTeamCheck.rows.length) return res.status(403).json({ error: 'No permission' });
        }
        canSeeFinancials = true; // user has permission for at least one of this official's orgs
      }
      // League-scoped: allow viewing games but strip financial data
    }

    const defaultRate = canSeeFinancials && official.rate_per_game != null ? Number(official.rate_per_game) : null;

    const { rows } = await pool.query(
      `SELECT
         g.id AS game_id,
         g.game_date,
         g.game_time,
         g.status,
         g.home_score,
         g.away_score,
         g.innings_played,
         g.season_id,
         ht.name AS home_team_name,
         at.name AS away_team_name,
         ht.team_city AS home_team_city, ht.team_mascot AS home_team_mascot, ht.team_color AS home_team_color,
         ht.age_group AS home_age_group,
         at.team_city AS away_team_city, at.team_mascot AS away_team_mascot, at.team_color AS away_team_color,
         fl.name AS location_name,
         goa.added_at,
         goa.game_fee,
         goa.is_paid,
         goa.paid_at,
         goa.no_show,
         ls.name AS season_name,
         lag.umpire_rate AS age_group_rate
       FROM game_official_assignments goa
       JOIN games g ON g.id = goa.game_id
       LEFT JOIN teams ht ON ht.id = g.home_team_id
       LEFT JOIN teams at ON at.id = g.away_team_id
       LEFT JOIN field_locations fl ON fl.id = g.location_id
       LEFT JOIN league_seasons ls ON ls.id = g.season_id
       LEFT JOIN league_age_groups lag ON LOWER(TRIM(lag.name)) = LOWER(TRIM(ht.age_group))
       WHERE goa.official_id = $1
       ORDER BY g.game_date DESC, g.game_time DESC NULLS LAST`,
      [id]
    );

    // Fee priority: game_fee override > official rate > age-group rate > $50
    const games = rows.map(r => {
      const ageGroupRate = r.age_group_rate != null ? Number(r.age_group_rate) : null;
      const fee = r.game_fee != null ? Number(r.game_fee) : (defaultRate ?? ageGroupRate ?? 50);
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
        game_fee: fee,
        is_paid: !!r.is_paid,
        no_show: !!r.no_show,
        effective_fee: fee,
        game_date: r.game_date instanceof Date ? r.game_date.toISOString().slice(0, 10) : (r.game_date || '').slice(0, 10),
      };
    });

    const completedGames = games.filter(g => g.status === 'completed');
    const earnableGames = completedGames.filter(g => !g.no_show);
    const totalEarnings = earnableGames.reduce((sum, g) => sum + g.effective_fee, 0);
    const totalPayments = earnableGames.filter(g => g.is_paid).reduce((sum, g) => sum + g.effective_fee, 0);
    const totalDue = totalEarnings - totalPayments;

    res.json({
      games: canSeeFinancials ? games : games.map(({ game_fee, effective_fee, is_paid, paid_at, ...g }) => g),
      summary: canSeeFinancials ? {
        total_games: games.length,
        completed_games: completedGames.length,
        total_earnings: Math.round(totalEarnings * 100) / 100,
        total_payments: Math.round(totalPayments * 100) / 100,
        total_due: Math.round(totalDue * 100) / 100,
        default_rate: defaultRate,
      } : {
        total_games: games.length,
        completed_games: completedGames.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Update payment info for an official's game assignment ──
router.put('/:id/games/:gameId/payment', authMiddleware, async (req, res) => {
  try {
    const { id, gameId } = req.params;
    const { game_fee, is_paid, no_show } = req.body;

    // Verify official exists + permission
    const { rows: offRows } = await pool.query('SELECT id FROM officials WHERE id = $1', [id]);
    if (!offRows.length) return res.status(404).json({ error: 'Official not found' });

    if (req.user.role !== 'super_admin' && req.user.role !== 'accountant') {
      const { rows: ooRows } = await pool.query('SELECT org_id FROM official_organizations WHERE official_id = $1', [id]);
      const orgIds = ooRows.map(r => r.org_id);
      if (orgIds.length) {
        const hasPermForAny = (await Promise.all(orgIds.map(oid => canEditOrg(req.user, oid)))).some(Boolean);
        if (!hasPermForAny) return res.status(403).json({ error: 'No permission' });
      } else {
        return res.status(403).json({ error: 'No permission' });
      }
    }

    // Check assignment exists
    const { rows: assignRows } = await pool.query(
      'SELECT * FROM game_official_assignments WHERE game_id = $1 AND official_id = $2',
      [gameId, id]
    );
    if (!assignRows.length) return res.status(404).json({ error: 'Assignment not found' });

    const updates = [];
    const params = [];

    if (game_fee !== undefined) {
      const fee = toMoney(game_fee, null);
      params.push(fee);
      updates.push(`game_fee = $${params.length}`);
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

    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(Number(gameId), Number(id));
    await pool.query(
      `UPDATE game_official_assignments SET ${updates.join(', ')} WHERE game_id = $${params.length - 1} AND official_id = $${params.length}`,
      params
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Official Age Group Eligibility ──

// PUT /officials/:id/age-groups — set eligible age groups for an official
router.put('/:id/age-groups', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { age_group_ids } = req.body; // array of age_group_id
    if (!Array.isArray(age_group_ids)) return res.status(400).json({ error: 'age_group_ids must be an array' });

    const { rows: existing } = await pool.query('SELECT * FROM officials WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Official not found' });

    // Delete all existing then insert new
    await pool.query('DELETE FROM official_age_groups WHERE official_id = $1', [id]);
    for (const agId of age_group_ids) {
      await pool.query(
        'INSERT INTO official_age_groups (official_id, age_group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, agId]
      );
    }

    res.json({ success: true, age_group_ids });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Interested games for an official (via linked user) ──
router.get('/:id/interested-games', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: offRows } = await pool.query('SELECT id, user_id FROM officials WHERE id = $1', [id]);
    if (!offRows.length) return res.status(404).json({ error: 'Official not found' });
    const official = offRows[0];
    if (!official.user_id) return res.json([]);

    const { rows } = await pool.query(
      `SELECT
         g.id AS game_id,
         g.game_date,
         g.game_time,
         g.status,
         g.home_score,
         g.away_score,
         ht.name AS home_team_name,
         at.name AS away_team_name,
         ht.team_city AS home_team_city, ht.team_mascot AS home_team_mascot,
         ht.age_group AS home_age_group,
         at.team_city AS away_team_city, at.team_mascot AS away_team_mascot,
         fl.name AS location_name,
         ls.name AS season_name,
         ugi.interested_at,
         COUNT(DISTINCT goa.official_id) AS assigned_count
       FROM umpire_game_interests ugi
       JOIN games g ON g.id = ugi.game_id
       LEFT JOIN teams ht ON ht.id = g.home_team_id
       LEFT JOIN teams at ON at.id = g.away_team_id
       LEFT JOIN field_locations fl ON fl.id = g.location_id
       LEFT JOIN league_seasons ls ON ls.id = g.season_id
       LEFT JOIN game_official_assignments goa ON goa.game_id = g.id
       WHERE ugi.user_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM game_official_assignments x WHERE x.game_id = g.id AND x.official_id = $2
         )
       GROUP BY g.id, g.game_date, g.game_time, g.status, g.home_score, g.away_score,
         ht.name, at.name, ht.team_city, ht.team_mascot, ht.age_group,
         at.team_city, at.team_mascot, fl.name, ls.name, ugi.interested_at
       ORDER BY g.game_date ASC, g.game_time ASC NULLS LAST`,
      [official.user_id, id]
    );

    const games = rows.map(r => {
      const homeName = r.home_team_city
        ? [r.home_team_city, r.home_team_mascot].filter(Boolean).join(' ')
        : (r.home_team_name || '(TBD)');
      const awayName = r.away_team_city
        ? [r.away_team_city, r.away_team_mascot].filter(Boolean).join(' ')
        : (r.away_team_name || '(TBD)');
      return {
        ...r,
        home_team_name: homeName,
        away_team_name: awayName,
        game_date: r.game_date instanceof Date ? r.game_date.toISOString().slice(0, 10) : (r.game_date || '').slice(0, 10),
      };
    });

    res.json(games);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Assign an official to a game (from interested) ──
router.post('/:id/games/:gameId/assign', authMiddleware, async (req, res) => {
  try {
    const { id, gameId } = req.params;
    const { rows: offRows } = await pool.query('SELECT id, org_id FROM officials WHERE id = $1', [id]);
    if (!offRows.length) return res.status(404).json({ error: 'Official not found' });

    if (req.user.role !== 'super_admin' && req.user.role !== 'accountant') {
      if (offRows[0].org_id) {
        if (!(await canEditOrg(req.user, offRows[0].org_id))) return res.status(403).json({ error: 'No permission' });
      } else {
        return res.status(403).json({ error: 'No permission' });
      }
    }

    await pool.query(
      'INSERT INTO game_official_assignments (game_id, official_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [gameId, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Unassign an official from a game (moves back to interested) ──
router.delete('/:id/games/:gameId/assign', authMiddleware, async (req, res) => {
  try {
    const { id, gameId } = req.params;
    const { rows: offRows } = await pool.query('SELECT id, org_id, user_id FROM officials WHERE id = $1', [id]);
    if (!offRows.length) return res.status(404).json({ error: 'Official not found' });

    if (req.user.role !== 'super_admin' && req.user.role !== 'accountant') {
      if (offRows[0].org_id) {
        if (!(await canEditOrg(req.user, offRows[0].org_id))) return res.status(403).json({ error: 'No permission' });
      } else {
        return res.status(403).json({ error: 'No permission' });
      }
    }

    await pool.query(
      'DELETE FROM game_official_assignments WHERE game_id = $1 AND official_id = $2',
      [gameId, id]
    );

    // Re-add interest if the official has a linked user
    if (offRows[0].user_id) {
      await pool.query(
        'INSERT INTO umpire_game_interests (user_id, game_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [offRows[0].user_id, gameId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
