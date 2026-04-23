const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { authMiddleware, canEditTeam } = require('../auth');
const cache = require('../cache');
const { sendCoachInviteEmail } = require('../email');

const router = express.Router();

const VALID_ROLES = ['head_coach', 'assistant_coach', 'scorekeeper', 'org_admin', 'scheduling_contact'];
const ROLE_LABELS = {
  head_coach: 'Head Coach',
  assistant_coach: 'Assistant Coach',
  scorekeeper: 'Scorekeeper',
  org_admin: 'Org Administrator',
  scheduling_contact: 'Scheduling Contact',
};

function addLabel(s) { return { ...s, role_label: ROLE_LABELS[s.role] || s.role }; }

// GET staff – by team_id (via junction) or search by name
router.get('/', async (req, res) => {
  try {
    const { team_id, search } = req.query;
    let result;
    if (team_id) {
      result = await pool.query(
        `SELECT sm.*, tsa.role
         FROM staff_members sm
         JOIN team_staff_assignments tsa ON tsa.staff_id = sm.id
         WHERE tsa.team_id = $1
         ORDER BY tsa.role, sm.name`, [team_id]
      );
    } else if (search) {
      const q = `%${search}%`;
      result = await pool.query(
        `SELECT * FROM staff_members WHERE name ILIKE $1
         ORDER BY name LIMIT 50`, [q]
      );
    } else {
      result = await pool.query('SELECT * FROM staff_members ORDER BY name');
    }
    res.json(result.rows.map(addLabel));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /sched-contact/:userId — get team_ids where this user is scheduling_contact
router.get('/sched-contact/:userId', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tsa.team_id
       FROM team_staff_assignments tsa
       JOIN staff_members sm ON sm.id = tsa.staff_id
       JOIN users u ON u.email = sm.email
       WHERE u.id = $1 AND tsa.role = 'scheduling_contact'`,
      [req.params.userId]
    );
    res.json({ team_ids: rows.map(r => r.team_id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /sched-contact — assign or remove scheduling_contact role for a user on a team
// Body: { user_id, team_id, enabled }
router.put('/sched-contact', authMiddleware, async (req, res) => {
  try {
    const { user_id, team_id, enabled } = req.body;
    if (!user_id || !team_id || enabled === undefined) {
      return res.status(400).json({ error: 'user_id, team_id, and enabled are required' });
    }
    if (!(await canEditTeam(req.user, team_id))) {
      return res.status(403).json({ error: 'No permission for this team' });
    }

    // Look up the user to get their email
    const userRes = await pool.query('SELECT email, name FROM users WHERE id = $1', [user_id]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'User not found' });
    const { email, name } = userRes.rows[0];

    if (!email) return res.status(400).json({ error: 'User has no email address' });

    // Find or create a matching staff_member by email
    let staffRes = await pool.query('SELECT id FROM staff_members WHERE email = $1', [email]);
    let staffId;
    if (staffRes.rows.length) {
      staffId = staffRes.rows[0].id;
    } else {
      const created = await pool.query(
        'INSERT INTO staff_members (name, email) VALUES ($1, $2) RETURNING id',
        [name, email]
      );
      staffId = created.rows[0].id;
    }

    if (enabled) {
      await pool.query(
        `INSERT INTO team_staff_assignments (team_id, staff_id, role)
         VALUES ($1, $2, 'scheduling_contact')
         ON CONFLICT (team_id, staff_id) DO UPDATE SET role = 'scheduling_contact'`,
        [team_id, staffId]
      );
    } else {
      await pool.query(
        `DELETE FROM team_staff_assignments
         WHERE team_id = $1 AND staff_id = $2 AND role = 'scheduling_contact'`,
        [team_id, staffId]
      );
    }

    cache.del('directory');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM staff_members WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Staff member not found' });
    const { rows: teams } = await pool.query(
      `SELECT t.id, t.name, tsa.role
       FROM teams t JOIN team_staff_assignments tsa ON tsa.team_id = t.id
       WHERE tsa.staff_id = $1 ORDER BY t.name`, [req.params.id]
    );
    res.json({ ...rows[0], teams });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Map staff role to user role
const STAFF_ROLE_TO_USER_ROLE = {
  head_coach: 'team_manager',
  assistant_coach: 'team_manager',
  scorekeeper: 'score_reporter',
};

// Create a new staff member and optionally assign to a team
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { team_id, name, role, email, phone, create_account } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (team_id) {
      if (!role) return res.status(400).json({ error: 'role is required when assigning to a team' });
      if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'role must be one of: ' + VALID_ROLES.join(', ') });
      if (!(await canEditTeam(req.user, team_id))) return res.status(403).json({ error: 'No permission for this team' });
      const { rows: teamCheck } = await client.query('SELECT id, name as team_name FROM teams WHERE id = $1', [team_id]);
      if (!teamCheck.length) return res.status(400).json({ error: 'Team not found' });
    }

    await client.query('BEGIN');

    // Check for existing staff with same email to avoid duplicates
    let staffId;
    let staffRow;
    if (email) {
      const { rows: existingStaff } = await client.query(
        'SELECT * FROM staff_members WHERE LOWER(email) = LOWER($1)', [email]
      );
      if (existingStaff.length) {
        staffRow = existingStaff[0];
        staffId = staffRow.id;
        // Update name/phone if provided
        await client.query(
          'UPDATE staff_members SET name = $1, phone = COALESCE($2, phone) WHERE id = $3',
          [name, phone || null, staffId]
        );
        staffRow.name = name;
        if (phone) staffRow.phone = phone;
      }
    }

    if (!staffId) {
      const { rows } = await client.query(
        'INSERT INTO staff_members (name, email, phone) VALUES ($1, $2, $3) RETURNING *',
        [name, email || null, phone || null]
      );
      staffRow = rows[0];
      staffId = rows[0].id;
    }

    if (team_id) {
      await client.query(
        'INSERT INTO team_staff_assignments (team_id, staff_id, role) VALUES ($1, $2, $3) ON CONFLICT (team_id, staff_id) DO UPDATE SET role = $3',
        [team_id, staffId, role]
      );
    }

    // Create user account if requested and email is provided
    let account_created = false;
    let account_existing = false;
    if (create_account && email && team_id) {
      const userRole = STAFF_ROLE_TO_USER_ROLE[role] || 'score_reporter';

      // Check if user already exists with this email
      const { rows: existingUser } = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]
      );

      if (existingUser.length) {
        // User exists — just add team permission
        await client.query(
          'INSERT INTO user_permissions (user_id, team_id, is_active) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING',
          [existingUser[0].id, team_id]
        );
        account_existing = true;
      } else {
        // Create new user account with temp password
        const emailLower = email.toLowerCase().trim();
        const { rows: usernameCheck } = await client.query('SELECT id FROM users WHERE username = $1', [emailLower]);
        const username = usernameCheck.length ? `staff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` : emailLower;

        const tempPassword = crypto.randomBytes(6).toString('base64url').slice(0, 10);
        const hash = await bcrypt.hash(tempPassword, 10);

        const { rows: userRows } = await client.query(
          `INSERT INTO users (username, password_hash, name, email, role, email_confirmed, approval_status)
           VALUES ($1, $2, $3, $4, $5, TRUE, 'approved') RETURNING id`,
          [username, hash, name, emailLower, userRole]
        );

        // Grant team permission (active immediately since admin-created)
        await client.query(
          'INSERT INTO user_permissions (user_id, team_id, is_active) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING',
          [userRows[0].id, team_id]
        );

        // Send invite email with credentials (after commit)
        const { rows: teamInfo } = await client.query('SELECT name FROM teams WHERE id = $1', [team_id]);
        const teamName = teamInfo[0]?.name || 'your team';
        // Defer email sending until after commit
        client._pendingInvite = { email: emailLower, name, tempPassword, teamName };
        account_created = true;
      }
    }

    await client.query('COMMIT');

    // Send invite email after successful commit (must await on Vercel serverless)
    if (client._pendingInvite) {
      const inv = client._pendingInvite;
      // Look up sender's email for Reply-To
      let replyTo;
      try {
        const { rows: senderRows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
        if (senderRows[0]?.email) replyTo = { email: senderRows[0].email, name: req.user.name };
      } catch (_) {}
      try {
        await sendCoachInviteEmail(inv.email, inv.name, inv.tempPassword, inv.teamName, { replyTo });
      } catch (err) {
        console.error('[STAFF] Failed to send invite email:', err);
      }
    }

    cache.del('directory');
    res.status(201).json(addLabel({ ...staffRow, role, account_created, account_existing }));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ error: 'A duplicate entry was detected.' });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Update staff member details + optionally role for a team
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query('SELECT * FROM staff_members WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Staff member not found' });
    const old = existing[0];

    // Permission: must be able to edit at least one team this staff is on
    const { rows: teamRows } = await pool.query('SELECT team_id FROM team_staff_assignments WHERE staff_id = $1', [id]);
    let hasPermission = req.user.role === 'super_admin';
    if (!hasPermission) {
      for (const tr of teamRows) {
        if (await canEditTeam(req.user, tr.team_id)) { hasPermission = true; break; }
      }
    }
    if (!hasPermission) return res.status(403).json({ error: 'No permission to edit this staff member' });

    const { name, role, email, phone, team_id } = req.body;
    if (role && !VALID_ROLES.includes(role)) return res.status(400).json({ error: 'role must be one of: ' + VALID_ROLES.join(', ') });

    const { rows } = await pool.query(
      'UPDATE staff_members SET name = $1, email = $2, phone = $3 WHERE id = $4 RETURNING *',
      [name ?? old.name, email ?? old.email, phone ?? old.phone, id]
    );

    // Update role for a specific team assignment if provided
    if (team_id && role) {
      await pool.query(
        'UPDATE team_staff_assignments SET role = $1 WHERE team_id = $2 AND staff_id = $3',
        [role, team_id, id]
      );
    }

    res.json(addLabel({ ...rows[0], role: role ?? null }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a staff member entirely (removes from all teams)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id, email FROM staff_members WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Staff member not found' });

    const { rows: teamRows } = await pool.query('SELECT team_id FROM team_staff_assignments WHERE staff_id = $1', [id]);
    let hasPermission = req.user.role === 'super_admin';
    if (!hasPermission) {
      for (const tr of teamRows) {
        if (await canEditTeam(req.user, tr.team_id)) { hasPermission = true; break; }
      }
    }
    if (!hasPermission) return res.status(403).json({ error: 'No permission to delete this staff member' });

    // Also delete the linked user account (matched by email)
    let user_deleted = false;
    const staffEmail = rows[0].email;
    if (staffEmail) {
      const { rows: linkedUser } = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [staffEmail]
      );
      if (linkedUser.length) {
        // Prevent deleting the requesting user's own account
        if (linkedUser[0].id !== req.user.id) {
          await pool.query('DELETE FROM users WHERE id = $1', [linkedUser[0].id]);
          user_deleted = true;
        }
      }
    }

    await pool.query('DELETE FROM staff_members WHERE id = $1', [id]);
    res.json({ success: true, user_deleted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Team-Staff Assignment Routes ──

// Assign existing staff to a team
router.post('/assign', authMiddleware, async (req, res) => {
  try {
    const { team_id, staff_id, role } = req.body;
    if (!team_id || !staff_id || !role) return res.status(400).json({ error: 'team_id, staff_id, and role are required' });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'role must be one of: ' + VALID_ROLES.join(', ') });
    if (!(await canEditTeam(req.user, team_id))) return res.status(403).json({ error: 'No permission for this team' });

    const { rows: staffCheck } = await pool.query('SELECT id, email FROM staff_members WHERE id = $1', [staff_id]);
    if (!staffCheck.length) return res.status(404).json({ error: 'Staff member not found' });

    await pool.query(
      'INSERT INTO team_staff_assignments (team_id, staff_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [team_id, staff_id, role]
    );

    // Sync user permissions if staff has a linked user account
    if (staffCheck[0].email) {
      const { rows: linkedUser } = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [staffCheck[0].email]
      );
      if (linkedUser.length) {
        await pool.query(
          'INSERT INTO user_permissions (user_id, team_id, is_active) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING',
          [linkedUser[0].id, team_id]
        );
      }
    }

    cache.del('directory');
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove staff from a team (does not delete the staff member)
router.post('/unassign', authMiddleware, async (req, res) => {
  try {
    const { team_id, staff_id } = req.body;
    if (!team_id || !staff_id) return res.status(400).json({ error: 'team_id and staff_id are required' });
    if (!(await canEditTeam(req.user, team_id))) return res.status(403).json({ error: 'No permission for this team' });

    await pool.query('DELETE FROM team_staff_assignments WHERE team_id = $1 AND staff_id = $2', [team_id, staff_id]);
    cache.del('directory');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
