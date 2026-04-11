/* ═══════════════════════════════════════════════════════
   Import Routes — /api/import/*
   Handles GameChanger imports: PDF, pasted text, URL.
   ═══════════════════════════════════════════════════════ */

const express = require('express');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');
const { parseBoxScorePDF, parseBoxScoreText } = require('../parsers/boxscore-pdf');

const router = express.Router();

// Accept files up to 5 MB (PDFs can be a few MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/* ── Team + Player lookups (shared helpers) ── */

/**
 * Build a lookup map: lowercased-name → team_id
 * Includes: team.name, team.abbreviation, "Name (Org)", and all team_name_aliases.
 */
async function buildTeamLookup() {
  const { rows } = await pool.query(
    'SELECT t.id, t.name, t.abbreviation, o.name AS org_name FROM teams t LEFT JOIN organizations o ON o.id = t.org_id'
  );
  const byName = {};
  const lookup = {};
  for (const t of rows) {
    const key = t.name.toLowerCase();
    if (!byName[key]) byName[key] = [];
    byName[key].push(t.id);
    if (t.org_name) lookup[`${t.name} (${t.org_name})`.toLowerCase()] = t.id;
    if (t.abbreviation) lookup[t.abbreviation.toLowerCase()] = t.id;
  }
  for (const [name, ids] of Object.entries(byName)) {
    if (ids.length === 1) lookup[name] = ids[0];
  }

  // Layer in saved aliases (these take priority for external names)
  const { rows: aliases } = await pool.query(
    'SELECT external_name, team_id FROM team_name_aliases'
  );
  for (const a of aliases) {
    lookup[a.external_name.toLowerCase()] = a.team_id;
  }

  return lookup;
}

/**
 * Get the full teams list for the frontend mapping UI.
 */
async function getTeamsList() {
  const { rows } = await pool.query(
    `SELECT t.id, t.name, t.abbreviation, t.age_group, o.name AS org_name
     FROM teams t LEFT JOIN organizations o ON o.id = t.org_id
     ORDER BY t.name`
  );
  return rows;
}

async function buildPlayerLookup(teamId) {
  // Get all players (optionally scoped to a team)
  let query, params;
  if (teamId) {
    query = `
      SELECT p.id, p.first_name, p.last_name, tp.jersey_number
      FROM players p
      JOIN team_players tp ON tp.player_id = p.id
      WHERE tp.team_id = $1
    `;
    params = [teamId];
  } else {
    query = `
      SELECT p.id, p.first_name, p.last_name, tp.jersey_number
      FROM players p
      LEFT JOIN team_players tp ON tp.player_id = p.id
    `;
    params = [];
  }
  const { rows } = await pool.query(query, params);
  const lookup = {};
  for (const p of rows) {
    const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
    const lastName = p.last_name.toLowerCase();
    const firstName = p.first_name.toLowerCase();
    const firstInitialLast = `${p.first_name[0]}. ${p.last_name}`.toLowerCase();
    // "FirstName L" — first name + last initial (GC format)
    const firstNameLastInitial = `${p.first_name} ${p.last_name[0]}`.toLowerCase();
    const entry = { id: p.id, jersey: p.jersey_number, first_name: p.first_name, last_name: p.last_name };
    lookup[fullName] = entry;
    // Store last name only if unambiguous
    if (!lookup[lastName]) lookup[lastName] = entry;
    else lookup[lastName] = null; // Ambiguous
    // Store first name only if unambiguous
    if (!lookup[firstName]) lookup[firstName] = entry;
    else lookup[firstName] = null; // Ambiguous
    lookup[firstInitialLast] = entry;
    lookup[firstNameLastInitial] = entry;
    if (p.jersey_number) {
      lookup[`#${p.jersey_number}`] = entry;
    }
  }
  return { lookup, list: rows };
}

