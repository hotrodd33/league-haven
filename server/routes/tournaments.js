const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireRole, getUserPermissions, canEditTeam } = require('../auth');
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
        : (tt.seed != null ? `Seed #${tt.seed}` : '(Unassigned Team)'));
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

function buildRoundRobinRounds(teamIds) {
  const ids = [...teamIds];
  if (ids.length < 2) return [];
  const needsBye = ids.length % 2 === 1;
  if (needsBye) ids.push(null);

  const n = ids.length;
  const rounds = [];
  let rotation = [...ids];
  for (let r = 0; r < n - 1; r++) {
    const matches = [];
    for (let i = 0; i < n / 2; i++) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];
      if (a && b) matches.push([a, b]);
    }
    rounds.push(matches);

    const fixed = rotation[0];
    const moving = rotation.slice(1);
    moving.unshift(moving.pop());
    rotation = [fixed, ...moving];
  }
  return rounds;
}

function matchupKey(a, b) {
  return Number(a) < Number(b) ? `${a}:${b}` : `${b}:${a}`;
}

function buildPartialPoolRounds(teamIds, requestedGamesPerTeam) {
  const rounds = buildRoundRobinRounds(teamIds);
  const allMatches = rounds.flatMap((roundMatches, rIdx) =>
    roundMatches.map((match, mIdx) => ({
      teamAId: match[0],
      teamBId: match[1],
      round_number: rIdx + 1,
      match_number: mIdx + 1,
      key: matchupKey(match[0], match[1]),
    }))
  );

  const teamCount = teamIds.length;
  const maxGamesPerTeam = Math.max(0, teamCount - 1);
  const sanitizedTarget = Math.max(1, Math.min(Number(requestedGamesPerTeam || 1), maxGamesPerTeam));

  const totalAppearancesWanted = teamCount * sanitizedTarget;
  const matchesWanted = Math.floor(totalAppearancesWanted / 2);
  const feasibleAppearances = matchesWanted * 2;

  const baseGames = Math.floor(feasibleAppearances / teamCount);
  const extraGamesTeamCount = feasibleAppearances - (baseGames * teamCount);

  const desiredByTeam = new Map();
  for (let i = 0; i < teamIds.length; i++) {
    desiredByTeam.set(teamIds[i], baseGames + (i < extraGamesTeamCount ? 1 : 0));
  }

  const remaining = new Map(desiredByTeam);
  const selectedKeys = new Set();

  // Havel-Hakimi style matching on the complete graph induced by pool teams.
  // This gives a deterministic near-equal degree schedule when exact equality is impossible.
  while (true) {
    const active = [...teamIds]
      .filter((tid) => (remaining.get(tid) || 0) > 0)
      .sort((a, b) => {
        const diff = (remaining.get(b) || 0) - (remaining.get(a) || 0);
        if (diff !== 0) return diff;
        return Number(a) - Number(b);
      });

    if (!active.length) break;

    const anchor = active[0];
    const need = remaining.get(anchor) || 0;
    const partners = [];

    for (let i = 1; i < active.length && partners.length < need; i++) {
      const candidate = active[i];
      const key = matchupKey(anchor, candidate);
      if (!selectedKeys.has(key)) partners.push(candidate);
    }

    if (partners.length < need) {
      break;
    }

    for (const partner of partners) {
      const key = matchupKey(anchor, partner);
      selectedKeys.add(key);
      remaining.set(anchor, (remaining.get(anchor) || 0) - 1);
      remaining.set(partner, (remaining.get(partner) || 0) - 1);
    }
  }

  const selectedMatches = allMatches
    .filter((m) => selectedKeys.has(m.key))
    .sort((a, b) => (a.round_number - b.round_number) || (a.match_number - b.match_number));

  const scheduledByTeam = new Map(teamIds.map((tid) => [tid, 0]));
  for (const m of selectedMatches) {
    scheduledByTeam.set(m.teamAId, (scheduledByTeam.get(m.teamAId) || 0) + 1);
    scheduledByTeam.set(m.teamBId, (scheduledByTeam.get(m.teamBId) || 0) + 1);
  }

  const counts = [...scheduledByTeam.values()];
  const minGames = counts.length ? Math.min(...counts) : 0;
  const maxGames = counts.length ? Math.max(...counts) : 0;

  const notes = [];
  if (Number(requestedGamesPerTeam) > maxGamesPerTeam) {
    notes.push(`Requested ${requestedGamesPerTeam} games per team exceeds max unique opponents (${maxGamesPerTeam}); capped at ${sanitizedTarget}.`);
  }
  if ((teamCount * sanitizedTarget) % 2 !== 0) {
    notes.push(`Exact ${sanitizedTarget} games/team is not possible with ${teamCount} teams; scheduled a balanced ${minGames}-${maxGames} games/team spread.`);
  }

  return {
    rounds: selectedMatches,
    requested_games_per_team: Number(requestedGamesPerTeam),
    applied_games_per_team: sanitizedTarget,
    min_games_per_team: minGames,
    max_games_per_team: maxGames,
    note: notes.join(' '),
  };
}

function buildSeedPositions(size) {
  if (size === 1) return [1];
  const half = buildSeedPositions(size / 2);
  const result = [];
  for (const h of half) { result.push(h); result.push(size + 1 - h); }
  return result;
}

