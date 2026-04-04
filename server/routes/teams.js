const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { org_id } = req.query;
    let result;
    if (org_id) {
      result = await pool.query(
        `SELECT t.*, o.name as org_name FROM teams t
         LEFT JOIN organizations o ON o.id = t.org_id
         WHERE t.org_id = $1 ORDER BY t.name`, [org_id]
      );
    } else {
      result = await pool.query(
        `SELECT t.*, o.name as org_name FROM teams t
         LEFT JOIN organizations o ON o.id = t.org_id
         ORDER BY o.name, t.name`
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, age_group, division, org_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Team name is required' });

    const { rows } = await pool.query(
      'INSERT INTO teams (name, age_group, division, org_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, age_group || null, division || null, org_id || null]
    );
    const result = await pool.query(
      `SELECT t.*, o.name as org_name FROM teams t
       LEFT JOIN organizations o ON o.id = t.org_id WHERE t.id = $1`, [rows[0].id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, age_group, division, org_id } = req.body;
    const { id } = req.params;
    if (!name) return res.status(400).json({ error: 'Team name is required' });

    const { rows: existing } = await pool.query('SELECT id FROM teams WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Team not found' });

    await pool.query(
      'UPDATE teams SET name = $1, age_group = $2, division = $3, org_id = $4 WHERE id = $5',
      [name, age_group || null, division || null, org_id ?? null, id]
    );
    const result = await pool.query(
      `SELECT t.*, o.name as org_name FROM teams t
       LEFT JOIN organizations o ON o.id = t.org_id WHERE t.id = $1`, [id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id FROM teams WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Team not found' });

    await pool.query('DELETE FROM teams WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
