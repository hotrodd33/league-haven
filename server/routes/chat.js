const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../auth');
const { notifyUser } = require('../push');

const Pusher = require('pusher');

const router = express.Router();

// ── Pusher pub/sub ────────────────────────────────────────────────
// Replaces the in-memory SSE channelSubs map. Works across multiple
// Vercel instances (stateless) and is not subject to function timeouts.
const pusher = new Pusher({
  appId:   process.env.PUSHER_APP_ID,
  key:     process.env.PUSHER_KEY,
  secret:  process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS:  true,
});

function publishToChannel(channelId, data) {
  // Fire-and-forget — don't block the HTTP response
  pusher.trigger(`chat-channel-${channelId}`, 'new-message', data).catch(err => {
    console.error('Pusher trigger error:', err.message);
  });
}

// All chat routes require authentication
router.use(authMiddleware);

// ── Helpers ──────────────────────────────────────────────────────

// Returns true if the user can access the given channel.
async function canAccessChannel(userId, channelId, role) {
  if (role === 'super_admin') return true;
  const { rows } = await pool.query(
    `SELECT 1 FROM chat_channel_members WHERE channel_id = $1 AND user_id = $2`,
    [channelId, userId]
  );
  return rows.length > 0;
}

// Ensures a team channel exists (creates + populates members if not).
async function ensureTeamChannel(teamId) {
  await pool.query(
    `INSERT INTO chat_channels (type, team_id, name)
     VALUES ('team', $1, (SELECT name FROM teams WHERE id = $1))
     ON CONFLICT DO NOTHING`,
    [teamId]
  );
  const { rows } = await pool.query(
    `SELECT id FROM chat_channels WHERE type = 'team' AND team_id = $1`,
    [teamId]
  );
  const channelId = rows[0]?.id;
  if (!channelId) return null;

  // Add all users with permission on this team as members (including guardians with approved claims)
  await pool.query(
    `INSERT INTO chat_channel_members (channel_id, user_id)
     SELECT $1, sub.user_id FROM (
       SELECT user_id FROM user_permissions WHERE team_id = $2 AND is_active = TRUE
       UNION
       SELECT gc.user_id FROM guardian_claims gc
         JOIN team_players tp ON tp.player_id = gc.player_id
         WHERE tp.team_id = $2 AND gc.status = 'approved'
     ) sub
     ON CONFLICT DO NOTHING`,
    [channelId, teamId]
  );
  return channelId;
}

