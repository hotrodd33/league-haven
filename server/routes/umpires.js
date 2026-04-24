const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../auth');
const cache = require('../cache');

const router = express.Router();

// GET /api/umpires/me — get current umpire's profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'umpire' && !req.user.is_umpire) {
      return res.status(403).json({ error: 'Only umpires can access this endpoint' });
    }

    const { rows } = await pool.query(
      `SELECT o.*, org.name AS org_name
       FROM officials o
       LEFT JOIN organizations org ON org.id = o.org_id
       WHERE o.user_id = $1`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Umpire profile not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/umpires/assigned-games — get games assigned to current umpire
router.get('/assigned-games', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'umpire' && !req.user.is_umpire) {
      return res.status(403).json({ error: 'Only umpires can access this endpoint' });
    }

    const assignedCacheKey = `umpires:assigned:${req.user.id}`;
    const assignedCached = cache.get(assignedCacheKey);
    if (assignedCached) return res.json(assignedCached);

    const { rows } = await pool.query(
      `SELECT 
         g.id, g.game_date, g.game_time, g.status, 
         g.home_team_id, g.away_team_id, g.location_id,
         g.home_score, g.away_score,
         ht.name AS home_team_name, ht.age_group AS home_age_group, ht.level AS home_level, ht.division AS home_division,
         at.name AS away_team_name, at.age_group AS away_age_group, at.level AS away_level, at.division AS away_division,
         fl.name AS location_name,
         STRING_AGG(DISTINCT off.name, ', ') AS official_names
       FROM games g
       JOIN teams ht ON ht.id = g.home_team_id
       JOIN teams at ON at.id = g.away_team_id
       LEFT JOIN field_locations fl ON fl.id = g.location_id
       LEFT JOIN game_official_assignments goa ON goa.game_id = g.id
       LEFT JOIN officials off ON off.id = goa.official_id
       JOIN game_official_assignments my_goa ON my_goa.game_id = g.id
       JOIN officials my_off ON my_off.id = my_goa.official_id
       WHERE my_off.user_id = $1 AND g.deleted_at IS NULL
       GROUP BY g.id, g.game_date, g.game_time, g.status, g.home_team_id, g.away_team_id, g.location_id, g.home_score, g.away_score, ht.id, ht.name, ht.age_group, ht.level, ht.division, at.id, at.name, at.age_group, at.level, at.division, fl.id, fl.name
       ORDER BY g.game_date DESC, g.game_time ASC`,
      [req.user.id]
    );

    cache.set(assignedCacheKey, rows, 60_000);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/umpires/available-games — get unassigned games umpire can express interest in
router.get('/available-games', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'umpire' && !req.user.is_umpire) {
      return res.status(403).json({ error: 'Only umpires can access this endpoint' });
    }

    const { season_id } = req.query;
    const avCacheKey = `umpires:available:${req.user.id}:${season_id||''}`;
    const avCached = cache.get(avCacheKey);
    if (avCached) return res.json(avCached);

    // Get umpire's official profile to determine org scope and eligible age groups
    const { rows: profileRows } = await pool.query(
      `SELECT o.id, o.org_id, ARRAY_AGG(oag.age_group_id) FILTER (WHERE oag.age_group_id IS NOT NULL) AS eligible_age_group_ids
       FROM officials o
       LEFT JOIN official_age_groups oag ON oag.official_id = o.id
       WHERE o.user_id = $1
       GROUP BY o.id
       LIMIT 1`,
      [req.user.id]
    );
    const umpireOrgId = profileRows[0]?.org_id ?? null;
    const eligibleAgeGroupIds = profileRows[0]?.eligible_age_group_ids ?? null;

    const params = [req.user.id];
    let whereClause = 'WHERE g.status = \'scheduled\' AND g.deleted_at IS NULL';

    // Org-scoped umpires only see games for their organization
    if (umpireOrgId !== null) {
      params.push(umpireOrgId);
      whereClause += ` AND (ht.org_id = $${params.length} OR at.org_id = $${params.length})`;
    }
    // League umpires (umpireOrgId = null) see all games

    if (season_id) {
      params.push(season_id);
      whereClause += ` AND g.season_id = $${params.length}`;
    }

    // Filter by official's eligible age groups (empty = eligible for all)
    if (eligibleAgeGroupIds && eligibleAgeGroupIds.length > 0) {
      params.push(eligibleAgeGroupIds);
      whereClause += ` AND (hag.id = ANY($${params.length}) OR aag.id = ANY($${params.length}))`;
    }

    const { rows } = await pool.query(
      `SELECT
         g.id, g.season_id, g.game_date, g.game_time, g.status,
         g.home_team_id, g.away_team_id, g.location_id,
         ht.name AS home_team_name, ht.age_group AS home_age_group, ht.level AS home_level, ht.division AS home_division,
         at.name AS away_team_name, at.age_group AS away_age_group, at.level AS away_level, at.division AS away_division,
         fl.name AS location_name,
         COUNT(DISTINCT goa.official_id) AS assigned_count,
         COALESCE(ugi.id, NULL) AS user_interest_id
       FROM games g
       JOIN teams ht ON ht.id = g.home_team_id
       JOIN teams at ON at.id = g.away_team_id
       LEFT JOIN field_locations fl ON fl.id = g.location_id
       LEFT JOIN game_official_assignments goa ON goa.game_id = g.id
       LEFT JOIN umpire_game_interests ugi ON ugi.game_id = g.id AND ugi.user_id = $1
       LEFT JOIN league_age_groups hag ON LOWER(TRIM(hag.name)) = LOWER(TRIM(ht.age_group))
       LEFT JOIN league_age_groups aag ON LOWER(TRIM(aag.name)) = LOWER(TRIM(at.age_group))
       ${whereClause}
       AND COALESCE(hag.ump_required, TRUE) = TRUE
       AND COALESCE(aag.ump_required, TRUE) = TRUE
       GROUP BY g.id, g.season_id, g.game_date, g.game_time, g.status, g.home_team_id, g.away_team_id, g.location_id, ht.id, ht.name, ht.age_group, ht.level, ht.division, at.id, at.name, at.age_group, at.level, at.division, fl.id, fl.name, ugi.id
       HAVING COUNT(DISTINCT goa.official_id) = 0
       ORDER BY g.game_date DESC, g.game_time ASC`,
      params
    );

    cache.set(avCacheKey, rows, 60_000);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/umpires/game-interests — get games umpire has expressed interest in
router.get('/game-interests', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'umpire' && !req.user.is_umpire) {
      return res.status(403).json({ error: 'Only umpires can access this endpoint' });
    }

    const intCacheKey = `umpires:interests:${req.user.id}`;
    const intCached = cache.get(intCacheKey);
    if (intCached) return res.json(intCached);

    const { rows } = await pool.query(
      `SELECT
         g.id, g.season_id, g.game_date, g.game_time, g.status,
         g.home_team_id, g.away_team_id, g.location_id,
         ht.name AS home_team_name, ht.age_group AS home_age_group, ht.level AS home_level, ht.division AS home_division,
         at.name AS away_team_name, at.age_group AS away_age_group, at.level AS away_level, at.division AS away_division,
         fl.name AS location_name,
         ugi.interested_at,
         COUNT(DISTINCT goa.official_id) AS assigned_count,
         COUNT(DISTINCT goa.official_id) > 0 AS is_assigned,
         STRING_AGG(DISTINCT off_assigned.name, ', ') AS assigned_official_names
       FROM umpire_game_interests ugi
       JOIN games g ON g.id = ugi.game_id AND g.deleted_at IS NULL
       JOIN teams ht ON ht.id = g.home_team_id
       JOIN teams at ON at.id = g.away_team_id
       LEFT JOIN field_locations fl ON fl.id = g.location_id
       LEFT JOIN game_official_assignments goa ON goa.game_id = g.id
       LEFT JOIN officials off_assigned ON off_assigned.id = goa.official_id
       WHERE ugi.user_id = $1
       GROUP BY g.id, g.season_id, g.game_date, g.game_time, g.status, g.home_team_id, g.away_team_id, g.location_id, ht.id, ht.name, ht.age_group, ht.level, ht.division, at.id, at.name, at.age_group, at.level, at.division, fl.id, fl.name, ugi.id, ugi.interested_at
       ORDER BY g.game_date DESC, g.game_time ASC`,
      [req.user.id]
    );

    cache.set(intCacheKey, rows, 60_000);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/umpires/interest — express interest in a game
router.post('/interest', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'umpire' && !req.user.is_umpire) {
      return res.status(403).json({ error: 'Only umpires can access this endpoint' });
    }

    const { game_id } = req.body;
    if (!game_id) return res.status(400).json({ error: 'Game ID is required' });

    // Verify game exists and is within umpire's org scope
    const { rows: profileRows } = await pool.query(
      'SELECT org_id FROM officials WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    const umpireOrgId = profileRows[0]?.org_id ?? null;

    let gameQuery, gameParams;
    if (umpireOrgId !== null) {
      gameQuery = `SELECT g.id FROM games g
        JOIN teams ht ON ht.id = g.home_team_id
        JOIN teams at ON at.id = g.away_team_id
        WHERE g.id = $1 AND (ht.org_id = $2 OR at.org_id = $2)`;
      gameParams = [game_id, umpireOrgId];
    } else {
      gameQuery = 'SELECT id FROM games WHERE id = $1';
      gameParams = [game_id];
    }
    const { rows: gameRows } = await pool.query(gameQuery, gameParams);
    if (!gameRows.length) return res.status(404).json({ error: 'Game not found or not accessible' });

    // Insert interest record (upsert via ON CONFLICT DO NOTHING)
    const { rows } = await pool.query(
      `INSERT INTO umpire_game_interests (user_id, game_id) 
       VALUES ($1, $2)
       ON CONFLICT (user_id, game_id) DO UPDATE SET interested_at = NOW()
       RETURNING id, interested_at`,
      [req.user.id, game_id]
    );

    cache.invalidatePrefix('umpires:');
    res.status(201).json({ message: 'Interest recorded', interest: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/umpires/interest/:gameId — remove interest in a game
router.delete('/interest/:gameId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'umpire' && !req.user.is_umpire) {
      return res.status(403).json({ error: 'Only umpires can access this endpoint' });
    }

    const { gameId } = req.params;
    const { rows } = await pool.query(
      'DELETE FROM umpire_game_interests WHERE user_id = $1 AND game_id = $2 RETURNING id',
      [req.user.id, gameId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Interest record not found' });
    }

    cache.invalidatePrefix('umpires:');
    res.json({ message: 'Interest removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
