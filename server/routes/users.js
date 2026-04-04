const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { authMiddleware, requireAdmin, getUserPermissions } = require('../auth');

const router = express.Router();

// All routes require admin
router.use(authMiddleware, requireAdmin);

// GET /api/users — list all users with their permissions
router.get('/', async (req, res) => {
  try {
    const { rows: users } = await pool.query(
      'SELECT id, username, name, role, created_at FROM users ORDER BY name'
    );
    const result = await Promise.all(users.map(async (u) => ({
      ...u,
      permissions: await getUserPermissions(u.id),
    })));
    res.json(result);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users — create a new user
router.post('/', async (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and name are required' });
    }
    const userRole = role === 'admin' ? 'admin' : 'user';

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.length) return res.status(409).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, username, name, role, created_at',
      [username, hash, name, userRole]
    );
    res.status(201).json({ ...rows[0], permissions: { org_ids: [], team_ids: [] } });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id — update user profile (name, role, optional password reset)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'User not found' });

    const { name, role, password } = req.body;
    const userRole = role === 'admin' ? 'admin' : 'user';

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE users SET name = $1, role = $2, password_hash = $3 WHERE id = $4',
        [name || existing[0].name, userRole, hash, id]
      );
    } else {
      await pool.query(
        'UPDATE users SET name = $1, role = $2 WHERE id = $3',
        [name || existing[0].name, userRole, id]
      );
    }

    const { rows } = await pool.query(
      'SELECT id, username, name, role, created_at FROM users WHERE id = $1', [id]
    );
    const permissions = await getUserPermissions(rows[0].id);
    res.json({ ...rows[0], permissions });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id — delete a user
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Prevent self-deletion
    if (Number(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id/permissions — replace all permissions for a user
router.put('/:id/permissions', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'User not found' });

    const { org_ids = [], team_ids = [] } = req.body;

    // Replace all permissions in a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_permissions WHERE user_id = $1', [id]);

      for (const orgId of org_ids) {
        await client.query(
          'INSERT INTO user_permissions (user_id, org_id) VALUES ($1, $2)',
          [id, orgId]
        );
      }
      for (const teamId of team_ids) {
        await client.query(
          'INSERT INTO user_permissions (user_id, team_id) VALUES ($1, $2)',
          [id, teamId]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const permissions = await getUserPermissions(Number(id));
    res.json({ permissions });
  } catch (err) {
    console.error('Update permissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
