const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireRole, getUserPermissions } = require('../auth');
const cache = require('../cache');

const router = express.Router();
const TOURNEY_TTL = 60_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function nearestPowerOf2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function roundNames(numRounds) {
  if (numRounds === 1) return ['Final'];
  if (numRounds === 2) return ['Semifinals', 'Final'];
  if (numRounds === 3) return ['Quarterfinals', 'Semifinals', 'Final'];
  const names = [];
  for (let i = 1; i <= numRounds - 3; i++) names.push(`Round ${i}`);
  names.push('Quarterfinals', 'Semifinals', 'Final');
  return names;
}

async function canManageTournament(user, tournamentOrgId) {
  if (user.role === 'super_admin') return true;
  if (user.role !== 'org_admin') return false;
  const perms = await getUserPermissions(user.id);
  return perms.org_ids.includes(Number(tournamentOrgId));
}

function enrichTeam(tt, teamRow) {
  if (!tt) return null;
  const name = tt.is_temp
    ? tt.temp_name
    : (teamRow
        ? (teamRow.team_city
            ? [teamRow.team_city, teamRow.team_mascot, teamRow.team_color, teamRow.age_group, teamRow.level].filter(Boolean).join(' ')
            : teamRow.name)
        : '(Deleted Team)');
  const cityWords = (teamRow?.team_city || '').trim().split(/\s+/);
  const cityAbbr = teamRow?.team_city
    ? (cityWords.length > 1 ? cityWords.map(w => w[0]).join('') : teamRow.team_city.substring(0, 3)).toUpperCase()
    : null;
  return {
    id: tt.id,
    team_id: tt.team_id,
    name,
    seed: tt.seed,
    is_temp: tt.is_temp,
    logo: teamRow?.logo_url || teamRow?.org_logo || null,
    org_id: teamRow?.org_id || null,
    age_group: teamRow?.age_group || null,
    level: teamRow?.level || null,
    primary_color: teamRow?.primary_color || null,
    secondary_color: teamRow?.secondary_color || null,
    city_abbr: cityAbbr,
  };
}

