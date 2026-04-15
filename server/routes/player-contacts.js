const express = require('express');
const { pool } = require('../db');
const { authMiddleware, canEditTeam } = require('../auth');

const router = express.Router();

// Helper: check if user can edit a player (must have access to at least one of
// the player's teams, or be super_admin)
async function canEditPlayer(user, playerId) {
  if (user.role === 'super_admin') return true;
  const { rows } = await pool.query('SELECT team_id FROM team_players WHERE player_id = $1', [playerId]);
  for (const r of rows) {
    if (await canEditTeam(user, r.team_id)) return true;
  }
  return false;
}

// GET /player-contacts/:playerId
router.get('/:playerId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM player_contacts WHERE player_id = $1 ORDER BY is_primary DESC, created_at',
      [req.params.playerId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /player-contacts/:playerId
router.post('/:playerId', authMiddleware, async (req, res) => {
  try {
    const { playerId } = req.params;
    if (!(await canEditPlayer(req.user, playerId))) return res.status(403).json({ error: 'No permission' });
    const { relationship, first_name, last_name, email, phone, is_primary, notes } = req.body;
    if (!first_name || !last_name) return res.status(400).json({ error: 'first_name and last_name are required' });

    // If setting as primary, unset other primaries
    if (is_primary) {
      await pool.query('UPDATE player_contacts SET is_primary = FALSE WHERE player_id = $1', [playerId]);
    }

    const { rows } = await pool.query(
      `INSERT INTO player_contacts (player_id, relationship, first_name, last_name, email, phone, is_primary, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [playerId, relationship || 'parent', first_name, last_name, email || null, phone || null, is_primary || false, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /player-contacts/:playerId/:id
router.put('/:playerId/:id', authMiddleware, async (req, res) => {
  try {
    const { playerId, id } = req.params;
    if (!(await canEditPlayer(req.user, playerId))) return res.status(403).json({ error: 'No permission' });
    const { relationship, first_name, last_name, email, phone, is_primary, notes } = req.body;

    if (is_primary) {
      await pool.query('UPDATE player_contacts SET is_primary = FALSE WHERE player_id = $1 AND id != $2', [playerId, id]);
    }

    const { rows } = await pool.query(
      `UPDATE player_contacts SET relationship=$1, first_name=$2, last_name=$3, email=$4, phone=$5, is_primary=$6, notes=$7
       WHERE id=$8 AND player_id=$9 RETURNING *`,
      [relationship || 'parent', first_name, last_name, email || null, phone || null, is_primary || false, notes || null, id, playerId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Contact not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /player-contacts/:playerId/:id
router.delete('/:playerId/:id', authMiddleware, async (req, res) => {
  try {
    const { playerId, id } = req.params;
    if (!(await canEditPlayer(req.user, playerId))) return res.status(403).json({ error: 'No permission' });
    const { rowCount } = await pool.query('DELETE FROM player_contacts WHERE id=$1 AND player_id=$2', [id, playerId]);
    if (!rowCount) return res.status(404).json({ error: 'Contact not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
