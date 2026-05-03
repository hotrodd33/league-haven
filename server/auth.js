const jwt = require('jsonwebtoken');
const { pool } = require('./db');

if (!process.env.JWT_SECRET) {
  if (process.env.VERCEL) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  console.warn('[auth] JWT_SECRET not set — using insecure default. Set JWT_SECRET before deploying.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// Valid roles ordered by privilege level
const ROLES = ['score_reporter', 'team_manager', 'org_admin', 'accountant', 'super_admin'];

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}

// Require at least a certain role level
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

async function getUserPermissions(userId) {
  const { rows } = await pool.query(
    'SELECT org_id, team_id FROM user_permissions WHERE user_id = $1 AND is_active = TRUE',
    [userId]
  );
  const orgIds = rows.filter(r => r.org_id != null).map(r => r.org_id);
  const teamIds = rows.filter(r => r.team_id != null).map(r => r.team_id);

  // Resolve orgs that the user's teams belong to
  let teamOrgIds = [];
  if (teamIds.length > 0) {
    const { rows: teamOrgs } = await pool.query(
      'SELECT DISTINCT org_id FROM teams WHERE id = ANY($1) AND org_id IS NOT NULL',
      [teamIds]
    );
    teamOrgIds = teamOrgs.map(r => r.org_id);
  }

  // Guardian: approved claims give access to specific players
  const { rows: claimRows } = await pool.query(
    `SELECT gc.player_id FROM guardian_claims gc
     JOIN users u ON u.id = gc.user_id
     WHERE gc.user_id = $1 AND gc.status = 'approved'`,
    [userId]
  );
  const claimedPlayerIds = claimRows.map(r => r.player_id);

  return {
    org_ids: orgIds,
    team_ids: teamIds,
    team_org_ids: teamOrgIds,
    claimed_player_ids: claimedPlayerIds,
  };
}

async function canEditOrg(user, orgId) {
  if (user.role === 'super_admin') return true;
  if (user.role === 'score_reporter') return false;
  if (user.role === 'accountant') return true; // accountants can view all orgs for payment management
  const perms = await getUserPermissions(user.id);
  if (perms.org_ids.includes(Number(orgId))) return true;
  // Team managers can edit fields for their team's org
  if (perms.team_ids.length > 0) {
    const { rows } = await pool.query(
      'SELECT 1 FROM teams WHERE id = ANY($1) AND org_id = $2 LIMIT 1',
      [perms.team_ids, orgId]
    );
    if (rows.length > 0) return true;
  }
  return false;
}

async function canEditTeam(user, teamId) {
  if (user.role === 'super_admin') return true;
  if (user.role === 'score_reporter') return false;
  const perms = await getUserPermissions(user.id);
  if (perms.team_ids.includes(Number(teamId))) return true;
  // Check if user has permission for the team's org (org_admin or team_manager with org access)
  const { rows } = await pool.query('SELECT org_id FROM teams WHERE id = $1', [teamId]);
  if (rows[0]?.org_id && perms.org_ids.includes(rows[0].org_id)) return true;
  return false;
}

// Score reporters can score games for their assigned teams (or any team they can edit)
async function canScoreGame(user, gameHomeTeamId, gameAwayTeamId) {
  if (user.role === 'super_admin') return true;
  const perms = await getUserPermissions(user.id);
  const teamIds = [Number(gameHomeTeamId), Number(gameAwayTeamId)];

  // Direct team permission
  if (teamIds.some(id => perms.team_ids.includes(id))) return true;

  // Org-level permission (any role with org access can score)
  for (const tid of teamIds) {
    const { rows } = await pool.query('SELECT org_id FROM teams WHERE id = $1', [tid]);
    if (rows[0]?.org_id && perms.org_ids.includes(rows[0].org_id)) return true;
  }

  return false;
}

/** Validate password strength. Returns error string or null if valid. */
function validatePassword(pw) {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter';
  if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter';
  if (!/[0-9]/.test(pw)) return 'Password must include a number';
  return null;
}

/** Like authMiddleware but doesn't reject unauthenticated requests — sets req.user to null instead. */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    req.user = null;
  }
  next();
}

module.exports = { authMiddleware, optionalAuth, requireAdmin, requireRole, getUserPermissions, canEditOrg, canEditTeam, canScoreGame, validatePassword, JWT_SECRET, ROLES };