function matchPlayer(name, jersey, playerLookup) {
  if (!name) return null;
  const clean = name.replace(/\s+/g, ' ').trim().toLowerCase();

  // Exact full name match
  if (playerLookup[clean]) return playerLookup[clean];

  // Jersey number match (most reliable for GC data)
  if (jersey && playerLookup[`#${jersey}`]) return playerLookup[`#${jersey}`];

  // GC uses "F LastName" — try matching "firstInitial. lastname"
  const parts = clean.split(' ');
  if (parts.length >= 2 && parts[0].length === 1) {
    // Try "F. LastName" format in lookup
    const initialDot = `${parts[0]}. ${parts.slice(1).join(' ')}`;
    if (playerLookup[initialDot]) return playerLookup[initialDot];
  }

  // GC sometimes uses "FirstName L" — first name + last initial
  if (parts.length === 2 && parts[1].length === 1) {
    // Already indexed in buildPlayerLookup as firstNameLastInitial
    if (playerLookup[clean]) return playerLookup[clean];
  }

  // Try "Last, First" → "First Last"
  const commaMatch = clean.match(/^(.+?),\s*(.+)$/);
  if (commaMatch) {
    const flipped = `${commaMatch[2]} ${commaMatch[1]}`;
    if (playerLookup[flipped]) return playerLookup[flipped];
  }

  // Try last name only (unambiguous)
  const lastName = parts[parts.length - 1];
  if (playerLookup[lastName] && playerLookup[lastName] !== null) return playerLookup[lastName];

  return null;
}

/* ═══════════════════════════════════════════════════════
   Shared: parse box score from any input source
   ═══════════════════════════════════════════════════════ */
async function parseBoxScoreInput(req) {
  const pastedText = req.body.pastedText;

  // Mode 1: Pasted text from GC web page
  if (pastedText && pastedText.trim().length > 10) {
    return parseBoxScoreText(pastedText);
  }

  // Mode 2: Uploaded file (PDF or text file)
  if (req.file) {
    const fileName = req.file.originalname || '';
    const isPDF = fileName.toLowerCase().endsWith('.pdf') ||
                  req.file.mimetype === 'application/pdf';

    if (isPDF) {
      return await parseBoxScorePDF(req.file.buffer);
    }

    // Plain text file (.txt, .csv, etc.)
    const text = req.file.buffer.toString('utf8');
    if (text.trim().length > 10) {
      return parseBoxScoreText(text);
    }
    throw new Error('File appears to be empty or unreadable');
  }

  throw new Error('No data provided. Upload a file or paste box score text.');
}

/**
 * Build preview response from parsed box score data.
 */
