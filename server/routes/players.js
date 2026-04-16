const express = require('express');
const { pool } = require('../db');
const { authMiddleware, canEditTeam } = require('../auth');

const router = express.Router();

async function withPositions(player) {
  if (!player) return null;
  const { rows: positions } = await pool.query(
    `SELECT p.id, p.name, p.abbreviation
     FROM positions p
     JOIN player_positions pp ON pp.position_id = p.id
     WHERE pp.player_id = $1`, [player.id]
  );
  return { ...player, positions };
}

// GET players, optionally filtered by team_id (via team_players junction)
router.get('/', async (req, res) => {
  try {
    const { team_id, org_id, search, with_teams } = req.query;
    let result;
    if (team_id) {
      result = await pool.query(
        `SELECT p.*, tp.jersey_number
         FROM players p
         JOIN team_players tp ON tp.player_id = p.id
         WHERE tp.team_id = $1
         ORDER BY p.last_name, p.first_name`, [team_id]
      );
    } else if (org_id) {
      result = await pool.query(
        `SELECT DISTINCT p.*
         FROM players p
         JOIN team_players tp ON tp.player_id = p.id
         JOIN teams t ON t.id = tp.team_id
         WHERE t.org_id = $1
         ORDER BY p.last_name, p.first_name`, [org_id]
      );
    } else if (search) {
      // Search players not on a specific team (for "add existing" flow)
      const q = `%${search}%`;
      result = await pool.query(
        `SELECT * FROM players WHERE first_name ILIKE $1 OR last_name ILIKE $1
         ORDER BY last_name, first_name LIMIT 50`, [q]
      );
    } else {
      result = await pool.query('SELECT * FROM players ORDER BY last_name, first_name');
    }
    let players = await Promise.all(result.rows.map(withPositions));

    // Enrich with primary contact info from player_contacts
    const allPlayerIds = players.map(p => p.id);
    if (allPlayerIds.length) {
      const { rows: contacts } = await pool.query(
        `SELECT DISTINCT ON (player_id) player_id, first_name AS contact_first_name,
                last_name AS contact_last_name, email, phone
         FROM player_contacts
         WHERE player_id = ANY($1)
         ORDER BY player_id, is_primary DESC, id ASC`, [allPlayerIds]
      );
      const contactMap = {};
      for (const c of contacts) contactMap[c.player_id] = c;
      players = players.map(p => {
        const c = contactMap[p.id];
        return {
          ...p,
          parent_email: p.parent_email || c?.email || null,
          parent_phone: p.parent_phone || c?.phone || null,
        };
      });
    }

    // Optionally include team assignments for each player
    if (with_teams === 'true') {
      const playerIds = players.map(p => p.id);
      if (playerIds.length) {
        const { rows: teamRows } = await pool.query(
          `SELECT tp.player_id, t.id AS team_id, t.name AS team_name, t.org_id,
                  o.name AS org_name, tp.jersey_number
           FROM team_players tp
           JOIN teams t ON t.id = tp.team_id
           LEFT JOIN organizations o ON o.id = t.org_id
           WHERE tp.player_id = ANY($1)
           ORDER BY t.name`, [playerIds]
        );
        const teamMap = {};
        for (const tr of teamRows) {
          if (!teamMap[tr.player_id]) teamMap[tr.player_id] = [];
          teamMap[tr.player_id].push(tr);
        }
        players = players.map(p => ({ ...p, teams: teamMap[p.id] || [] }));
      } else {
        players = players.map(p => ({ ...p, teams: [] }));
      }
    }

    res.json(players);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM players WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });
    // Also get the teams this player is on
    const { rows: teams } = await pool.query(
      `SELECT t.id, t.name, t.org_id, tp.jersey_number
       FROM teams t JOIN team_players tp ON tp.team_id = t.id
       WHERE tp.player_id = $1 ORDER BY t.name`, [req.params.id]
    );
    const player = await withPositions(rows[0]);
    res.json({ ...player, teams });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new player and optionally assign to a team
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { team_id, first_name, last_name, jersey_number, date_of_birth,
            batting_hand, throwing_hand, parent_email, parent_phone, grade, position_ids, contacts } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'first_name and last_name are required' });
    }
    // If assigning to a team, check permission
    if (team_id) {
      if (!(await canEditTeam(req.user, team_id))) return res.status(403).json({ error: 'No permission for this team' });
      const { rows: teamCheck } = await client.query('SELECT id FROM teams WHERE id = $1', [team_id]);
      if (!teamCheck.length) return res.status(400).json({ error: 'Team not found' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO players (first_name, last_name, date_of_birth, batting_hand, throwing_hand, parent_email, parent_phone, grade)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [first_name, last_name, date_of_birth || null, batting_hand || null, throwing_hand || null,
       parent_email || null, parent_phone || null, grade || null]
    );
    const playerId = rows[0].id;

    // Assign to team if provided
    if (team_id) {
      await client.query(
        'INSERT INTO team_players (team_id, player_id, jersey_number) VALUES ($1, $2, $3)',
        [team_id, playerId, jersey_number || null]
      );
    }

    if (Array.isArray(position_ids)) {
      for (const posId of position_ids) {
        await client.query('INSERT INTO player_positions (player_id, position_id) VALUES ($1, $2)', [playerId, posId]);
      }
    }

    // Save contacts
    if (Array.isArray(contacts)) {
      for (const c of contacts) {
        if (!c.first_name || !c.last_name) continue;
        if (c.is_primary) {
          await client.query('UPDATE player_contacts SET is_primary = FALSE WHERE player_id = $1', [playerId]);
        }
        await client.query(
          `INSERT INTO player_contacts (player_id, relationship, first_name, last_name, email, phone, is_primary)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [playerId, c.relationship || 'parent', c.first_name, c.last_name, c.email || null, c.phone || null, c.is_primary || false]
        );
      }
    }

    await client.query('COMMIT');

    const { rows: playerRows } = await pool.query('SELECT * FROM players WHERE id = $1', [playerId]);
    const player = await withPositions(playerRows[0]);
    // Include jersey_number in the response for convenience
    res.status(201).json({ ...player, jersey_number: jersey_number || null });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Update player details (personal info + positions)
router.put('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { rows: existingRows } = await client.query('SELECT * FROM players WHERE id = $1', [id]);
    if (!existingRows.length) return res.status(404).json({ error: 'Player not found' });
    const existing = existingRows[0];

    // Permission: user must be able to edit at least one team this player is on
    const { rows: teamRows } = await client.query('SELECT team_id FROM team_players WHERE player_id = $1', [id]);
    let hasPermission = req.user.role === 'super_admin';
    if (!hasPermission) {
      for (const tr of teamRows) {
        if (await canEditTeam(req.user, tr.team_id)) { hasPermission = true; break; }
      }
    }
    if (!hasPermission) return res.status(403).json({ error: 'No permission to edit this player' });

    const { first_name, last_name, date_of_birth, batting_hand, throwing_hand,
            parent_email, parent_phone, grade, position_ids,
            team_id, jersey_number } = req.body;

    await client.query('BEGIN');

    await client.query(
      `UPDATE players SET
        first_name = $1, last_name = $2,
        date_of_birth = $3, batting_hand = $4, throwing_hand = $5,
        parent_email = $6, parent_phone = $7, grade = $8, updated_at = NOW()
       WHERE id = $9`,
      [
        first_name ?? existing.first_name,
        last_name ?? existing.last_name,
        date_of_birth ?? existing.date_of_birth,
        batting_hand ?? existing.batting_hand,
        throwing_hand ?? existing.throwing_hand,
        parent_email ?? existing.parent_email,
        parent_phone ?? existing.parent_phone,
        grade ?? existing.grade,
        id
      ]
    );

    // Update jersey number for a specific team assignment
    if (team_id && jersey_number !== undefined) {
      await client.query(
        'UPDATE team_players SET jersey_number = $1 WHERE team_id = $2 AND player_id = $3',
        [jersey_number || null, team_id, id]
      );
    }

    if (Array.isArray(position_ids)) {
      await client.query('DELETE FROM player_positions WHERE player_id = $1', [id]);
      for (const posId of position_ids) {
        await client.query('INSERT INTO player_positions (player_id, position_id) VALUES ($1, $2)', [id, posId]);
      }
    }

    await client.query('COMMIT');

    const { rows: playerRows } = await pool.query('SELECT * FROM players WHERE id = $1', [id]);
    const player = await withPositions(playerRows[0]);
    // If team context was provided, include the jersey number
    if (team_id) {
      const { rows: tp } = await pool.query('SELECT jersey_number FROM team_players WHERE team_id = $1 AND player_id = $2', [team_id, id]);
      player.jersey_number = tp[0]?.jersey_number ?? null;
    }
    res.json(player);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Delete a player entirely
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id FROM players WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });

    // Permission: must be admin or can edit at least one team
    const { rows: teamRows } = await pool.query('SELECT team_id FROM team_players WHERE player_id = $1', [id]);
    let hasPermission = req.user.role === 'super_admin';
    if (!hasPermission) {
      for (const tr of teamRows) {
        if (await canEditTeam(req.user, tr.team_id)) { hasPermission = true; break; }
      }
    }
    if (!hasPermission) return res.status(403).json({ error: 'No permission to delete this player' });

    await pool.query('DELETE FROM players WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Team-Player Assignment Routes ──

// Add an existing player to a team
router.post('/assign', authMiddleware, async (req, res) => {
  try {
    const { team_id, player_id, jersey_number } = req.body;
    if (!team_id || !player_id) return res.status(400).json({ error: 'team_id and player_id are required' });
    if (!(await canEditTeam(req.user, team_id))) return res.status(403).json({ error: 'No permission for this team' });

    const { rows: playerCheck } = await pool.query('SELECT id FROM players WHERE id = $1', [player_id]);
    if (!playerCheck.length) return res.status(404).json({ error: 'Player not found' });

    await pool.query(
      'INSERT INTO team_players (team_id, player_id, jersey_number) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [team_id, player_id, jersey_number || null]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove a player from a team (does not delete the player)
router.post('/unassign', authMiddleware, async (req, res) => {
  try {
    const { team_id, player_id } = req.body;
    if (!team_id || !player_id) return res.status(400).json({ error: 'team_id and player_id are required' });
    if (!(await canEditTeam(req.user, team_id))) return res.status(403).json({ error: 'No permission for this team' });

    await pool.query('DELETE FROM team_players WHERE team_id = $1 AND player_id = $2', [team_id, player_id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
