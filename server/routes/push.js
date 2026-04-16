const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');
const { notifyTeamUsers, notifyOrgUsers, notifyAll, VAPID_PUBLIC_KEY } = require('../push');

const router = express.Router();

// GET /api/push/vapid-key — public key for client-side subscription
router.get('/vapid-key', (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(404).json({ error: 'Push notifications not configured' });
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe — save push subscription for authenticated user
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, keys_p256dh = $3, keys_auth = $4`,
      [req.user.id, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Push subscribe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/push/unsubscribe — remove push subscription
router.delete('/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Endpoint required' });
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Push unsubscribe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/push/status — check if current user has an active subscription
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ subscribed: parseInt(rows[0].count) > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/push/send — admin sends a notification (team, org, or league-wide)
router.post('/send', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { title, body, scope, teamIds, orgIds, url } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    const payload = { title, body, url: url || '/', tag: 'admin-message' };
    let sent = [];

    if (scope === 'team' && teamIds?.length) {
      sent = await notifyTeamUsers(teamIds, payload);
    } else if (scope === 'org' && orgIds?.length) {
      sent = await notifyOrgUsers(orgIds, payload);
    } else {
      sent = await notifyAll(payload);
    }

    const successCount = (sent || []).filter(Boolean).length;
    res.json({ ok: true, delivered: successCount });
  } catch (err) {
    console.error('Push send error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