async function buildBoxScorePreview(parsed) {
  const { gameInfo, batting, pitching } = parsed;

  // Check which teams match our database
  const teamLookup = await buildTeamLookup();
  const detectedTeams = [gameInfo.awayTeam, gameInfo.homeTeam].filter(Boolean);
  const unmatchedTeams = detectedTeams.filter(t => !teamLookup[t.toLowerCase()]);
  const matchedTeamMap = {};
  for (const t of detectedTeams) {
    const id = teamLookup[t.toLowerCase()];
    if (id) matchedTeamMap[t] = id;
  }

  const headers = ['type', 'team', 'player', 'stat_line'];
  const rows = [];

  // Game info row
  rows.push({
    type: 'Game',
    team: `${gameInfo.awayTeam || '?'} @ ${gameInfo.homeTeam || '?'}`,
    player: gameInfo.date || '—',
    stat_line: gameInfo.finalScore
      ? `${gameInfo.finalScore.away} - ${gameInfo.finalScore.home}`
      : '—',
  });

  // Batting rows
  for (const side of ['away', 'home']) {
    const teamName = side === 'away' ? gameInfo.awayTeam : gameInfo.homeTeam;
    for (const b of batting[side]) {
      rows.push({
        type: 'Batting',
        team: teamName || side,
        player: b.name,
        stat_line: [
          b.ab != null ? `${b.ab} AB` : null,
          b.h != null ? `${b.h} H` : null,
          b.r != null ? `${b.r} R` : null,
          b.rbi != null ? `${b.rbi} RBI` : null,
          b.bb != null ? `${b.bb} BB` : null,
          b.so != null ? `${b.so} SO` : null,
        ].filter(Boolean).join(', '),
      });
    }
  }

  // Pitching rows — show jersey, pitch count, match status
  // Also build pitcher mapping data for the player mapping UI
  const pitcherMappings = [];
  const playersByTeam = {};

  for (const side of ['away', 'home']) {
    const teamName = side === 'away' ? gameInfo.awayTeam : gameInfo.homeTeam;
    const teamId = side === 'away' ? teamLookup[(gameInfo.awayTeam || '').toLowerCase()] : teamLookup[(gameInfo.homeTeam || '').toLowerCase()];
    const { lookup: playerLookup, list: playerList } = teamId ? await buildPlayerLookup(teamId) : { lookup: {}, list: [] };

    // Store player list for this team (for mapping dropdowns)
    if (teamId && playerList.length > 0) {
      playersByTeam[teamId] = playerList.map(p => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        jersey_number: p.jersey_number,
      }));
    }

    for (const p of pitching[side]) {
      const matched = matchPlayer(p.name, p.jersey, playerLookup);
      const matchLabel = matched ? '✓ Matched' : '+ New player';
      const jerseyLabel = p.jersey ? `#${p.jersey}` : '';

      rows.push({
        type: 'Pitching',
        team: teamName || side,
        player: `${p.name} ${jerseyLabel}`.trim(),
        stat_line: [
          p.pitches != null ? `${p.pitches} pitches` : null,
          p.strikes != null ? `${p.strikes} strikes` : null,
          p.ip != null ? `${p.ip} IP` : null,
          p.k != null ? `${p.k} K` : null,
          p.bb != null ? `${p.bb} BB` : null,
          p.er != null ? `${p.er} ER` : null,
          matchLabel,
        ].filter(Boolean).join(', '),
      });

      // Build pitcher mapping entry
      pitcherMappings.push({
        gcName: p.name,
        jersey: p.jersey || null,
        firstName: p.firstName || null,
        lastName: p.lastName || null,
        pitches: p.pitches ?? null,
        strikes: p.strikes ?? null,
        ip: p.ip ?? null,
        side,
        teamName: teamName || side,
        teamId: teamId || null,
        suggestedPlayerId: matched ? matched.id : null,
        suggestedPlayerName: matched
          ? `${matched.first_name} ${matched.last_name}`
          : null,
      });
    }
  }

  const teamsListForMapping = unmatchedTeams.length > 0 ? await getTeamsList() : [];

  return {
    headers,
    rows,
    detectedType: 'boxscore',
    gameInfo,
    teams: { away: gameInfo.awayTeam, home: gameInfo.homeTeam },
    unmatchedTeams,
    matchedTeams: matchedTeamMap,
    teamsList: teamsListForMapping,
    pitcherMappings,
    playersByTeam,
    _debug: parsed._debug || null,
    _rawText: (parsed.raw || '').slice(0, 5000),
  };
}

/* ═══════════════════════════════════════════════════════
   POST /api/import/gamechanger/preview
   Parse file OR pasted text, return preview rows.
   ═══════════════════════════════════════════════════════ */
router.post(
  '/gamechanger/preview',
  authMiddleware,
  upload.single('gamechangerFile'),
  async (req, res) => {
    try {
      const importType = req.body.importType || 'boxscore';
      const pastedText = req.body.pastedText;

      // Must have either a file or pasted text
      if (!req.file && (!pastedText || pastedText.trim().length < 10)) {
        return res.status(400).json({ error: 'Upload a file or paste box score text' });
      }

      if (importType === 'boxscore') {
        const parsed = await parseBoxScoreInput(req);
        const preview = await buildBoxScorePreview(parsed);
        return res.json(preview);
      }

      // CSV-based import types (schedule, stats, roster)
      if (!req.file) {
        return res.status(400).json({ error: 'CSV import requires a file upload' });
      }

      const text = req.file.buffer.toString('utf8');
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        return res.status(400).json({ error: 'File appears to be empty' });
      }

      const headerLine = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const previewRows = lines.slice(1, 11).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row = {};
        headerLine.forEach((h, i) => { row[h] = vals[i] || ''; });
        return row;
      });

      return res.json({
        headers: headerLine,
        rows: previewRows,
        detectedType: importType,
      });

    } catch (err) {
      console.error('Preview error:', err);
      res.status(400).json({ error: err.message || 'Failed to parse input' });
    }
  }
);

