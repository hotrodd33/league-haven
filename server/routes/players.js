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

router.get('/', async (req, res) => {
  try {
    const { team_id } = req.query;
    let result;
    if (team_id) {
      result = await pool.query('SELECT * FROM players WHERE team_id = $1 ORDER BY last_name, first_name', [team_id]);
    } else {
      result = await pool.query('SELECT * FROM players ORDER BY last_name, first_name');
    }
    const players = await Promise.all(result.rows.map(withPositions));
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
    res.json(await withPositions(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { team_id, first_name, last_name, jersey_number, date_of_birth, batting_hand, throwing_hand, parent_email, parent_phone, grade, position_ids } = req.body;

    if (!team_id || !first_name || !last_name) {
      return res.status(400).json({ error: 'team_id, first_name, and last_name are required' });
    }
    if (!(await canEditTeam(req.user, team_id))) return res.status(403).json({ error: 'No permission for this team' });

    const { rows: teamCheck } = await client.query('SELECT id FROM teams WHERE id = $1', [team_id]);
    if (!teamCheck.length) return res.status(400).json({ error: 'Team not found' });

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO players (team_id, first_name, last_name, jersey_number, date_of_birth, batting_hand, throwing_hand, parent_email, parent_phone, grade)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [team_id, first_name, last_name, jersey_number || null, date_of_birth || null, batting_hand || null, throwing_hand || null, parent_email || null, parent_phone || null, grade || null]
    );
    const playerId = rows[0].id;

    if (Array.isArray(position_ids)) {
      for (const posId of position_ids) {
        await client.query('INSERT INTO player_positions (player_id, position_id) VALUES ($1, $2)', [playerId, posId]);
      }
    }

    await client.query('COMMIT');

    const { rows: playerRows } = await pool.query('SELECT * FROM players WHERE id = $1', [playerId]);
    res.status(201).json(await withPositions(playerRows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { rows: existingRows } = await client.query('SELECT * FROM players WHERE id = $1', [id]);
    if (!existingRows.length) return res.status(404).json({ error: 'Player not found' });
    const existing = existingRows[0];
    if (!(await canEditTeam(req.user, existing.team_id))) return res.status(403).json({ error: 'No permission for this team' });

    const { team_id, first_name, last_name, jersey_number, date_of_birth, batting_hand, throwing_hand, parent_email, parent_phone, grade, position_ids } = req.body;

    await client.query('BEGIN');

    await client.query(
      `UPDATE players SET
        team_id = $1, first_name = $2, last_name = $3, jersey_number = $4,
        date_of_birth = $5, batting_hand = $6, throwing_hand = $7,
        parent_email = $8, parent_phone = $9, grade = $10, updated_at = NOW()
       WHERE id = $11`,
      [
        team_id ?? existing.team_id,
        first_name ?? existing.first_name,
        last_name ?? existing.last_name,
        jersey_number ?? existing.jersey_number,
        date_of_birth ?? existing.date_of_birth,
        batting_hand ?? existing.batting_hand,
        throwing_hand ?? existing.throwing_hand,
        parent_email ?? existing.parent_email,
        parent_phone ?? existing.parent_phone,
        grade ?? existing.grade,
        id
      ]
    );

    if (Array.isArray(position_ids)) {
      await client.query('DELETE FROM player_positions WHERE player_id = $1', [id]);
      for (const posId of position_ids) {
        await client.query('INSERT INTO player_positions (player_id, position_id) VALUES ($1, $2)', [id, posId]);
      }
    }

    await client.query('COMMIT');

    const { rows: playerRows } = await pool.query('SELECT * FROM players WHERE id = $1', [id]);
    res.json(await withPositions(playerRows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id, team_id FROM players WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });
    if (!(await canEditTeam(req.user, rows[0].team_id))) return res.status(403).json({ error: 'No permission for this team' });

    await pool.query('DELETE FROM players WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
