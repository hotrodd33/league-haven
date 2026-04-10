const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { authMiddleware, requireAdmin, getUserPermissions, ROLES } = require('../auth');
const { sendInviteEmail } = require('../email');

const router = express.Router();

// All routes require super_admin
router.use(authMiddleware, requireAdmin);

const VALID_ROLES = ROLES; // ['score_reporter', 'team_manager', 'org_admin', 'super_admin']

function sanitizeRole(role) {
  return VALID_ROLES.includes(role) ? role : 'score_reporter';
}

// GET /api/users — list all users with their permissions
router.get('/', async (req, res) => {
  try {
    const { rows: users } = await pool.query(
      'SELECT id, username, name, email, role, created_at FROM users ORDER BY name'
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

// POST /api/users — create a new user (admin-created)
router.post('/', async (req, res) => {
  try {
    const { username, password, name, email, role } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and name are required' });
    }
    const userRole = sanitizeRole(role);

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.length) return res.status(409).json({ error: 'Username already taken' });

    if (email) {
      const { rows: existingEmail } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingEmail.length) return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, name, email, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, name, email, role, created_at',
      [username, hash, name, email || null, userRole]
    );
    res.status(201).json({ ...rows[0], permissions: { org_ids: [], team_ids: [] } });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/:id/invite — send invite email with temp password
router.post('/:id/invite', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id, name, email, username FROM users WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const user = rows[0];
    if (!user.email) return res.status(400).json({ error: 'User has no email address. Add one first.' });

    // Generate a temp password and reset it
    const tempPassword = crypto.randomBytes(4).toString('hex'); // 8-char random
    const hash = await bcrypt.hash(tempPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);

    await sendInviteEmail(user.email, user.name, tempPassword);
    res.json({ message: `Invite sent to ${user.email}` });
  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id — update user profile (name, role, email, optional password reset)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'User not found' });

    const { name, role, password, email } = req.body;
    const userRole = sanitizeRole(role);

    // Check email uniqueness if changed
    if (email && email !== existing[0].email) {
      const { rows: dup } = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]);
      if (dup.length) return res.status(409).json({ error: 'Email already registered by another user' });
    }

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE users SET name = $1, role = $2, password_hash = $3, email = $4 WHERE id = $5',
        [name || existing[0].name, userRole, hash, email ?? existing[0].email, id]
      );
    } else {
      await pool.query(
        'UPDATE users SET name = $1, role = $2, email = $3 WHERE id = $4',
        [name || existing[0].name, userRole, email ?? existing[0].email, id]
      );
    }

    const { rows } = await pool.query(
      'SELECT id, username, name, email, role, created_at FROM users WHERE id = $1', [id]
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
