const express = require('express');
const { pool } = require('../db');
const { authMiddleware, optionalAuth, canEditTeam, canScoreGame } = require('../auth');
const { normalizeDOB } = require('../utils/dob');
const { sendOpponentRosterAddEmail } = require('../email');

const router = express.Router();

// ── canEditPlayer: team access OR approved guardian claim ──
async function canEditPlayer(user, playerId) {
  if (user.role === 'super_admin') return true;
  // Guardian: check approved claim
  const { rows: claimRows } = await pool.query(
    `SELECT 1 FROM guardian_claims WHERE user_id = $1 AND player_id = $2 AND status = 'approved' LIMIT 1`,
    [user.id, playerId]
  );
  if (claimRows.length) return true;
  // Team access
  const { rows } = await pool.query('SELECT team_id FROM team_players WHERE player_id = $1', [playerId]);
  for (const r of rows) {
    if (await canEditTeam(user, r.team_id)) return true;
  }
  return false;
}

async function notifyOpponentRosterAdd({ teamId, game, addedByUser, playerFirstName, playerLastName, jerseyNumber }) {
  const { rows: coachRows } = await pool.query(
    `SELECT DISTINCT s.email
     FROM staff_members s
     JOIN team_staff_assignments tsa ON tsa.staff_id = s.id
     WHERE tsa.team_id = $1 AND s.email IS NOT NULL AND s.email != ''`,
    [teamId]
  );
  const emails = coachRows.map(r => r.email);
  if (!emails.length) return;

  const opponentTeamId = Number(game.home_team_id) === Number(teamId) ? game.away_team_id : game.home_team_id;
  const { rows: nameRows } = await pool.query(
    `SELECT
       (SELECT name FROM teams WHERE id = $1) AS team_name,
       (SELECT name FROM teams WHERE id = $2) AS opponent_team_name`,
    [teamId, opponentTeamId]
  );
  const teamName = nameRows[0]?.team_name || 'Your team';
  const opponentTeamName = nameRows[0]?.opponent_team_name || 'Opposing team';

  const { rows: senderRows } = await pool.query('SELECT email FROM users WHERE id = $1', [addedByUser.id]);
  const senderEmail = senderRows[0]?.email || null;
  const replyTo = senderEmail ? { email: senderEmail, name: addedByUser.name || addedByUser.username } : undefined;

  await sendOpponentRosterAddEmail(emails, {
    teamName,
    opponentTeamName,
    gameDate: game.game_date,
    addedBy: addedByUser.name || addedByUser.username || 'Unknown',
    playerFirstName,
    playerLastName,
    jerseyNumber,
    replyTo,
  });
}

async function withPositions(player) {
  if (!player) return null;
  const { rows: positions } = await pool.query(
    `SELECT p.id, p.name, p.abbreviation
     FROM positions p
     JOIN player_positions pp ON pp.position_id = p.id
     WHERE pp.player_id = $1`, [player.id]
  );
  return { ...player, positions };
}

// Bulk version: single query for all players instead of N queries
async function withPositionsBulk(players) {
  if (!players.length) return players;
  const ids = players.map(p => p.id);
  const { rows } = await pool.query(
    `SELECT pp.player_id, p.id, p.name, p.abbreviation
     FROM player_positions pp
     JOIN positions p ON p.id = pp.position_id
     WHERE pp.player_id = ANY($1)`, [ids]
  );
  const map = {};
  for (const r of rows) {
    if (!map[r.player_id]) map[r.player_id] = [];
    map[r.player_id].push({ id: r.id, name: r.name, abbreviation: r.abbreviation });
  }
  return players.map(p => ({ ...p, positions: map[p.id] || [] }));
}

