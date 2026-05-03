const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../auth');
const { notifyUser } = require('../push');
const { sendGuardianClaimApprovedEmail, sendGuardianClaimDeniedEmail } = require('../email');

const router = express.Router();

// ── Helpers ──

function isAdmin(user) {
  return ['super_admin', 'org_admin'].includes(user.role);
}

const CLAIM_SELECT = `
  SELECT gc.id, gc.status, gc.notes, gc.created_at, gc.reviewed_at,
         gc.user_id, u.name AS user_name, u.email AS user_email,
         gc.player_id,
         p.first_name || ' ' || p.last_name AS player_name,
         p.date_of_birth,
         gc.reviewed_by,
         ru.name AS reviewed_by_name,
         (
           SELECT string_agg(t.name, ', ')
           FROM team_players tp JOIN teams t ON t.id = tp.team_id
           WHERE tp.player_id = gc.player_id
         ) AS player_teams
  FROM guardian_claims gc
  JOIN users u ON u.id = gc.user_id
  JOIN players p ON p.id = gc.player_id
  LEFT JOIN users ru ON ru.id = gc.reviewed_by
`;

// ── POST /guardian-claims — submit a new claim ──
// Allowed for any authenticated user (guardian registers first, then claims)
router.post('/', authMiddleware, async (req, res) => {
  const { player_id } = req.body;
  if (!player_id) return res.status(400).json({ error: 'player_id is required' });

  try {
    // Verify the player exists
    const { rows: pRows } = await pool.query(
      'SELECT id, first_name, last_name FROM players WHERE id = $1', [player_id]
    );
    if (!pRows.length) return res.status(404).json({ error: 'Player not found' });

    // Check for existing open claim from this user for this player
    const { rows: existing } = await pool.query(
      `SELECT id, status FROM guardian_claims WHERE user_id = $1 AND player_id = $2`,
      [req.user.id, player_id]
    );
    if (existing.length) {
      const ex = existing[0];
      if (ex.status === 'approved') return res.status(409).json({ error: 'You already have access to this player' });
      if (ex.status === 'pending') return res.status(409).json({ error: 'You already have a pending claim for this player' });
      // denied — allow re-submit
      await pool.query(
        `UPDATE guardian_claims SET status = 'pending', notes = NULL, reviewed_by = NULL, reviewed_at = NULL, created_at = NOW()
         WHERE id = $1`, [ex.id]
      );
      const { rows } = await pool.query(`${CLAIM_SELECT} WHERE gc.id = $1`, [ex.id]);
      return res.status(200).json(rows[0]);
    }

    const { rows } = await pool.query(
      `INSERT INTO guardian_claims (user_id, player_id) VALUES ($1, $2) RETURNING id`,
      [req.user.id, player_id]
    );
    const { rows: full } = await pool.query(`${CLAIM_SELECT} WHERE gc.id = $1`, [rows[0].id]);
    res.status(201).json(full[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /guardian-claims/mine — authenticated user's own claims ──
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`${CLAIM_SELECT} WHERE gc.user_id = $1 ORDER BY gc.created_at DESC`, [req.user.id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /guardian-claims — admin: list all claims (optionally filtered by status) ──
router.get('/', authMiddleware, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin access required' });

  const { status } = req.query;
  try {
    let sql = `${CLAIM_SELECT}`;
    const params = [];
    if (status) {
      sql += ` WHERE gc.status = $1`;
      params.push(status);
    }
    sql += ` ORDER BY gc.status = 'pending' DESC, gc.created_at DESC`;
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /guardian-claims/pending-count — admin: unreviewed count for badge ──
router.get('/pending-count', authMiddleware, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin access required' });
  try {
    const { rows } = await pool.query(`SELECT COUNT(*) AS count FROM guardian_claims WHERE status = 'pending'`);
    res.json({ count: parseInt(rows[0].count, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /guardian-claims/:id — admin: approve or deny ──
router.patch('/:id', authMiddleware, async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin access required' });

  const { id } = req.params;
  const { action, notes } = req.body; // action: 'approve' | 'deny'
  if (!['approve', 'deny'].includes(action)) {
    return res.status(400).json({ error: 'action must be "approve" or "deny"' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: claimRows } = await client.query(
      `${CLAIM_SELECT} WHERE gc.id = $1`, [id]
    );
    if (!claimRows.length) return res.status(404).json({ error: 'Claim not found' });
    const claim = claimRows[0];

    const newStatus = action === 'approve' ? 'approved' : 'denied';
    await client.query(
      `UPDATE guardian_claims SET status = $1, notes = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $4`,
      [newStatus, notes || null, req.user.id, id]
    );

    if (action === 'approve') {
      // Upsert guardian record linked to this user
      const { rows: gRows } = await client.query(
        `SELECT id FROM guardians WHERE user_id = $1 LIMIT 1`, [claim.user_id]
      );
      let guardianId;
      if (gRows.length) {
        guardianId = gRows[0].id;
      } else {
        // Split name for new guardian record (name column from users)
        const nameParts = (claim.user_name || '').trim().split(/\s+/);
        const firstName = nameParts[0] || claim.user_name;
        const lastName = nameParts.slice(1).join(' ') || '';
        const { rows: newG } = await client.query(
          `INSERT INTO guardians (user_id, first_name, last_name, email) VALUES ($1, $2, $3, $4) RETURNING id`,
          [claim.user_id, firstName, lastName, claim.user_email]
        );
        guardianId = newG[0].id;
      }

      // Link guardian → player if not already
      await client.query(
        `INSERT INTO player_guardians (player_id, guardian_id, relationship, is_primary)
         VALUES ($1, $2, 'parent', FALSE)
         ON CONFLICT (player_id, guardian_id) DO NOTHING`,
        [claim.player_id, guardianId]
      );
    }

    await client.query('COMMIT');

    // Fire email + push (non-blocking)
    const { rows: userRows } = await pool.query(
      'SELECT name, email FROM users WHERE id = $1', [claim.user_id]
    );
    const userInfo = userRows[0];
    if (userInfo?.email) {
      if (action === 'approve') {
        sendGuardianClaimApprovedEmail(userInfo.email, userInfo.name, claim.player_name).catch(() => {});
      } else {
        sendGuardianClaimDeniedEmail(userInfo.email, userInfo.name, claim.player_name, notes).catch(() => {});
      }
    }
    notifyUser(claim.user_id, {
      title: action === 'approve' ? 'Claim Approved!' : 'Claim Update',
      body: action === 'approve'
        ? `Your claim for ${claim.player_name} has been approved. You now have access to their profile.`
        : `Your claim for ${claim.player_name} was not approved.${notes ? ' Reason: ' + notes : ''}`,
      url: '/',
    }).catch(() => {});

    const { rows: updated } = await pool.query(`${CLAIM_SELECT} WHERE gc.id = $1`, [id]);
    res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ── DELETE /guardian-claims/:id — user can withdraw own pending claim; admin can delete any ──
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM guardian_claims WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Claim not found' });
    const claim = rows[0];
    if (claim.user_id !== req.user.id && !isAdmin(req.user)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await pool.query('DELETE FROM guardian_claims WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
