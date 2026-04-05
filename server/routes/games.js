const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');

const router = express.Router();

const VALID_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'postponed'];
const STATUS_LABELS = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Final',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
};

const BASE_SELECT = `
  SELECT g.*,
    ht.name AS home_team_name, ht.logo_url AS home_team_logo,
    ht.org_id AS home_org_id,
    ho.logo_url AS home_org_logo,
    at.name AS away_team_name, at.logo_url AS away_team_logo,
    at.org_id AS away_org_id,
    ao.logo_url AS away_org_logo,
    fl.name AS location_name, fl.address AS location_address,
    fl.city AS location_city, fl.state AS location_state,
    ls.name AS season_name, ls.year AS season_year
  FROM games g
  JOIN teams ht ON ht.id = g.home_team_id
  LEFT JOIN organizations ho ON ho.id = ht.org_id
  JOIN teams at ON at.id = g.away_team_id
  LEFT JOIN organizations ao ON ao.id = at.org_id
  LEFT JOIN field_locations fl ON fl.id = g.location_id
  LEFT JOIN league_seasons ls ON ls.id = g.season_id
`;

function enrichGame(row) {
  return {
    ...row,
    status_label: STATUS_LABELS[row.status] || row.status,
    home_logo: row.home_team_logo || row.home_org_logo || null,
    away_logo: row.away_team_logo || row.away_org_logo || null,
  };
}

// GET games — supports filters: ?team_id=, ?season_id=, ?status=, ?from=, ?to=
router.get('/', async (req, res) => {
  try {
    const { team_id, season_id, status, from, to } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (team_id) {
      conditions.push(`(g.home_team_id = $${idx} OR g.away_team_id = $${idx})`);
      params.push(team_id);
      idx++;
    }
    if (season_id) {
      conditions.push(`g.season_id = $${idx}`);
      params.push(season_id);
      idx++;
    }
    if (status) {
      conditions.push(`g.status = $${idx}`);
      params.push(status);
      idx++;
    }
    if (from) {
      conditions.push(`g.game_date >= $${idx}`);
      params.push(from);
      idx++;
    }
    if (to) {
      conditions.push(`g.game_date <= $${idx}`);
      params.push(to);
      idx++;
    }

    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const sql = BASE_SELECT + where + ' ORDER BY g.game_date, g.game_time NULLS LAST';
    const { rows } = await pool.query(sql, params);
    res.json(rows.map(enrichGame));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET single game
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(BASE_SELECT + ' WHERE g.id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Game not found' });
    res.json(enrichGame(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CREATE game
router.post('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { season_id, home_team_id, away_team_id, location_id, game_date, game_time, status, notes } = req.body;
    if (!home_team_id || !away_team_id || !game_date) {
      return res.status(400).json({ error: 'home_team_id, away_team_id, and game_date are required' });
    }
    if (Number(home_team_id) === Number(away_team_id)) {
      return res.status(400).json({ error: 'Home and away teams must be different' });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { rows } = await pool.query(
      `INSERT INTO games (season_id, home_team_id, away_team_id, location_id, game_date, game_time, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [season_id || null, home_team_id, away_team_id, location_id || null,
       game_date, game_time || null, status || 'scheduled', notes || null]
    );
    const gameId = rows[0].id;
    const { rows: gameRows } = await pool.query(BASE_SELECT + ' WHERE g.id = $1', [gameId]);
    res.status(201).json(enrichGame(gameRows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE game
router.put('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query('SELECT id FROM games WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Game not found' });

    const { season_id, home_team_id, away_team_id, location_id, game_date, game_time, status, home_score, away_score, notes } = req.body;
    if (home_team_id && away_team_id && Number(home_team_id) === Number(away_team_id)) {
      return res.status(400).json({ error: 'Home and away teams must be different' });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await pool.query(
      `UPDATE games SET
        season_id = COALESCE($1, season_id),
        home_team_id = COALESCE($2, home_team_id),
        away_team_id = COALESCE($3, away_team_id),
        location_id = $4,
        game_date = COALESCE($5, game_date),
        game_time = $6,
        status = COALESCE($7, status),
        home_score = $8,
        away_score = $9,
        notes = $10,
        updated_at = NOW()
       WHERE id = $11`,
      [season_id, home_team_id, away_team_id, location_id ?? null,
       game_date, game_time ?? null, status, home_score ?? null, away_score ?? null,
       notes ?? null, id]
    );

    const { rows } = await pool.query(BASE_SELECT + ' WHERE g.id = $1', [id]);
    res.json(enrichGame(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE game
router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id FROM games WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Game not found' });

    await pool.query('DELETE FROM games WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
