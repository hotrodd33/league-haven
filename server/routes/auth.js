const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { JWT_SECRET, authMiddleware, getUserPermissions, validatePassword } = require('../auth');
const { sendWelcomeEmail, sendPasswordResetEmail, sendPasswordChangedEmail, sendCoachInviteEmail } = require('../email');

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

    // Record last login timestamp
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role, is_umpire: user.is_umpire || false },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const permissions = await getUserPermissions(user.id);

    res.json({
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role, is_umpire: user.is_umpire || false, email: user.email },
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
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

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
      { id: user.id, username: user.username, name: user.name, role: user.role, is_umpire: false },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const permissions = { org_ids: [], team_ids: [] };
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role, is_umpire: false, email: user.email },
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
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    // Check username uniqueness
    const { rows: existingUser } = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUser.length) return res.status(409).json({ error: 'Username already taken' });

    // Check email uniqueness
    const { rows: existingEmail } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingEmail.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    
    // Create user with umpire role
    const { rows: userRows } = await pool.query(
      'INSERT INTO users (username, password_hash, name, email, role, is_umpire) VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id, username, name, email, role, is_umpire, created_at',
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
      { id: user.id, username: user.username, name: user.name, role: user.role, is_umpire: true },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const permissions = { org_ids: [], team_ids: [] };
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role, is_umpire: true, email: user.email },
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
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

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
    const pwErr = validatePassword(newPassword);
    if (pwErr) return res.status(400).json({ error: pwErr });

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
    const { rows } = await pool.query('SELECT id, username, name, role, is_umpire, email FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const user = rows[0];
    const permissions = await getUserPermissions(user.id);
    res.json({ user, permissions });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/registration-config — public config for registration forms
router.get('/registration-config', async (req, res) => {
  try {
    const [orgs, ageGroups, levels, seasons] = await Promise.all([
      pool.query(`SELECT id, name, city, state FROM organizations ORDER BY name`),
      pool.query(`SELECT id, name FROM league_age_groups ORDER BY sort_order, name`),
      pool.query(`SELECT id, name FROM league_levels ORDER BY sort_order, name`),
      pool.query(`SELECT id, name, year, is_active FROM league_seasons ORDER BY year DESC, name`),
    ]);
    res.json({
      organizations: orgs.rows,
      age_groups: ageGroups.rows,
      levels: levels.rows,
      seasons: seasons.rows,
    });
  } catch (err) {
    console.error('Registration config error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register-director — travel director self-registration with org + teams + coaches
router.post('/register-director', async (req, res) => {
  const client = await pool.connect();
  try {
    const { director, organization, teams } = req.body;

    // ── Validate director ──
    if (!director?.username || !director?.password || !director?.name || !director?.email) {
      return res.status(400).json({ error: 'Director username, password, name, and email are required' });
    }
    const pwErr = validatePassword(director.password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    // ── Validate organization ──
    if (!organization) {
      return res.status(400).json({ error: 'Organization information is required' });
    }
    if (!organization.id && !organization.name) {
      return res.status(400).json({ error: 'Please select an existing organization or provide a name for a new one' });
    }

    // ── Validate teams ──
    if (!teams || !teams.length) {
      return res.status(400).json({ error: 'At least one team is required' });
    }
    for (let i = 0; i < teams.length; i++) {
      if (!teams[i].team_city) {
        return res.status(400).json({ error: `Team ${i + 1}: city is required` });
      }
      if (!teams[i].age_group) {
        return res.status(400).json({ error: `Team ${i + 1}: age group is required` });
      }
    }

    // ── Check director username/email uniqueness ──
    const { rows: existingUser } = await client.query('SELECT id FROM users WHERE username = $1', [director.username]);
    if (existingUser.length) return res.status(409).json({ error: 'Username already taken' });
    const { rows: existingEmail } = await client.query('SELECT id FROM users WHERE email = $1', [director.email]);
    if (existingEmail.length) return res.status(409).json({ error: 'Email already registered' });

    await client.query('BEGIN');

    // ── 1. Create director user account ──
    const dirHash = await bcrypt.hash(director.password, 10);
    const { rows: dirRows } = await client.query(
      'INSERT INTO users (username, password_hash, name, email, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, name, email, role',
      [director.username, dirHash, director.name, director.email, 'org_admin']
    );
    const dirUser = dirRows[0];

    // ── 2. Create or find organization ──
    let orgId;
    if (organization.id) {
      // Verify org exists
      const { rows: orgCheck } = await client.query('SELECT id FROM organizations WHERE id = $1', [organization.id]);
      if (!orgCheck.length) return res.status(400).json({ error: 'Selected organization not found' });
      orgId = organization.id;
    } else {
      // Create new org
      const { rows: orgRows } = await client.query(
        `INSERT INTO organizations (name, city, state, contact_name, contact_email, contact_phone)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          organization.name,
          organization.city || null,
          organization.state || null,
          organization.contact_name || director.name,
          organization.contact_email || director.email,
          organization.contact_phone || null,
        ]
      );
      orgId = orgRows[0].id;
    }

    // ── 3. Grant director org permission ──
    await client.query(
      'INSERT INTO user_permissions (user_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [dirUser.id, orgId]
    );

    // ── 4. Find active season for registrations ──
    const { rows: seasonRows } = await client.query(
      'SELECT id FROM league_seasons WHERE is_active = TRUE ORDER BY year DESC LIMIT 1'
    );
    const activeSeasonId = seasonRows[0]?.id || null;

    // ── 5. Create teams + coaches ──
    const coachEmails = []; // track to send emails after commit
    const teamIds = [];

    for (const t of teams) {
      // Build team name
      const name = [t.team_city, t.team_color, t.age_group, t.level].filter(Boolean).join(' ');
      let abbr = '';
      if (t.team_city) {
        const words = t.team_city.trim().split(/\s+/);
        abbr = words.length > 1 ? words.map(w => w[0]).join('') : t.team_city.substring(0, 3);
      }
      if (t.team_mascot) abbr += t.team_mascot[0];
      if (t.team_color) abbr += t.team_color[0];
      if (t.age_group) abbr += t.age_group.replace(/\s+/g, '');
      if (t.level) abbr += t.level.replace(/\s+/g, '');
      abbr = abbr.toUpperCase();

      // Insert team
      const { rows: teamRows } = await client.query(
        `INSERT INTO teams (name, abbreviation, team_city, team_color, team_mascot, age_group, level, org_id, primary_color, secondary_color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [name, abbr || null, t.team_city, t.team_color || null, t.team_mascot || null, t.age_group, t.level || null, orgId, t.primary_color || null, t.secondary_color || null]
      );
      const teamId = teamRows[0].id;
      teamIds.push(teamId);

      // Register team for active season
      if (activeSeasonId) {
        // Look up age group fee
        const { rows: agRows } = await client.query(
          `SELECT league_fee FROM league_age_groups WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
          [t.age_group]
        );
        const fee = agRows[0]?.league_fee || null;

        await client.query(
          `INSERT INTO team_registrations (team_id, season_id, fee, status)
           VALUES ($1, $2, $3, 'registered') ON CONFLICT (team_id, season_id) DO NOTHING`,
          [teamId, activeSeasonId, fee]
        );
      }

      // Create coach account if coach email provided and different from director
      if (t.coach_email && t.coach_email.toLowerCase() !== director.email.toLowerCase()) {
        const coachEmail = t.coach_email.toLowerCase().trim();
        const coachName = t.coach_name || coachEmail.split('@')[0];

        // Check if user already exists
        const { rows: existing } = await client.query('SELECT id FROM users WHERE email = $1', [coachEmail]);
        let coachUserId;
        let tempPassword = null;

        if (existing.length) {
          coachUserId = existing[0].id;
        } else {
          // Check if username (email) is taken
          const { rows: usernameCheck } = await client.query('SELECT id FROM users WHERE username = $1', [coachEmail]);
          const coachUsername = usernameCheck.length ? `coach_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` : coachEmail;

          // Generate temp password
          tempPassword = crypto.randomBytes(6).toString('base64url').slice(0, 10);
          const coachHash = await bcrypt.hash(tempPassword, 10);

          const { rows: coachRows } = await client.query(
            'INSERT INTO users (username, password_hash, name, email, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [coachUsername, coachHash, coachName, coachEmail, 'team_manager']
          );
          coachUserId = coachRows[0].id;
          coachEmails.push({ email: coachEmail, name: coachName, tempPassword, teamName: name });
        }

        // Grant team permission
        await client.query(
          'INSERT INTO user_permissions (user_id, team_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [coachUserId, teamId]
        );
      }
    }

    await client.query('COMMIT');

    // ── 6. Send coach invitation emails (non-blocking, after commit) ──
    for (const c of coachEmails) {
      sendCoachInviteEmail(c.email, c.name, c.tempPassword, c.teamName).catch(() => {});
    }

    // Send welcome email to director
    sendWelcomeEmail(director.email, director.name).catch(() => {});

    // ── 7. Generate JWT & return ──
    const token = jwt.sign(
      { id: dirUser.id, username: dirUser.username, name: dirUser.name, role: dirUser.role, is_umpire: false },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const permissions = await getUserPermissions(dirUser.id);

    res.status(201).json({
      token,
      user: { id: dirUser.id, username: dirUser.username, name: dirUser.name, role: dirUser.role, is_umpire: false, email: dirUser.email },
      permissions,
      teams_created: teamIds.length,
      coaches_invited: coachEmails.length,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Register director error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A duplicate entry was detected. Please check your information.' });
    }
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
