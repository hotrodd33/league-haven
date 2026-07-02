// Admin utilities — super-admin only.
const express = require('express');
const cache = require('../cache');
const { authMiddleware, requireRole } = require('../auth');

const router = express.Router();

// POST /api/admin/clear-cache
// Wipes the in-memory TTL cache used by routes (organizations, league-config,
// games, etc.). Useful for super admins debugging stale reads after a deploy
// or data fix.
router.post('/clear-cache', authMiddleware, requireRole('super_admin'), (req, res) => {
  res.set('Cache-Control', 'no-store');
  cache.invalidatePrefix('');
  res.json({ ok: true, cleared_at: new Date().toISOString() });
});

module.exports = router;
