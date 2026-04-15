const express = require('express');
const { pool } = require('../db');
const { authMiddleware, canEditTeam } = require('../auth');

const router = express.Router();

const VALID_ROLES = ['head_coach', 'assistant_coach', 'travel_director', 'scorekeeper'];
const ROLE_LABELS = {
  head_coach: 'Head Coach',
  assistant_coach: 'Assistant Coach',
  travel_director: 'Travel Director',
  scorekeeper: 'Scorekeeper',
};

function addLabel(s) { return { ...s, role_label: ROLE_LABELS[s.role] || s.role }; }

// GET staff – by team_id (via junction) or search by name
router.get('/', async (req, res) => {
  try {
    const { team_id, search } = req.query;
    let result;
    if (team_id) {
      result = await pool.query(
        `SELECT sm.*, tsa.role
         FROM staff_members sm
         JOIN team_staff_assignments tsa ON tsa.staff_id = sm.id
         WHERE tsa.team_id = $1
         ORDER BY tsa.role, sm.name`, [team_id]
      );
    } else if (search) {
      const q = `%${search}%`;
      result = await pool.query(
        `SELECT * FROM staff_members WHERE name ILIKE $1
         ORDER BY name LIMIT 50`, [q]
      );
    } else {
      result = await pool.query('SELECT * FROM staff_members ORDER BY name');
    }
    res.json(result.rows.map(addLabel));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM staff_members WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Staff member not found' });
    const { rows: teams } = await pool.query(
      `SELECT t.id, t.name, tsa.role
       FROM teams t JOIN team_staff_assignments tsa ON tsa.team_id = t.id
       WHERE tsa.staff_id = $1 ORDER BY t.name`, [req.params.id]
    );
    res.json({ ...rows[0], teams });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new staff member and optionally assign to a team
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { team_id, name, role, email, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (team_id) {
      if (!role) return res.status(400).json({ error: 'role is required when assigning to a team' });
      if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'role must be one of: ' + VALID_ROLES.join(', ') });
      if (!(await canEditTeam(req.user, team_id))) return res.status(403).json({ error: 'No permission for this team' });
      const { rows: teamCheck } = await client.query('SELECT id FROM teams WHERE id = $1', [team_id]);
      if (!teamCheck.length) return res.status(400).json({ error: 'Team not found' });
    }

    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO staff_members (name, email, phone) VALUES ($1, $2, $3) RETURNING *',
      [name, email || null, phone || null]
    );
    const staffId = rows[0].id;

    if (team_id) {
      await client.query(
        'INSERT INTO team_staff_assignments (team_id, staff_id, role) VALUES ($1, $2, $3)',
        [team_id, staffId, role]
      );
    }
    await client.query('COMMIT');

    res.status(201).json(addLabel({ ...rows[0], role }));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Update staff member details + optionally role for a team
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query('SELECT * FROM staff_members WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Staff member not found' });
    const old = existing[0];

    // Permission: must be able to edit at least one team this staff is on
    const { rows: teamRows } = await pool.query('SELECT team_id FROM team_staff_assignments WHERE staff_id = $1', [id]);
    let hasPermission = req.user.role === 'super_admin';
    if (!hasPermission) {
      for (const tr of teamRows) {
        if (await canEditTeam(req.user, tr.team_id)) { hasPermission = true; break; }
      }
    }
    if (!hasPermission) return res.status(403).json({ error: 'No permission to edit this staff member' });

    const { name, role, email, phone, team_id } = req.body;
    if (role && !VALID_ROLES.includes(role)) return res.status(400).json({ error: 'role must be one of: ' + VALID_ROLES.join(', ') });

    const { rows } = await pool.query(
      'UPDATE staff_members SET name = $1, email = $2, phone = $3 WHERE id = $4 RETURNING *',
      [name ?? old.name, email ?? old.email, phone ?? old.phone, id]
    );

    // Update role for a specific team assignment if provided
    if (team_id && role) {
      await pool.query(
        'UPDATE team_staff_assignments SET role = $1 WHERE team_id = $2 AND staff_id = $3',
        [role, team_id, id]
      );
    }

    res.json(addLabel({ ...rows[0], role: role ?? null }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a staff member entirely (removes from all teams)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id FROM staff_members WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Staff member not found' });

    const { rows: teamRows } = await pool.query('SELECT team_id FROM team_staff_assignments WHERE staff_id = $1', [id]);
    let hasPermission = req.user.role === 'super_admin';
    if (!hasPermission) {
      for (const tr of teamRows) {
        if (await canEditTeam(req.user, tr.team_id)) { hasPermission = true; break; }
      }
    }
    if (!hasPermission) return res.status(403).json({ error: 'No permission to delete this staff member' });

    await pool.query('DELETE FROM staff_members WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Team-Staff Assignment Routes ──

// Assign existing staff to a team
router.post('/assign', authMiddleware, async (req, res) => {
  try {
    const { team_id, staff_id, role } = req.body;
    if (!team_id || !staff_id || !role) return res.status(400).json({ error: 'team_id, staff_id, and role are required' });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'role must be one of: ' + VALID_ROLES.join(', ') });
    if (!(await canEditTeam(req.user, team_id))) return res.status(403).json({ error: 'No permission for this team' });

    const { rows: staffCheck } = await pool.query('SELECT id FROM staff_members WHERE id = $1', [staff_id]);
    if (!staffCheck.length) return res.status(404).json({ error: 'Staff member not found' });

    await pool.query(
      'INSERT INTO team_staff_assignments (team_id, staff_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [team_id, staff_id, role]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove staff from a team (does not delete the staff member)
router.post('/unassign', authMiddleware, async (req, res) => {
  try {
    const { team_id, staff_id } = req.body;
    if (!team_id || !staff_id) return res.status(400).json({ error: 'team_id and staff_id are required' });
    if (!(await canEditTeam(req.user, team_id))) return res.status(403).json({ error: 'No permission for this team' });

    await pool.query('DELETE FROM team_staff_assignments WHERE team_id = $1 AND staff_id = $2', [team_id, staff_id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
