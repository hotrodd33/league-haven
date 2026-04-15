const express = require('express');
const { pool } = require('../db');
const { authMiddleware, canEditTeam } = require('../auth');

const router = express.Router();

async function canEditPlayer(user, playerId) {
  if (user.role === 'super_admin') return true;
  const { rows } = await pool.query('SELECT team_id FROM team_players WHERE player_id = $1', [playerId]);
  for (const r of rows) {
    if (await canEditTeam(user, r.team_id)) return true;
  }
  return false;
}

// GET /player-notes/:playerId
router.get('/:playerId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pn.*, u.name AS author_name
       FROM player_notes pn
       LEFT JOIN users u ON u.id = pn.user_id
       WHERE pn.player_id = $1
       ORDER BY pn.created_at DESC`,
      [req.params.playerId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /player-notes/:playerId
router.post('/:playerId', authMiddleware, async (req, res) => {
  try {
    const { playerId } = req.params;
    if (!(await canEditPlayer(req.user, playerId))) return res.status(403).json({ error: 'No permission' });
    const { note } = req.body;
    if (!note?.trim()) return res.status(400).json({ error: 'note is required' });

    const { rows } = await pool.query(
      `INSERT INTO player_notes (player_id, user_id, note) VALUES ($1, $2, $3) RETURNING *`,
      [playerId, req.user.id, note.trim()]
    );
    // Include author name in response
    rows[0].author_name = req.user.name || req.user.username;
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /player-notes/:playerId/:id
router.put('/:playerId/:id', authMiddleware, async (req, res) => {
  try {
    const { playerId, id } = req.params;
    if (!(await canEditPlayer(req.user, playerId))) return res.status(403).json({ error: 'No permission' });
    const { note } = req.body;
    if (!note?.trim()) return res.status(400).json({ error: 'note is required' });

    const { rows } = await pool.query(
      `UPDATE player_notes SET note=$1, updated_at=NOW() WHERE id=$2 AND player_id=$3 RETURNING *`,
      [note.trim(), id, playerId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Note not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /player-notes/:playerId/:id
router.delete('/:playerId/:id', authMiddleware, async (req, res) => {
  try {
    const { playerId, id } = req.params;
    if (!(await canEditPlayer(req.user, playerId))) return res.status(403).json({ error: 'No permission' });
    const { rowCount } = await pool.query('DELETE FROM player_notes WHERE id=$1 AND player_id=$2', [id, playerId]);
    if (!rowCount) return res.status(404).json({ error: 'Note not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
