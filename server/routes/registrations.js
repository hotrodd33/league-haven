const express = require('express');
const { pool } = require('../db');
const { authMiddleware, getUserPermissions } = require('../auth');

const router = express.Router();

function toMoney(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return { error: true };
  return Math.round(num * 100) / 100;
}

function requireAdminOrAccountant(req, res, next) {
  const role = req.user?.role;
  if (role === 'super_admin' || role === 'accountant') return next();
  return res.status(403).json({ error: 'Forbidden' });
}

// ── List all registrations (with team/season/org info + fee resolution) ──
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { season_id, age_group, status, payment } = req.query;
    const params = [];
    const conditions = [];

    // Scope by user role: admin/accountant see all, others see only their orgs
    const role = req.user?.role;
    const isFullAccess = role === 'super_admin' || role === 'accountant';
    if (!isFullAccess) {
      const perms = await getUserPermissions(req.user.id);
      const userOrgIds = perms.org_ids || [];
      if (!userOrgIds.length) return res.json({ registrations: [], summary: { total_teams: 0, total_fees: 0, total_collected: 0, total_outstanding: 0 } });
      params.push(userOrgIds);
      conditions.push(`t.org_id = ANY($${params.length})`);
    }

    if (season_id) {
      params.push(season_id);
      conditions.push(`r.season_id = $${params.length}`);
    }
    if (age_group) {
      params.push(age_group);
      conditions.push(`LOWER(TRIM(t.age_group)) = LOWER(TRIM($${params.length}))`);
    }
    if (status) {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }
    if (payment === 'paid') conditions.push('r.is_paid = TRUE');
    if (payment === 'unpaid') conditions.push('r.is_paid = FALSE');

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await pool.query(`
      SELECT r.*,
        t.name AS team_name, t.age_group, t.level, t.logo_url,
        t.primary_color, t.secondary_color,
        o.name AS org_name, o.id AS org_id,
        s.name AS season_name, s.year AS season_year,
        lag.league_fee AS age_group_fee
      FROM team_registrations r
      JOIN teams t ON t.id = r.team_id
      LEFT JOIN organizations o ON o.id = t.org_id
      JOIN league_seasons s ON s.id = r.season_id
      LEFT JOIN league_age_groups lag ON LOWER(TRIM(lag.name)) = LOWER(TRIM(t.age_group))
      ${where}
      ORDER BY s.year DESC, s.name, COALESCE(t.age_group, ''), t.name
    `, params);

    const registrations = rows.map(r => {
      const effectiveFee = r.fee != null ? Number(r.fee) :
        (r.age_group_fee != null ? Number(r.age_group_fee) : null);
      return {
        ...r,
        fee: r.fee != null ? Number(r.fee) : null,
        paid_amount: r.paid_amount != null ? Number(r.paid_amount) : null,
        age_group_fee: r.age_group_fee != null ? Number(r.age_group_fee) : null,
        effective_fee: effectiveFee,
      };
    });

    // Summary
    const totalFees = registrations.reduce((sum, r) => sum + (r.effective_fee || 0), 0);
    const totalCollected = registrations.filter(r => r.is_paid).reduce((sum, r) => sum + (r.paid_amount != null ? r.paid_amount : (r.effective_fee || 0)), 0);

    res.json({
      registrations,
      summary: {
        total_teams: registrations.length,
        total_fees: totalFees,
        total_collected: totalCollected,
        total_outstanding: totalFees - totalCollected,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Register a team for a season ──
router.post('/', authMiddleware, requireAdminOrAccountant, async (req, res) => {
  try {
    const { team_id, season_id, fee, status } = req.body;
    if (!team_id || !season_id) return res.status(400).json({ error: 'team_id and season_id are required' });

    const parsedFee = toMoney(fee);
    if (parsedFee && parsedFee.error) return res.status(400).json({ error: 'Invalid fee amount' });

    const { rows } = await pool.query(
      `INSERT INTO team_registrations (team_id, season_id, fee, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [team_id, season_id, parsedFee, status || 'registered']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Team is already registered for this season' });
    if (err.code === '23503') return res.status(400).json({ error: 'Invalid team or season' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Bulk register all teams for a season ──
router.post('/bulk', authMiddleware, requireAdminOrAccountant, async (req, res) => {
  try {
    const { season_id } = req.body;
    if (!season_id) return res.status(400).json({ error: 'season_id is required' });

    // Find teams NOT already registered for this season
    const { rows: teams } = await pool.query(`
      SELECT t.id FROM teams t
      WHERE t.id NOT IN (SELECT team_id FROM team_registrations WHERE season_id = $1)
    `, [season_id]);

    if (!teams.length) return res.json({ registered: 0 });

    const values = teams.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
    const params = teams.flatMap(t => [t.id, season_id]);
    await pool.query(
      `INSERT INTO team_registrations (team_id, season_id) VALUES ${values} ON CONFLICT DO NOTHING`,
      params
    );

    res.json({ registered: teams.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Update a registration (fee, payment, status) ──
router.put('/:id', authMiddleware, requireAdminOrAccountant, async (req, res) => {
  try {
    const { fee, is_paid, paid_amount, payment_method, check_number, payment_notes, status } = req.body;

    // Build dynamic update
    const sets = [];
    const params = [];

    if (fee !== undefined) {
      const parsedFee = toMoney(fee);
      if (parsedFee && parsedFee.error) return res.status(400).json({ error: 'Invalid fee amount' });
      params.push(parsedFee);
      sets.push(`fee = $${params.length}`);
    }

    if (is_paid !== undefined) {
      params.push(!!is_paid);
      sets.push(`is_paid = $${params.length}`);
      if (is_paid) {
        sets.push(`paid_at = NOW()`);
      } else {
        sets.push(`paid_at = NULL`);
      }
    }

    if (paid_amount !== undefined) {
      const parsedAmt = toMoney(paid_amount);
      if (parsedAmt && parsedAmt.error) return res.status(400).json({ error: 'Invalid paid amount' });
      params.push(parsedAmt);
      sets.push(`paid_amount = $${params.length}`);
    }

    if (payment_method !== undefined) {
      params.push(payment_method || 'check');
      sets.push(`payment_method = $${params.length}`);
    }

    if (check_number !== undefined) {
      params.push(check_number || null);
      sets.push(`check_number = $${params.length}`);
    }

    if (payment_notes !== undefined) {
      params.push(payment_notes || null);
      sets.push(`payment_notes = $${params.length}`);
    }

    if (status !== undefined) {
      params.push(status);
      sets.push(`status = $${params.length}`);
    }

    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE team_registrations SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Registration not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Delete a registration ──
router.delete('/:id', authMiddleware, requireAdminOrAccountant, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM team_registrations WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
