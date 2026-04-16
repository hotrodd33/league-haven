const webpush = require('web-push');
const { pool } = require('./db');

// Configure VAPID keys (set via environment variables)
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.FROM_EMAIL || 'mailto:admin@leaguehaven.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    VAPID_EMAIL.startsWith('mailto:') ? VAPID_EMAIL : `mailto:${VAPID_EMAIL}`,
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
}

/**
 * Send a push notification to a single subscription.
 * Returns true on success, false on failure (auto-removes stale subscriptions).
 */
async function sendToSubscription(sub, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
      },
      JSON.stringify(payload)
    );
    return true;
  } catch (err) {
    // 404 or 410 means subscription is gone — remove it
    if (err.statusCode === 404 || err.statusCode === 410) {
      await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
    }
    return false;
  }
}

/**
 * Send a push notification to a specific user (all their devices).
 */
async function notifyUser(userId, payload) {
  const { rows } = await pool.query(
    'SELECT endpoint, keys_p256dh, keys_auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );
  return Promise.all(rows.map((sub) => sendToSubscription(sub, payload)));
}

/**
 * Send a push notification to all users who have a permission for the given team(s).
 */
async function notifyTeamUsers(teamIds, payload) {
  if (!teamIds.length) return;
  const { rows } = await pool.query(
    `SELECT DISTINCT ps.endpoint, ps.keys_p256dh, ps.keys_auth
     FROM push_subscriptions ps
     JOIN user_permissions up ON up.user_id = ps.user_id AND up.is_active = TRUE
     WHERE up.team_id = ANY($1)
       OR up.org_id IN (SELECT org_id FROM teams WHERE id = ANY($1) AND org_id IS NOT NULL)`,
    [teamIds]
  );
  return Promise.all(rows.map((sub) => sendToSubscription(sub, payload)));
}

/**
 * Send a push notification to all users who have a permission for the given org(s).
 */
async function notifyOrgUsers(orgIds, payload) {
  if (!orgIds.length) return;
  const { rows } = await pool.query(
    `SELECT DISTINCT ps.endpoint, ps.keys_p256dh, ps.keys_auth
     FROM push_subscriptions ps
     JOIN user_permissions up ON up.user_id = ps.user_id AND up.is_active = TRUE
     WHERE up.org_id = ANY($1)`,
    [orgIds]
  );
  return Promise.all(rows.map((sub) => sendToSubscription(sub, payload)));
}

/**
 * Send a push notification to ALL subscribed users (league-wide).
 */
async function notifyAll(payload) {
  const { rows } = await pool.query(
    'SELECT endpoint, keys_p256dh, keys_auth FROM push_subscriptions'
  );
  return Promise.all(rows.map((sub) => sendToSubscription(sub, payload)));
}

module.exports = {
  notifyUser,
  notifyTeamUsers,
  notifyOrgUsers,
  notifyAll,
  VAPID_PUBLIC_KEY: VAPID_PUBLIC,
};
