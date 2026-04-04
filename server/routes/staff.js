const express = require('express');
const { pool } = require('../db');
const { authMiddleware, canEditTeam } = require('../auth');

const router = express.Router();

const VALID_ROLES = ['head_coach', 'assistant_coach', 'travel_director'];
const ROLE_LABELS = {
  head_coach: 'Head Coach',
  assistant_coach: 'Assistant Coach',
  travel_director: 'Travel Director',
};

function addLabel(s) { return { ...s, role_label: ROLE_LABELS[s.role] || s.role }; }

router.get('/', async (req, res) => {
  try {
    const { team_id } = req.query;
    let result;
    if (team_id) {
      result = await pool.query('SELECT * FROM team_staff WHERE team_id = $1 ORDER BY role, name', [team_id]);
    } else {
      result = await pool.query('SELECT * FROM team_staff ORDER BY team_id, role, name');
    }
    res.json(result.rows.map(addLabel));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM team_staff WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Staff member not found' });
    res.json(addLabel(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { team_id, name, role, email, phone } = req.body;
    if (!team_id || !name || !role) return res.status(400).json({ error: 'team_id, name, and role are required' });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'role must be one of: ' + VALID_ROLES.join(', ') });
    if (!(await canEditTeam(req.user, team_id))) return res.status(403).json({ error: 'No permission for this team' });

    const { rows: teamCheck } = await pool.query('SELECT id FROM teams WHERE id = $1', [team_id]);
    if (!teamCheck.length) return res.status(400).json({ error: 'Team not found' });

    const { rows } = await pool.query(
      'INSERT INTO team_staff (team_id, name, role, email, phone) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [team_id, name, role, email || null, phone || null]
    );
    res.status(201).json(addLabel(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query('SELECT * FROM team_staff WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Staff member not found' });
    const old = existing[0];
    if (!(await canEditTeam(req.user, old.team_id))) return res.status(403).json({ error: 'No permission for this team' });

    const { name, role, email, phone } = req.body;
    if (role && !VALID_ROLES.includes(role)) return res.status(400).json({ error: 'role must be one of: ' + VALID_ROLES.join(', ') });

    const { rows } = await pool.query(
      'UPDATE team_staff SET name = $1, role = $2, email = $3, phone = $4 WHERE id = $5 RETURNING *',
      [name ?? old.name, role ?? old.role, email ?? old.email, phone ?? old.phone, id]
    );
    res.json(addLabel(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id, team_id FROM team_staff WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Staff member not found' });
    if (!(await canEditTeam(req.user, rows[0].team_id))) return res.status(403).json({ error: 'No permission for this team' });

    await pool.query('DELETE FROM team_staff WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
