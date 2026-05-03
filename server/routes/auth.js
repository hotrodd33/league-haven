const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { JWT_SECRET, authMiddleware, getUserPermissions, validatePassword } = require('../auth');
const { sendWelcomeEmail, sendPasswordResetEmail, sendPasswordChangedEmail, sendCoachInviteEmail, sendConfirmationEmail, sendApprovalRequestEmail } = require('../email');
const cache = require('../cache');

const router = express.Router();

// Simple IP-based rate limiter using the in-memory cache.
// Returns a 429 response and true if the limit is exceeded.
function rateLimit(req, res, { max, windowMs, key }) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const cacheKey = `rl:${key}:${ip}`;
  const count = (cache.get(cacheKey) || 0) + 1;
  cache.set(cacheKey, count, windowMs);
  if (count > max) {
    res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    return true;
  }
  return false;
}

// Helper: generate email confirmation token, store it, and send the email
async function generateAndSendConfirmation(userId, email, name, client) {
  const token = crypto.randomBytes(32).toString('hex');
  const db = client || pool;
  await db.query('UPDATE users SET email_confirmation_token = $1 WHERE id = $2', [token, userId]);
  sendConfirmationEmail(email, name, token).catch(() => {});
  return token;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  if (rateLimit(req, res, { key: 'login', max: 10, windowMs: 60_000 })) return;
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Allow login by username OR email (case-insensitive)
    const normalizedInput = username.trim().toLowerCase();
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1', [normalizedInput]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Block unconfirmed users
    if (!user.email_confirmed) {
      return res.status(403).json({ error: 'Please confirm your email address before signing in. Check your inbox for a confirmation link.', unconfirmed: true, email: user.email });
    }

    // Block pending approval users
    if (user.approval_status === 'pending') {
      return res.status(403).json({ error: 'Your account is pending approval. You will receive an email once approved.', pending_approval: true });
    }

    // Block rejected users (30-day lockout)
    if (user.approval_status === 'rejected') {
      const rejectedAt = user.approval_rejected_at ? new Date(user.approval_rejected_at) : null;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      if (rejectedAt && rejectedAt > thirtyDaysAgo) {
        return res.status(403).json({ error: 'Your account registration was not approved. Please contact a league administrator if you believe this is an error.', rejected: true });
      }
    }

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
      user: { id: user.id, username: user.username, name: user.name, role: user.role, is_umpire: user.is_umpire || false, email: user.email, must_change_password: user.must_change_password || false },
      permissions,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register — self-registration (scorekeeper — pending approval)
router.post('/register', async (req, res) => {
  if (rateLimit(req, res, { key: 'register', max: 5, windowMs: 300_000 })) return;
  try {
    const { username, password, name, email: rawEmail, team_ids } = req.body;
    const email = rawEmail?.trim().toLowerCase();
    if (!username || !password || !name || !email) {
      return res.status(400).json({ error: 'Username, password, name, and email are required' });
    }
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    // Check username uniqueness
    const { rows: existingUser } = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (existingUser.length) return res.status(409).json({ error: 'Username already taken' });

    // Check email uniqueness
    const { rows: existingEmail } = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existingEmail.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, name, email, role, approval_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, name, email, role, created_at',
      [username, hash, name, email, 'score_reporter', 'pending']
    );
    const user = rows[0];

    // Create inactive team permissions if teams selected
    const selectedTeams = Array.isArray(team_ids) ? team_ids.filter(Boolean) : [];
    for (const teamId of selectedTeams) {
      await pool.query(
        'INSERT INTO user_permissions (user_id, team_id, is_active) VALUES ($1, $2, FALSE) ON CONFLICT DO NOTHING',
        [user.id, teamId]
      );
    }

    // Send confirmation email
    await generateAndSendConfirmation(user.id, email, name);

    // Notify coaches of the selected teams
    if (selectedTeams.length) {
      const { rows: coaches } = await pool.query(
        `SELECT DISTINCT u.email, u.name FROM users u
         JOIN user_permissions up ON up.user_id = u.id
         WHERE up.team_id = ANY($1) AND u.role = 'team_manager' AND u.email IS NOT NULL AND u.approval_status = 'approved'`,
        [selectedTeams]
      );
      for (const coach of coaches) {
        sendApprovalRequestEmail(coach.email, coach.name, name, 'score_reporter').catch(() => {});
      }
    }

    res.status(201).json({ message: 'Registration successful. Please check your email to confirm your account. Your access will be activated once approved by a coach.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register-guardian — guardian self-registration (approved immediately, no team access)
router.post('/register-guardian', async (req, res) => {
  if (rateLimit(req, res, { key: 'register-guardian', max: 5, windowMs: 300_000 })) return;
  try {
    const { username, password, name, email: rawEmail } = req.body;
    const email = rawEmail?.trim().toLowerCase();
    if (!username || !password || !name || !email) {
      return res.status(400).json({ error: 'Username, password, name, and email are required' });
    }
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const { rows: existingUser } = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (existingUser.length) return res.status(409).json({ error: 'Username already taken' });
    const { rows: existingEmail } = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existingEmail.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, name, email, role, approval_status, email_confirmed)
       VALUES ($1, $2, $3, $4, 'guardian', 'approved', TRUE) RETURNING id, username, name, email, role`,
      [username, hash, name, email]
    );
    const user = rows[0];

    // ── Auto-link existing guardian records that match this email ──
    // If coaches/admins have already entered this person as a guardian on player records,
    // link those records to the new account and create approved claims so they can see the players immediately.
    const { rows: linkedGuardians } = await pool.query(
      `UPDATE guardians SET user_id = $1 WHERE LOWER(email) = LOWER($2) AND user_id IS NULL RETURNING id`,
      [user.id, email]
    );
    if (linkedGuardians.length) {
      const guardianIds = linkedGuardians.map(g => g.id);
      // Insert approved guardian_claims for every player linked to these guardian records
      await pool.query(
        `INSERT INTO guardian_claims (user_id, player_id, status, notes, reviewed_at)
         SELECT $1, pg.player_id, 'approved', 'Auto-approved: matched existing guardian record', NOW()
         FROM player_guardians pg
         WHERE pg.guardian_id = ANY($2)
         ON CONFLICT (user_id, player_id) DO NOTHING`,
        [user.id, guardianIds]
      );
    }

    const permissions = await getUserPermissions(user.id);
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user, permissions });
  } catch (err) {
    console.error('Register guardian error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register-umpire — umpire self-registration with profile creation (pending approval)
router.post('/register-umpire', async (req, res) => {
  if (rateLimit(req, res, { key: 'register-umpire', max: 5, windowMs: 300_000 })) return;
  try {
    const { username, password, name, email, phone, org_ids, date_of_birth, is_certified, years_of_experience } = req.body;
    if (!username || !password || !name || !email) {
      return res.status(400).json({ error: 'Username, password, name, and email are required' });
    }
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    // Check username uniqueness
    const { rows: existingUser } = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (existingUser.length) return res.status(409).json({ error: 'Username already taken' });

    // Check email uniqueness
    const { rows: existingEmail } = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existingEmail.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    
    // Create user with umpire role — pending approval
    const { rows: userRows } = await pool.query(
      'INSERT INTO users (username, password_hash, name, email, role, is_umpire, approval_status) VALUES ($1, $2, $3, $4, $5, TRUE, $6) RETURNING id, username, name, email, role, is_umpire, created_at',
      [username, hash, name, email, 'umpire', 'pending']
    );
    const user = userRows[0];

    // Create official profile linked to user
    const { rows: officialRows } = await pool.query(
      'INSERT INTO officials (user_id, name, email, phone, date_of_birth, is_certified, years_of_experience) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [user.id, name, email, phone || null, date_of_birth || null, is_certified === true, years_of_experience || null]
    );
    const officialId = officialRows[0].id;

    // Link official to selected orgs and create inactive org permissions
    const selectedOrgs = Array.isArray(org_ids) ? org_ids.filter(Boolean) : [];
    for (const orgId of selectedOrgs) {
      await pool.query(
        'INSERT INTO official_organizations (official_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [officialId, orgId]
      );
      await pool.query(
        'INSERT INTO user_permissions (user_id, org_id, is_active) VALUES ($1, $2, FALSE) ON CONFLICT DO NOTHING',
        [user.id, orgId]
      );
    }

    // Send confirmation email
    await generateAndSendConfirmation(user.id, email, name);

    // Notify org admins
    if (selectedOrgs.length) {
      const { rows: admins } = await pool.query(
        `SELECT DISTINCT u.email, u.name FROM users u
         JOIN user_permissions up ON up.user_id = u.id
         WHERE up.org_id = ANY($1) AND u.role = 'org_admin' AND u.email IS NOT NULL AND u.approval_status = 'approved'`,
        [selectedOrgs]
      );
      for (const admin of admins) {
        sendApprovalRequestEmail(admin.email, admin.name, name, 'umpire').catch(() => {});
      }
      // Also notify super admins
      const { rows: superAdmins } = await pool.query(
        `SELECT email, name FROM users WHERE role = 'super_admin' AND email IS NOT NULL`
      );
      for (const sa of superAdmins) {
        sendApprovalRequestEmail(sa.email, sa.name, name, 'umpire').catch(() => {});
      }
    }

    res.status(201).json({ message: 'Registration successful. Please check your email to confirm your account. Your access will be activated once approved.' });
  } catch (err) {
    console.error('Register umpire error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/forgot-password — send reset email
router.post('/forgot-password', async (req, res) => {
  if (rateLimit(req, res, { key: 'forgot', max: 5, windowMs: 300_000 })) return;
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
    await pool.query('UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2', [hash, req.user.id]);

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
    const { rows } = await pool.query('SELECT id, username, name, role, is_umpire, email, created_at, last_login_at FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const user = rows[0];
    const permissions = await getUserPermissions(user.id);

    // Resolve org and team names for the account panel
    let organizations = [];
    let teams = [];
    if (permissions.org_ids.length) {
      const { rows: orgs } = await pool.query('SELECT id, name FROM organizations WHERE id = ANY($1) ORDER BY name', [permissions.org_ids]);
      organizations = orgs;
    }
    const allTeamIds = [...new Set([...permissions.team_ids, ...(permissions.team_org_ids ? [] : [])])];
    if (allTeamIds.length) {
      const { rows: tms } = await pool.query('SELECT t.id, t.name, t.age_group, t.level, o.name AS org_name FROM teams t LEFT JOIN organizations o ON o.id = t.org_id WHERE t.id = ANY($1) ORDER BY t.name', [allTeamIds]);
      teams = tms;
    }
    // Also include teams from orgs the user manages
    if (permissions.org_ids.length) {
      const { rows: orgTeams } = await pool.query('SELECT t.id, t.name, t.age_group, t.level, o.name AS org_name FROM teams t LEFT JOIN organizations o ON o.id = t.org_id WHERE t.org_id = ANY($1) ORDER BY t.name', [permissions.org_ids]);
      const existingIds = new Set(teams.map(t => t.id));
      for (const t of orgTeams) {
        if (!existingIds.has(t.id)) teams.push(t);
      }
    }

    res.json({ user, permissions, organizations, teams });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register-coach — coach registers with a single team under an existing org
router.post('/register-coach', async (req, res) => {
  const client = await pool.connect();
  try {
    const { username, password, name, email, phone, org_id, team_id, team } = req.body;

    if (!username || !password || !name || !email) {
      return res.status(400).json({ error: 'Username, password, name, and email are required' });
    }
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    if (!org_id) return res.status(400).json({ error: 'Organization is required' });
    if (!team_id && !team?.team_city) return res.status(400).json({ error: 'Team selection or team city is required' });
    if (!team_id && !team?.age_group) return res.status(400).json({ error: 'Age group is required' });

    const { rows: orgCheck } = await client.query('SELECT id, name FROM organizations WHERE id = $1', [org_id]);
    if (!orgCheck.length) return res.status(400).json({ error: 'Organization not found' });

    const { rows: existingUser } = await client.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (existingUser.length) return res.status(409).json({ error: 'Username already taken' });
    const { rows: existingEmail } = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingEmail.length) return res.status(409).json({ error: 'Email already registered' });

    await client.query('BEGIN');

    // Create user as team_manager — pending approval
    const hash = await bcrypt.hash(password, 10);
    const { rows: userRows } = await client.query(
      'INSERT INTO users (username, password_hash, name, email, role, approval_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, name, email, role',
      [username, hash, name, email, 'team_manager', 'pending']
    );
    const user = userRows[0];

    let teamId;
    let teamName;

    if (team_id) {
      // Joining an existing team
      const { rows: teamCheck } = await client.query(
        'SELECT id, name FROM teams WHERE id = $1 AND org_id = $2',
        [team_id, org_id]
      );
      if (!teamCheck.length) return res.status(400).json({ error: 'Team not found in the selected organization' });
      teamId = teamCheck[0].id;
      teamName = teamCheck[0].name;
    } else {
      // Creating a new team
      const t = team;
      teamName = [t.team_city, t.team_color, t.age_group, t.level].filter(Boolean).join(' ');
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

      const { rows: teamRows } = await client.query(
        `INSERT INTO teams (name, abbreviation, team_city, team_color, team_mascot, age_group, level, org_id, primary_color, secondary_color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [teamName, abbr || null, t.team_city, t.team_color || null, t.team_mascot || null, t.age_group, t.level || null, org_id, t.primary_color || null, t.secondary_color || null]
      );
      teamId = teamRows[0].id;

      // Auto-register new team for active season
      const { rows: seasonRows } = await client.query(
        'SELECT id FROM league_seasons WHERE is_active = TRUE ORDER BY year DESC LIMIT 1'
      );
      if (seasonRows[0]) {
        const { rows: agRows } = await client.query(
          'SELECT league_fee FROM league_age_groups WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))',
          [t.age_group]
        );
        await client.query(
          `INSERT INTO team_registrations (team_id, season_id, fee, status)
           VALUES ($1, $2, $3, 'registered') ON CONFLICT (team_id, season_id) DO NOTHING`,
          [teamId, seasonRows[0].id, agRows[0]?.league_fee || null]
        );
      }
    }

    // Grant team permission (inactive until approved)
    await client.query(
      'INSERT INTO user_permissions (user_id, team_id, is_active) VALUES ($1, $2, FALSE)',
      [user.id, teamId]
    );

    // Create staff_members record and assign to team
    const { rows: staffRows } = await client.query(
      'INSERT INTO staff_members (name, email, phone) VALUES ($1, $2, $3) RETURNING id',
      [name, email, phone || null]
    );
    await client.query(
      `INSERT INTO team_staff_assignments (team_id, staff_id, role) VALUES ($1, $2, 'head_coach') ON CONFLICT DO NOTHING`,
      [teamId, staffRows[0].id]
    );

    await client.query('COMMIT');

    // Send confirmation email
    await generateAndSendConfirmation(user.id, email, name);

    // Notify org admins about the new coach
    const { rows: orgAdmins } = await pool.query(
      `SELECT DISTINCT u.email, u.name FROM users u
       JOIN user_permissions up ON up.user_id = u.id
       WHERE up.org_id = $1 AND u.role = 'org_admin' AND u.email IS NOT NULL AND u.approval_status = 'approved'`,
      [org_id]
    );
    for (const admin of orgAdmins) {
      sendApprovalRequestEmail(admin.email, admin.name, name, 'team_manager').catch(() => {});
    }

    res.status(201).json({
      message: 'Registration successful. Please check your email to confirm your account. Your access will be activated once approved by your organization.',
      team_name: teamName,
      org_name: orgCheck[0].name,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Register coach error:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'A duplicate entry was detected.' });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// GET /api/auth/registration-config — public config for registration forms
router.get('/registration-config', async (req, res) => {
  try {
    const [orgs, ageGroups, levels, seasons, teams] = await Promise.all([
      pool.query(`SELECT id, name, city, state FROM organizations ORDER BY name`),
      pool.query(`SELECT id, name FROM league_age_groups ORDER BY sort_order, name`),
      pool.query(`SELECT id, name FROM league_levels ORDER BY sort_order, name`),
      pool.query(`SELECT id, name, year, is_active FROM league_seasons ORDER BY year DESC, name`),
      pool.query(`SELECT id, name, org_id, age_group FROM teams ORDER BY name`),
    ]);
    res.json({
      organizations: orgs.rows,
      age_groups: ageGroups.rows,
      levels: levels.rows,
      seasons: seasons.rows,
      teams: teams.rows,
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
    const teamList = Array.isArray(teams) ? teams : [];

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

    // ── Validate teams (optional) ──
    for (let i = 0; i < teamList.length; i++) {
      if (!teamList[i].team_city) {
        return res.status(400).json({ error: `Team ${i + 1}: city is required` });
      }
      if (!teamList[i].age_group) {
        return res.status(400).json({ error: `Team ${i + 1}: age group is required` });
      }
    }

    // ── Check director username/email uniqueness ──
    const { rows: existingUser } = await client.query('SELECT id FROM users WHERE username = $1', [director.username]);
    if (existingUser.length) return res.status(409).json({ error: 'Username already taken' });
    const { rows: existingEmail } = await client.query('SELECT id FROM users WHERE email = $1', [director.email]);
    if (existingEmail.length) return res.status(409).json({ error: 'Email already registered' });

    await client.query('BEGIN');

    // ── 1. Create director user account — pending approval ──
    const dirHash = await bcrypt.hash(director.password, 10);
    const { rows: dirRows } = await client.query(
      'INSERT INTO users (username, password_hash, name, email, role, approval_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, name, email, role',
      [director.username, dirHash, director.name, director.email, 'org_admin', 'pending']
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

    // ── 3. Grant director org permission (inactive until approved) ──
    await client.query(
      'INSERT INTO user_permissions (user_id, org_id, is_active) VALUES ($1, $2, FALSE) ON CONFLICT DO NOTHING',
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

    for (const t of teamList) {
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

    // Send confirmation email to director
    await generateAndSendConfirmation(dirUser.id, director.email, director.name);

    // Notify super admins about new org registration
    const { rows: superAdmins } = await pool.query(
      `SELECT email, name FROM users WHERE role = 'super_admin' AND email IS NOT NULL`
    );
    for (const sa of superAdmins) {
      sendApprovalRequestEmail(sa.email, sa.name, director.name, 'org_admin').catch(() => {});
    }

    res.status(201).json({
      message: 'Registration successful. Please check your email to confirm your account. Your organization access will be activated once approved by the league.',
      teams_created: teamIds.length,
      coaches_invited: coachEmails.length,
      teams_skipped: teamList.length === 0,
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

// GET /api/auth/confirm-email?token=... — verify email confirmation token
router.get('/confirm-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Confirmation token is required' });

    const { rows } = await pool.query(
      'SELECT id, name, email FROM users WHERE email_confirmation_token = $1',
      [token]
    );
    if (!rows.length) return res.status(400).json({ error: 'Invalid or expired confirmation link' });

    const user = rows[0];
    await pool.query(
      'UPDATE users SET email_confirmed = TRUE, email_confirmation_token = NULL WHERE id = $1',
      [user.id]
    );

    res.json({ message: 'Email confirmed! You can now sign in.', name: user.name });
  } catch (err) {
    console.error('Confirm email error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/resend-confirmation — resend confirmation email
router.post('/resend-confirmation', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const { rows } = await pool.query(
      'SELECT id, name, email, email_confirmed FROM users WHERE email = $1',
      [email]
    );
    // Always return success to prevent email enumeration
    if (!rows.length || rows[0].email_confirmed) {
      return res.json({ message: 'If that email has a pending registration, a new confirmation link has been sent.' });
    }

    const user = rows[0];
    await generateAndSendConfirmation(user.id, user.email, user.name);

    res.json({ message: 'If that email has a pending registration, a new confirmation link has been sent.' });
  } catch (err) {
    console.error('Resend confirmation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