/* ═══════════════════════════════════════════════════════
   POST /api/import/gamechanger
   Full import — parse, match, and insert into DB.
   Accepts file upload OR pastedText.
   ═══════════════════════════════════════════════════════ */
router.post(
  '/gamechanger',
  authMiddleware,
  upload.single('gamechangerFile'),
  async (req, res) => {
    try {
      const importType = req.body.importType || 'boxscore';
      const teamId = req.body.teamId ? parseInt(req.body.teamId) : null;
      const seasonId = req.body.seasonId ? parseInt(req.body.seasonId) : null;
      const overwrite = req.body.overwrite === 'true';
      const pastedText = req.body.pastedText;

      if (!req.file && (!pastedText || pastedText.trim().length < 10)) {
        return res.status(400).json({ error: 'Upload a file or paste box score text' });
      }

      // Parse team mappings from frontend (JSON string: { "GC Name": teamId, ... })
      let teamMappings = {};
      if (req.body.teamMappings) {
        try { teamMappings = JSON.parse(req.body.teamMappings); } catch { /* ignore */ }
      }

      // Parse player mappings from frontend (JSON string: { "GC Name": playerId|"__new__", ... })
      let playerMappings = {};
      if (req.body.playerMappings) {
        try { playerMappings = JSON.parse(req.body.playerMappings); } catch { /* ignore */ }
      }

      if (importType === 'boxscore') {
        const parsed = await parseBoxScoreInput(req);
        return await importBoxScore(req, res, {
          parsed,
          teamId,
          seasonId,
          overwrite,
          teamMappings,
          playerMappings,
        });
      }

      // Future: CSV stat imports, schedule imports, roster imports
      return res.status(400).json({ error: `Import type "${importType}" is not yet supported` });

    } catch (err) {
      console.error('Import error:', err);
      res.status(400).json({ error: err.message || 'Import failed' });
    }
  }
);