// ── GET /players/search — limited-field player search for guardian claim flow ──
// Returns only name, dob year, and team names — no PII (no DOB, email, phone).
// Any authenticated user can call this to find players to claim.
router.get('/search', authMiddleware, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  try {
    const { rows } = await pool.query(
      `SELECT p.id,
              p.first_name,
              p.last_name,
              EXTRACT(YEAR FROM p.date_of_birth::date)::int AS dob_year,
              COALESCE(
                (SELECT string_agg(t.name, ', ')
                 FROM team_players tp JOIN teams t ON t.id = tp.team_id
                 WHERE tp.player_id = p.id),
                ''
              ) AS teams
       FROM players p
       WHERE (p.first_name || ' ' || p.last_name) ILIKE $1
          OR p.last_name ILIKE $1
          OR p.first_name ILIKE $1
       ORDER BY p.last_name, p.first_name
       LIMIT 20`,
      [`%${q}%`]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fields safe to return to unauthenticated public viewers
const PUBLIC_FIELDS = ['id', 'first_name', 'last_name', 'jersey_number', 'grade', 'batting_hand', 'throwing_hand', 'positions', 'teams'];
function toPublic(player) {
  const out = {};
  for (const k of PUBLIC_FIELDS) if (player[k] !== undefined) out[k] = player[k];
  return out;
}

// GET players, optionally filtered by team_id (via team_players junction)
// Unfiltered requests support ?page= and ?limit= (default 200, max 500)
// Public (unauthenticated) callers may fetch a team roster but receive only safe fields.
router.get('/', optionalAuth, async (req, res) => {
  try {
    const user = req.user;
    const { team_id, org_id, search, with_teams } = req.query;

    // Unauthenticated callers may only fetch a specific team's roster
    if (!user && !team_id) return res.status(401).json({ error: 'Authentication required' });

    const page = Math.max(0, parseInt(req.query.page || '0', 10));
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || '200', 10)));
    let result;
    if (team_id) {
      result = await pool.query(
        `SELECT p.*, tp.jersey_number
         FROM players p
         JOIN team_players tp ON tp.player_id = p.id
         WHERE tp.team_id = $1
         ORDER BY p.last_name, p.first_name`, [team_id]
      );
    } else if (org_id) {
      result = await pool.query(
        `SELECT DISTINCT p.*
         FROM players p
         JOIN team_players tp ON tp.player_id = p.id
         JOIN teams t ON t.id = tp.team_id
         WHERE t.org_id = $1
         ORDER BY p.last_name, p.first_name`, [org_id]
      );
    } else if (search) {
      // Search players not on a specific team (for "add existing" flow)
      const q = `%${search}%`;
      result = await pool.query(
        `SELECT * FROM players WHERE first_name ILIKE $1 OR last_name ILIKE $1
         ORDER BY last_name, first_name LIMIT 50`, [q]
      );
    } else {
      result = await pool.query(
        'SELECT * FROM players ORDER BY last_name, first_name LIMIT $1 OFFSET $2',
        [limit, page * limit]
      );
    }
    let players = await withPositionsBulk(result.rows);

    // Enrich with primary guardian contact info
    const allPlayerIds = players.map(p => p.id);
    if (allPlayerIds.length) {
      const { rows: contacts } = await pool.query(
        `SELECT DISTINCT ON (pg.player_id) pg.player_id, g.first_name AS contact_first_name,
                g.last_name AS contact_last_name, g.email, g.phone
         FROM player_guardians pg
         JOIN guardians g ON g.id = pg.guardian_id
         WHERE pg.player_id = ANY($1)
         ORDER BY pg.player_id, pg.is_primary DESC, pg.id ASC`, [allPlayerIds]
      );
      const contactMap = {};
      for (const c of contacts) contactMap[c.player_id] = c;
      players = players.map(p => {
        const c = contactMap[p.id];
        return {
          ...p,
          parent_email: p.email || c?.email || p.parent_email || null,
          parent_phone: p.phone || c?.phone || p.parent_phone || null,
        };
      });
    }

    // Optionally include team assignments for each player
    if (with_teams === 'true') {
      const playerIds = players.map(p => p.id);
      if (playerIds.length) {
        const { rows: teamRows } = await pool.query(
          `SELECT tp.player_id, t.id AS team_id, t.name AS team_name, t.org_id,
                  o.name AS org_name, tp.jersey_number
           FROM team_players tp
           JOIN teams t ON t.id = tp.team_id
           LEFT JOIN organizations o ON o.id = t.org_id
           WHERE tp.player_id = ANY($1)
           ORDER BY t.name`, [playerIds]
        );
        const teamMap = {};
        for (const tr of teamRows) {
          if (!teamMap[tr.player_id]) teamMap[tr.player_id] = [];
          teamMap[tr.player_id].push(tr);
        }
        players = players.map(p => ({ ...p, teams: teamMap[p.id] || [] }));
      } else {
        players = players.map(p => ({ ...p, teams: [] }));
      }
    }

    // Strip PII for unauthenticated (public site) callers
    if (!user) players = players.map(toPublic);

    res.json(players);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update jersey number for a player on a specific team
router.put('/jersey', authMiddleware, async (req, res) => {
  try {
    const { team_id, player_id, jersey_number } = req.body;
    if (!team_id || !player_id) return res.status(400).json({ error: 'team_id and player_id are required' });
    if (!(await canEditTeam(req.user, team_id))) return res.status(403).json({ error: 'No permission for this team' });

    await pool.query(
      'UPDATE team_players SET jersey_number = $1 WHERE team_id = $2 AND player_id = $3',
      [jersey_number || null, team_id, player_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM players WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });
    // Also get the teams this player is on
    const { rows: teams } = await pool.query(
      `SELECT t.id, t.name, t.org_id, tp.jersey_number
       FROM teams t JOIN team_players tp ON tp.team_id = t.id
       WHERE tp.player_id = $1 ORDER BY t.name`, [req.params.id]
    );
    const player = await withPositions(rows[0]);
    res.json({ ...player, teams });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new player and optionally assign to a team
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { team_id, game_id, first_name, last_name, jersey_number, date_of_birth,
            batting_hand, throwing_hand, parent_email, parent_phone, grade, position_ids, contacts,
            jersey_size, hat_size, needs_new_jersey, needs_new_hat,
            email: playerEmail, phone: playerPhone } = req.body;

    if (!jersey_number) {
      return res.status(400).json({ error: 'jersey_number is required' });
    }

    const final_first_name = first_name || 'Player';
    const final_last_name = last_name || `#${jersey_number}`;

    // If assigning to a team, check permission. When the user lacks direct edit
    // permission on the team, allow the add only if it is performed in the
    // context of a game in which they are an authorized scorer for the
    // opposing team. We notify the affected team's coaches afterwards.
    let crossTeamGame = null;
    if (team_id) {
      const hasTeamPerm = await canEditTeam(req.user, team_id);
      if (!hasTeamPerm) {
        if (game_id) {
          const { rows: gameRows } = await pool.query(
            'SELECT id, home_team_id, away_team_id, game_date FROM games WHERE id = $1',
            [game_id]
          );
          const g = gameRows[0];
          const teamIsInGame = g && [Number(g.home_team_id), Number(g.away_team_id)].includes(Number(team_id));
          if (g && teamIsInGame && (await canScoreGame(req.user, g.home_team_id, g.away_team_id))) {
            crossTeamGame = g;
          }
        }
        if (!crossTeamGame) return res.status(403).json({ error: 'No permission for this team' });
      }
      const { rows: teamCheck } = await client.query('SELECT id FROM teams WHERE id = $1', [team_id]);
      if (!teamCheck.length) return res.status(400).json({ error: 'Team not found' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO players (first_name, last_name, date_of_birth, batting_hand, throwing_hand, parent_email, parent_phone, grade, jersey_size, hat_size, needs_new_jersey, needs_new_hat, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [final_first_name, final_last_name, normalizeDOB(date_of_birth), batting_hand || null, throwing_hand || null,
       parent_email || null, parent_phone || null, grade || null,
       jersey_size || null, hat_size || null, !!needs_new_jersey, !!needs_new_hat,
       playerEmail || null, playerPhone || null]
    );
    const playerId = rows[0].id;

    // Assign to team if provided
    if (team_id) {
      await client.query(
        'INSERT INTO team_players (team_id, player_id, jersey_number) VALUES ($1, $2, $3)',
        [team_id, playerId, jersey_number || null]
      );
    }

    if (Array.isArray(position_ids)) {
      for (const posId of position_ids) {
        await client.query('INSERT INTO player_positions (player_id, position_id) VALUES ($1, $2)', [playerId, posId]);
      }
    }

    // Save contacts as guardians
    if (Array.isArray(contacts)) {
      for (const c of contacts) {
        if (!c.first_name || !c.last_name) continue;
        // Find or create guardian
        let guardianId;
        if (c.email) {
          const { rows: byEmail } = await client.query('SELECT id FROM guardians WHERE LOWER(email) = LOWER($1) LIMIT 1', [c.email.trim()]);
          if (byEmail.length) guardianId = byEmail[0].id;
        }
        if (!guardianId) {
          const { rows: created } = await client.query(
            'INSERT INTO guardians (first_name, last_name, email, phone) VALUES ($1, $2, $3, $4) RETURNING id',
            [c.first_name.trim(), c.last_name.trim(), c.email || null, c.phone || null]
          );
          guardianId = created[0].id;
        }
        if (c.is_primary) {
          await client.query('UPDATE player_guardians SET is_primary = FALSE WHERE player_id = $1', [playerId]);
        }
        await client.query(
          `INSERT INTO player_guardians (player_id, guardian_id, relationship, is_primary)
           VALUES ($1, $2, $3, $4) ON CONFLICT (player_id, guardian_id) DO UPDATE SET relationship = $3, is_primary = $4`,
          [playerId, guardianId, c.relationship || 'parent', c.is_primary || false]
        );
      }
    }

    await client.query('COMMIT');

    const { rows: playerRows } = await pool.query('SELECT * FROM players WHERE id = $1', [playerId]);
    const player = await withPositions(playerRows[0]);
    // Include jersey_number in the response for convenience
    res.status(201).json({ ...player, jersey_number: jersey_number || null });

    if (crossTeamGame) {
      notifyOpponentRosterAdd({
        teamId: Number(team_id),
        game: crossTeamGame,
        addedByUser: req.user,
        playerFirstName: final_first_name,
        playerLastName: final_last_name,
        jerseyNumber: jersey_number,
      }).catch(err => console.error('[opponent roster add notify]', err));
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Update player details (personal info + positions)
router.put('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { rows: existingRows } = await client.query('SELECT * FROM players WHERE id = $1', [id]);
    if (!existingRows.length) return res.status(404).json({ error: 'Player not found' });
    const existing = existingRows[0];

    // Permission: user must be able to edit at least one team this player is on
    const { rows: teamRows } = await client.query('SELECT team_id FROM team_players WHERE player_id = $1', [id]);
    let hasPermission = req.user.role === 'super_admin';
    if (!hasPermission) {
      for (const tr of teamRows) {
        if (await canEditTeam(req.user, tr.team_id)) { hasPermission = true; break; }
      }
    }
    if (!hasPermission) return res.status(403).json({ error: 'No permission to edit this player' });

    const { first_name, last_name, date_of_birth, batting_hand, throwing_hand,
            parent_email, parent_phone, grade, position_ids,
            team_id, jersey_number,
            jersey_size, hat_size, needs_new_jersey, needs_new_hat,
            email: playerEmail, phone: playerPhone } = req.body;

    await client.query('BEGIN');

    await client.query(
      `UPDATE players SET
        first_name = $1, last_name = $2,
        date_of_birth = $3, batting_hand = $4, throwing_hand = $5,
        parent_email = $6, parent_phone = $7, grade = $8,
        jersey_size = $9, hat_size = $10, needs_new_jersey = $11, needs_new_hat = $12,
        email = $14, phone = $15,
        updated_at = NOW()
       WHERE id = $13`,
      [
        first_name ?? existing.first_name,
        last_name ?? existing.last_name,
        date_of_birth != null ? (normalizeDOB(date_of_birth) ?? existing.date_of_birth) : existing.date_of_birth,
        batting_hand ?? existing.batting_hand,
        throwing_hand ?? existing.throwing_hand,
        parent_email ?? existing.parent_email,
        parent_phone ?? existing.parent_phone,
        grade ?? existing.grade,
        jersey_size !== undefined ? (jersey_size || null) : existing.jersey_size,
        hat_size !== undefined ? (hat_size || null) : existing.hat_size,
        needs_new_jersey !== undefined ? !!needs_new_jersey : existing.needs_new_jersey,
        needs_new_hat !== undefined ? !!needs_new_hat : existing.needs_new_hat,
        id,
        playerEmail !== undefined ? (playerEmail || null) : existing.email,
        playerPhone !== undefined ? (playerPhone || null) : existing.phone,
      ]
    );

    // Update jersey number for a specific team assignment
    if (team_id && jersey_number !== undefined) {
      await client.query(
        'UPDATE team_players SET jersey_number = $1 WHERE team_id = $2 AND player_id = $3',
        [jersey_number || null, team_id, id]
      );
    }

    if (Array.isArray(position_ids)) {
      await client.query('DELETE FROM player_positions WHERE player_id = $1', [id]);
      for (const posId of position_ids) {
        await client.query('INSERT INTO player_positions (player_id, position_id) VALUES ($1, $2)', [id, posId]);
      }
    }

    await client.query('COMMIT');

    const { rows: playerRows } = await pool.query('SELECT * FROM players WHERE id = $1', [id]);
    const player = await withPositions(playerRows[0]);
    // If team context was provided, include the jersey number
    if (team_id) {
      const { rows: tp } = await pool.query('SELECT jersey_number FROM team_players WHERE team_id = $1 AND player_id = $2', [team_id, id]);
      player.jersey_number = tp[0]?.jersey_number ?? null;
    }
    res.json(player);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Delete a player entirely
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id FROM players WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });

    // Permission: must be admin or can edit at least one team
    const { rows: teamRows } = await pool.query('SELECT team_id FROM team_players WHERE player_id = $1', [id]);
    let hasPermission = req.user.role === 'super_admin';
    if (!hasPermission) {
      for (const tr of teamRows) {
        if (await canEditTeam(req.user, tr.team_id)) { hasPermission = true; break; }
      }
    }
    if (!hasPermission) return res.status(403).json({ error: 'No permission to delete this player' });

    await pool.query('DELETE FROM players WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Team-Player Assignment Routes ──

// Add an existing player to a team
router.post('/assign', authMiddleware, async (req, res) => {
  try {
    const { team_id, player_id, jersey_number } = req.body;
    if (!team_id || !player_id) return res.status(400).json({ error: 'team_id and player_id are required' });
    if (!(await canEditTeam(req.user, team_id))) return res.status(403).json({ error: 'No permission for this team' });

    const { rows: playerCheck } = await pool.query('SELECT id FROM players WHERE id = $1', [player_id]);
    if (!playerCheck.length) return res.status(404).json({ error: 'Player not found' });

    await pool.query(
      'INSERT INTO team_players (team_id, player_id, jersey_number) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [team_id, player_id, jersey_number || null]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove a player from a team (does not delete the player)
router.post('/unassign', authMiddleware, async (req, res) => {
  try {
    const { team_id, player_id } = req.body;
    if (!team_id || !player_id) return res.status(400).json({ error: 'team_id and player_id are required' });
    if (!(await canEditTeam(req.user, team_id))) return res.status(403).json({ error: 'No permission for this team' });

    await pool.query('DELETE FROM team_players WHERE team_id = $1 AND player_id = $2', [team_id, player_id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
module.exports.canEditPlayer = canEditPlayer;
