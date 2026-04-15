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

      const headerLine = parseCSVLine(lines[0]).map(h => h.trim());
      const previewRows = lines.slice(1, 11).map(line => {
        const vals = parseCSVLine(line).map(v => v.trim());
        const row = {};
        headerLine.forEach((h, i) => { row[h] = vals[i] || ''; });
        return row;
      });

      // For roster imports: detect Team column and return unmatched teams for mapping UI
      if (importType === 'roster') {
        const teamColIndex = headerLine.findIndex(h =>
          ['team', 'club', 'team name', 'teamname'].includes(h.toLowerCase())
        );

        if (teamColIndex >= 0) {
          const teamLookup = await buildTeamLookup();
          const teamsList = await getTeamsList();
          const teamColHeader = headerLine[teamColIndex];

          const allRows = lines.slice(1).map(line => {
            const vals = parseCSVLine(line).map(v => v.trim());
            return vals[teamColIndex] || '';
          });

          const csvTeamNames = [...new Set(allRows.filter(Boolean))];
          const unmatchedTeams = [];
          const matchedTeams = {};
          for (const name of csvTeamNames) {
            const id = teamLookup[name.toLowerCase()];
            if (id) {
              matchedTeams[name] = id;
            } else {
              unmatchedTeams.push(name);
            }
          }

          return res.json({
            headers: headerLine,
            rows: previewRows,
            detectedType: importType,
            unmatchedTeams,
            matchedTeams,
            teamsList,
            teamColumnName: teamColHeader,
          });
        }
      }

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
      const gameId = req.body.gameId ? parseInt(req.body.gameId) : null;
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
          targetGameId: gameId,
          teamId,
          seasonId,
          overwrite,
          teamMappings,
          playerMappings,
        });
      }

      if (importType === 'roster') {
        if (!req.file) {
          return res.status(400).json({ error: 'Roster import requires a file upload' });
        }
        return await importRoster(req, res, {
          teamId,
          overwrite,
          teamMappings,
        });
      }

      // Future: CSV stat imports, schedule imports
      return res.status(400).json({ error: `Import type "${importType}" is not yet supported` });

    } catch (err) {
      console.error('Import error:', err);
      res.status(400).json({ error: err.message || 'Import failed' });
    }
  }
);