/* ── Box Score Import Logic ── */
async function importBoxScore(req, res, opts) {
  const { parsed, teamId, seasonId, overwrite, teamMappings, playerMappings } = opts;
  const { gameInfo, linescore, batting, pitching } = parsed;

  const results = {
    success: true,
    games: 0,
    players: 0,
    stats: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    message: '',
  };

  // ── Save any new team mappings as aliases for future imports ──
  if (teamMappings && typeof teamMappings === 'object') {
    for (const [externalName, mappedTeamId] of Object.entries(teamMappings)) {
      if (externalName && mappedTeamId) {
        try {
          await pool.query(
            `INSERT INTO team_name_aliases (external_name, team_id, source)
             VALUES ($1, $2, 'gamechanger')
             ON CONFLICT (external_name, source) DO UPDATE SET team_id = $2`,
            [externalName, parseInt(mappedTeamId)]
          );
        } catch (err) {
          results.errors.push(`Could not save alias for "${externalName}": ${err.message}`);
        }
      }
    }
  }

  // ── Resolve teams (includes saved aliases + any just-saved ones) ──
  const teamLookup = await buildTeamLookup();

  // Also overlay the ad-hoc mappings passed in this request
  if (teamMappings) {
    for (const [externalName, mappedTeamId] of Object.entries(teamMappings)) {
      if (externalName && mappedTeamId) {
        teamLookup[externalName.toLowerCase()] = parseInt(mappedTeamId);
      }
    }
  }

  const awayTeamId = gameInfo.awayTeam ? teamLookup[gameInfo.awayTeam.toLowerCase()] : null;
  const homeTeamId = gameInfo.homeTeam ? teamLookup[gameInfo.homeTeam.toLowerCase()] : null;

  if (!awayTeamId && gameInfo.awayTeam) {
    results.errors.push(`Away team "${gameInfo.awayTeam}" not found in database`);
  }
  if (!homeTeamId && gameInfo.homeTeam) {
    results.errors.push(`Home team "${gameInfo.homeTeam}" not found in database`);
  }

  // ── Resolve scores from linescore or gameInfo ──
  let homeScore = gameInfo.finalScore?.home ?? null;
  let awayScore = gameInfo.finalScore?.away ?? null;
  let inningsPlayed = null;

  if (linescore.length >= 2) {
    // First row is away, second is home (standard box score ordering)
    if (awayScore == null) awayScore = linescore[0].runs ?? null;
    if (homeScore == null) homeScore = linescore[1].runs ?? null;
    inningsPlayed = Math.max(
      linescore[0].innings?.length || 0,
      linescore[1].innings?.length || 0
    ) || null;
  }

  // ── Create game record ──
  let gameId = null;
  const gameDate = gameInfo.date || null;

  if (gameDate) {
    // Check for existing game on same date with same teams
    let existingGameId = null;
    if (awayTeamId && homeTeamId) {
      const { rows: existingGames } = await pool.query(
        `SELECT id FROM games
         WHERE game_date = $1 AND home_team_id = $2 AND away_team_id = $3
         LIMIT 1`,
        [gameDate, homeTeamId, awayTeamId]
      );
      if (existingGames.length > 0) {
        existingGameId = existingGames[0].id;
      }
    }

    if (existingGameId && overwrite) {
      // Update existing game
      await pool.query(
        `UPDATE games SET home_score = $1, away_score = $2, innings_played = $3,
         status = 'completed', game_time = $4 WHERE id = $5`,
        [homeScore, awayScore, inningsPlayed, gameInfo.time, existingGameId]
      );
      gameId = existingGameId;
      results.updated++;
    } else if (existingGameId) {
      gameId = existingGameId;
      results.skipped++;
    } else {
      // Create new game
      const { rows: newGame } = await pool.query(
        `INSERT INTO games (game_date, game_time, home_team_id, away_team_id, season_id,
         status, home_score, away_score, innings_played)
         VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8)
         RETURNING id`,
        [gameDate, gameInfo.time, homeTeamId, awayTeamId, seasonId,
         homeScore, awayScore, inningsPlayed]
      );
      gameId = newGame[0].id;
      results.created++;
    }
    results.games = 1;
  } else {
    results.errors.push('Could not determine game date from box score');
  }

  // ── Match and import pitching data (pitch counts) ──
  if (gameId) {
    const sides = [
      { pitchers: pitching.away, teamId: awayTeamId, label: 'Away' },
      { pitchers: pitching.home, teamId: homeTeamId, label: 'Home' },
    ];

    for (const side of sides) {
      if (!side.teamId) continue;
      // Rebuild lookup each iteration so newly-created players are visible
      let { lookup: playerLookup, list: playerList } = await buildPlayerLookup(side.teamId);

      for (const pitcher of side.pitchers) {
        let player = null;

        // Check user-supplied player mappings first
        const userMapping = playerMappings && pitcher.name ? playerMappings[pitcher.name] : null;
        if (userMapping && userMapping !== '__new__') {
          // User explicitly mapped to an existing player ID
          const mappedId = parseInt(userMapping);
          if (!isNaN(mappedId)) {
            player = { id: mappedId };
          }
        } else if (userMapping !== '__new__') {
          // No explicit "create new" — try auto-matching
          player = matchPlayer(pitcher.name, pitcher.jersey, playerLookup);
        }

        // Auto-create player if not found (or user chose "__new__")
        if (!player && pitcher.name) {
          const firstName = pitcher.firstName || pitcher.name.split(' ')[0] || '';
          const lastName = pitcher.lastName || pitcher.name.split(' ').slice(1).join(' ') || '';
          try {
            const { rows: newP } = await pool.query(
              `INSERT INTO players (first_name, last_name) VALUES ($1, $2) RETURNING id`,
              [firstName, lastName]
            );
            const newId = newP[0].id;
            const jerseyNum = pitcher.jersey ? parseInt(pitcher.jersey) : null;
            await pool.query(
              `INSERT INTO team_players (team_id, player_id, jersey_number)
               VALUES ($1, $2, $3)
               ON CONFLICT (team_id, player_id) DO UPDATE SET jersey_number = $3`,
              [side.teamId, newId, jerseyNum]
            );
            player = { id: newId, jersey: jerseyNum };
            results.created++;
            // Refresh lookup so jersey/name is available for subsequent pitchers
            ({ lookup: playerLookup, list: playerList } = await buildPlayerLookup(side.teamId));
          } catch (err) {
            results.errors.push(`Could not create player "${pitcher.name}": ${err.message}`);
            results.skipped++;
            continue;
          }
        }

        if (!player) {
          results.errors.push(`${side.label} pitcher "${pitcher.name}" could not be matched or created`);
          results.skipped++;
          continue;
        }

        const pitchCount = pitcher.pitches ?? null;
        const ip = pitcher.ip != null ? String(pitcher.ip) : null;

        if (pitchCount == null && ip == null) {
          results.skipped++;
          continue;
        }

        await upsertPitchCount(gameId, player.id, side.teamId, pitchCount, ip, overwrite);
        results.stats++;
        results.players++;
      }
    }
  }

  // ── Summary message ──
  const parts = [];
  if (results.games) parts.push(`${results.games} game`);
  if (results.stats) parts.push(`${results.stats} pitch count records`);
  if (results.errors.length) parts.push(`${results.errors.length} warnings`);
  results.message = parts.length
    ? `Imported: ${parts.join(', ')}.`
    : 'No data was imported.';

  // Remove success flag if there were fatal issues
  if (!gameId && !results.stats) results.success = false;

  res.json(results);
}