async function computePoolStandings(tournamentId, poolId) {
  const { rows: teamRows } = await pool.query(
    `SELECT tt.id AS tournament_team_id, tt.seed, tt.team_id, tt.temp_name, tt.is_temp,
            t.name AS team_name, t.logo_url, t.org_id, t.age_group, t.level,
            t.team_city, t.team_mascot, t.team_color, t.primary_color, t.secondary_color,
            o.logo_url AS org_logo
     FROM tournament_pool_teams ppt
     JOIN tournament_teams tt ON tt.id = ppt.tournament_team_id
     LEFT JOIN teams t ON t.id = tt.team_id
     LEFT JOIN organizations o ON o.id = t.org_id
     WHERE ppt.pool_id = $1
     ORDER BY tt.seed NULLS LAST, tt.id`,
    [poolId]
  );

  const teams = teamRows.map((row) => ({
    ...enrichTeam(
      { id: row.tournament_team_id, team_id: row.team_id, seed: row.seed, temp_name: row.temp_name, is_temp: row.is_temp },
      row.team_id ? row : null,
    ),
    tournament_team_id: row.tournament_team_id,
  }));

  const standingsMap = new Map();
  teams.forEach((team) => standingsMap.set(team.tournament_team_id, createStanding(team)));

  const { rows: matchRows } = await pool.query(
    `SELECT pm.team_a_id, pm.team_b_id, g.status, g.home_score, g.away_score
     FROM tournament_pool_matches pm
     LEFT JOIN games g ON g.id = pm.game_id
     WHERE pm.tournament_id = $1 AND pm.pool_id = $2`,
    [tournamentId, poolId]
  );

  const headToHead = new Map();
  let completedGames = 0;

  for (const match of matchRows) {
    const a = standingsMap.get(match.team_a_id);
    const b = standingsMap.get(match.team_b_id);
    if (!a || !b) continue;
    const hs = match.home_score;
    const as_ = match.away_score;
    const done = hs != null && as_ != null && match.status !== 'cancelled';
    if (!done) continue;
    completedGames++;
    a.games_played++; b.games_played++;
    a.runs_for += Number(hs); a.runs_against += Number(as_);
    b.runs_for += Number(as_); b.runs_against += Number(hs);
    if (hs > as_) {
      a.wins++; b.losses++;
      headToHead.set(`${a.tournament_team_id}:${b.tournament_team_id}`, (headToHead.get(`${a.tournament_team_id}:${b.tournament_team_id}`) || 0) + 1);
    } else if (as_ > hs) {
      b.wins++; a.losses++;
      headToHead.set(`${b.tournament_team_id}:${a.tournament_team_id}`, (headToHead.get(`${b.tournament_team_id}:${a.tournament_team_id}`) || 0) + 1);
    } else {
      a.ties++; b.ties++;
    }
  }

  const standings = Array.from(standingsMap.values()).map((s) => ({
    ...s,
    run_diff: s.runs_for - s.runs_against,
    points: (s.wins * 2) + s.ties,
  }));

  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const aBeatB = headToHead.get(`${a.tournament_team_id}:${b.tournament_team_id}`) || 0;
    const bBeatA = headToHead.get(`${b.tournament_team_id}:${a.tournament_team_id}`) || 0;
    if ((aBeatB + bBeatA) > 0 && aBeatB !== bBeatA) return bBeatA - aBeatB;
    if (b.run_diff !== a.run_diff) return b.run_diff - a.run_diff;
    if (a.runs_against !== b.runs_against) return a.runs_against - b.runs_against;
    if ((a.seed ?? 9999) !== (b.seed ?? 9999)) return (a.seed ?? 9999) - (b.seed ?? 9999);
    return a.name.localeCompare(b.name);
  });
  standings.forEach((s, idx) => { s.pool_rank = idx + 1; });
  return { standings, completedGames, totalMatches: matchRows.length, teamCount: teams.length };
}

