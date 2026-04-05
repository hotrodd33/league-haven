const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');

const router = express.Router();

// ── Age Groups ──

router.get('/age-groups', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM league_age_groups ORDER BY sort_order, name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/age-groups', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'INSERT INTO league_age_groups (name, sort_order) VALUES ($1, $2) RETURNING *',
      [name.trim(), sort_order ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Age group already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/age-groups/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'UPDATE league_age_groups SET name = $1, sort_order = $2 WHERE id = $3 RETURNING *',
      [name.trim(), sort_order ?? 0, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Age group already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/age-groups/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM league_age_groups WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Levels ──

router.get('/levels', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM league_levels ORDER BY sort_order, name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/levels', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'INSERT INTO league_levels (name, sort_order) VALUES ($1, $2) RETURNING *',
      [name.trim(), sort_order ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Level already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/levels/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'UPDATE league_levels SET name = $1, sort_order = $2 WHERE id = $3 RETURNING *',
      [name.trim(), sort_order ?? 0, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Level already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/levels/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM league_levels WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Seasons ──

router.get('/seasons', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM league_seasons ORDER BY sort_order, year DESC, name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/seasons', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { year, name, is_active, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    if (!year) return res.status(400).json({ error: 'Year is required' });
    // If marking active, deactivate others first
    if (is_active) {
      await pool.query('UPDATE league_seasons SET is_active = false');
    }
    const { rows } = await pool.query(
      'INSERT INTO league_seasons (year, name, is_active, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [year, name.trim(), !!is_active, sort_order ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/seasons/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { year, name, is_active, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    if (!year) return res.status(400).json({ error: 'Year is required' });
    // If marking active, deactivate others first
    if (is_active) {
      await pool.query('UPDATE league_seasons SET is_active = false WHERE id != $1', [req.params.id]);
    }
    const { rows } = await pool.query(
      'UPDATE league_seasons SET year = $1, name = $2, is_active = $3, sort_order = $4 WHERE id = $5 RETURNING *',
      [year, name.trim(), !!is_active, sort_order ?? 0, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/seasons/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    // CASCADE will delete linked divisions
    const { rows } = await pool.query('DELETE FROM league_seasons WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Divisions (hierarchical) ──

// Helper: build full path labels for each division using a recursive CTE
async function getDivisionsWithPaths(seasonId) {
  const whereClause = seasonId ? 'WHERE parent_id IS NULL AND season_id = $1' : 'WHERE parent_id IS NULL';
  const params = seasonId ? [seasonId] : [];
  const { rows } = await pool.query(`
    WITH RECURSIVE div_tree AS (
      SELECT id, parent_id, season_id, name, sort_order, name::text AS path, 0 AS depth
      FROM league_divisions ${whereClause}
      UNION ALL
      SELECT d.id, d.parent_id, d.season_id, d.name, d.sort_order, (dt.path || ' / ' || d.name)::text, dt.depth + 1
      FROM league_divisions d JOIN div_tree dt ON d.parent_id = dt.id
    )
    SELECT * FROM div_tree ORDER BY path
  `, params);
  return rows;
}

router.get('/divisions', async (req, res) => {
  try {
    const seasonId = req.query.season_id || null;
    const rows = await getDivisionsWithPaths(seasonId);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/divisions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order, parent_id, season_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'INSERT INTO league_divisions (name, sort_order, parent_id, season_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name.trim(), sort_order ?? 0, parent_id || null, season_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/divisions/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order, parent_id, season_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    // Prevent setting parent to self or descendant
    if (parent_id && Number(parent_id) === Number(req.params.id)) {
      return res.status(400).json({ error: 'Cannot set parent to self' });
    }
    const { rows } = await pool.query(
      'UPDATE league_divisions SET name = $1, sort_order = $2, parent_id = $3, season_id = $4 WHERE id = $5 RETURNING *',
      [name.trim(), sort_order ?? 0, parent_id || null, season_id || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/divisions/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    // CASCADE will delete children too
    const { rows } = await pool.query('DELETE FROM league_divisions WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