/* ── Upsert pitch count ── */
async function upsertPitchCount(gameId, playerId, teamId, pitchCount, inningsPitched, overwrite) {
  const { rows: existing } = await pool.query(
    'SELECT id FROM game_pitch_counts WHERE game_id = $1 AND player_id = $2',
    [gameId, playerId]
  );

  if (existing.length > 0 && overwrite) {
    await pool.query(
      `UPDATE game_pitch_counts SET pitch_count = $1, innings_pitched = $2, team_id = $3
       WHERE game_id = $4 AND player_id = $5`,
      [pitchCount || 0, inningsPitched, teamId, gameId, playerId]
    );
  } else if (existing.length === 0) {
    await pool.query(
      `INSERT INTO game_pitch_counts (game_id, player_id, team_id, pitch_count, innings_pitched)
       VALUES ($1, $2, $3, $4, $5)`,
      [gameId, playerId, teamId, pitchCount || 0, inningsPitched]
    );
  }
}

/* ═══════════════════════════════════════════════════════
   Team Name Aliases — CRUD endpoints
   ═══════════════════════════════════════════════════════ */

// GET /api/import/team-aliases — list all saved aliases
router.get('/team-aliases', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.external_name, a.team_id, a.source, a.created_at,
              t.name AS team_name, t.abbreviation AS team_abbreviation
       FROM team_name_aliases a
       JOIN teams t ON t.id = a.team_id
       ORDER BY a.external_name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/team-aliases — create or update an alias
router.post('/team-aliases', authMiddleware, async (req, res) => {
  try {
    const { externalName, teamId, source } = req.body;
    if (!externalName || !teamId) {
      return res.status(400).json({ error: 'externalName and teamId are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO team_name_aliases (external_name, team_id, source)
       VALUES ($1, $2, $3)
       ON CONFLICT (external_name, source) DO UPDATE SET team_id = $2
       RETURNING *`,
      [externalName, parseInt(teamId), source || 'gamechanger']
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/import/team-aliases/:id — remove an alias
router.delete('/team-aliases/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM team_name_aliases WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