function createStanding(team) {
  return {
    tournament_team_id: team.id,
    team_id: team.team_id,
    name: team.name,
    seed: team.seed,
    is_temp: team.is_temp,
    logo: team.logo,
    city_abbr: team.city_abbr,
    wins: 0,
    losses: 0,
    ties: 0,
    games_played: 0,
    runs_for: 0,
    runs_against: 0,
    run_diff: 0,
    points: 0,
    rank: null,
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
        (SELECT COUNT(*)::int FROM tournament_teams tt WHERE tt.tournament_id = t.id) AS enrolled_count,
        (SELECT COUNT(*)::int FROM tournament_teams tt WHERE tt.tournament_id = t.id AND tt.registration_status != 'withdrawn') AS registered_count
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

// ── GET /my-registrations — user's active registrations ──────────────────────
// Must be registered before /:id to avoid wildcard match

router.get('/my-registrations', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tt.id, tt.tournament_id, tt.team_id, tt.registration_status, tt.registration_notes,
              tt.created_at AS registered_at
       FROM tournament_teams tt
       WHERE tt.registered_by = $1 AND tt.registration_status != 'withdrawn'`,
      [req.user.id]
    );
    res.json(rows);
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

// ── GET /:id/pitch-count-board — tournament-wide pitch counts by team ──────

router.get('/:id/pitch-count-board', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: tournamentRows } = await pool.query(
      'SELECT id, name FROM tournaments WHERE id = $1',
      [id]
    );
    if (!tournamentRows.length) return res.status(404).json({ error: 'Tournament not found' });

    const { rows: tournamentTeams } = await pool.query(
      `SELECT tt.team_id, tt.seed,
              t.name AS team_name,
              t.logo_url,
              t.primary_color,
              t.secondary_color
       FROM tournament_teams tt
       JOIN teams t ON t.id = tt.team_id
       WHERE tt.tournament_id = $1
         AND tt.team_id IS NOT NULL
         AND tt.registration_status != 'withdrawn'
       ORDER BY tt.seed NULLS LAST, t.name ASC`,
      [id]
    );

    const { rows: allGames } = await pool.query(
      `SELECT g.id AS game_id,
              g.game_date::text AS game_date,
              g.game_time::text AS game_time,
              g.home_team_id,
              g.away_team_id,
              COALESCE(ht.name, 'TBD') AS home_team_name,
              COALESCE(at.name, 'TBD') AS away_team_name
       FROM games g
       LEFT JOIN teams ht ON ht.id = g.home_team_id
       LEFT JOIN teams at ON at.id = g.away_team_id
       WHERE g.tournament_id = $1
         AND g.deleted_at IS NULL
         AND g.status != 'cancelled'
       ORDER BY g.game_date ASC NULLS LAST, g.game_time ASC NULLS LAST, g.id ASC`,
      [id]
    );

    const { rows: pitchRows } = await pool.query(
      `SELECT gpc.team_id,
              gpc.player_id,
              gpc.game_id,
              SUM(gpc.pitch_count)::int AS pitch_count,
              p.first_name,
              p.last_name,
              tp.jersey_number
       FROM game_pitch_counts gpc
       JOIN games g ON g.id = gpc.game_id
       JOIN players p ON p.id = gpc.player_id
       LEFT JOIN team_players tp ON tp.player_id = gpc.player_id AND tp.team_id = gpc.team_id
       WHERE g.tournament_id = $1
         AND g.deleted_at IS NULL
         AND g.status != 'cancelled'
       GROUP BY gpc.team_id, gpc.player_id, gpc.game_id, p.first_name, p.last_name, tp.jersey_number`,
      [id]
    );

    const today = new Date().toISOString().slice(0, 10);
    const gamesByTeam = new Map();

    for (const team of tournamentTeams) {
      const teamGames = allGames
        .filter((g) => Number(g.home_team_id) === Number(team.team_id) || Number(g.away_team_id) === Number(team.team_id))
        .map((g, idx) => {
          const isHome = Number(g.home_team_id) === Number(team.team_id);
          return {
            game_id: g.game_id,
            game_date: g.game_date,
            game_time: g.game_time,
            game_index: idx + 1,
            opponent_name: isHome ? g.away_team_name : g.home_team_name,
            home_away: isHome ? 'vs' : '@',
          };
        });
      gamesByTeam.set(Number(team.team_id), teamGames);
    }

    const byTeamPlayer = new Map();
    for (const row of pitchRows) {
      const teamId = Number(row.team_id);
      if (!byTeamPlayer.has(teamId)) byTeamPlayer.set(teamId, new Map());
      const playerMap = byTeamPlayer.get(teamId);
      const playerId = Number(row.player_id);
      if (!playerMap.has(playerId)) {
        playerMap.set(playerId, {
          player_id: playerId,
          first_name: row.first_name,
          last_name: row.last_name,
          jersey_number: row.jersey_number,
          by_game: new Map(),
        });
      }
      const player = playerMap.get(playerId);
      player.by_game.set(Number(row.game_id), Number(row.pitch_count || 0));
    }

    const teams = tournamentTeams.map((team) => {
      const teamId = Number(team.team_id);
      const teamGames = gamesByTeam.get(teamId) || [];
      const playerMap = byTeamPlayer.get(teamId) || new Map();

      const players = Array.from(playerMap.values()).map((player) => {
        const by_game = {};
        let day_total = 0;
        let tournament_total = 0;

        for (const g of teamGames) {
          const count = Number(player.by_game.get(Number(g.game_id)) || 0);
          by_game[g.game_id] = count;
          tournament_total += count;
          if (g.game_date === today) day_total += count;
        }

        return {
          player_id: player.player_id,
          first_name: player.first_name,
          last_name: player.last_name,
          jersey_number: player.jersey_number,
          by_game,
          day_total,
          tournament_total,
        };
      })
        .filter((p) => p.tournament_total > 0)
        .sort((a, b) => {
          if (b.tournament_total !== a.tournament_total) return b.tournament_total - a.tournament_total;
          const aLast = `${a.last_name || ''}`.toLowerCase();
          const bLast = `${b.last_name || ''}`.toLowerCase();
          if (aLast !== bLast) return aLast.localeCompare(bLast);
          return `${a.first_name || ''}`.toLowerCase().localeCompare(`${b.first_name || ''}`.toLowerCase());
        });

      const team_day_total = players.reduce((sum, p) => sum + Number(p.day_total || 0), 0);
      const team_tournament_total = players.reduce((sum, p) => sum + Number(p.tournament_total || 0), 0);

      return {
        team_id: teamId,
        team_name: team.team_name,
        seed: team.seed,
        logo_url: team.logo_url,
        primary_color: team.primary_color,
        secondary_color: team.secondary_color,
        games: teamGames,
        players,
        tracked_player_count: players.length,
        team_day_total,
        team_tournament_total,
      };
    });

    res.json({
      tournament_id: Number(id),
      tournament_name: tournamentRows[0].name,
      day_date: today,
      teams,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST / — create tournament ───────────────────────────────────────────────

router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      name, format, description, team_count, start_date, end_date, org_id,
      pitch_limit_mode, pitch_limit_per_day, pitch_limit_per_tournament,
    } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const fmt = format || 'single_elimination';
    if (!['single_elimination', 'double_elimination'].includes(fmt)) {
      return res.status(400).json({ error: 'Invalid format' });
    }
    const pitchMode = pitch_limit_mode || 'league_default';
    if (!['league_default', 'tournament_custom'].includes(pitchMode)) {
      return res.status(400).json({ error: 'Invalid pitch_limit_mode' });
    }
    const perDay = pitch_limit_per_day == null || pitch_limit_per_day === ''
      ? null
      : Number(pitch_limit_per_day);
    const perTournament = pitch_limit_per_tournament == null || pitch_limit_per_tournament === ''
      ? null
      : Number(pitch_limit_per_tournament);
    if (perDay != null && (!Number.isFinite(perDay) || perDay <= 0)) {
      return res.status(400).json({ error: 'pitch_limit_per_day must be a positive number' });
    }
    if (perTournament != null && (!Number.isFinite(perTournament) || perTournament <= 0)) {
      return res.status(400).json({ error: 'pitch_limit_per_tournament must be a positive number' });
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
      `INSERT INTO tournaments (
        name, format, description, team_count, start_date, end_date, created_by, org_id,
        pitch_limit_mode, pitch_limit_per_day, pitch_limit_per_tournament
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        name,
        fmt,
        description || null,
        count,
        start_date || null,
        end_date || null,
        req.user.id,
        effectiveOrgId,
        pitchMode,
        perDay,
        perTournament,
      ]
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

    const { name, description, status, start_date, end_date,
            location_id, location_notes, registration_open, registration_deadline,
            entry_fee, max_registrations, pitch_limit_mode, pitch_limit_per_day,
            pitch_limit_per_tournament } = req.body;

    const modeParam = pitch_limit_mode == null ? null : String(pitch_limit_mode);
    if (modeParam != null && !['league_default', 'tournament_custom'].includes(modeParam)) {
      return res.status(400).json({ error: 'Invalid pitch_limit_mode' });
    }
    const perDayParam = pitch_limit_per_day == null || pitch_limit_per_day === '' ? null : Number(pitch_limit_per_day);
    const perTournamentParam = pitch_limit_per_tournament == null || pitch_limit_per_tournament === ''
      ? null
      : Number(pitch_limit_per_tournament);
    if (perDayParam != null && (!Number.isFinite(perDayParam) || perDayParam <= 0)) {
      return res.status(400).json({ error: 'pitch_limit_per_day must be a positive number' });
    }
    if (perTournamentParam != null && (!Number.isFinite(perTournamentParam) || perTournamentParam <= 0)) {
      return res.status(400).json({ error: 'pitch_limit_per_tournament must be a positive number' });
    }
    await pool.query(
      `UPDATE tournaments SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        start_date = COALESCE($4, start_date),
        end_date = COALESCE($5, end_date),
        location_id = COALESCE($6, location_id),
        location_notes = COALESCE($7, location_notes),
        registration_open = COALESCE($8, registration_open),
        registration_deadline = COALESCE($9, registration_deadline),
        entry_fee = COALESCE($10, entry_fee),
        max_registrations = COALESCE($11, max_registrations),
        pitch_limit_mode = COALESCE($12, pitch_limit_mode),
        pitch_limit_per_day = COALESCE($13, pitch_limit_per_day),
        pitch_limit_per_tournament = COALESCE($14, pitch_limit_per_tournament),
        updated_at = NOW()
       WHERE id = $15`,
      [name, description, status, start_date, end_date,
       location_id, location_notes, registration_open, registration_deadline,
       entry_fee, max_registrations, modeParam, perDayParam, perTournamentParam, id]
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

// ── GET /:id/pools — list pools with assigned teams ─────────────────────────

router.get('/:id/pools', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: tRows } = await pool.query('SELECT id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });

    const { rows: pools } = await pool.query(
      `SELECT * FROM tournament_pools WHERE tournament_id = $1 ORDER BY sort_order, id`,
      [id]
    );

    const { rows: teamRows } = await pool.query(
      `SELECT ppt.pool_id, tt.id AS tournament_team_id, tt.seed, tt.team_id, tt.temp_name, tt.is_temp,
              t.name AS team_name, t.logo_url, t.org_id, t.age_group, t.level,
              t.team_city, t.team_mascot, t.team_color, t.primary_color, t.secondary_color,
              o.logo_url AS org_logo
       FROM tournament_pool_teams ppt
       JOIN tournament_teams tt ON tt.id = ppt.tournament_team_id
       LEFT JOIN teams t ON t.id = tt.team_id
       LEFT JOIN organizations o ON o.id = t.org_id
       WHERE tt.tournament_id = $1
       ORDER BY tt.seed NULLS LAST, tt.id`,
      [id]
    );

    const teamsByPool = {};
    const teamLookup = {};
    for (const row of teamRows) {
      if (!teamsByPool[row.pool_id]) teamsByPool[row.pool_id] = [];
      const enriched = {
        ...enrichTeam(row, row.team_id ? row : null),
        tournament_team_id: row.tournament_team_id,
      };
      teamsByPool[row.pool_id].push(enriched);
      teamLookup[row.tournament_team_id] = enriched;
    }

    const { rows: poolMatchRows } = await pool.query(
      `SELECT pm.id, pm.pool_id, pm.round_number, pm.match_number, pm.team_a_id, pm.team_b_id, pm.game_id,
              g.game_date, g.game_time, g.status AS game_status, g.home_score, g.away_score,
              fl.name AS location_name
       FROM tournament_pool_matches pm
       LEFT JOIN games g ON g.id = pm.game_id
       LEFT JOIN field_locations fl ON fl.id = g.location_id
       WHERE pm.tournament_id = $1
       ORDER BY pm.pool_id, pm.round_number, pm.match_number, pm.id`,
      [id]
    );

    const poolMatchesByPool = {};
    for (const row of poolMatchRows) {
      if (!poolMatchesByPool[row.pool_id]) poolMatchesByPool[row.pool_id] = [];
      poolMatchesByPool[row.pool_id].push({
        id: row.id,
        round_number: row.round_number,
        match_number: row.match_number,
        team_a_id: row.team_a_id,
        team_b_id: row.team_b_id,
        team_a: row.team_a_id ? (teamLookup[row.team_a_id] || null) : null,
        team_b: row.team_b_id ? (teamLookup[row.team_b_id] || null) : null,
        game: row.game_id ? {
          id: row.game_id,
          status: row.game_status || 'unscheduled',
          game_date: row.game_date instanceof Date ? row.game_date.toISOString().slice(0, 10) : row.game_date,
          game_time: row.game_time || null,
          location_name: row.location_name || null,
          home_score: row.home_score,
          away_score: row.away_score,
        } : null,
      });
    }

    res.json(pools.map((p) => ({
      ...p,
      teams: teamsByPool[p.id] || [],
      pool_matches: poolMatchesByPool[p.id] || [],
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /:id/pools/:poolId/standings — computed pool standings ──────────────

router.get('/:id/pools/:poolId/standings', async (req, res) => {
  try {
    const { id, poolId } = req.params;
    const { rows: poolRows } = await pool.query(
      `SELECT p.*
       FROM tournament_pools p
       WHERE p.id = $1 AND p.tournament_id = $2`,
      [poolId, id]
    );
    if (!poolRows.length) return res.status(404).json({ error: 'Pool not found' });
    const poolRow = poolRows[0];

    const { rows: teamRows } = await pool.query(
      `SELECT tt.id AS tournament_team_id, tt.seed, tt.team_id, tt.temp_name, tt.is_temp,
              t.name AS team_name, t.logo_url, t.org_id, t.age_group, t.level,
              t.team_city, t.team_mascot, t.team_color, t.primary_color, t.secondary_color,
              o.logo_url AS org_logo
       FROM tournament_pool_teams ppt
       JOIN tournament_teams tt ON tt.id = ppt.tournament_team_id
       LEFT JOIN teams t ON t.id = tt.team_id
       LEFT JOIN organizations o ON o.id = t.org_id
       WHERE ppt.pool_id = $1
       ORDER BY tt.seed NULLS LAST, tt.id`,
      [poolId]
    );

    const teams = teamRows.map((row) => ({
      ...enrichTeam(
        {
          id: row.tournament_team_id,
          team_id: row.team_id,
          seed: row.seed,
          temp_name: row.temp_name,
          is_temp: row.is_temp,
        },
        row.team_id ? row : null,
      ),
      tournament_team_id: row.tournament_team_id,
    }));

    const { standings, completedGames, totalMatches } = await computePoolStandings(id, poolId);
    standings.forEach((s, idx) => { s.rank = idx + 1; });

    res.json({
      pool: {
        id: poolRow.id,
        tournament_id: poolRow.tournament_id,
        name: poolRow.name,
      },
      totals: {
        teams: standings.length,
        matches: totalMatches,
        completed_games: completedGames,
      },
      standings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /:id/preview-bracket-seeds — compute seeds across pools (no writes) ─

router.get('/:id/preview-bracket-seeds', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { seeding_mode = 'global_rank', qualifiers_per_pool } = req.query;

    if (!['global_rank', 'fixed_qualifiers_per_pool'].includes(seeding_mode)) {
      return res.status(400).json({ error: 'seeding_mode must be global_rank or fixed_qualifiers_per_pool' });
    }

    const { rows: poolRows } = await pool.query(
      'SELECT * FROM tournament_pools WHERE tournament_id = $1 ORDER BY sort_order, id', [id]
    );
    if (!poolRows.length) return res.status(400).json({ error: 'No pools found for this tournament' });

    const allPoolStandings = await Promise.all(
      poolRows.map(async (p) => {
        const { standings, completedGames, totalMatches } = await computePoolStandings(id, p.id);
        return { pool: { id: p.id, name: p.name }, standings, completedGames, totalMatches };
      })
    );

    const qpp = qualifiers_per_pool != null ? Number(qualifiers_per_pool) : null;
    let qualifiers;

    if (seeding_mode === 'fixed_qualifiers_per_pool') {
      if (!qpp || qpp < 1) return res.status(400).json({ error: 'qualifiers_per_pool required for fixed mode' });
      qualifiers = [];
      // Interleave: rank-1 from each pool, then rank-2 from each pool, …
      for (let rank = 0; rank < qpp; rank++) {
        for (const { standings } of allPoolStandings) {
          const team = standings[rank];
          if (team) qualifiers.push({ ...team, from_pool: allPoolStandings.find(p => p.standings.includes(team))?.pool?.name });
        }
      }
    } else {
      // global_rank: sort all teams by pool_rank first, then points/rd, interleave by pool
      const maxRank = Math.max(...allPoolStandings.map(p => p.standings.length));
      qualifiers = [];
      for (let rank = 0; rank < maxRank; rank++) {
        for (const { pool: pl, standings } of allPoolStandings) {
          const team = standings[rank];
          if (team) qualifiers.push({ ...team, from_pool: pl.name });
        }
      }
    }

    // Assign bracket seeds 1..N
    qualifiers.forEach((t, idx) => { t.bracket_seed = idx + 1; });

    res.json({
      seeding_mode,
      qualifiers_per_pool: qpp,
      pools: allPoolStandings.map(p => ({ id: p.pool.id, name: p.pool.name, completed: p.completedGames, total: p.totalMatches })),
      seeds: qualifiers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /:id/generate-bracket-from-pools — write seeds + assign round 1 ────

router.post('/:id/generate-bracket-from-pools', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { rows: tRows } = await client.query('SELECT * FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const tournament = tRows[0];
    const allowed = await canManageTournament(req.user, tournament.org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const {
      seeding_mode = 'global_rank',
      qualifiers_per_pool,
      seed_overrides = [], // [{bracket_seed, tournament_team_id}]
    } = req.body;

    if (!['global_rank', 'fixed_qualifiers_per_pool'].includes(seeding_mode)) {
      return res.status(400).json({ error: 'Invalid seeding_mode' });
    }

    const { rows: poolRows } = await client.query(
      'SELECT * FROM tournament_pools WHERE tournament_id = $1 ORDER BY sort_order, id', [id]
    );
    if (!poolRows.length) return res.status(400).json({ error: 'No pools found for this tournament' });

    const allPoolStandings = await Promise.all(
      poolRows.map(async (p) => {
        const { standings } = await computePoolStandings(id, p.id);
        return { pool: p, standings };
      })
    );

    const qpp = qualifiers_per_pool != null ? Number(qualifiers_per_pool) : null;
    let qualifiers = [];
    if (seeding_mode === 'fixed_qualifiers_per_pool') {
      if (!qpp || qpp < 1) return res.status(400).json({ error: 'qualifiers_per_pool required for fixed mode' });
      for (let rank = 0; rank < qpp; rank++) {
        for (const { standings } of allPoolStandings) {
          if (standings[rank]) qualifiers.push(standings[rank]);
        }
      }
    } else {
      const maxRank = Math.max(...allPoolStandings.map(p => p.standings.length));
      for (let rank = 0; rank < maxRank; rank++) {
        for (const { standings } of allPoolStandings) {
          if (standings[rank]) qualifiers.push(standings[rank]);
        }
      }
    }

    // Apply seed overrides: swap teams at specific bracket positions
    const overrideMap = new Map();
    for (const ov of (seed_overrides || [])) {
      if (ov.bracket_seed >= 1 && ov.bracket_seed <= qualifiers.length) {
        overrideMap.set(Number(ov.bracket_seed), Number(ov.tournament_team_id));
      }
    }
    if (overrideMap.size > 0) {
      const ttIdToIdx = new Map(qualifiers.map((q, i) => [q.tournament_team_id, i]));
      for (const [targetSeed, ttId] of overrideMap) {
        const targetIdx = targetSeed - 1;
        const currentTeamAtTarget = qualifiers[targetIdx];
        const sourceIdx = ttIdToIdx.get(ttId);
        if (sourceIdx == null) continue;
        // swap
        const temp = qualifiers[targetIdx];
        qualifiers[targetIdx] = qualifiers[sourceIdx];
        qualifiers[sourceIdx] = temp;
        ttIdToIdx.set(currentTeamAtTarget.tournament_team_id, sourceIdx);
        ttIdToIdx.set(ttId, targetIdx);
      }
    }

    if (qualifiers.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 qualifying teams to generate bracket' });
    }

    const bracketSize = nearestPowerOf2(qualifiers.length);
    const seedPositions = buildSeedPositions(bracketSize);

    await client.query('BEGIN');

    const { rows: winnerCheck } = await client.query(
      'SELECT id FROM tournament_matches WHERE tournament_id = $1 AND winner_team_id IS NOT NULL LIMIT 1', [id]
    );
    if (winnerCheck.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot regenerate bracket: some matches already have results. Reset bracket results first.' });
    }

    // Rebuild the bracket from the number of advancing qualifiers so pool advancement
    // drives bracket size (e.g., 6 qualifiers => 8-slot bracket with 2 byes).
    await client.query('DELETE FROM tournament_matches WHERE tournament_id = $1', [id]);
    await client.query('DELETE FROM games WHERE tournament_id = $1', [id]);
    await client.query('DELETE FROM tournament_rounds WHERE tournament_id = $1', [id]);

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

    const { rows: r1Matches } = await client.query(
      `SELECT id FROM tournament_matches WHERE tournament_id = $1 AND round_id = $2
       ORDER BY match_number`,
      [id, roundIds[0]]
    );

    // Update seeds on tournament_teams
    for (let i = 0; i < qualifiers.length; i++) {
      await client.query(
        'UPDATE tournament_teams SET seed = $1 WHERE id = $2',
        [i + 1, qualifiers[i].tournament_team_id]
      );
    }

    // Assign round-1 match slots. seedPositions pairs: [0,1], [2,3], …
    for (let matchIdx = 0; matchIdx < r1Matches.length; matchIdx++) {
      const slotA = seedPositions[matchIdx * 2] - 1;    // 0-based qualifier index
      const slotB = seedPositions[matchIdx * 2 + 1] - 1;
      const teamA = qualifiers[slotA] || null;
      const teamB = qualifiers[slotB] || null;
      const isBye = !teamA || !teamB;

      await client.query(
        `UPDATE tournament_matches SET
           team_a_id = $1::int,
           team_b_id = $2::int,
           winner_team_id = CASE WHEN $3::boolean THEN COALESCE($1::int, $2::int) ELSE NULL END,
           loser_team_id = NULL,
           is_bye = $3::boolean
         WHERE id = $4::int`,
        [
          teamA?.tournament_team_id ?? null,
          teamB?.tournament_team_id ?? null,
          isBye,
          r1Matches[matchIdx].id,
        ]
      );

      // If it's a bye, auto-advance the present team to next match
      if (isBye && r1Matches[matchIdx]) {
        const winnerId = teamA?.tournament_team_id ?? teamB?.tournament_team_id;
        if (winnerId) {
          const { rows: matchDetails } = await client.query(
            'SELECT next_match_id FROM tournament_matches WHERE id = $1', [r1Matches[matchIdx].id]
          );
          if (matchDetails[0]?.next_match_id) {
            const { rows: nextSlot } = await client.query(
              'SELECT team_a_id, team_b_id FROM tournament_matches WHERE id = $1',
              [matchDetails[0].next_match_id]
            );
            if (nextSlot.length) {
              const col = !nextSlot[0].team_a_id ? 'team_a_id' : 'team_b_id';
              await client.query(
                `UPDATE tournament_matches SET ${col} = $1 WHERE id = $2`,
                [winnerId, matchDetails[0].next_match_id]
              );
            }
          }
        }
      }

      // Update linked game with real team IDs
      const { rows: matchGame } = await client.query(
        'SELECT game_id FROM tournament_matches WHERE id = $1', [r1Matches[matchIdx].id]
      );
      if (matchGame[0]?.game_id) {
        const homeTeam = teamA ? await client.query('SELECT team_id FROM tournament_teams WHERE id = $1', [teamA.tournament_team_id]) : null;
        const awayTeam = teamB ? await client.query('SELECT team_id FROM tournament_teams WHERE id = $1', [teamB.tournament_team_id]) : null;
        await client.query(
          'UPDATE games SET home_team_id = $1, away_team_id = $2 WHERE id = $3',
          [homeTeam?.rows[0]?.team_id ?? null, awayTeam?.rows[0]?.team_id ?? null, matchGame[0].game_id]
        );
      }
    }

    // Clear any subsequent round slots that may have been set from a previous seeding
    const { rows: laterMatches } = await client.query(
      `SELECT tm.id FROM tournament_matches tm
       JOIN tournament_rounds tr ON tr.id = tm.round_id
       WHERE tm.tournament_id = $1 AND tr.round_number > 1
         AND tm.winner_team_id IS NULL`,
      [id]
    );
    for (const m of laterMatches) {
      await client.query(
        'UPDATE tournament_matches SET team_a_id = NULL, team_b_id = NULL WHERE id = $1',
        [m.id]
      );
    }

    await client.query('COMMIT');
    cache.invalidatePrefix('tournaments:');

    res.json({
      success: true,
      seeding_mode,
      qualifiers_seeded: qualifiers.length,
      bracket_size: bracketSize,
      bye_count: bracketSize - qualifiers.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ── POST /:id/pools — create a pool ─────────────────────────────────────────

router.post('/:id/pools', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: tRows } = await pool.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Pool name is required' });

    const { rows: maxRows } = await pool.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort FROM tournament_pools WHERE tournament_id = $1',
      [id]
    );
    const sortOrder = req.body?.sort_order != null ? Number(req.body.sort_order) : Number(maxRows[0].next_sort || 1);

    const { rows } = await pool.query(
      `INSERT INTO tournament_pools (tournament_id, name, sort_order)
       VALUES ($1, $2, $3) RETURNING *`,
      [id, name, sortOrder]
    );

    cache.invalidatePrefix('tournaments:');
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Pool name or sort order already exists for this tournament' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /:id/pools/:poolId — update pool metadata ───────────────────────────

router.put('/:id/pools/:poolId', authMiddleware, async (req, res) => {
  try {
    const { id, poolId } = req.params;
    const { rows: tRows } = await pool.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const nameParam = req.body?.name == null ? null : String(req.body.name).trim();
    const sortParam = req.body?.sort_order == null ? null : Number(req.body.sort_order);

    const { rows } = await pool.query(
      `UPDATE tournament_pools SET
         name = COALESCE($1, name),
         sort_order = COALESCE($2, sort_order)
       WHERE id = $3 AND tournament_id = $4
       RETURNING *`,
      [nameParam || null, Number.isFinite(sortParam) ? sortParam : null, poolId, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pool not found' });

    cache.invalidatePrefix('tournaments:');
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Pool name or sort order already exists for this tournament' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /:id/pools/:poolId — remove pool and assignments ─────────────────

router.delete('/:id/pools/:poolId', authMiddleware, async (req, res) => {
  try {
    const { id, poolId } = req.params;
    const { rows: tRows } = await pool.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    await pool.query(
      `DELETE FROM tournament_pools WHERE id = $1 AND tournament_id = $2`,
      [poolId, id]
    );

    cache.invalidatePrefix('tournaments:');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /:id/pools/:poolId/teams — assign team to pool ─────────────────────

router.post('/:id/pools/:poolId/teams', authMiddleware, async (req, res) => {
  try {
    const { id, poolId } = req.params;
    const { rows: tRows } = await pool.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const tournamentTeamId = Number(req.body?.tournament_team_id);
    if (!Number.isFinite(tournamentTeamId)) {
      return res.status(400).json({ error: 'tournament_team_id is required' });
    }

    const { rows: poolRows } = await pool.query(
      'SELECT id FROM tournament_pools WHERE id = $1 AND tournament_id = $2',
      [poolId, id]
    );
    if (!poolRows.length) return res.status(404).json({ error: 'Pool not found' });

    const { rows: ttRows } = await pool.query(
      'SELECT id FROM tournament_teams WHERE id = $1 AND tournament_id = $2',
      [tournamentTeamId, id]
    );
    if (!ttRows.length) return res.status(404).json({ error: 'Tournament team not found' });

    const { rows } = await pool.query(
      `INSERT INTO tournament_pool_teams (pool_id, tournament_team_id)
       VALUES ($1, $2)
       ON CONFLICT (tournament_team_id)
       DO UPDATE SET pool_id = EXCLUDED.pool_id
       RETURNING *`,
      [poolId, tournamentTeamId]
    );

    cache.invalidatePrefix('tournaments:');
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /:id/pools/:poolId/teams/:ttId — remove assignment ───────────────

router.delete('/:id/pools/:poolId/teams/:ttId', authMiddleware, async (req, res) => {
  try {
    const { id, poolId, ttId } = req.params;
    const { rows: tRows } = await pool.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    await pool.query(
      `DELETE FROM tournament_pool_teams
       WHERE pool_id = $1
         AND tournament_team_id = $2
         AND EXISTS (SELECT 1 FROM tournament_pools p WHERE p.id = $1 AND p.tournament_id = $3)`,
      [poolId, ttId, id]
    );

    cache.invalidatePrefix('tournaments:');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /:id/pools/auto-balance — auto-assign all teams into pools ─────────

router.post('/:id/pools/auto-balance', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { rows: tRows } = await client.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const poolCount = Number(req.body?.pool_count);
    if (!Number.isFinite(poolCount) || poolCount < 2 || poolCount > 16) {
      return res.status(400).json({ error: 'pool_count must be between 2 and 16' });
    }

    await client.query('BEGIN');

    const { rows: existingPools } = await client.query(
      'SELECT id, sort_order FROM tournament_pools WHERE tournament_id = $1 ORDER BY sort_order, id',
      [id]
    );

    const pools = [...existingPools];
    for (let i = pools.length; i < poolCount; i++) {
      const letter = String.fromCharCode(65 + i);
      const { rows } = await client.query(
        `INSERT INTO tournament_pools (tournament_id, name, sort_order)
         VALUES ($1, $2, $3)
         RETURNING id, sort_order`,
        [id, `Pool ${letter}`, i + 1]
      );
      pools.push(rows[0]);
    }

    const selectedPoolIds = pools
      .sort((a, b) => a.sort_order - b.sort_order)
      .slice(0, poolCount)
      .map(p => p.id);

    const { rows: teams } = await client.query(
      `SELECT id FROM tournament_teams
       WHERE tournament_id = $1 AND registration_status != 'withdrawn'
       ORDER BY seed NULLS LAST, id`,
      [id]
    );

    await client.query(
      `DELETE FROM tournament_pool_teams
       WHERE pool_id IN (
         SELECT id FROM tournament_pools WHERE tournament_id = $1
       )`,
      [id]
    );

    // Build high-vs-low seed pairs (1 with N, 2 with N-1, ...), then
    // snake those pairs across pools for a more balanced distribution.
    const pairs = [];
    let left = 0;
    let right = teams.length - 1;
    while (left <= right) {
      const pair = [teams[left].id];
      if (left !== right) pair.push(teams[right].id);
      pairs.push(pair);
      left += 1;
      right -= 1;
    }

    // Keep pools balanced by always placing each high/low pair into the
    // currently least-filled pool (difference stays at most 1 team).
    const poolTeamCounts = new Array(selectedPoolIds.length).fill(0);
    let tieBreakerStart = 0;

    for (let i = 0; i < pairs.length; i++) {
      const minCount = Math.min(...poolTeamCounts);
      const candidatePoolIndexes = [];
      for (let p = 0; p < poolTeamCounts.length; p++) {
        if (poolTeamCounts[p] === minCount) candidatePoolIndexes.push(p);
      }

      const chosenOffset = tieBreakerStart % candidatePoolIndexes.length;
      const targetPoolIndex = candidatePoolIndexes[chosenOffset];
      const targetPool = selectedPoolIds[targetPoolIndex];

      for (const tournamentTeamId of pairs[i]) {
        await client.query(
          'INSERT INTO tournament_pool_teams (pool_id, tournament_team_id) VALUES ($1, $2)',
          [targetPool, tournamentTeamId]
        );
        poolTeamCounts[targetPoolIndex] += 1;
      }

      tieBreakerStart += 1;
    }

    await client.query('COMMIT');
    cache.invalidatePrefix('tournaments:');
    res.json({ success: true, pool_count: poolCount, assigned_teams: teams.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ── POST /:id/pools/:poolId/schedule-round-robin — generate pool games ──────

router.post('/:id/pools/:poolId/schedule-round-robin', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, poolId } = req.params;
    const requestedGamesPerTeam = req.body?.games_per_team == null || req.body?.games_per_team === ''
      ? null
      : Number(req.body.games_per_team);

    if (requestedGamesPerTeam != null && (!Number.isFinite(requestedGamesPerTeam) || requestedGamesPerTeam < 1)) {
      return res.status(400).json({ error: 'games_per_team must be a positive number when provided' });
    }

    const { rows: tRows } = await client.query('SELECT org_id, start_date FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const { rows: poolRows } = await client.query(
      'SELECT id FROM tournament_pools WHERE id = $1 AND tournament_id = $2',
      [poolId, id]
    );
    if (!poolRows.length) return res.status(404).json({ error: 'Pool not found' });

    const { rows: assignedTeams } = await client.query(
      `SELECT tt.id AS tournament_team_id, tt.team_id
       FROM tournament_pool_teams ppt
       JOIN tournament_teams tt ON tt.id = ppt.tournament_team_id
       WHERE ppt.pool_id = $1 AND tt.tournament_id = $2
       ORDER BY tt.seed NULLS LAST, tt.id`,
      [poolId, id]
    );

    if (assignedTeams.length < 2) {
      return res.status(400).json({ error: 'Pool needs at least 2 teams to generate round-robin matches' });
    }

    const teamIds = assignedTeams.map(t => t.tournament_team_id);
    const fullRoundRobin = buildRoundRobinRounds(teamIds);
    const partialPlan = requestedGamesPerTeam != null
      ? buildPartialPoolRounds(teamIds, requestedGamesPerTeam)
      : null;

    const scheduledMatches = partialPlan
      ? partialPlan.rounds
      : fullRoundRobin.flatMap((roundMatches, rIdx) =>
        roundMatches.map((match, mIdx) => ({
          teamAId: match[0],
          teamBId: match[1],
          round_number: rIdx + 1,
          match_number: mIdx + 1,
        }))
      );

    const defaultGameDate = tRows[0].start_date || new Date().toISOString().slice(0, 10);

    await client.query('BEGIN');

    const { rows: existingPoolMatches } = await client.query(
      'SELECT id, game_id FROM tournament_pool_matches WHERE pool_id = $1',
      [poolId]
    );
    const gameIds = existingPoolMatches.map(m => m.game_id).filter(Boolean);
    if (gameIds.length) {
      await client.query('DELETE FROM games WHERE id = ANY($1)', [gameIds]);
    }
    await client.query('DELETE FROM tournament_pool_matches WHERE pool_id = $1', [poolId]);

    let createdMatches = 0;
    for (const sm of scheduledMatches) {
      const teamAId = sm.teamAId;
      const teamBId = sm.teamBId;
      const teamA = assignedTeams.find(t => t.tournament_team_id === teamAId) || null;
      const teamB = assignedTeams.find(t => t.tournament_team_id === teamBId) || null;

      const { rows: gRows } = await client.query(
        `INSERT INTO games (tournament_id, home_team_id, away_team_id, game_date, status)
         VALUES ($1, $2, $3, $4, 'scheduled')
         RETURNING id`,
        [id, teamA?.team_id || null, teamB?.team_id || null, defaultGameDate]
      );
      const gameId = gRows[0].id;

      const { rows: poolMatchRows } = await client.query(
        `INSERT INTO tournament_pool_matches (tournament_id, pool_id, round_number, match_number, team_a_id, team_b_id, game_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [id, poolId, sm.round_number, sm.match_number, teamAId, teamBId, gameId]
      );

      await client.query(
        'UPDATE games SET tournament_pool_match_id = $1 WHERE id = $2',
        [poolMatchRows[0].id, gameId]
      );
      createdMatches += 1;
    }

    await client.query('COMMIT');
    cache.invalidatePrefix('tournaments:');
    res.json({
      success: true,
      rounds: partialPlan ? null : fullRoundRobin.length,
      matches: createdMatches,
      games_per_team_requested: requestedGamesPerTeam,
      games_per_team_applied: partialPlan ? partialPlan.applied_games_per_team : null,
      min_games_per_team: partialPlan ? partialPlan.min_games_per_team : null,
      max_games_per_team: partialPlan ? partialPlan.max_games_per_team : null,
      note: partialPlan?.note || null,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
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
    const parsedLocationId = location_id ? Number(location_id) : null;
    if (location_id && !Number.isFinite(parsedLocationId)) {
      return res.status(400).json({ error: 'Invalid location_id' });
    }
    if (parsedLocationId) {
      const { rows: locRows } = await pool.query(
        'SELECT id FROM field_locations WHERE id = $1 AND org_id = $2',
        [parsedLocationId, tRows[0].org_id]
      );
      if (!locRows.length) {
        return res.status(400).json({ error: 'Selected field is not associated with this tournament organization' });
      }
    }

    const newStatus = game_date && game_time && parsedLocationId ? 'scheduled' : 'unscheduled';
    await pool.query(
      `UPDATE games SET
        game_date = COALESCE($1, game_date),
        game_time = COALESCE($2, game_time),
        location_id = COALESCE($3, location_id),
        status = $4,
        updated_at = NOW()
       WHERE id = $5`,
      [game_date || null, game_time || null, parsedLocationId || null, newStatus, mRows[0].game_id]
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
    const parsedLocationId = location_id ? Number(location_id) : null;
    if (location_id && !Number.isFinite(parsedLocationId)) {
      return res.status(400).json({ error: 'Invalid location_id' });
    }
    if (parsedLocationId) {
      const { rows: locRows } = await pool.query(
        'SELECT id FROM field_locations WHERE id = $1 AND org_id = $2',
        [parsedLocationId, tRows[0].org_id]
      );
      if (!locRows.length) {
        return res.status(400).json({ error: 'Selected field is not associated with this tournament organization' });
      }
    }

    const newStatus = game_date && game_time && parsedLocationId ? 'scheduled' : 'unscheduled';
    await pool.query(
      `UPDATE games SET
        home_team_id = $1, away_team_id = $2,
        game_date = $3, game_time = $4, location_id = $5,
        status = $6, updated_at = NOW()
       WHERE id = $7`,
      [homeTeamId, awayTeamId,
       game_date || null, game_time || null, parsedLocationId || null,
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

// ── POST /:id/register — self-service team registration ──────────────────────

router.post('/:id/register', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { team_id, notes } = req.body;
  if (!team_id) return res.status(400).json({ error: 'team_id is required' });

  try {
    // Fetch tournament
    const { rows: tRows } = await pool.query(
      'SELECT * FROM tournaments WHERE id = $1', [id]
    );
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
    const tournament = tRows[0];

    if (!tournament.registration_open) {
      return res.status(409).json({ error: 'Registration is closed for this tournament' });
    }
    if (tournament.registration_deadline) {
      const deadline = new Date(tournament.registration_deadline);
      deadline.setHours(23, 59, 59, 999);
      if (new Date() > deadline) {
        return res.status(409).json({ error: 'Registration deadline has passed' });
      }
    }

    // Verify caller can manage this team
    const allowed = await canEditTeam(req.user, team_id);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    // Check for existing non-withdrawn registration
    const { rows: existing } = await pool.query(
      `SELECT id FROM tournament_teams
       WHERE tournament_id = $1 AND team_id = $2 AND registration_status != 'withdrawn'`,
      [id, team_id]
    );
    if (existing.length) return res.status(409).json({ error: 'Team is already registered' });

    // Count current active registrations
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM tournament_teams
       WHERE tournament_id = $1 AND registration_status != 'withdrawn'`,
      [id]
    );
    const currentCount = countRows[0].cnt;
    const status =
      !tournament.max_registrations || currentCount < tournament.max_registrations
        ? 'registered'
        : 'waitlisted';

    const { rows: inserted } = await pool.query(
      `INSERT INTO tournament_teams (tournament_id, team_id, registration_status, registered_by, registration_notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, team_id, status, req.user.id, notes || null]
    );

    cache.invalidatePrefix('tournaments:');
    res.status(201).json(inserted[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /:id/teams/:ttId/withdraw — self-service withdrawal ────────────────

router.patch('/:id/teams/:ttId/withdraw', authMiddleware, async (req, res) => {
  const { id, ttId } = req.params;
  try {
    const { rows: ttRows } = await pool.query(
      `SELECT tt.*, t.org_id AS tournament_org_id
       FROM tournament_teams tt
       JOIN tournaments t ON t.id = tt.tournament_id
       WHERE tt.id = $1 AND tt.tournament_id = $2`,
      [ttId, id]
    );
    if (!ttRows.length) return res.status(404).json({ error: 'Registration not found' });
    const tt = ttRows[0];

    const isOwner = tt.registered_by === req.user.id;
    const isHost = await canManageTournament(req.user, tt.tournament_org_id);
    if (!isOwner && !isHost) return res.status(403).json({ error: 'Forbidden' });

    await pool.query(
      `UPDATE tournament_teams SET registration_status = 'withdrawn' WHERE id = $1`,
      [ttId]
    );

    cache.invalidatePrefix('tournaments:');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /:id/registrations — list registrations (host admin) ─────────────────

router.get('/:id/registrations', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: tRows } = await pool.query('SELECT org_id FROM tournaments WHERE id = $1', [id]);
    if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });

    const allowed = await canManageTournament(req.user, tRows[0].org_id);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      `SELECT tt.*, t.name AS team_name, o.name AS org_name,
              u.name AS registered_by_name
       FROM tournament_teams tt
       LEFT JOIN teams t ON t.id = tt.team_id
       LEFT JOIN organizations o ON o.id = t.org_id
       LEFT JOIN users u ON u.id = tt.registered_by
       WHERE tt.tournament_id = $1
       ORDER BY tt.created_at`,
      [id]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

