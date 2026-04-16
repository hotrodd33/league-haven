const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');
const { notifyUser, notifyTeamUsers, notifyOrgUsers, notifyAll, VAPID_PUBLIC_KEY } = require('../push');

const router = express.Router();

// GET /api/push/vapid-key — public key for client-side subscription
router.get('/vapid-key', (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(404).json({ error: 'Push notifications not configured', hasPublic: !!process.env.VAPID_PUBLIC_KEY, hasPrivate: !!process.env.VAPID_PRIVATE_KEY });
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// GET /api/push/debug — check push config and subscription status (admin only)
router.get('/debug', authMiddleware, async (req, res) => {
  try {
    const vapidOk = !!VAPID_PUBLIC_KEY;
    const { rows: subs } = await pool.query(
      'SELECT id, user_id, endpoint, created_at FROM push_subscriptions WHERE user_id = $1',
      [req.user.id]
    );
    const { rows: allSubs } = await pool.query('SELECT COUNT(*) as count FROM push_subscriptions');
    res.json({
      vapid_configured: vapidOk,
      vapid_public_key_prefix: VAPID_PUBLIC_KEY ? VAPID_PUBLIC_KEY.substring(0, 10) + '...' : null,
      your_user_id: req.user.id,
      your_subscriptions: subs.length,
      your_subscription_details: subs.map(s => ({
        id: s.id,
        endpoint_prefix: s.endpoint.substring(0, 60) + '...',
        created_at: s.created_at,
      })),
      total_subscriptions: parseInt(allSubs[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/push/test — send a test push to yourself (with full error details)
router.post('/test', authMiddleware, async (req, res) => {
  try {
    if (!VAPID_PUBLIC_KEY) {
      return res.status(400).json({ error: 'VAPID keys not configured on server' });
    }
    const { rows: subs } = await pool.query(
      'SELECT endpoint, keys_p256dh, keys_auth FROM push_subscriptions WHERE user_id = $1',
      [req.user.id]
    );
    if (!subs.length) {
      return res.json({ ok: false, sent: 0, failed: 0, total_subscriptions: 0, error: 'No subscriptions in database for your user' });
    }
    const webpush = require('web-push');
    const results = [];
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
          JSON.stringify({ title: 'Test Notification', body: 'Push notifications are working!', tag: 'test-' + Date.now(), url: '/' })
        );
        results.push({ endpoint_prefix: sub.endpoint.substring(0, 60), status: 'sent' });
      } catch (err) {
        results.push({
          endpoint_prefix: sub.endpoint.substring(0, 60),
          status: 'failed',
          statusCode: err.statusCode,
          error: err.body || err.message,
        });
      }
    }
    const sent = results.filter(r => r.status === 'sent').length;
    res.json({ ok: sent > 0, sent, failed: results.length - sent, total_subscriptions: results.length, details: results });
  } catch (err) {
    console.error('Push test error:', err);
    res.status(500).json({ error: err.message });
  }
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

// GET /api/push/preferences — get notification category preferences
router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT notification_prefs FROM users WHERE id = $1',
      [req.user.id]
    );
    const defaults = { schedule_changes: true, cancellations: true, announcements: true };
    res.json(rows[0]?.notification_prefs || defaults);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/push/preferences — update notification category preferences
router.put('/preferences', authMiddleware, async (req, res) => {
  try {
    const allowed = ['schedule_changes', 'cancellations', 'announcements'];
    const prefs = {};
    for (const key of allowed) {
      prefs[key] = req.body[key] !== false;
    }
    await pool.query(
      'UPDATE users SET notification_prefs = $1 WHERE id = $2',
      [JSON.stringify(prefs), req.user.id]
    );
    res.json(prefs);
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
