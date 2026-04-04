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

// ── Divisions ──

router.get('/divisions', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM league_divisions ORDER BY sort_order, name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/divisions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'INSERT INTO league_divisions (name, sort_order) VALUES ($1, $2) RETURNING *',
      [name.trim(), sort_order ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Division already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/divisions/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'UPDATE league_divisions SET name = $1, sort_order = $2 WHERE id = $3 RETURNING *',
      [name.trim(), sort_order ?? 0, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Division already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/divisions/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM league_divisions WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