// ── GET / — list tournaments ─────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { org_id } = req.query;
    const cacheKey = `tournaments:list:${org_id || ''}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    let sql = `
      SELECT t.*, o.name AS org_name, u.name AS created_by_name,
        (SELECT COUNT(*)::int FROM tournament_teams tt WHERE tt.tournament_id = t.id) AS enrolled_count
      FROM tournaments t
      LEFT JOIN organizations o ON o.id = t.org_id
      LEFT JOIN users u ON u.id = t.created_by
    `;
    const params = [];
    if (org_id) {
      sql += ' WHERE t.org_id = $1';
      params.push(org_id);
    }
    sql += ' ORDER BY t.created_at DESC';
    const { rows } = await pool.query(sql, params);
    const result = rows.map(r => ({
      ...r,
      start_date: r.start_date instanceof Date ? r.start_date.toISOString().slice(0, 10) : r.start_date,
      end_date: r.end_date instanceof Date ? r.end_date.toISOString().slice(0, 10) : r.end_date,
    }));
    cache.set(cacheKey, result, TOURNEY_TTL);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /:id — full bracket data ─────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `tournaments:detail:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Tournament
    const { rows: tRows } = await pool.query(
      `SELECT t.*, o.name AS org_name FROM tournaments t
       LEFT JOIN organizations o ON o.id = t.org_id WHERE t.id = $1`, [id]
    );
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const tournament = tRows[0];
    tournament.start_date = tournament.start_date instanceof Date ? tournament.start_date.toISOString().slice(0, 10) : tournament.start_date;
    tournament.end_date = tournament.end_date instanceof Date ? tournament.end_date.toISOString().slice(0, 10) : tournament.end_date;

    // Teams
    const { rows: ttRows } = await pool.query(
      `SELECT tt.*, t.name, t.logo_url, t.org_id, t.age_group, t.level,
              t.team_city, t.team_mascot, t.team_color, t.primary_color, t.secondary_color,
              o.logo_url AS org_logo
       FROM tournament_teams tt
       LEFT JOIN teams t ON t.id = tt.team_id
       LEFT JOIN organizations o ON o.id = t.org_id
       WHERE tt.tournament_id = $1
       ORDER BY tt.seed NULLS LAST, tt.id`, [id]
    );
    const teamLookup = {};
    const teams = ttRows.map(row => {
      const enriched = enrichTeam(row, row.team_id ? row : null);
      teamLookup[row.id] = enriched;
      return enriched;
    });

    // Rounds + matches + games
    const { rows: roundRows } = await pool.query(
      'SELECT * FROM tournament_rounds WHERE tournament_id = $1 ORDER BY round_number', [id]
    );
    const { rows: matchRows } = await pool.query(
      `SELECT m.*, g.game_date, g.game_time, g.status AS game_status,
              g.home_score, g.away_score, g.location_id,
              g.home_team_id AS game_home_team_id, g.away_team_id AS game_away_team_id,
              fl.name AS location_name
       FROM tournament_matches m
       LEFT JOIN games g ON g.id = m.game_id
       LEFT JOIN field_locations fl ON fl.id = g.location_id
       WHERE m.tournament_id = $1
       ORDER BY m.match_number`, [id]
    );

    const rounds = roundRows.map(round => {
      const matches = matchRows
        .filter(m => m.round_id === round.id)
        .map(m => {
          const teamA = m.team_a_id ? teamLookup[m.team_a_id] || null : null;
          const teamB = m.team_b_id ? teamLookup[m.team_b_id] || null : null;
          const matchTeams = [
            teamA ? { ...teamA, score: m.home_score } : null,
            teamB ? { ...teamB, score: m.away_score } : null,
          ];
          // can_create_game: both teams assigned, game has no teams set yet, no winner
          const gameHasTeams = !!(m.game_home_team_id || m.game_away_team_id);
          return {
            id: m.id,
            match_number: m.match_number,
            is_bye: m.is_bye,
            teams: matchTeams,
            winnerId: m.winner_team_id || null,
            next_match_id: m.next_match_id,
            loser_next_match_id: m.loser_next_match_id,
            game: m.game_id ? {
              id: m.game_id,
              status: m.game_status || 'pending',
              game_date: m.game_date instanceof Date
                ? m.game_date.toISOString().slice(0, 10)
                : m.game_date,
              game_time: m.game_time || null,
              location_name: m.location_name || null,
            } : null,
            linked_game_id: gameHasTeams ? m.game_id : null,
            can_create_game: !!(m.team_a_id && m.team_b_id && !gameHasTeams && !m.winner_team_id),
          };
        });
      return {
        id: round.id,
        title: round.name,
        round_number: round.round_number,
        round_type: round.round_type,
        matches,
      };
    });

    const result = { tournament, teams, rounds };
    cache.set(cacheKey, result, TOURNEY_TTL);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST / — create tournament ───────────────────────────────────────────────

