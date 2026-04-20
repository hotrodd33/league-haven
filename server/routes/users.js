const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { authMiddleware, requireAdmin, requireRole, getUserPermissions, validatePassword, ROLES, canEditOrg, canEditTeam } = require('../auth');
const { sendInviteEmail, sendApprovalEmail, sendRejectionEmail, sendApprovalRequestEmail } = require('../email');

const router = express.Router();

// Admin-only middleware (applied per-route below, NOT globally)
const adminOnly = [authMiddleware, requireAdmin];

const VALID_ROLES = [...ROLES]; // umpire access is handled via is_umpire flag, not role

function sanitizeRole(role) {
  return VALID_ROLES.includes(role) ? role : 'score_reporter';
}

// GET /api/users — list all users with their permissions
router.get('/', adminOnly, async (req, res) => {
  try {
    const { rows: users } = await pool.query(
      'SELECT id, username, name, email, role, is_umpire, created_at, last_login_at FROM users ORDER BY name'
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
router.post('/', adminOnly, async (req, res) => {
  try {
    const { username, password, name, email, role, is_umpire } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and name are required' });
    }
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    const userRole = sanitizeRole(role);

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.length) return res.status(409).json({ error: 'Username already taken' });

    if (email) {
      const { rows: existingEmail } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingEmail.length) return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, name, email, role, is_umpire) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, name, email, role, is_umpire, created_at',
      [username, hash, name, email || null, userRole, is_umpire === true]
    );
    res.status(201).json({ ...rows[0], permissions: { org_ids: [], team_ids: [] } });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/:id/invite — send invite email with temp password
router.post('/:id/invite', adminOnly, async (req, res) => {
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

    // Look up sender's email for Reply-To
    let replyTo;
    const { rows: senderRows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    if (senderRows[0]?.email) replyTo = { email: senderRows[0].email, name: req.user.name };

    await sendInviteEmail(user.email, user.name, tempPassword, { replyTo });
    res.json({ message: `Invite sent to ${user.email}` });
  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id — update user profile (name, role, email, optional password reset)
router.put('/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'User not found' });

    const { name, role, password, email, is_umpire } = req.body;
    const userRole = sanitizeRole(role);

    // Check email uniqueness if changed
    if (email && email !== existing[0].email) {
      const { rows: dup } = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]);
      if (dup.length) return res.status(409).json({ error: 'Email already registered by another user' });
    }

    if (password) {
      const pwErr = validatePassword(password);
      if (pwErr) return res.status(400).json({ error: pwErr });
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE users SET name = $1, role = $2, password_hash = $3, email = $4, is_umpire = $5 WHERE id = $6',
        [name || existing[0].name, userRole, hash, email ?? existing[0].email, is_umpire !== undefined ? Boolean(is_umpire) : existing[0].is_umpire, id]
      );
    } else {
      await pool.query(
        'UPDATE users SET name = $1, role = $2, email = $3, is_umpire = $4 WHERE id = $5',
        [name || existing[0].name, userRole, email ?? existing[0].email, is_umpire !== undefined ? Boolean(is_umpire) : existing[0].is_umpire, id]
      );
    }

    const { rows } = await pool.query(
      'SELECT id, username, name, email, role, is_umpire, created_at FROM users WHERE id = $1', [id]
    );
    const permissions = await getUserPermissions(rows[0].id);
    res.json({ ...rows[0], permissions });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id — delete a user
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    // Prevent self-deletion
    if (Number(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    const { rows } = await pool.query('SELECT id, email FROM users WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    // Also delete the linked staff member (matched by email)
    let staff_deleted = false;
    const userEmail = rows[0].email;
    if (userEmail) {
      const { rowCount } = await pool.query(
        'DELETE FROM staff_members WHERE LOWER(email) = LOWER($1)', [userEmail]
      );
      staff_deleted = rowCount > 0;
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true, staff_deleted });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id/permissions — replace all permissions for a user
router.put('/:id/permissions', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'User not found' });
    const user = existing[0];

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

      // Sync staff records for coaches, scorekeepers, and org admins
      const syncRoles = ['team_manager', 'score_reporter', 'org_admin'];
      if (syncRoles.includes(user.role)) {
        // Determine which teams this user should be staff on
        let staffTeamIds = [...team_ids];
        if (user.role === 'org_admin' && org_ids.length) {
          const { rows: orgTeams } = await client.query(
            'SELECT id FROM teams WHERE org_id = ANY($1)',
            [org_ids]
          );
          staffTeamIds = orgTeams.map(t => t.id);
        }

        if (staffTeamIds.length) {
          let staffId;
          const { rows: existingStaff } = await client.query(
            'SELECT id FROM staff_members WHERE LOWER(email) = LOWER($1)',
            [user.email]
          );
          if (existingStaff.length) {
            staffId = existingStaff[0].id;
          } else {
            const { rows: newStaff } = await client.query(
              'INSERT INTO staff_members (name, email) VALUES ($1, $2) RETURNING id',
              [user.name, user.email]
            );
            staffId = newStaff[0].id;
          }
          const staffRole = user.role === 'org_admin' ? 'org_admin'
            : user.role === 'team_manager' ? 'head_coach' : 'scorekeeper';
          for (const teamId of staffTeamIds) {
            await client.query(
              'INSERT INTO team_staff_assignments (team_id, staff_id, role) VALUES ($1, $2, $3) ON CONFLICT (team_id, staff_id) DO UPDATE SET role = $3',
              [teamId, staffId, staffRole]
            );
          }
          // Remove staff assignments for teams no longer in permissions
          await client.query(
            'DELETE FROM team_staff_assignments WHERE staff_id = $1 AND team_id != ALL($2)',
            [staffId, staffTeamIds]
          );
        }
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

/* ═══════════════════════════════════════════════════════
   Approval workflow endpoints
   These have their own auth — NOT super_admin only
   ═══════════════════════════════════════════════════════ */

// GET /api/users/pending — get pending approvals visible to the current user
router.get('/pending', authMiddleware, requireRole('super_admin', 'org_admin', 'team_manager'), async (req, res) => {
  try {
    const user = req.user;
    let query;
    let params = [];

    if (user.role === 'super_admin') {
      // Super admin sees ALL pending users
      query = `
        SELECT u.id, u.username, u.name, u.email, u.role, u.is_umpire, u.approval_status, u.created_at,
               u.approval_notes,
               json_agg(json_build_object('org_id', up.org_id, 'team_id', up.team_id, 'team_name', t.name, 'org_name', o.name)) FILTER (WHERE up.id IS NOT NULL) AS pending_permissions
        FROM users u
        LEFT JOIN user_permissions up ON up.user_id = u.id
        LEFT JOIN teams t ON t.id = up.team_id
        LEFT JOIN organizations o ON o.id = up.org_id
        WHERE u.approval_status IN ('pending', 'rejected')
        GROUP BY u.id
        ORDER BY u.approval_status = 'pending' DESC, u.created_at DESC
      `;
    } else if (user.role === 'org_admin') {
      // Org admin sees pending coaches (team_manager) and umpires for their orgs
      const perms = await getUserPermissions(user.id);
      if (!perms.org_ids.length) return res.json([]);
      query = `
        SELECT u.id, u.username, u.name, u.email, u.role, u.is_umpire, u.approval_status, u.created_at,
               u.approval_notes,
               json_agg(json_build_object('org_id', up.org_id, 'team_id', up.team_id, 'team_name', t.name, 'org_name', o.name)) FILTER (WHERE up.id IS NOT NULL) AS pending_permissions
        FROM users u
        JOIN user_permissions up ON up.user_id = u.id
        LEFT JOIN teams t ON t.id = up.team_id
        LEFT JOIN organizations o ON o.id = up.org_id
        WHERE u.approval_status IN ('pending', 'rejected')
          AND (
            (u.role = 'team_manager' AND up.team_id IN (SELECT id FROM teams WHERE org_id = ANY($1)))
            OR (u.role = 'umpire' AND up.org_id = ANY($1))
          )
        GROUP BY u.id
        ORDER BY u.approval_status = 'pending' DESC, u.created_at DESC
      `;
      params = [perms.org_ids];
    } else if (user.role === 'team_manager') {
      // Team manager sees pending scorekeepers and other coaches for their teams
      const perms = await getUserPermissions(user.id);
      if (!perms.team_ids.length) return res.json([]);
      query = `
        SELECT u.id, u.username, u.name, u.email, u.role, u.is_umpire, u.approval_status, u.created_at,
               u.approval_notes,
               json_agg(json_build_object('org_id', up.org_id, 'team_id', up.team_id, 'team_name', t.name, 'org_name', o.name)) FILTER (WHERE up.id IS NOT NULL) AS pending_permissions
        FROM users u
        JOIN user_permissions up ON up.user_id = u.id
        LEFT JOIN teams t ON t.id = up.team_id
        LEFT JOIN organizations o ON o.id = up.org_id
        WHERE u.approval_status IN ('pending', 'rejected')
          AND u.role IN ('score_reporter', 'team_manager')
          AND up.team_id = ANY($1)
        GROUP BY u.id
        ORDER BY u.approval_status = 'pending' DESC, u.created_at DESC
      `;
      params = [perms.team_ids];
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Pending approvals error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/:id/approve — approve a pending user
router.post('/:id/approve', authMiddleware, requireRole('super_admin', 'org_admin', 'team_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id, name, email, role, approval_status FROM users WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const target = rows[0];
    if (target.approval_status !== 'pending') return res.status(400).json({ error: 'User is not pending approval' });

    // Verify the approver has authority over this user
    const allowed = await canApprove(req.user, target);
    if (!allowed) return res.status(403).json({ error: 'You do not have permission to approve this user' });

    // Approve: set status and activate permissions
    await pool.query('UPDATE users SET approval_status = $1 WHERE id = $2', ['approved', id]);
    await pool.query('UPDATE user_permissions SET is_active = TRUE WHERE user_id = $1', [id]);

    // Ensure staff record exists so they show under Coaches & Staff
    if (target.role === 'score_reporter' || target.role === 'team_manager' || target.role === 'org_admin') {
      let staffTeamIds = [];
      if (target.role === 'org_admin') {
        // Org admins get added to all teams in their orgs
        const { rows: orgPerms } = await pool.query(
          'SELECT org_id FROM user_permissions WHERE user_id = $1 AND org_id IS NOT NULL', [id]
        );
        if (orgPerms.length) {
          const { rows: orgTeams } = await pool.query(
            'SELECT id FROM teams WHERE org_id = ANY($1)',
            [orgPerms.map(p => p.org_id)]
          );
          staffTeamIds = orgTeams.map(t => t.id);
        }
      } else {
        const { rows: perms } = await pool.query(
          'SELECT team_id FROM user_permissions WHERE user_id = $1 AND team_id IS NOT NULL', [id]
        );
        staffTeamIds = perms.map(p => p.team_id);
      }

      if (staffTeamIds.length) {
        // Find or create staff_members record
        let staffId;
        const { rows: existingStaff } = await pool.query(
          'SELECT id FROM staff_members WHERE LOWER(email) = LOWER($1)',
          [target.email]
        );
        if (existingStaff.length) {
          staffId = existingStaff[0].id;
        } else {
          const { rows: newStaff } = await pool.query(
            'INSERT INTO staff_members (name, email) VALUES ($1, $2) RETURNING id',
            [target.name, target.email]
          );
          staffId = newStaff[0].id;
        }
        const staffRole = target.role === 'org_admin' ? 'org_admin'
          : target.role === 'team_manager' ? 'head_coach' : 'scorekeeper';
        for (const teamId of staffTeamIds) {
          await pool.query(
            'INSERT INTO team_staff_assignments (team_id, staff_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [teamId, staffId, staffRole]
          );
        }
      }
    }

    // Send approval email
    if (target.email) {
      const { rows: senderRows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
      const replyTo = senderRows[0]?.email ? { email: senderRows[0].email, name: req.user.name } : undefined;
      sendApprovalEmail(target.email, target.name, { replyTo }).catch(() => {});
    }

    res.json({ success: true, message: `${target.name} has been approved` });
  } catch (err) {
    console.error('Approve user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/:id/reject — reject a pending user
router.post('/:id/reject', authMiddleware, requireRole('super_admin', 'org_admin', 'team_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const { rows } = await pool.query('SELECT id, name, email, role, approval_status FROM users WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const target = rows[0];
    if (target.approval_status !== 'pending') return res.status(400).json({ error: 'User is not pending approval' });

    const allowed = await canApprove(req.user, target);
    if (!allowed) return res.status(403).json({ error: 'You do not have permission to reject this user' });

    await pool.query(
      'UPDATE users SET approval_status = $1, approval_rejected_at = NOW(), approval_notes = $2 WHERE id = $3',
      ['rejected', notes || null, id]
    );

    if (target.email) {
      const { rows: senderRows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
      const replyTo = senderRows[0]?.email ? { email: senderRows[0].email, name: req.user.name } : undefined;
      sendRejectionEmail(target.email, target.name, { replyTo }).catch(() => {});
    }

    res.json({ success: true, message: `${target.name} has been rejected` });
  } catch (err) {
    console.error('Reject user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/:id/reset-approval — reset a rejected user back to pending (admin only)
router.post('/:id/reset-approval', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id, name, approval_status FROM users WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    if (rows[0].approval_status !== 'rejected') return res.status(400).json({ error: 'User is not rejected' });

    await pool.query(
      'UPDATE users SET approval_status = $1, approval_rejected_at = NULL, approval_notes = NULL WHERE id = $2',
      ['pending', id]
    );

    res.json({ success: true, message: `${rows[0].name} has been reset to pending` });
  } catch (err) {
    console.error('Reset approval error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Check if the approver has authority over the target user.
 * Hierarchy: super_admin approves org_admin; org_admin approves team_manager + umpire; team_manager approves score_reporter
 */
async function canApprove(approver, target) {
  if (approver.role === 'super_admin') return true;

  const perms = await getUserPermissions(approver.id);

  if (approver.role === 'org_admin') {
    if (target.role === 'team_manager') {
      // Check if the team_manager's teams are under the org_admin's orgs
      const { rows } = await pool.query(
        'SELECT up.team_id FROM user_permissions up JOIN teams t ON t.id = up.team_id WHERE up.user_id = $1 AND t.org_id = ANY($2)',
        [target.id, perms.org_ids]
      );
      return rows.length > 0;
    }
    if (target.role === 'umpire') {
      // Check if the umpire requested orgs that belong to this org_admin
      const { rows } = await pool.query(
        'SELECT org_id FROM user_permissions WHERE user_id = $1 AND org_id = ANY($2)',
        [target.id, perms.org_ids]
      );
      return rows.length > 0;
    }
  }

  if (approver.role === 'team_manager' && (target.role === 'score_reporter' || target.role === 'team_manager')) {
    // Check if the target's teams overlap with the manager's teams
    const { rows } = await pool.query(
      'SELECT team_id FROM user_permissions WHERE user_id = $1 AND team_id = ANY($2)',
      [target.id, perms.team_ids]
    );
    return rows.length > 0;
  }

  return false;
}

module.exports = router;