/* ── Box Score Import Logic ── */
async function importBoxScore(req, res, opts) {
  let { parsed, targetGameId, teamId, seasonId, overwrite, teamMappings, playerMappings } = opts;
  const { gameInfo, linescore, batting, pitching } = parsed;

  // Auto-detect active season if none provided
  if (!seasonId) {
    const { rows: activeSeason } = await pool.query(
      'SELECT id FROM league_seasons WHERE is_active = true LIMIT 1'
    );
    if (activeSeason.length > 0) {
      seasonId = activeSeason[0].id;
    }
  }

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

  let awayTeamId = gameInfo.awayTeam ? teamLookup[gameInfo.awayTeam.toLowerCase()] : null;
  let homeTeamId = gameInfo.homeTeam ? teamLookup[gameInfo.homeTeam.toLowerCase()] : null;

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
  let wasExisting = false;
  const gameDate = gameInfo.date || null;

  if (targetGameId) {
    const { rows: targetGameRows } = await pool.query(
      'SELECT id, home_team_id, away_team_id FROM games WHERE id = $1 LIMIT 1',
      [targetGameId]
    );
    if (!targetGameRows.length) {
      return res.status(400).json({ error: 'Target game for import was not found' });
    }

    const targetGame = targetGameRows[0];
    homeTeamId = homeTeamId || targetGame.home_team_id;
    awayTeamId = awayTeamId || targetGame.away_team_id;

    await pool.query(
      `UPDATE games SET home_score = $1, away_score = $2, innings_played = $3,
       status = 'completed', game_time = COALESCE($4, game_time), season_id = COALESCE($6, season_id)
       WHERE id = $5`,
      [homeScore, awayScore, inningsPlayed, gameInfo.time, targetGameId, seasonId]
    );

    gameId = targetGameId;
    wasExisting = true;
    results.updated++;
    results.games = 1;
  }

  if (!gameId && gameDate) {
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
      // Update existing game — full overwrite including scores, season, status
      await pool.query(
        `UPDATE games SET home_score = $1, away_score = $2, innings_played = $3,
         status = 'completed', game_time = $4, season_id = COALESCE($6, season_id)
         WHERE id = $5`,
        [homeScore, awayScore, inningsPlayed, gameInfo.time, existingGameId, seasonId]
      );
      gameId = existingGameId;
      wasExisting = true;
      results.updated++;
    } else if (existingGameId) {
      // Existing game found — always ensure it's marked completed with season + scores
      await pool.query(
        `UPDATE games SET
           status = 'completed',
           season_id = COALESCE(season_id, $2),
           home_score = COALESCE(home_score, $3),
           away_score = COALESCE(away_score, $4),
           innings_played = COALESCE(innings_played, $5)
         WHERE id = $1`,
        [existingGameId, seasonId, homeScore, awayScore, inningsPlayed]
      );
      gameId = existingGameId;
      wasExisting = true;
      results.updated++;
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
  } else if (!gameId) {
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

        if (pitchCount == null) {
          results.skipped++;
          continue;
        }

        await upsertPitchCount(gameId, player.id, side.teamId, pitchCount, overwrite);
        results.stats++;
        results.players++;
      }
    }
  }

  // ── Warning for duplicate imports ──
  if (wasExisting) {
    results.warnings = results.warnings || [];
    results.warnings.push(
      'This game was already imported. Scores were kept from the original import. Pitch counts for your team\'s pitchers have been added.'
    );
  }

  // ── Audit log ──
  if (gameId && req.user?.id) {
    const pitchCountSummary = [];
    const sides = [
      { pitchers: pitching.away, teamId: awayTeamId, label: 'Away' },
      { pitchers: pitching.home, teamId: homeTeamId, label: 'Home' },
    ];
    for (const side of sides) {
      for (const p of side.pitchers) {
        if (p.pitches != null) {
          pitchCountSummary.push({
            name: p.name,
            team: side.label,
            pitches: p.pitches,
            strikes: p.strikes ?? null,
            ip: p.ip ?? null,
          });
        }
      }
    }
    try {
      await pool.query(
        `INSERT INTO game_import_log
           (game_id, user_id, source, home_team_id, away_team_id,
            home_score, away_score, pitch_counts, was_existing)
         VALUES ($1, $2, 'gamechanger', $3, $4, $5, $6, $7, $8)`,
        [gameId, req.user.id, homeTeamId, awayTeamId,
         homeScore, awayScore, JSON.stringify(pitchCountSummary), wasExisting]
      );
    } catch (err) {
      // Non-fatal — don't fail the import over audit logging
      console.error('Failed to write import log:', err.message);
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
async function upsertPitchCount(gameId, playerId, teamId, pitchCount, overwrite) {
  const { rows: existing } = await pool.query(
    'SELECT id FROM game_pitch_counts WHERE game_id = $1 AND player_id = $2',
    [gameId, playerId]
  );

  if (existing.length > 0 && overwrite) {
    await pool.query(
      `UPDATE game_pitch_counts SET pitch_count = $1, team_id = $2
       WHERE game_id = $3 AND player_id = $4`,
      [pitchCount || 0, teamId, gameId, playerId]
    );
  } else if (existing.length === 0) {
    await pool.query(
      `INSERT INTO game_pitch_counts (game_id, player_id, team_id, pitch_count)
       VALUES ($1, $2, $3, $4)`,
      [gameId, playerId, teamId, pitchCount || 0]
    );
  }
}

/* ═══════════════════════════════════════════════════════
   Roster CSV Import Logic
   ═══════════════════════════════════════════════════════ */
async function importRoster(req, res, opts) {
  const { teamId: defaultTeamId, overwrite, teamMappings } = opts;

  const text = req.file.buffer.toString('utf8');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    return res.status(400).json({ error: 'File appears to be empty' });
  }

  const headerLine = parseCSVLine(lines[0]).map(h => h.trim());

  // Build index map: lowercase header → column position
  const idx = {};
  headerLine.forEach((h, i) => { idx[h.toLowerCase()] = i; });
  const col = (...names) => {
    for (const n of names) {
      if (idx[n.toLowerCase()] !== undefined) return idx[n.toLowerCase()];
    }
    return -1;
  };

  const iFirst   = col('first', 'first name', 'firstname');
  const iLast    = col('last', 'last name', 'lastname');
  const iName    = col('player', 'name', 'full name', 'fullname');
  const iJersey  = col('#', 'jersey', 'number', 'jersey number', 'jersey #', 'uniform', 'uniform #');
  const iTeam    = col('team', 'club', 'team name', 'teamname');
  const iDOB     = col('dob', 'date of birth', 'birthday', 'birth date', 'birthdate');
  const iEmail   = col('parent email', 'email', 'contact email', 'parent_email');
  const iPhone   = col('parent phone', 'phone', 'contact phone', 'parent_phone');
  const iBats    = col('bats', 'batting hand', 'batting', 'bat hand');
  const iThrows  = col('throws', 'throwing hand', 'throwing', 'throw hand');
  const iGrade   = col('grade', 'year', 'school year');

  // Build combined team lookup: user mappings take priority
  const teamLookup = await buildTeamLookup();
  const tMap = {};
  if (teamMappings && typeof teamMappings === 'object') {
    for (const [name, id] of Object.entries(teamMappings)) {
      if (id) tMap[name.toLowerCase()] = Number(id);
    }
  }

  const results = {
    success: true,
    players: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]).map(v => v.trim());
      if (!cols.length || (cols.length === 1 && !cols[0])) continue;

      const get = (colIdx) => (colIdx >= 0 ? cols[colIdx] || '' : '');

      // Resolve first/last name
      let firstName = get(iFirst);
      let lastName = get(iLast);
      if (!firstName && !lastName && iName >= 0) {
        const parts = get(iName).split(/\s+/);
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
      }

      if (!firstName && !lastName) {
        results.skipped++;
        continue;
      }

      const jerseyRaw = get(iJersey);
      const jerseyNum = jerseyRaw ? (parseInt(jerseyRaw) || null) : null;

      // Determine team for this row
      const csvTeamName = get(iTeam);
      let rowTeamId = defaultTeamId || null;
      if (csvTeamName) {
        rowTeamId = tMap[csvTeamName.toLowerCase()]
          ?? teamLookup[csvTeamName.toLowerCase()]
          ?? defaultTeamId
          ?? null;
      }

      // Validate enumerated fields
      const batsRaw = get(iBats).toUpperCase()[0] || '';
      const throwsRaw = get(iThrows).toUpperCase()[0] || '';
      const battingHand  = ['R', 'L', 'S'].includes(batsRaw)  ? batsRaw  : null;
      const throwingHand = ['R', 'L'].includes(throwsRaw)     ? throwsRaw : null;
      const gradeRaw = get(iGrade);
      const grade = ['K','1','2','3','4','5','6','7','8','9'].includes(gradeRaw) ? gradeRaw : null;

      try {
        // Find existing player — jersey within team first, then name globally
        let existingId = null;

        if (rowTeamId && jerseyNum !== null) {
          const { rows: byJersey } = await client.query(
            `SELECT p.id FROM players p
             JOIN team_players tp ON tp.player_id = p.id
             WHERE tp.team_id = $1 AND tp.jersey_number = $2
             LIMIT 1`,
            [rowTeamId, jerseyNum]
          );
          if (byJersey.length) existingId = byJersey[0].id;
        }

        if (!existingId) {
          const { rows: byName } = await client.query(
            `SELECT id FROM players
             WHERE LOWER(first_name) = LOWER($1) AND LOWER(last_name) = LOWER($2)
             LIMIT 1`,
            [firstName, lastName]
          );
          if (byName.length) existingId = byName[0].id;
        }

        let playerId;
        if (existingId && !overwrite) {
          playerId = existingId;
          results.skipped++;
        } else if (existingId && overwrite) {
          await client.query(
            `UPDATE players SET
               first_name      = $1,
               last_name       = $2,
               date_of_birth   = COALESCE(NULLIF($3,''), date_of_birth),
               batting_hand    = COALESCE($4,            batting_hand),
               throwing_hand   = COALESCE($5,            throwing_hand),
               parent_email    = COALESCE(NULLIF($6,''), parent_email),
               parent_phone    = COALESCE(NULLIF($7,''), parent_phone),
               grade           = COALESCE($8,            grade),
               updated_at      = NOW()
             WHERE id = $9`,
            [firstName, lastName,
             get(iDOB)   || null,
             battingHand, throwingHand,
             get(iEmail) || null,
             get(iPhone) || null,
             grade,
             existingId]
          );
          playerId = existingId;
          results.updated++;
        } else {
          const { rows: newP } = await client.query(
            `INSERT INTO players
               (first_name, last_name, date_of_birth, batting_hand, throwing_hand,
                parent_email, parent_phone, grade)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [firstName, lastName,
             get(iDOB)   || null,
             battingHand, throwingHand,
             get(iEmail) || null,
             get(iPhone) || null,
             grade]
          );
          playerId = newP[0].id;
          results.created++;
        }

        // Upsert team membership
        if (rowTeamId && playerId) {
          await client.query(
            `INSERT INTO team_players (team_id, player_id, jersey_number)
             VALUES ($1, $2, $3)
             ON CONFLICT (team_id, player_id) DO UPDATE
               SET jersey_number = COALESCE($3, team_players.jersey_number)`,
            [rowTeamId, playerId, jerseyNum]
          );
        }

        results.players++;
      } catch (rowErr) {
        results.errors.push(`Row ${i}: ${rowErr.message}`);
        results.skipped++;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  results.message = `Imported ${results.created} new player${results.created !== 1 ? 's' : ''}, updated ${results.updated}, skipped ${results.skipped}.`;
  return res.json(results);
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

/* ═══════════════════════════════════════════════════════
   GET /api/import/game-import-log
   Super-admin only — view import audit trail.
   Optional query params: ?game_id=X or ?limit=50
   ═══════════════════════════════════════════════════════ */
router.get('/game-import-log', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const gameId = req.query.game_id ? parseInt(req.query.game_id) : null;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    let query = `
      SELECT gil.*,
             u.username AS imported_by,
             ht.name AS home_team_name,
             at.name AS away_team_name,
             g.game_date::text AS game_date
      FROM game_import_log gil
      JOIN users u ON u.id = gil.user_id
      LEFT JOIN teams ht ON ht.id = gil.home_team_id
      LEFT JOIN teams at ON at.id = gil.away_team_id
      LEFT JOIN games g ON g.id = gil.game_id
    `;
    const params = [];

    if (gameId) {
      query += ' WHERE gil.game_id = $1';
      params.push(gameId);
    }

    query += ' ORDER BY gil.created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Import log error:', err);
    res.status(500).json({ error: 'Failed to fetch import log' });
  }
});

/* ═══════════════════════════════════════════════════════
   POST /api/import/schedule/preview
   Parse CSV schedule text, return preview with team matching.
   ═══════════════════════════════════════════════════════ */
router.post('/schedule/preview', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { csvText } = req.body;
    if (!csvText || typeof csvText !== 'string') {
      return res.status(400).json({ error: 'csvText is required' });
    }

    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'CSV must have a header row and at least one data row' });

    // Parse header
    const header = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const colDate = header.indexOf('date');
    const colTime = header.indexOf('time');
    const colHome = header.indexOf('home');
    const colAway = header.indexOf('away');
    const colVenue = Math.max(header.indexOf('venue'), header.indexOf('location'), header.indexOf('field'));
    const colNotes = Math.max(header.indexOf('notes'), header.indexOf('match day'));
    const colSeason = Math.max(header.indexOf('season'), header.indexOf('year'));

    if (colDate < 0 || colHome < 0 || colAway < 0) {
      return res.status(400).json({ error: 'CSV must have Date, Home, and Away columns' });
    }

    // Build lookups
    const teamLookup = await buildTeamLookup();
    const { rows: locationRows } = await pool.query('SELECT id, name FROM field_locations ORDER BY name');
    const locationLookup = {};
    for (const loc of locationRows) {
      locationLookup[loc.name.toLowerCase()] = loc.id;
    }

    // Parse data rows
    const games = [];
    const unmatchedTeams = new Set();
    const unmatchedVenues = new Set();

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (cols.length < Math.max(colDate, colHome, colAway) + 1) continue;

      const date = cols[colDate]?.trim();
      const time = cols[colTime]?.trim() || null;
      const homeName = cols[colHome]?.trim();
      const awayName = cols[colAway]?.trim();
      const venueName = colVenue >= 0 ? (cols[colVenue]?.trim() || null) : null;
      const notes = colNotes >= 0 ? (cols[colNotes]?.trim() || null) : null;
      const seasonYear = colSeason >= 0 ? (cols[colSeason]?.trim() || null) : null;

      if (!date || !homeName || !awayName) continue;

      const homeId = teamLookup[homeName.toLowerCase()] || null;
      const awayId = teamLookup[awayName.toLowerCase()] || null;
      const locationId = venueName ? (locationLookup[venueName.toLowerCase()] || null) : null;

      if (!homeId) unmatchedTeams.add(homeName);
      if (!awayId) unmatchedTeams.add(awayName);
      if (venueName && !locationId) unmatchedVenues.add(venueName);

      games.push({
        row: i + 1,
        date,
        time,
        home_name: homeName,
        away_name: awayName,
        home_team_id: homeId,
        away_team_id: awayId,
        venue_name: venueName,
        location_id: locationId,
        notes,
        seasonYear,
      });
    }

    // Get team list for mapping UI
    const teamsList = await getTeamsList();
    const { rows: seasonsList } = await pool.query('SELECT id, year, name, is_active FROM league_seasons ORDER BY year DESC, name');

    // Detect season year from CSV data
    const detectedYear = games.length > 0 && games[0].seasonYear ? parseInt(games[0].seasonYear) : null;
    const suggestedSeason = detectedYear ? seasonsList.find(s => s.year === detectedYear) : seasonsList.find(s => s.is_active);

    res.json({
      games,
      unmatchedTeams: [...unmatchedTeams],
      unmatchedVenues: [...unmatchedVenues],
      teamsList,
      locationsList: locationRows,
      seasonsList,
      suggestedSeasonId: suggestedSeason?.id || null,
      totalRows: games.length,
    });
  } catch (err) {
    console.error('Schedule preview error:', err);
    res.status(400).json({ error: err.message || 'Failed to parse schedule' });
  }
});

/* ═══════════════════════════════════════════════════════
   POST /api/import/schedule
   Create games from previewed CSV data.
   ═══════════════════════════════════════════════════════ */
router.post('/schedule', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { games, seasonId, teamMappings, venueMappings } = req.body;
    if (!Array.isArray(games) || !games.length) {
      return res.status(400).json({ error: 'No games to import' });
    }
    if (!seasonId) {
      return res.status(400).json({ error: 'Season is required' });
    }

    // Validate season exists
    const { rows: seasonRows } = await pool.query('SELECT id FROM league_seasons WHERE id = $1', [seasonId]);
    if (!seasonRows.length) return res.status(400).json({ error: 'Invalid season' });

    // Team mapping overrides: { "External Name" => team_id }
    const tMap = {};
    if (teamMappings && typeof teamMappings === 'object') {
      for (const [name, id] of Object.entries(teamMappings)) {
        if (id) tMap[name.toLowerCase()] = Number(id);
      }
    }
    // Venue mapping overrides: { "External Name" => location_id }
    const vMap = {};
    if (venueMappings && typeof venueMappings === 'object') {
      for (const [name, id] of Object.entries(venueMappings)) {
        if (id) vMap[name.toLowerCase()] = Number(id);
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let created = 0;
      let skipped = 0;
      const errors = [];

      for (const g of games) {
        const homeId = tMap[g.home_name?.toLowerCase()] || g.home_team_id;
        const awayId = tMap[g.away_name?.toLowerCase()] || g.away_team_id;
        const locationId = (g.venue_name ? vMap[g.venue_name.toLowerCase()] : null) || g.location_id || null;

        if (!homeId || !awayId) {
          skipped++;
          errors.push(`Row ${g.row}: Missing team match for "${!homeId ? g.home_name : g.away_name}"`);
          continue;
        }
        if (homeId === awayId) {
          skipped++;
          errors.push(`Row ${g.row}: Home and away team are the same`);
          continue;
        }

        // Check for duplicate (same date + same teams)
        const { rows: dupes } = await client.query(
          `SELECT id FROM games
           WHERE game_date = $1 AND home_team_id = $2 AND away_team_id = $3 AND season_id = $4`,
          [g.date, homeId, awayId, seasonId]
        );
        if (dupes.length) {
          skipped++;
          errors.push(`Row ${g.row}: Duplicate game (already exists)`);
          continue;
        }

        await client.query(
          `INSERT INTO games (season_id, home_team_id, away_team_id, location_id, game_date, game_time, status, notes)
           VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7)`,
          [seasonId, homeId, awayId, locationId, g.date, g.time || null, g.notes || null]
        );
        created++;
      }

      // Save any new team alias mappings for future imports
      for (const [externalName, teamId] of Object.entries(tMap)) {
        await client.query(
          `INSERT INTO team_name_aliases (external_name, team_id, source)
           VALUES ($1, $2, 'schedule_import')
           ON CONFLICT (external_name, source) DO UPDATE SET team_id = $2`,
          [externalName, teamId]
        );
      }

      await client.query('COMMIT');
      res.json({ created, skipped, errors, total: games.length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Schedule import error:', err);
    res.status(500).json({ error: err.message || 'Import failed' });
  }
});

/** Simple CSV line parser that handles quoted fields */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

module.exports = router;