router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, format, description, team_count, start_date, end_date, org_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const fmt = format || 'single_elimination';
    if (!['single_elimination', 'double_elimination'].includes(fmt)) {
      return res.status(400).json({ error: 'Invalid format' });
    }
    const count = Number(team_count) || 8;
    if (count < 2 || count > 128) return res.status(400).json({ error: 'team_count must be 2–128' });

    // Permission: super_admin or org_admin for the given org
    const effectiveOrgId = org_id || null;
    if (effectiveOrgId) {
      const allowed = await canManageTournament(req.user, effectiveOrgId);
      if (!allowed) return res.status(403).json({ error: 'Not authorized for this organization' });
    } else if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'org_id is required for non-super-admin users' });
    }

    await client.query('BEGIN');

    // Create tournament
    const { rows: tRows } = await client.query(
      `INSERT INTO tournaments (name, format, description, team_count, start_date, end_date, created_by, org_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [name, fmt, description || null, count, start_date || null, end_date || null, req.user.id, effectiveOrgId]
    );
    const tournamentId = tRows[0].id;

    // Generate bracket structure
    const bracketSize = nearestPowerOf2(count);
    const numRounds = Math.log2(bracketSize);
    const names = roundNames(numRounds);

    // Create rounds
    const roundIds = [];
    for (let r = 0; r < numRounds; r++) {
      const { rows } = await client.query(
        `INSERT INTO tournament_rounds (tournament_id, round_number, name, round_type)
         VALUES ($1, $2, $3, 'winners') RETURNING id`,
        [tournamentId, r + 1, names[r]]
      );
      roundIds.push(rows[0].id);
    }

    // Create matches + games per round, wire next_match_id
    // Work backwards from final to first round so we can set next_match_id
    const matchIdsByRound = [];
    for (let r = numRounds - 1; r >= 0; r--) {
      const matchCount = bracketSize / Math.pow(2, r + 1);
      const matchIds = [];
      for (let m = 0; m < matchCount; m++) {
        // Create game
        const { rows: gRows } = await client.query(
          `INSERT INTO games (tournament_id, status) VALUES ($1, 'unscheduled') RETURNING id`,
          [tournamentId]
        );
        const gameId = gRows[0].id;

        // Determine next_match_id (the match in the next round this winner feeds into)
        let nextMatchId = null;
        if (r < numRounds - 1) {
          const nextRoundMatches = matchIdsByRound[matchIdsByRound.length - 1];
          nextMatchId = nextRoundMatches[Math.floor(m / 2)];
        }

        const { rows: mRows } = await client.query(
          `INSERT INTO tournament_matches (tournament_id, round_id, match_number, game_id, next_match_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [tournamentId, roundIds[r], m + 1, gameId, nextMatchId]
        );
        matchIds.push(mRows[0].id);
      }
      matchIdsByRound.push(matchIds);
    }

    await client.query('COMMIT');
    cache.invalidatePrefix('tournaments:');

    // Return the created tournament
    const { rows: result } = await pool.query(
      'SELECT * FROM tournaments WHERE id = $1', [tournamentId]
    );
    res.status(201).json(result[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ── PUT /:id — update tournament metadata ────────────────────────────────────

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, existing[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const { name, description, status, start_date, end_date } = req.body;
    await pool.query(
      `UPDATE tournaments SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        start_date = COALESCE($4, start_date),
        end_date = COALESCE($5, end_date),
        updated_at = NOW()
       WHERE id = $6`,
      [name, description, status, start_date, end_date, id]
    );
    cache.invalidatePrefix('tournaments:');
    const { rows } = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, rows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });
    await pool.query('DELETE FROM tournaments WHERE id = $1', [id]);
    cache.invalidatePrefix('tournaments:');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /:id/teams — get teams ───────────────────────────────────────────────

router.get('/:id/teams', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT tt.*, 
        t.name AS team_name, t.org_id, o.name AS org_name,
        json_build_object(
          'id', t.id,
          'name', t.name,
          'org_id', t.org_id,
          'org_name', o.name
        ) as team
       FROM tournament_teams tt
       LEFT JOIN teams t ON t.id = tt.team_id
       LEFT JOIN organizations o ON o.id = t.org_id
       WHERE tt.tournament_id = $1
       ORDER BY tt.seed ASC NULLS LAST, tt.created_at ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /:id/teams — add team ───────────────────────────────────────────────

router.post('/:id/teams', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: tRows } = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const { team_id, temp_name } = req.body;
    if (!team_id && !temp_name) {
      return res.status(400).json({ error: 'Provide team_id or temp_name' });
    }

    // Check capacity
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*)::int AS c FROM tournament_teams WHERE tournament_id = $1', [id]
    );
    if (countRows[0].c >= tRows[0].team_count) {
      return res.status(400).json({ error: 'Tournament is at capacity' });
    }

    // Next seed
    const { rows: seedRows } = await pool.query(
      'SELECT COALESCE(MAX(seed), 0) + 1 AS next_seed FROM tournament_teams WHERE tournament_id = $1', [id]
    );

    const isTemp = !team_id;
    const { rows: inserted } = await pool.query(
      `INSERT INTO tournament_teams (tournament_id, team_id, seed, temp_name, is_temp)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, team_id || null, seedRows[0].next_seed, isTemp ? temp_name : null, isTemp]
    );

    cache.invalidatePrefix('tournaments:');

    // Enrich response
    let teamData = null;
    if (team_id) {
      const { rows: tData } = await pool.query(
        `SELECT t.*, o.logo_url AS org_logo FROM teams t
         LEFT JOIN organizations o ON o.id = t.org_id WHERE t.id = $1`, [team_id]
      );
      teamData = tData[0] || null;
    }
    res.status(201).json(enrichTeam(inserted[0], teamData));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Team already in tournament' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /:id/teams/:ttId ──────────────────────────────────────────────────

router.delete('/:id/teams/:ttId', authMiddleware, async (req, res) => {
  try {
    const { id, ttId } = req.params;
    const { rows: tRows } = await pool.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    // Clear from any match slots
    await pool.query(
      `UPDATE tournament_matches SET team_a_id = NULL WHERE team_a_id = $1 AND tournament_id = $2`, [ttId, id]
    );
    await pool.query(
      `UPDATE tournament_matches SET team_b_id = NULL WHERE team_b_id = $1 AND tournament_id = $2`, [ttId, id]
    );
    await pool.query('DELETE FROM tournament_teams WHERE id = $1 AND tournament_id = $2', [ttId, id]);
    cache.invalidatePrefix('tournaments:');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /:id/matches/:matchId/assign — assign team to match slot ─────────────

router.put('/:id/matches/:matchId/assign', authMiddleware, async (req, res) => {
  try {
    const { id, matchId } = req.params;
    const { rows: tRows } = await pool.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const { tournament_team_id, slot } = req.body;
    if (!['a', 'b'].includes(slot)) {
      return res.status(400).json({ error: 'slot must be "a" or "b"' });
    }

    const col = slot === 'a' ? 'team_a_id' : 'team_b_id';
    const { rows: updatedMatch } = await pool.query(
      `UPDATE tournament_matches SET ${col} = $1 WHERE id = $2 AND tournament_id = $3 RETURNING game_id`,
      [tournament_team_id || null, matchId, id]
    );

    if (updatedMatch[0] && updatedMatch[0].game_id) {
      let realTeamId = null;
      if (tournament_team_id) {
        const { rows: teamRows } = await pool.query('SELECT team_id FROM tournament_teams WHERE id = $1', [tournament_team_id]);
        if (teamRows.length) realTeamId = teamRows[0].team_id;
      }
      const gameCol = slot === 'a' ? 'home_team_id' : 'away_team_id';
      await pool.query(`UPDATE games SET ${gameCol} = $1 WHERE id = $2`, [realTeamId, updatedMatch[0].game_id]);
    }
    cache.invalidatePrefix('tournaments:');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /:id/matches/:matchId/schedule — set date/time/location ──────────────

router.put('/:id/matches/:matchId/schedule', authMiddleware, async (req, res) => {
  try {
    const { id, matchId } = req.params;
    const { rows: tRows } = await pool.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const { rows: mRows } = await pool.query(
      'SELECT game_id FROM tournament_matches WHERE id = $1 AND tournament_id = $2', [matchId, id]
    );
    if (!mRows.length) return res.status(404).json({ error: 'Match not found' });
    if (!mRows[0].game_id) return res.status(400).json({ error: 'No game linked to this match' });

    const { game_date, game_time, location_id } = req.body;
    const newStatus = game_date && game_time && location_id ? 'scheduled' : 'unscheduled';
    await pool.query(
      `UPDATE games SET
        game_date = COALESCE($1, game_date),
        game_time = COALESCE($2, game_time),
        location_id = COALESCE($3, location_id),
        status = $4,
        updated_at = NOW()
       WHERE id = $5`,
      [game_date || null, game_time || null, location_id || null, newStatus, mRows[0].game_id]
    );
    cache.invalidatePrefix('tournaments:');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /:id/matches/:matchId/score — record score + auto-advance ────────────

router.put('/:id/matches/:matchId/score', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, matchId } = req.params;
    const { rows: tRows } = await client.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const { rows: mRows } = await client.query(
      'SELECT * FROM tournament_matches WHERE id = $1 AND tournament_id = $2', [matchId, id]
    );
    if (!mRows.length) return res.status(404).json({ error: 'Match not found' });
    const match = mRows[0];

    const { home_score, away_score } = req.body;
    if (home_score == null || away_score == null) {
      return res.status(400).json({ error: 'home_score and away_score required' });
    }
    const hs = Number(home_score);
    const as = Number(away_score);
    if (hs === as) return res.status(400).json({ error: 'Ties not allowed in elimination tournaments' });

    await client.query('BEGIN');

    // Update game
    if (match.game_id) {
      await client.query(
        `UPDATE games SET home_score = $1, away_score = $2, status = 'completed', updated_at = NOW()
         WHERE id = $3`,
        [hs, as, match.game_id]
      );
    }

    // Determine winner/loser
    const winnerId = hs > as ? match.team_a_id : match.team_b_id;
    const loserId = hs > as ? match.team_b_id : match.team_a_id;

    await client.query(
      'UPDATE tournament_matches SET winner_team_id = $1, loser_team_id = $2 WHERE id = $3',
      [winnerId, loserId, matchId]
    );

    // Auto-advance winner to next match
    if (match.next_match_id && winnerId) {
      const { rows: nextMatch } = await client.query(
        'SELECT team_a_id, team_b_id FROM tournament_matches WHERE id = $1', [match.next_match_id]
      );
      if (nextMatch.length) {
        const slot = !nextMatch[0].team_a_id ? 'team_a_id' : 'team_b_id';
        await client.query(
          `UPDATE tournament_matches SET ${slot} = $1 WHERE id = $2`,
          [winnerId, match.next_match_id]
        );
      }
    }

    // Double-elim: advance loser to losers bracket
    if (match.loser_next_match_id && loserId) {
      const { rows: loserNext } = await client.query(
        'SELECT team_a_id, team_b_id FROM tournament_matches WHERE id = $1', [match.loser_next_match_id]
      );
      if (loserNext.length) {
        const slot = !loserNext[0].team_a_id ? 'team_a_id' : 'team_b_id';
        await client.query(
          `UPDATE tournament_matches SET ${slot} = $1 WHERE id = $2`,
          [loserId, match.loser_next_match_id]
        );
      }
    }

    await client.query('COMMIT');
    cache.invalidatePrefix('tournaments:');
    res.json({ success: true, winner_team_id: winnerId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ── PUT /:id/matches/:matchId/advance — manual advance (bye/forfeit) ─────────

router.put('/:id/matches/:matchId/advance', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, matchId } = req.params;
    const { rows: tRows } = await client.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const { tournament_team_id } = req.body;
    if (!tournament_team_id) return res.status(400).json({ error: 'tournament_team_id required' });

    const { rows: mRows } = await client.query(
      'SELECT * FROM tournament_matches WHERE id = $1 AND tournament_id = $2', [matchId, id]
    );
    if (!mRows.length) return res.status(404).json({ error: 'Match not found' });
    const match = mRows[0];

    await client.query('BEGIN');

    await client.query(
      'UPDATE tournament_matches SET winner_team_id = $1, is_bye = TRUE WHERE id = $2',
      [tournament_team_id, matchId]
    );

    // Advance to next match
    if (match.next_match_id) {
      const { rows: nextMatch } = await client.query(
        'SELECT team_a_id, team_b_id FROM tournament_matches WHERE id = $1', [match.next_match_id]
      );
      if (nextMatch.length) {
        const slot = !nextMatch[0].team_a_id ? 'team_a_id' : 'team_b_id';
        await client.query(
          `UPDATE tournament_matches SET ${slot} = $1 WHERE id = $2`,
          [tournament_team_id, match.next_match_id]
        );
      }
    }

    await client.query('COMMIT');
    cache.invalidatePrefix('tournaments:');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ── POST /:id/matches/:matchId/create-game — set up tournament game for a matchup ──

router.post('/:id/matches/:matchId/create-game', authMiddleware, async (req, res) => {
  try {
    const { id, matchId } = req.params;
    const { rows: tRows } = await pool.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const { rows: mRows } = await pool.query(
      'SELECT * FROM tournament_matches WHERE id = $1 AND tournament_id = $2', [matchId, id]
    );
    if (!mRows.length) return res.status(404).json({ error: 'Match not found' });
    const match = mRows[0];

    if (!match.team_a_id || !match.team_b_id) {
      return res.status(400).json({ error: 'Both teams must be assigned before creating a game' });
    }

    // Check if game already has teams assigned (already created)
    if (match.game_id) {
      const { rows: gRows } = await pool.query(
        'SELECT home_team_id, away_team_id FROM games WHERE id = $1', [match.game_id]
      );
      if (gRows.length && (gRows[0].home_team_id || gRows[0].away_team_id)) {
        return res.status(400).json({ error: 'Game already created for this match' });
      }
    }

    // Retrieve the real team IDs for the tournament teams
    const { rows: ttRows } = await pool.query(
      'SELECT id, team_id FROM tournament_teams WHERE id IN ($1, $2)',
      [match.team_a_id || -1, match.team_b_id || -1]
    );
    const ttMap = {};
    for (const row of ttRows) ttMap[row.id] = row.team_id;

    const homeTeamId = match.team_a_id ? ttMap[match.team_a_id] : null;
    const awayTeamId = match.team_b_id ? ttMap[match.team_b_id] : null;

    // Set teams on the game
    const { game_date, game_time, location_id } = req.body;
    const newStatus = game_date && game_time && location_id ? 'scheduled' : 'unscheduled';
    await pool.query(
      `UPDATE games SET
        home_team_id = $1, away_team_id = $2,
        game_date = $3, game_time = $4, location_id = $5,
        status = $6, updated_at = NOW()
       WHERE id = $7`,
      [homeTeamId, awayTeamId,
       game_date || null, game_time || null, location_id || null,
       newStatus, match.game_id]
    );

    cache.invalidatePrefix('tournaments:');
    res.json({ success: true, game_id: match.game_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /:id/matches/:matchId/create-game — undo game creation ────────────

router.delete('/:id/matches/:matchId/create-game', authMiddleware, async (req, res) => {
  try {
    const { id, matchId } = req.params;
    const { rows: tRows } = await pool.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const { rows: mRows } = await pool.query(
      'SELECT game_id, winner_team_id FROM tournament_matches WHERE id = $1 AND tournament_id = $2', [matchId, id]
    );
    if (!mRows.length) return res.status(404).json({ error: 'Match not found' });
    
    if (mRows[0].winner_team_id) {
      return res.status(400).json({ error: 'Cannot undo matchup when there is already a winner.' });
    }

    if (mRows[0].game_id) {
      await pool.query(
        `UPDATE games SET
          home_team_id = NULL, away_team_id = NULL,
          game_date = NULL, game_time = NULL, location_id = NULL,
          status = 'unscheduled', updated_at = NOW()
         WHERE id = $1`,
        [mRows[0].game_id]
      );
    }

    cache.invalidatePrefix('tournaments:');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /:id/rounds/:roundId — rename a round ───────────────────────────────

router.put('/:id/rounds/:roundId', authMiddleware, async (req, res) => {
  try {
    const { id, roundId } = req.params;
    const { rows: tRows } = await pool.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    await pool.query(
      'UPDATE tournament_rounds SET name = $1 WHERE id = $2 AND tournament_id = $3',
      [name.trim(), roundId, id]
    );

    cache.invalidatePrefix('tournaments:');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// ── POST /:id/matches/:matchId/reset — undo a match result ──────────────────

router.post('/:id/matches/:matchId/reset', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, matchId } = req.params;
    const { rows: tRows } = await client.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const { rows: mRows } = await client.query(
      'SELECT * FROM tournament_matches WHERE id = $1 AND tournament_id = $2', [matchId, id]
    );
    if (!mRows.length) return res.status(404).json({ error: 'Match not found' });
    const match = mRows[0];

    if (!match.winner_team_id) {
      return res.status(400).json({ error: 'Match has no result to reset' });
    }

    // Check if downstream match already has a winner (cascade protection)
    if (match.next_match_id) {
      const { rows: nextMatch } = await client.query(
        'SELECT winner_team_id FROM tournament_matches WHERE id = $1', [match.next_match_id]
      );
      if (nextMatch.length && nextMatch[0].winner_team_id) {
        return res.status(400).json({ error: 'Cannot reset: the next round match already has a result. Reset that match first.' });
      }
    }

    await client.query('BEGIN');

    // Remove winner from next match slot
    if (match.next_match_id && match.winner_team_id) {
      await client.query(
        `UPDATE tournament_matches SET team_a_id = CASE WHEN team_a_id = $1 THEN NULL ELSE team_a_id END,
                                       team_b_id = CASE WHEN team_b_id = $1 THEN NULL ELSE team_b_id END
         WHERE id = $2`, [match.winner_team_id, match.next_match_id]
      );
    }

    // Remove loser from losers bracket slot
    if (match.loser_next_match_id && match.loser_team_id) {
      await client.query(
        `UPDATE tournament_matches SET team_a_id = CASE WHEN team_a_id = $1 THEN NULL ELSE team_a_id END,
                                       team_b_id = CASE WHEN team_b_id = $1 THEN NULL ELSE team_b_id END
         WHERE id = $2`, [match.loser_team_id, match.loser_next_match_id]
      );
    }

    // Clear winner/loser and bye status on match
    await client.query(
      'UPDATE tournament_matches SET winner_team_id = NULL, loser_team_id = NULL, is_bye = FALSE WHERE id = $1', [matchId]
    );

    // Reset game back to scheduled/pending
    if (match.game_id) {
      await client.query(
        `UPDATE games SET home_score = NULL, away_score = NULL, status = 'unscheduled', updated_at = NOW()
         WHERE id = $1`, [match.game_id]
      );
    }

    await client.query('COMMIT');
    cache.invalidatePrefix('tournaments:');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ── POST /:id/rounds/:roundId/reset — reset all matches in a round ──────────

router.post('/:id/rounds/:roundId/reset', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, roundId } = req.params;
    const { rows: tRows } = await client.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const { rows: matches } = await client.query(
      'SELECT * FROM tournament_matches WHERE round_id = $1 AND tournament_id = $2', [roundId, id]
    );

    // Check if any downstream matches have results
    for (const match of matches) {
      if (match.next_match_id) {
        const { rows: nextMatch } = await client.query(
          'SELECT winner_team_id FROM tournament_matches WHERE id = $1', [match.next_match_id]
        );
        if (nextMatch.length && nextMatch[0].winner_team_id) {
          return res.status(400).json({ error: `Cannot reset round: match #${match.match_number} feeds into a match that already has a result. Reset downstream matches first.` });
        }
      }
    }

    await client.query('BEGIN');

    for (const match of matches) {
      if (!match.winner_team_id) continue;

      // Remove winner from next match
      if (match.next_match_id && match.winner_team_id) {
        await client.query(
          `UPDATE tournament_matches SET team_a_id = CASE WHEN team_a_id = $1 THEN NULL ELSE team_a_id END,
                                         team_b_id = CASE WHEN team_b_id = $1 THEN NULL ELSE team_b_id END
           WHERE id = $2`, [match.winner_team_id, match.next_match_id]
        );
      }

      // Remove loser from losers bracket
      if (match.loser_next_match_id && match.loser_team_id) {
        await client.query(
          `UPDATE tournament_matches SET team_a_id = CASE WHEN team_a_id = $1 THEN NULL ELSE team_a_id END,
                                         team_b_id = CASE WHEN team_b_id = $1 THEN NULL ELSE team_b_id END
           WHERE id = $2`, [match.loser_team_id, match.loser_next_match_id]
        );
      }

      // Clear match result and bye status
      await client.query(
        'UPDATE tournament_matches SET winner_team_id = NULL, loser_team_id = NULL, is_bye = FALSE WHERE id = $1', [match.id]
      );

      // Reset game
      if (match.game_id) {
        await client.query(
          `UPDATE games SET home_score = NULL, away_score = NULL, status = 'unscheduled', updated_at = NOW()
           WHERE id = $1`, [match.game_id]
        );
      }
    }

    await client.query('COMMIT');
    cache.invalidatePrefix('tournaments:');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ── PUT /:id/resize — change team count and regenerate bracket (draft only) ──

