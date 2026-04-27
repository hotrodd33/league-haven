const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../auth');
const cache = require('../cache');

const router = express.Router();

const STAT_DEFS_KEY = 'stats:definitions';
const STAT_DEFS_TTL = 5 * 60_000;

// ── Stat Definitions (configurable fields) ──

// GET /stats/definitions
router.get('/definitions', async (req, res) => {
  try {
    const { category, active_only } = req.query;
    const cacheKey = `${STAT_DEFS_KEY}:${category || ''}:${active_only || ''}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);
    let sql = 'SELECT * FROM stat_definitions';
    const params = [];
    const conditions = [];
    if (category) { conditions.push(`category = $${params.length + 1}`); params.push(category); }
    if (active_only === 'true') { conditions.push('is_active = TRUE'); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY category, sort_order, name';
    const { rows } = await pool.query(sql, params);
    cache.set(cacheKey, rows, STAT_DEFS_TTL);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /stats/definitions (admin only)
router.post('/definitions', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Admin only' });
    const { name, abbreviation, category, data_type, sort_order, gc_column_name } = req.body;
    if (!name || !abbreviation) return res.status(400).json({ error: 'name and abbreviation required' });

    const { rows } = await pool.query(
      `INSERT INTO stat_definitions (name, abbreviation, category, data_type, sort_order, gc_column_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, abbreviation, category || 'batting', data_type || 'integer', sort_order || 0, gc_column_name || null]
    );
    cache.invalidatePrefix(STAT_DEFS_KEY);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /stats/definitions/:id (admin only)
router.put('/definitions/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Admin only' });
    const { name, abbreviation, category, data_type, sort_order, is_active, gc_column_name } = req.body;

    const { rows } = await pool.query(
      `UPDATE stat_definitions SET
        name=COALESCE($1, name), abbreviation=COALESCE($2, abbreviation),
        category=COALESCE($3, category), data_type=COALESCE($4, data_type),
        sort_order=COALESCE($5, sort_order), is_active=COALESCE($6, is_active),
        gc_column_name=COALESCE($7, gc_column_name)
       WHERE id=$8 RETURNING *`,
      [name, abbreviation, category, data_type, sort_order, is_active, gc_column_name, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Stat definition not found' });
    cache.invalidatePrefix(STAT_DEFS_KEY);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /stats/definitions/:id (admin only)
router.delete('/definitions/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Admin only' });
    const { rowCount } = await pool.query('DELETE FROM stat_definitions WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Stat definition not found' });
    cache.invalidatePrefix(STAT_DEFS_KEY);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Player Game Stats ──

// GET /stats/player/:playerId — all stats for a player, optionally filtered by game_id
router.get('/player/:playerId', async (req, res) => {
  try {
    const { game_id } = req.query;
    let sql = `
      SELECT pgs.*, sd.name AS stat_name, sd.abbreviation, sd.category,
             g.game_date, g.home_team_id, g.away_team_id,
             ht.name AS home_team_name, at.name AS away_team_name
      FROM player_game_stats pgs
      JOIN stat_definitions sd ON sd.id = pgs.stat_definition_id
      JOIN games g ON g.id = pgs.game_id AND g.deleted_at IS NULL
      LEFT JOIN teams ht ON ht.id = g.home_team_id
      LEFT JOIN teams at ON at.id = g.away_team_id
      WHERE pgs.player_id = $1`;
    const params = [req.params.playerId];
    if (game_id) {
      sql += ` AND pgs.game_id = $2`;
      params.push(game_id);
    }
    sql += ' ORDER BY g.game_date DESC, sd.category, sd.sort_order';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /stats/game/:gameId — all player stats for a game
router.get('/game/:gameId', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT pgs.*, sd.name AS stat_name, sd.abbreviation, sd.category,
             p.first_name, p.last_name, t.name AS team_name
      FROM player_game_stats pgs
      JOIN stat_definitions sd ON sd.id = pgs.stat_definition_id
      JOIN players p ON p.id = pgs.player_id
      LEFT JOIN teams t ON t.id = pgs.team_id
      WHERE pgs.game_id = $1
      ORDER BY t.name, p.last_name, sd.category, sd.sort_order`,
      [req.params.gameId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /stats/player/:playerId/game/:gameId — save stats for a player in a game
router.post('/player/:playerId/game/:gameId', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { playerId, gameId } = req.params;
    const { stats, team_id } = req.body;
    // stats = [{ stat_definition_id, value }, ...]
    if (!Array.isArray(stats)) return res.status(400).json({ error: 'stats array required' });

    await client.query('BEGIN');
    // Upsert each stat
    for (const { stat_definition_id, value } of stats) {
      if (!stat_definition_id || value === undefined || value === null || value === '') continue;
      await client.query(
        `INSERT INTO player_game_stats (player_id, game_id, team_id, stat_definition_id, value)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (player_id, game_id, stat_definition_id)
         DO UPDATE SET value=$5, team_id=$3`,
        [playerId, gameId, team_id || null, stat_definition_id, String(value)]
      );
    }
    await client.query('COMMIT');

    // Return all stats for this player+game
    const { rows } = await pool.query(
      `SELECT pgs.*, sd.name AS stat_name, sd.abbreviation, sd.category
       FROM player_game_stats pgs
       JOIN stat_definitions sd ON sd.id = pgs.stat_definition_id
       WHERE pgs.player_id = $1 AND pgs.game_id = $2
       ORDER BY sd.category, sd.sort_order`,
      [playerId, gameId]
    );
    res.json(rows);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// DELETE /stats/player/:playerId/game/:gameId — clear all stats for a player in a game
router.delete('/player/:playerId/game/:gameId', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM player_game_stats WHERE player_id=$1 AND game_id=$2',
      [req.params.playerId, req.params.gameId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
