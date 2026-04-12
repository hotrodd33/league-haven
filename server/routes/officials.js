const express = require('express');
const { pool } = require('../db');
const { authMiddleware, canEditOrg, getUserPermissions } = require('../auth');

const router = express.Router();

function toMoney(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return { error: true };
  return Math.round(num * 100) / 100;
}

function normalizeOfficial(row) {
  return {
    ...row,
    scope: row.org_id ? 'org' : 'league',
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

    // Always include league-level officials (org_id IS NULL); include org officials only if enabled
    const { rows } = await pool.query(
      `SELECT o.*, org.name AS org_name
       FROM officials o
       LEFT JOIN organizations org ON org.id = o.org_id
       WHERE o.org_id IS NULL${orgOfficialsEnabled ? ' OR o.org_id = $1' : ''}
       ORDER BY CASE WHEN o.org_id IS NULL THEN 0 ELSE 1 END, o.name`,
      orgOfficialsEnabled ? [org_id] : []
    );
    res.json(rows.map(normalizeOfficial));
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
      params.push(org_id);
      clauses.push(`o.org_id = $${params.length}`);
    }
    if (scope === 'league') clauses.push('o.org_id IS NULL');
    if (scope === 'org') clauses.push('o.org_id IS NOT NULL');
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(o.name ILIKE $${params.length} OR COALESCE(o.email, '') ILIKE $${params.length})`);
    }

    if (req.user.role !== 'super_admin') {
      const perms = await getUserPermissions(req.user.id);
      const orgIds = perms.org_ids || [];
      if (orgIds.length) {
        params.push(orgIds);
        clauses.push(`(o.org_id = ANY($${params.length}) OR o.org_id IS NULL)`);
      } else {
        clauses.push('o.org_id IS NULL');
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT o.*, org.name AS org_name, u.username AS linked_username
       FROM officials o
       LEFT JOIN organizations org ON org.id = o.org_id
       LEFT JOIN users u ON u.id = o.user_id
       ${where}
       ORDER BY CASE WHEN o.org_id IS NULL THEN 0 ELSE 1 END, org.name NULLS FIRST, o.name`,
      params
    );

    res.json(rows.map(normalizeOfficial));
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

    const targetOrgId = org_id ? Number(org_id) : null;
    if (targetOrgId) {
      if (!(await canEditOrg(req.user, targetOrgId))) return res.status(403).json({ error: 'No permission for this organization' });
    } else if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can create league officials' });
    }

    const rate = toMoney(rate_per_game, null);
    if (rate?.error) return res.status(400).json({ error: 'rate_per_game must be a non-negative number' });

    const { rows } = await pool.query(
      `INSERT INTO officials
        (org_id, name, email, phone, address, city, state, zip, venmo_id, rate_per_game, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        targetOrgId,
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
    const { rows: orgRows } = await pool.query('SELECT name FROM organizations WHERE id = $1', [row.org_id]);
    res.status(201).json(normalizeOfficial({ ...row, org_name: orgRows[0]?.name || null }));
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

    const nextOrgId = org_id === undefined
      ? existing.org_id
      : (org_id ? Number(org_id) : null);

    if (existing.org_id) {
      if (!(await canEditOrg(req.user, existing.org_id))) return res.status(403).json({ error: 'No permission for this official' });
    } else if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'No permission for this official' });
    }

    if (nextOrgId) {
      if (!(await canEditOrg(req.user, nextOrgId))) return res.status(403).json({ error: 'No permission for target organization' });
    } else if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can assign league officials' });
    }

    const rate = toMoney(rate_per_game, existing.rate_per_game ?? null);
    if (rate?.error) return res.status(400).json({ error: 'rate_per_game must be a non-negative number' });

    const { rows } = await pool.query(
      `UPDATE officials SET
         org_id = $1,
         name = $2,
         email = $3,
         phone = $4,
         address = $5,
         city = $6,
         state = $7,
         zip = $8,
         venmo_id = $9,
         rate_per_game = $10,
         notes = $11,
         date_of_birth = $12,
         is_certified = $13,
         years_of_experience = $14,
         user_id = $15,
         updated_at = NOW()
       WHERE id = $16
       RETURNING *`,
      [
        nextOrgId,
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

    const row = rows[0];
    const { rows: orgRows } = await pool.query('SELECT name FROM organizations WHERE id = $1', [row.org_id]);
    const { rows: userRows } = await pool.query('SELECT username FROM users WHERE id = $1', [row.user_id]);
    res.json(normalizeOfficial({ ...row, org_name: orgRows[0]?.name || null, linked_username: userRows[0]?.username || null }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete official
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT org_id FROM officials WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Official not found' });

    const orgId = rows[0].org_id;
    if (orgId) {
      if (!(await canEditOrg(req.user, orgId))) return res.status(403).json({ error: 'No permission for this official' });
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
      `SELECT o.*, org.name AS org_name, u.username AS linked_username
       FROM officials o
       LEFT JOIN organizations org ON org.id = o.org_id
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Official not found' });
    const official = rows[0];

    // Permission check: super admin, or can edit the official's org
    if (req.user.role !== 'super_admin') {
      if (official.org_id) {
        if (!(await canEditOrg(req.user, official.org_id))) {
          // Also allow coaches (team-level permissions) if they're in the same org
          const perms = await getUserPermissions(req.user.id);
          const orgTeamCheck = perms.team_ids?.length
            ? await pool.query('SELECT 1 FROM teams WHERE id = ANY($1) AND org_id = $2 LIMIT 1', [perms.team_ids, official.org_id])
            : { rows: [] };
          if (!orgTeamCheck.rows.length) return res.status(403).json({ error: 'No permission' });
        }
      } else {
        // League-scoped official — only super admin
        return res.status(403).json({ error: 'No permission' });
      }
    }

    res.json(normalizeOfficial(official));
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
    const { rows: offRows } = await pool.query('SELECT id, org_id, rate_per_game FROM officials WHERE id = $1', [id]);
    if (!offRows.length) return res.status(404).json({ error: 'Official not found' });
    const official = offRows[0];

    if (req.user.role !== 'super_admin') {
      if (official.org_id) {
        if (!(await canEditOrg(req.user, official.org_id))) {
          const perms = await getUserPermissions(req.user.id);
          const orgTeamCheck = perms.team_ids?.length
            ? await pool.query('SELECT 1 FROM teams WHERE id = ANY($1) AND org_id = $2 LIMIT 1', [perms.team_ids, official.org_id])
            : { rows: [] };
          if (!orgTeamCheck.rows.length) return res.status(403).json({ error: 'No permission' });
        }
      } else {
        return res.status(403).json({ error: 'No permission' });
      }
    }

    const defaultRate = official.rate_per_game != null ? Number(official.rate_per_game) : null;

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

    // Fee priority: game_fee override > age-group rate > official default rate > $50
    const games = rows.map(r => {
      const ageGroupRate = r.age_group_rate != null ? Number(r.age_group_rate) : null;
      const fee = r.game_fee != null ? Number(r.game_fee) : (ageGroupRate ?? defaultRate ?? 50);
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
        effective_fee: fee,
        game_date: r.game_date instanceof Date ? r.game_date.toISOString().slice(0, 10) : (r.game_date || '').slice(0, 10),
      };
    });

    const completedGames = games.filter(g => g.status === 'completed');
    const totalEarnings = completedGames.reduce((sum, g) => sum + g.effective_fee, 0);
    const totalPayments = completedGames.filter(g => g.is_paid).reduce((sum, g) => sum + g.effective_fee, 0);
    const totalDue = totalEarnings - totalPayments;

    res.json({
      games,
      summary: {
        total_games: games.length,
        completed_games: completedGames.length,
        total_earnings: Math.round(totalEarnings * 100) / 100,
        total_payments: Math.round(totalPayments * 100) / 100,
        total_due: Math.round(totalDue * 100) / 100,
        default_rate: defaultRate,
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
    const { game_fee, is_paid } = req.body;

    // Verify official exists + permission
    const { rows: offRows } = await pool.query('SELECT id, org_id FROM officials WHERE id = $1', [id]);
    if (!offRows.length) return res.status(404).json({ error: 'Official not found' });
    const official = offRows[0];

    if (req.user.role !== 'super_admin') {
      if (official.org_id) {
        if (!(await canEditOrg(req.user, official.org_id))) return res.status(403).json({ error: 'No permission' });
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

module.exports = router;
