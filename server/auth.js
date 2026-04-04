const jwt = require('jsonwebtoken');
const { pool } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

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
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

async function getUserPermissions(userId) {
  const { rows } = await pool.query(
    'SELECT org_id, team_id FROM user_permissions WHERE user_id = $1',
    [userId]
  );
  return {
    org_ids: rows.filter(r => r.org_id != null).map(r => r.org_id),
    team_ids: rows.filter(r => r.team_id != null).map(r => r.team_id),
  };
}

async function canEditOrg(user, orgId) {
  if (user.role === 'admin') return true;
  const perms = await getUserPermissions(user.id);
  return perms.org_ids.includes(Number(orgId));
}

async function canEditTeam(user, teamId) {
  if (user.role === 'admin') return true;
  const perms = await getUserPermissions(user.id);
  if (perms.team_ids.includes(Number(teamId))) return true;
  // Check if user has permission for the team's org
  const { rows } = await pool.query('SELECT org_id FROM teams WHERE id = $1', [teamId]);
  if (rows[0]?.org_id && perms.org_ids.includes(rows[0].org_id)) return true;
  return false;
}

module.exports = { authMiddleware, requireAdmin, getUserPermissions, canEditOrg, canEditTeam, JWT_SECRET };
