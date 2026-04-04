const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM positions ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, abbreviation } = req.body;
    if (!name) return res.status(400).json({ error: 'Position name is required' });

    const { rows } = await pool.query(
      'INSERT INTO positions (name, abbreviation) VALUES ($1, $2) RETURNING *',
      [name, abbreviation || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Position already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