// ── GET /api/chat/channels — list channels the user is a member of ──
router.get('/channels', async (req, res) => {
  const userId = req.user.id;
  const isSuperAdmin = req.user.role === 'super_admin';
  try {
    // Optimized: LATERAL joins instead of correlated subqueries (one index scan per channel,
    // not N separate subquery executions). No ensureTeamChannel on the read path —
    // team access is derived from user_permissions directly, eliminating all writes on GET.
    //
    // Super admin: sees all DM channels + any channel (team/org) that has at least one message.
    // Regular user: sees DM channels they're an explicit member of, plus team channels where
    //   they have user_permissions (or approved guardian_claims), provided messages exist.
    const whereClause = isSuperAdmin
      ? `WHERE cc.type = 'direct' OR lm.created_at IS NOT NULL`
      : `WHERE
           (cc.type = 'direct' AND ccm.channel_id IS NOT NULL)
           OR (
             cc.type = 'team'
             AND lm.created_at IS NOT NULL
             AND (
               ccm.channel_id IS NOT NULL
               OR EXISTS (
                 SELECT 1 FROM user_permissions
                 WHERE user_id = $1 AND team_id = cc.team_id AND is_active = TRUE
                 UNION ALL
                 SELECT 1 FROM guardian_claims gc
                   JOIN team_players tp ON tp.player_id = gc.player_id
                   WHERE gc.user_id = $1 AND tp.team_id = cc.team_id AND gc.status = 'approved'
               )
             )
           )`;

    const { rows } = await pool.query(
      `SELECT
         cc.id, cc.type, cc.name, cc.team_id, cc.org_id,
         ccm.last_read_at,
         lm.body        AS last_message,
         lm.created_at  AS last_message_at,
         COALESCE(unread.cnt, 0) AS unread_count,
         CASE WHEN cc.type = 'direct' THEN other.name END AS other_user_name
       FROM chat_channels cc
       LEFT JOIN chat_channel_members ccm
              ON ccm.channel_id = cc.id AND ccm.user_id = $1
       LEFT JOIN LATERAL (
         SELECT body, created_at FROM chat_messages
         WHERE channel_id = cc.id AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 1
       ) lm ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS cnt FROM chat_messages
         WHERE channel_id = cc.id
           AND deleted_at IS NULL
           AND (ccm.last_read_at IS NULL OR created_at > ccm.last_read_at)
       ) unread ON TRUE
       LEFT JOIN LATERAL (
         SELECT u.name FROM chat_channel_members m2
         JOIN users u ON u.id = m2.user_id
         WHERE m2.channel_id = cc.id AND m2.user_id <> $1
         LIMIT 1
       ) other ON cc.type = 'direct'
       ${whereClause}
       ORDER BY lm.created_at DESC NULLS LAST`,
      [userId]
    );
    return res.json(rows);
  } catch (err) {
    console.error('GET /chat/channels error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/chat/unread-count — total unread messages across all channels ──
router.get('/unread-count', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(
         (SELECT COUNT(*) FROM chat_messages cm
          WHERE cm.channel_id = cc.id
            AND cm.deleted_at IS NULL
            AND (ccm.last_read_at IS NULL OR cm.created_at > ccm.last_read_at)
         )
       ), 0) AS count
       FROM chat_channels cc
       JOIN chat_channel_members ccm ON ccm.channel_id = cc.id AND ccm.user_id = $1`,
      [req.user.id]
    );
    res.json({ count: Number(rows[0].count) });
  } catch (err) {
    console.error('GET /chat/unread-count error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/chat/dm — find or create a direct message channel ──
router.post('/dm', async (req, res) => {
  const { other_user_id } = req.body;
  if (!other_user_id) return res.status(400).json({ error: 'other_user_id required' });
  const meId = req.user.id;
  if (Number(other_user_id) === meId) return res.status(400).json({ error: 'Cannot DM yourself' });

  try {
    // Look for existing DM channel with exactly these two members
    const { rows: existing } = await pool.query(
      `SELECT cc.id FROM chat_channels cc
       JOIN chat_channel_members m1 ON m1.channel_id = cc.id AND m1.user_id = $1
       JOIN chat_channel_members m2 ON m2.channel_id = cc.id AND m2.user_id = $2
       WHERE cc.type = 'direct'
         AND (SELECT COUNT(*) FROM chat_channel_members WHERE channel_id = cc.id) = 2
       LIMIT 1`,
      [meId, other_user_id]
    );
    if (existing.length) {
      return res.json({ channel_id: existing[0].id });
    }

    // Create new DM channel
    const { rows: [ch] } = await pool.query(
      `INSERT INTO chat_channels (type) VALUES ('direct') RETURNING id`
    );
    await pool.query(
      `INSERT INTO chat_channel_members (channel_id, user_id) VALUES ($1, $2), ($1, $3)`,
      [ch.id, meId, other_user_id]
    );
    res.status(201).json({ channel_id: ch.id });
  } catch (err) {
    console.error('POST /chat/dm error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/chat/dm-users — users this person can DM ──
router.get('/dm-users', async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'super_admin') {
      // Super admin can DM anyone
      ({ rows } = await pool.query(
        `SELECT id, name, username, role
         FROM users
         WHERE id <> $1 AND approval_status = 'approved'
         ORDER BY name`,
        [req.user.id]
      ));
    } else {
      ({ rows } = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.username, u.role
         FROM users u
         JOIN user_permissions up ON up.user_id = u.id
         WHERE up.team_id IN (
           SELECT team_id FROM user_permissions WHERE user_id = $1 AND is_active = TRUE
         )
         AND u.id <> $1
         AND u.approval_status = 'approved'
         ORDER BY u.name`,
        [req.user.id]
      ));
    }
    res.json(rows);
  } catch (err) {
    console.error('GET /chat/dm-users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/chat/teams — teams the current user can start a team chat with ──
router.get('/teams', async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'super_admin') {
      ({ rows } = await pool.query(`SELECT id, name FROM teams ORDER BY name`));
    } else {
      ({ rows } = await pool.query(
        `SELECT DISTINCT t.id, t.name
         FROM teams t
         JOIN user_permissions up ON up.team_id = t.id
         WHERE up.user_id = $1 AND up.is_active = TRUE
         ORDER BY t.name`,
        [req.user.id]
      ));
    }
    res.json(rows);
  } catch (err) {
    console.error('GET /chat/teams error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/chat/team-channel — find or create a team channel ──
router.post('/team-channel', async (req, res) => {
  const { team_id } = req.body;
  if (!team_id) return res.status(400).json({ error: 'team_id required' });
  try {
    const channelId = await ensureTeamChannel(Number(team_id));
    if (!channelId) return res.status(404).json({ error: 'Team not found' });
    // Ensure the requesting user is a member (super_admin may not be in user_permissions)
    await pool.query(
      `INSERT INTO chat_channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [channelId, req.user.id]
    );
    res.json({ channel_id: channelId });
  } catch (err) {
    console.error('POST /chat/team-channel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SSE endpoint removed — replaced by Pusher (see publishToChannel above)

// ── GET /api/chat/channels/:id/messages — paginated message history ──
router.get('/channels/:id/messages', async (req, res) => {
  const channelId = Number(req.params.id);
  if (!Number.isFinite(channelId)) return res.status(400).json({ error: 'Invalid channel id' });

  if (!await canAccessChannel(req.user.id, channelId, req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = req.query.before; // ISO timestamp — load older messages
  const after  = req.query.after;  // ISO timestamp — incremental poll (new messages only)

  try {
    const MSG_SELECT = `
      SELECT cm.*,
        u.name AS sender_name, u.username AS sender_username,
        reply.body AS reply_body,
        reply_u.name AS reply_sender_name
      FROM chat_messages cm
      JOIN users u ON u.id = cm.sender_id
      LEFT JOIN chat_messages reply ON reply.id = cm.reply_to_id
      LEFT JOIN users reply_u ON reply_u.id = reply.sender_id`;

    if (after) {
      // Incremental poll: return ONLY new messages, ASC so client can append directly.
      // Returns [] when nothing is new — minimal payload, minimal DB work.
      const { rows } = await pool.query(
        `${MSG_SELECT}
         WHERE cm.channel_id = $1
           AND cm.deleted_at IS NULL
           AND cm.created_at > $2::timestamptz
         ORDER BY cm.created_at ASC
         LIMIT $3`,
        [channelId, after, limit]
      );
      return res.json(rows);
    }

    if (before) {
      // Paginate backwards for "load older" button.
      const { rows } = await pool.query(
        `${MSG_SELECT}
         WHERE cm.channel_id = $1
           AND cm.deleted_at IS NULL
           AND cm.created_at < $2::timestamptz
         ORDER BY cm.created_at DESC
         LIMIT $3`,
        [channelId, before, limit]
      );
      return res.json(rows.reverse());
    }

    // Initial load: latest N messages, oldest-first.
    const { rows } = await pool.query(
      `${MSG_SELECT}
       WHERE cm.channel_id = $1
         AND cm.deleted_at IS NULL
       ORDER BY cm.created_at DESC
       LIMIT $2`,
      [channelId, limit]
    );
    return res.json(rows.reverse());
  } catch (err) {
    console.error('GET /chat/channels/:id/messages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/chat/channels/:id/messages — send a message ──
router.post('/channels/:id/messages', async (req, res) => {
  const channelId = Number(req.params.id);
  if (!Number.isFinite(channelId)) return res.status(400).json({ error: 'Invalid channel id' });

  if (!await canAccessChannel(req.user.id, channelId, req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Auto-join super_admin to the channel so read-tracking works
  if (req.user.role === 'super_admin') {
    await pool.query(
      `INSERT INTO chat_channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [channelId, req.user.id]
    );
  }

  const { body, reply_to_id } = req.body;
  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return res.status(400).json({ error: 'Message body is required' });
  }
  if (body.length > 4000) {
    return res.status(400).json({ error: 'Message too long (max 4000 characters)' });
  }

  // Validate reply_to_id if provided
  if (reply_to_id) {
    const { rows: replyRows } = await pool.query(
      `SELECT 1 FROM chat_messages WHERE id = $1 AND channel_id = $2 AND deleted_at IS NULL`,
      [reply_to_id, channelId]
    );
    if (!replyRows.length) return res.status(400).json({ error: 'Reply target not found in this channel' });
  }

  try {
    const { rows: [msg] } = await pool.query(
      `INSERT INTO chat_messages (channel_id, sender_id, body, reply_to_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [channelId, req.user.id, body.trim(), reply_to_id || null]
    );
    // Add sender name for immediate use by client
    const fullMsg = {
      ...msg,
      sender_name: req.user.name,
      sender_username: req.user.username,
    };
    res.status(201).json(fullMsg);

    // Push to any open SSE connections for this channel instantly (no poll wait)
    publishToChannel(channelId, fullMsg);

    // Fire-and-forget push notifications.
    // Combines explicit chat_channel_members AND user_permissions for team channels
    // so that users who joined a team after the channel was last bootstrapped still receive pushes.
    pool.query(
      `SELECT DISTINCT r.user_id
       FROM (
         -- Explicit channel members
         SELECT ccm.user_id
         FROM chat_channel_members ccm
         JOIN users u ON u.id = ccm.user_id
         WHERE ccm.channel_id = $1
           AND (u.notification_prefs IS NULL OR (u.notification_prefs->>'chat_message')::boolean IS NOT FALSE)
         UNION
         -- Team channel members via user_permissions (catches new members not yet in chat_channel_members)
         SELECT up.user_id
         FROM chat_channels cc
         JOIN user_permissions up ON up.team_id = cc.team_id AND up.is_active = TRUE
         JOIN users u ON u.id = up.user_id
         WHERE cc.id = $1 AND cc.type = 'team'
           AND (u.notification_prefs IS NULL OR (u.notification_prefs->>'chat_message')::boolean IS NOT FALSE)
       ) r
       WHERE r.user_id <> $2`,
      [channelId, req.user.id]
    ).then(({ rows }) => {
      const senderName = req.user.name || req.user.username;
      const preview = body.trim().slice(0, 100);
      rows.forEach(r => notifyUser(r.user_id, {
        title: senderName,
        body: preview,
        tag: `chat-${channelId}`,
        url: `/?page=chat&channelId=${channelId}`,
        data: { page: 'chat', channelId },
      }).catch(() => {}));
    }).catch(() => {});
  } catch (err) {
    console.error('POST /chat/channels/:id/messages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/chat/channels/:id/read — mark channel as read ──
router.post('/channels/:id/read', async (req, res) => {
  const channelId = Number(req.params.id);
  if (!Number.isFinite(channelId)) return res.status(400).json({ error: 'Invalid channel id' });

  if (!await canAccessChannel(req.user.id, channelId, req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    // Upsert membership for super_admin who may not be a formal member yet
    await pool.query(
      `INSERT INTO chat_channel_members (channel_id, user_id, last_read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (channel_id, user_id) DO UPDATE SET last_read_at = NOW()`,
      [channelId, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /chat/channels/:id/read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/chat/messages/:id — edit a message ──
router.put('/messages/:id', async (req, res) => {
  const msgId = Number(req.params.id);
  if (!Number.isFinite(msgId)) return res.status(400).json({ error: 'Invalid message id' });

  const { body } = req.body;
  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return res.status(400).json({ error: 'Message body required' });
  }
  if (body.length > 4000) return res.status(400).json({ error: 'Message too long' });

  try {
    const { rows } = await pool.query(
      `UPDATE chat_messages SET body = $1, edited_at = NOW()
       WHERE id = $2 AND sender_id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [body.trim(), msgId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Message not found or not yours' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /chat/messages/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/chat/messages/:id — soft-delete a message ──
router.delete('/messages/:id', async (req, res) => {
  const msgId = Number(req.params.id);
  if (!Number.isFinite(msgId)) return res.status(400).json({ error: 'Invalid message id' });

  try {
    // Sender or admin/super_admin can delete
    const isAdmin = ['super_admin', 'org_admin'].includes(req.user.role);
    const whereClause = isAdmin
      ? `WHERE id = $1 AND deleted_at IS NULL`
      : `WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL`;
    const params = isAdmin ? [msgId] : [msgId, req.user.id];

    const { rows } = await pool.query(
      `UPDATE chat_messages SET deleted_at = NOW() ${whereClause} RETURNING id`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Message not found or not yours' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /chat/messages/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
