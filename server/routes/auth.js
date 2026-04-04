const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { JWT_SECRET } = require('../auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password, name } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and name are required' });
    }

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.length) return res.status(409).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
      [username, hash, name]
    );

    const token = jwt.sign(
      { id: rows[0].id, username, name, role: 'manager' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: { id: rows[0].id, username, name, role: 'manager' } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
