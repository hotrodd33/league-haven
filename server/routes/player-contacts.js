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

// GET /player-contacts/:playerId — list guardians for a player
router.get('/:playerId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT g.id, g.first_name, g.last_name, g.email, g.phone, g.user_id,
              pg.relationship, pg.is_primary, pg.notes, pg.id AS link_id
       FROM player_guardians pg
       JOIN guardians g ON g.id = pg.guardian_id
       WHERE pg.player_id = $1
       ORDER BY pg.is_primary DESC, g.last_name, g.first_name`,
      [req.params.playerId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /player-contacts/:playerId — add a guardian to a player
// Reuses existing guardian if matched by email or first+last name
router.post('/:playerId', authMiddleware, async (req, res) => {
  try {
    const { playerId } = req.params;
    if (!(await canEditPlayer(req.user, playerId))) return res.status(403).json({ error: 'No permission' });
    const { relationship, first_name, last_name, email, phone, is_primary, notes } = req.body;
    if (!first_name || !last_name) return res.status(400).json({ error: 'first_name and last_name are required' });

    // Find or create guardian
    let guardianId;
    if (email) {
      const { rows: byEmail } = await pool.query(
        'SELECT id FROM guardians WHERE LOWER(email) = LOWER($1) LIMIT 1', [email.trim()]
      );
      if (byEmail.length) {
        guardianId = byEmail[0].id;
        // Update phone if provided and missing
        await pool.query('UPDATE guardians SET phone = COALESCE(phone, $1), updated_at = NOW() WHERE id = $2', [phone || null, guardianId]);
      }
    }
    if (!guardianId) {
      const { rows: byName } = await pool.query(
        'SELECT id FROM guardians WHERE LOWER(first_name) = LOWER($1) AND LOWER(last_name) = LOWER($2) AND (email IS NULL OR email = $3) LIMIT 1',
        [first_name.trim(), last_name.trim(), email || null]
      );
      if (byName.length) {
        guardianId = byName[0].id;
        await pool.query('UPDATE guardians SET email = COALESCE(email, $1), phone = COALESCE(phone, $2), updated_at = NOW() WHERE id = $3', [email || null, phone || null, guardianId]);
      }
    }
    if (!guardianId) {
      const { rows: created } = await pool.query(
        'INSERT INTO guardians (first_name, last_name, email, phone) VALUES ($1, $2, $3, $4) RETURNING id',
        [first_name.trim(), last_name.trim(), email || null, phone || null]
      );
      guardianId = created[0].id;
    }

    // If setting as primary, unset other primaries for this player
    if (is_primary) {
      await pool.query('UPDATE player_guardians SET is_primary = FALSE WHERE player_id = $1', [playerId]);
    }

    const { rows } = await pool.query(
      `INSERT INTO player_guardians (player_id, guardian_id, relationship, is_primary, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (player_id, guardian_id) DO UPDATE SET relationship = $3, is_primary = $4, notes = $5
       RETURNING *`,
      [playerId, guardianId, relationship || 'parent', is_primary || false, notes || null]
    );

    // Return the full guardian info
    const { rows: full } = await pool.query(
      `SELECT g.id, g.first_name, g.last_name, g.email, g.phone, g.user_id,
              pg.relationship, pg.is_primary, pg.notes, pg.id AS link_id
       FROM player_guardians pg JOIN guardians g ON g.id = pg.guardian_id
       WHERE pg.id = $1`, [rows[0].id]
    );
    res.status(201).json(full[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /player-contacts/:playerId/:id — update a guardian and/or the link
// :id is the guardian id
router.put('/:playerId/:id', authMiddleware, async (req, res) => {
  try {
    const { playerId, id } = req.params;
    if (!(await canEditPlayer(req.user, playerId))) return res.status(403).json({ error: 'No permission' });
    const { relationship, first_name, last_name, email, phone, is_primary, notes } = req.body;

    // Update guardian record
    await pool.query(
      `UPDATE guardians SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name),
       email = $3, phone = $4, updated_at = NOW() WHERE id = $5`,
      [first_name, last_name, email || null, phone || null, id]
    );

    // Update the junction record
    if (is_primary) {
      await pool.query('UPDATE player_guardians SET is_primary = FALSE WHERE player_id = $1 AND guardian_id != $2', [playerId, id]);
    }
    await pool.query(
      `UPDATE player_guardians SET relationship = $1, is_primary = $2, notes = $3
       WHERE player_id = $4 AND guardian_id = $5`,
      [relationship || 'parent', is_primary || false, notes || null, playerId, id]
    );

    const { rows } = await pool.query(
      `SELECT g.id, g.first_name, g.last_name, g.email, g.phone, g.user_id,
              pg.relationship, pg.is_primary, pg.notes, pg.id AS link_id
       FROM player_guardians pg JOIN guardians g ON g.id = pg.guardian_id
       WHERE pg.player_id = $1 AND pg.guardian_id = $2`, [playerId, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Contact not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /player-contacts/:playerId/:id — remove guardian link from player
// :id is the guardian id
router.delete('/:playerId/:id', authMiddleware, async (req, res) => {
  try {
    const { playerId, id } = req.params;
    if (!(await canEditPlayer(req.user, playerId))) return res.status(403).json({ error: 'No permission' });
    const { rowCount } = await pool.query('DELETE FROM player_guardians WHERE player_id = $1 AND guardian_id = $2', [playerId, id]);
    if (!rowCount) return res.status(404).json({ error: 'Contact not found' });
    // Clean up orphaned guardian (no links to any player)
    await pool.query('DELETE FROM guardians WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM player_guardians WHERE guardian_id = $1)', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
