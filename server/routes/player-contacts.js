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

// ── All Guardians List (for Guardians page) ──
// MUST be defined before /:playerId to avoid route conflict

// GET /player-contacts/all-guardians — list all guardians with players + volunteer roles
router.get('/all-guardians', async (req, res) => {
  try {
    const { rows: guardians } = await pool.query(`
      SELECT g.id, g.first_name, g.last_name, g.email, g.phone,
             COALESCE(
               json_agg(
                 DISTINCT jsonb_build_object(
                   'player_id', p.id, 'player_name', p.first_name || ' ' || p.last_name,
                   'relationship', pg.relationship, 'team_names',
                   (SELECT string_agg(DISTINCT t.name, ', ')
                    FROM team_players tp JOIN teams t ON t.id = tp.team_id
                    WHERE tp.player_id = p.id)
                 )
               ) FILTER (WHERE p.id IS NOT NULL), '[]'
             ) AS players,
             COALESCE(
               array_agg(DISTINCT gv.role_id) FILTER (WHERE gv.role_id IS NOT NULL), '{}'
             ) AS volunteer_role_ids
      FROM guardians g
      LEFT JOIN player_guardians pg ON pg.guardian_id = g.id
      LEFT JOIN players p ON p.id = pg.player_id
      LEFT JOIN guardian_volunteers gv ON gv.guardian_id = g.id
      GROUP BY g.id
      ORDER BY g.last_name, g.first_name
      LIMIT 500
    `);
    res.json(guardians);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Guardian Volunteer Interests ──

// GET /player-contacts/guardian/:guardianId/volunteers — volunteer role IDs for a guardian
router.get('/guardian/:guardianId/volunteers', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT role_id FROM guardian_volunteers WHERE guardian_id = $1',
      [req.params.guardianId]
    );
    res.json(rows.map(r => r.role_id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /player-contacts/guardian/:guardianId/volunteers — replace volunteer role IDs
router.put('/guardian/:guardianId/volunteers', authMiddleware, async (req, res) => {
  try {
    const { guardianId } = req.params;
    const { role_ids } = req.body;
    if (!Array.isArray(role_ids)) return res.status(400).json({ error: 'role_ids must be an array' });

    await pool.query('DELETE FROM guardian_volunteers WHERE guardian_id = $1', [guardianId]);
    for (const rid of role_ids) {
      await pool.query(
        'INSERT INTO guardian_volunteers (guardian_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [guardianId, rid]
      );
    }
    res.json({ success: true, role_ids });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
