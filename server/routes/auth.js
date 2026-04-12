const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { JWT_SECRET, authMiddleware, getUserPermissions } = require('../auth');
const { sendWelcomeEmail, sendPasswordResetEmail, sendPasswordChangedEmail } = require('../email');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Allow login by username OR email
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1', [username]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const permissions = await getUserPermissions(user.id);

    res.json({
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email },
      permissions,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register — self-registration (no permissions until admin assigns)
router.post('/register', async (req, res) => {
  try {
    const { username, password, name, email } = req.body;
    if (!username || !password || !name || !email) {
      return res.status(400).json({ error: 'Username, password, name, and email are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check username uniqueness
    const { rows: existingUser } = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUser.length) return res.status(409).json({ error: 'Username already taken' });

    // Check email uniqueness
    const { rows: existingEmail } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingEmail.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, name, email, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, name, email, role, created_at',
      [username, hash, name, email, 'score_reporter']
    );
    const user = rows[0];

    // Send welcome email (non-blocking)
    sendWelcomeEmail(email, name).catch(() => {});

    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const permissions = { org_ids: [], team_ids: [] };
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email },
      permissions,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register-umpire — umpire self-registration with profile creation
router.post('/register-umpire', async (req, res) => {
  try {
    const { username, password, name, email, phone, org_id, date_of_birth, is_certified, years_of_experience } = req.body;
    if (!username || !password || !name || !email) {
      return res.status(400).json({ error: 'Username, password, name, and email are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check username uniqueness
    const { rows: existingUser } = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUser.length) return res.status(409).json({ error: 'Username already taken' });

    // Check email uniqueness
    const { rows: existingEmail } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingEmail.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    
    // Create user with umpire role
    const { rows: userRows } = await pool.query(
      'INSERT INTO users (username, password_hash, name, email, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, name, email, role, created_at',
      [username, hash, name, email, 'umpire']
    );
    const user = userRows[0];

    // Create official profile linked to user
    await pool.query(
      'INSERT INTO officials (user_id, org_id, name, email, phone, date_of_birth, is_certified, years_of_experience, rate_per_game) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 50)',
      [user.id, org_id || null, name, email, phone || null, date_of_birth || null, is_certified === true, years_of_experience || null]
    );

    // Send welcome email (non-blocking)
    sendWelcomeEmail(email, name).catch(() => {});

    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const permissions = { org_ids: [], team_ids: [] };
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email },
      permissions,
    });
  } catch (err) {
    console.error('Register umpire error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/forgot-password — send reset email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const { rows } = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
    // Always return success to prevent email enumeration
    if (!rows.length) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const user = rows[0];

    // Generate a secure token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any existing tokens for this user
    await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE', [user.id]);

    // Store the hashed token
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    // Send email (non-blocking)
    sendPasswordResetEmail(user.email, user.name, resetToken).catch(() => {});

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/reset-password — validate token and set new password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await pool.query(
      'SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW()',
      [tokenHash]
    );

    if (!rows.length) return res.status(400).json({ error: 'Invalid or expired reset link' });

    const resetRecord = rows[0];
    const hash = await bcrypt.hash(password, 10);

    // Update password and mark token as used
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, resetRecord.user_id]);
    await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [resetRecord.id]);

    // Get user for email notification
    const { rows: userRows } = await pool.query('SELECT name, email FROM users WHERE id = $1', [resetRecord.user_id]);
    if (userRows[0]?.email) {
      sendPasswordChangedEmail(userRows[0].email, userRows[0].name).catch(() => {});
    }

    res.json({ message: 'Password has been reset. You can now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/auth/change-password — authenticated user changes own password
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const { rows } = await pool.query('SELECT password_hash, name, email FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);

    // Send notification email (non-blocking)
    if (rows[0].email) {
      sendPasswordChangedEmail(rows[0].email, rows[0].name).catch(() => {});
    }

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me — return current user info + permissions
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, username, name, role, email FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const user = rows[0];
    const permissions = await getUserPermissions(user.id);
    res.json({ user, permissions });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
