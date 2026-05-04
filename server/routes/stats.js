const express = require('express');
const { pool } = require('../db');
const { authMiddleware, optionalAuth, getUserPermissions } = require('../auth');
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
router.get('/player/:playerId', optionalAuth, async (req, res) => {
  try {
    const playerId = req.params.playerId;
    const user = req.user;

    // ── Access control ──
    // Get the player's teams and their stats_visibility settings
    const { rows: teamRows } = await pool.query(
      `SELECT t.id, COALESCE(t.stats_visibility, 'own') AS stats_visibility
       FROM team_players tp
       JOIN teams t ON t.id = tp.team_id
       WHERE tp.player_id = $1`,
      [playerId]
    );

    const hasPublicTeam = teamRows.some(t => t.stats_visibility === 'all');

    if (!hasPublicTeam) {
      // Auth required from here on
      if (!user) return res.status(403).json({ error: 'Access denied' });

      const STAFF_ROLES = ['super_admin', 'org_admin', 'team_manager', 'score_reporter', 'accountant', 'umpire'];
      if (!STAFF_ROLES.includes(user.role)) {
        if (user.role === 'guardian') {
          // Check if this is their own claimed player
          const { rows: ownClaim } = await pool.query(
            `SELECT 1 FROM guardian_claims WHERE user_id = $1 AND player_id = $2 AND status = 'approved' LIMIT 1`,
            [user.id, playerId]
          );
          if (!ownClaim.length) {
            // Not their player — check for team-level access
            const teamIds = teamRows
              .filter(t => t.stats_visibility === 'team')
              .map(t => t.id);
            if (teamIds.length) {
              const { rows: teamClaim } = await pool.query(
                `SELECT 1 FROM guardian_claims gc
                 JOIN team_players tp ON tp.player_id = gc.player_id
                 WHERE gc.user_id = $1 AND gc.status = 'approved'
                 AND tp.team_id = ANY($2) LIMIT 1`,
                [user.id, teamIds]
              );
              if (!teamClaim.length) return res.status(403).json({ error: 'Access denied' });
            } else {
              return res.status(403).json({ error: 'Access denied' });
            }
          }
        } else {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    // ── Fetch stats ──
    const { game_id } = req.query;
    let sql = `
      SELECT pgs.*, sd.name AS stat_name, sd.abbreviation, sd.category,
             g.game_date, g.home_team_id, g.away_team_id, g.season_id,
             ls.name AS season_name, ls.year AS season_year,
             ht.name AS home_team_name, at.name AS away_team_name
      FROM player_game_stats pgs
      JOIN stat_definitions sd ON sd.id = pgs.stat_definition_id
      JOIN games g ON g.id = pgs.game_id AND g.deleted_at IS NULL
      LEFT JOIN league_seasons ls ON ls.id = g.season_id
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

// GET /stats/team/:teamId — aggregated season stats for all players on a team
router.get('/team/:teamId', optionalAuth, async (req, res) => {
  try {
    const { teamId } = req.params;
    const { season_id } = req.query;
    const user = req.user;

    // ── Access control ──
    // Respect the team's stats_visibility setting (same model as player stats)
    const { rows: teamRows } = await pool.query(
      `SELECT COALESCE(stats_visibility, 'own') AS stats_visibility, org_id FROM teams WHERE id = $1`,
      [teamId]
    );
    if (!teamRows.length) return res.status(404).json({ error: 'Team not found' });

    const { stats_visibility, org_id } = teamRows[0];

    if (stats_visibility !== 'all') {
      // Auth required
      if (!user) return res.status(403).json({ error: 'Access denied' });

      const STAFF_ROLES = ['super_admin', 'org_admin', 'team_manager', 'score_reporter', 'accountant', 'umpire'];
      if (!STAFF_ROLES.includes(user.role)) {
        // Guardians: must have an approved claim for a player on this team
        if (user.role === 'guardian') {
          const { rows: claimRows } = await pool.query(
            `SELECT 1 FROM guardian_claims gc
             JOIN team_players tp ON tp.player_id = gc.player_id
             WHERE gc.user_id = $1 AND gc.status = 'approved' AND tp.team_id = $2 LIMIT 1`,
            [user.id, teamId]
          );
          if (!claimRows.length) return res.status(403).json({ error: 'Access denied' });
        } else {
          return res.status(403).json({ error: 'Access denied' });
        }
      } else if (!['super_admin'].includes(user.role)) {
        // Staff roles other than super_admin: must have a permission entry for this team or org
        const perms = await getUserPermissions(user.id);
        const hasTeam = perms.team_ids.includes(Number(teamId));
        const hasOrg = org_id && (perms.org_ids.includes(Number(org_id)) || perms.team_org_ids.includes(Number(org_id)));
        if (!hasTeam && !hasOrg) return res.status(403).json({ error: 'Access denied' });
      }
    }

    const cacheKey = `stats:team:${teamId}:${season_id || 'all'}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Team W/L record from games
    const seasonFilter = season_id ? 'AND g.season_id = $2' : '';
    const recordArgs = season_id ? [teamId, season_id] : [teamId];
    const { rows: recordRows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE g.status IN ('completed','final') AND (
           (g.home_team_id = $1::int AND g.home_score > g.away_score) OR
           (g.away_team_id = $1::int AND g.away_score > g.home_score)
         )) AS wins,
         COUNT(*) FILTER (WHERE g.status IN ('completed','final') AND (
           (g.home_team_id = $1::int AND g.home_score < g.away_score) OR
           (g.away_team_id = $1::int AND g.away_score < g.home_score)
         )) AS losses,
         COUNT(*) FILTER (WHERE g.status IN ('completed','final') AND (
           (g.home_team_id = $1::int OR g.away_team_id = $1::int) AND
           g.home_score = g.away_score AND g.home_score IS NOT NULL
         )) AS ties,
         COALESCE(SUM(CASE WHEN g.home_team_id = $1::int THEN g.home_score
                           WHEN g.away_team_id = $1::int THEN g.away_score END)
                  FILTER (WHERE g.status IN ('completed','final')), 0) AS runs_scored,
         COALESCE(SUM(CASE WHEN g.home_team_id = $1::int THEN g.away_score
                           WHEN g.away_team_id = $1::int THEN g.home_score END)
                  FILTER (WHERE g.status IN ('completed','final')), 0) AS runs_allowed
       FROM games g
       WHERE (g.home_team_id = $1::int OR g.away_team_id = $1::int)
         AND g.deleted_at IS NULL
         ${seasonFilter}`,
      recordArgs
    );

    // Available seasons for this team
    const { rows: seasonRows } = await pool.query(
      `SELECT DISTINCT ls.id, ls.name, ls.year
       FROM games g
       JOIN league_seasons ls ON ls.id = g.season_id
       WHERE (g.home_team_id = $1 OR g.away_team_id = $1)
         AND g.deleted_at IS NULL
         AND g.season_id IS NOT NULL
       ORDER BY ls.year DESC, ls.name`,
      [teamId]
    );

    // Aggregated player stats
    // Join through games (team was home or away) + team_players to avoid relying on pgs.team_id
    const seasonCond = season_id ? 'AND g2.season_id = $2' : '';
    const statsArgs = season_id ? [teamId, season_id] : [teamId];

    const { rows: statRows } = await pool.query(
      `SELECT
         p.id AS player_id,
         p.first_name,
         p.last_name,
         sd.id AS stat_def_id,
         sd.abbreviation,
         sd.category,
         sd.data_type,
         sd.sort_order,
         COUNT(DISTINCT pgs.game_id) AS games_played,
         SUM(pgs.value::numeric) AS total_value,
         AVG(pgs.value::numeric) AS avg_value
       FROM player_game_stats pgs
       JOIN players p ON p.id = pgs.player_id
       JOIN stat_definitions sd ON sd.id = pgs.stat_definition_id
       JOIN games g2 ON g2.id = pgs.game_id AND g2.deleted_at IS NULL
         AND (g2.home_team_id = $1::int OR g2.away_team_id = $1::int)
         ${seasonCond}
       JOIN team_players tp ON tp.player_id = pgs.player_id AND tp.team_id = $1::int
       WHERE sd.is_active = TRUE
         AND pgs.value ~ '^[0-9]+(\\.[0-9]+)?$'
       GROUP BY p.id, p.first_name, p.last_name, sd.id, sd.abbreviation, sd.category, sd.data_type, sd.sort_order
       ORDER BY p.last_name, p.first_name, sd.category, sd.sort_order`,
      statsArgs
    );

    // Count distinct games per player
    const { rows: gamesPerPlayer } = await pool.query(
      `SELECT pgs.player_id, COUNT(DISTINCT pgs.game_id) AS games
       FROM player_game_stats pgs
       JOIN games g2 ON g2.id = pgs.game_id AND g2.deleted_at IS NULL
         AND (g2.home_team_id = $1::int OR g2.away_team_id = $1::int)
         ${seasonCond}
       JOIN team_players tp ON tp.player_id = pgs.player_id AND tp.team_id = $1::int
       GROUP BY pgs.player_id`,
      statsArgs
    );
    const gamesMap = Object.fromEntries(gamesPerPlayer.map(r => [r.player_id, parseInt(r.games, 10)]));

    const record = recordRows[0] || {};
    const result = {
      record: {
        wins: parseInt(record.wins, 10) || 0,
        losses: parseInt(record.losses, 10) || 0,
        ties: parseInt(record.ties, 10) || 0,
        runs_scored: parseInt(record.runs_scored, 10) || 0,
        runs_allowed: parseInt(record.runs_allowed, 10) || 0,
      },
      seasons: seasonRows,
      stats: statRows.map(r => ({
        player_id: r.player_id,
        player_name: `${r.first_name} ${r.last_name}`,
        last_name: r.last_name,
        stat_def_id: r.stat_def_id,
        abbreviation: r.abbreviation,
        category: r.category,
        data_type: r.data_type,
        sort_order: parseInt(r.sort_order, 10),
        games: gamesMap[r.player_id] || 0,
        total: parseFloat(r.total_value) || 0,
        avg: parseFloat(r.avg_value) || 0,
      })),
    };

    cache.set(cacheKey, result, 60_000); // 1 min cache
    res.json(result);
  } catch (err) {
    console.error('Team stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