router.put('/:id/resize', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { rows: tRows } = await client.query('SELECT * FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const tournament = tRows[0];
    const allowed = await canManageTournament(req.user, tournament.org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    if (tournament.status !== 'draft') {
      return res.status(400).json({ error: 'Can only resize draft tournaments' });
    }

    // Check no winners set
    const { rows: winnerCheck } = await client.query(
      'SELECT id FROM tournament_matches WHERE tournament_id = $1 AND winner_team_id IS NOT NULL LIMIT 1', [id]
    );
    if (winnerCheck.length) {
      return res.status(400).json({ error: 'Cannot resize: some matches already have results. Reset all matches first.' });
    }

    const { team_count } = req.body;
    const count = Number(team_count);
    if (!count || count < 2 || count > 128) {
      return res.status(400).json({ error: 'team_count must be 2–128' });
    }

    await client.query('BEGIN');

    // Delete existing bracket (cascade will handle matches → games)
    await client.query('DELETE FROM tournament_matches WHERE tournament_id = $1', [id]);
    await client.query('DELETE FROM games WHERE tournament_id = $1', [id]);
    await client.query('DELETE FROM tournament_rounds WHERE tournament_id = $1', [id]);

    // Update team_count
    await client.query('UPDATE tournaments SET team_count = $1, updated_at = NOW() WHERE id = $2', [count, id]);

    // Regenerate bracket
    const bracketSize = nearestPowerOf2(count);
    const numRounds = Math.log2(bracketSize);
    const names = roundNames(numRounds);

    const roundIds = [];
    for (let r = 0; r < numRounds; r++) {
      const { rows } = await client.query(
        `INSERT INTO tournament_rounds (tournament_id, round_number, name, round_type)
         VALUES ($1, $2, $3, 'winners') RETURNING id`,
        [id, r + 1, names[r]]
      );
      roundIds.push(rows[0].id);
    }

    const matchIdsByRound = [];
    for (let r = numRounds - 1; r >= 0; r--) {
      const matchCount = bracketSize / Math.pow(2, r + 1);
      const matchIds = [];
      for (let m = 0; m < matchCount; m++) {
        const { rows: gRows } = await client.query(
          `INSERT INTO games (tournament_id, status) VALUES ($1, 'unscheduled') RETURNING id`, [id]
        );
        const gameId = gRows[0].id;
        let nextMatchId = null;
        if (r < numRounds - 1) {
          const nextRoundMatches = matchIdsByRound[matchIdsByRound.length - 1];
          nextMatchId = nextRoundMatches[Math.floor(m / 2)];
        }
        const { rows: mRows } = await client.query(
          `INSERT INTO tournament_matches (tournament_id, round_id, match_number, game_id, next_match_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [id, roundIds[r], m + 1, gameId, nextMatchId]
        );
        matchIds.push(mRows[0].id);
      }
      matchIdsByRound.push(matchIds);
    }

    await client.query('COMMIT');
    cache.invalidatePrefix('tournaments:');
    res.json({ success: true, team_count: count });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
