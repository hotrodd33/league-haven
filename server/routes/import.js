/* ═══════════════════════════════════════════════════════
   Import Routes — /api/import/*
   Handles GameChanger imports: PDF, pasted text, URL.
   ═══════════════════════════════════════════════════════ */

const express = require('express');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, requireAdmin, canScoreGame, getUserPermissions } = require('../auth');
const { parseBoxScorePDF, parseBoxScoreText } = require('../parsers/boxscore-pdf');
const { normalizeDOB } = require('../utils/dob');
const { findBestMatches, similarity } = require('../utils/fuzzyMatch');

const router = express.Router();
const importDebugLoggingEnabled = process.env.IMPORT_DEBUG === 'true';

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
    if (t.org_name) {
      lookup[`${t.name} (${t.org_name})`.toLowerCase()] = t.id;
      lookup[`${t.name}(${t.org_name})`.toLowerCase()] = t.id;
    }
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

/**
 * Find-or-create the catch-all 'External Opponents' org used when an
 * unknown opponent is created on the fly during a GameChanger import.
 */
async function ensureExternalOpponentsOrg() {
  const { rows } = await pool.query(
    `SELECT id FROM organizations WHERE name = $1 LIMIT 1`,
    ['External Opponents']
  );
  if (rows.length) return rows[0].id;
  const { rows: created } = await pool.query(
    `INSERT INTO organizations (name, notes)
     VALUES ($1, $2) RETURNING id`,
    ['External Opponents', 'Auto-created to host opponent teams imported from GameChanger.']
  );
  return created[0].id;
}

/**
 * Create a new team from an external (GameChanger) name.
 * Returns the newly-created team id.
 */
async function createTeamFromExternalName(externalName) {
  const orgId = await ensureExternalOpponentsOrg();
  const { rows } = await pool.query(
    `INSERT INTO teams (org_id, name) VALUES ($1, $2) RETURNING id`,
    [orgId, externalName]
  );
  return rows[0].id;
}

/**
 * Create a player and attach them to a team's roster.
 * Returns { id, jersey } of the new player. Idempotent on (team, player).
 */
async function createPlayerForTeam(teamId, displayName, jersey, firstName, lastName) {
  const fn = firstName || (displayName || '').split(' ')[0] || 'Unknown';
  const ln = lastName || (displayName || '').split(' ').slice(1).join(' ') || '';
  const { rows } = await pool.query(
    `INSERT INTO players (first_name, last_name) VALUES ($1, $2) RETURNING id`,
    [fn, ln]
  );
  const playerId = rows[0].id;
  const jerseyNum = jersey ? parseInt(jersey) : null;
  await pool.query(
    `INSERT INTO team_players (team_id, player_id, jersey_number)
     VALUES ($1, $2, $3)
     ON CONFLICT (team_id, player_id) DO UPDATE SET jersey_number = $3`,
    [teamId, playerId, isNaN(jerseyNum) ? null : jerseyNum]
  );
  return { id: playerId, jersey: jerseyNum };
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
async function buildBoxScorePreview(parsed, { userId } = {}) {
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

  // ── Fuzzy team suggestions for unmatched names ──
  const teamSuggestions = {};
  if (unmatchedTeams.length > 0) {
    const candidates = await getTeamsList();
    for (const name of unmatchedTeams) {
      const matches = findBestMatches(name, candidates, {
        keyFn: (t) => [t.name, t.abbreviation, t.org_name ? `${t.name} (${t.org_name})` : null].filter(Boolean),
        threshold: 0.6,
        limit: 5,
      });
      teamSuggestions[name] = matches.map(m => ({
        teamId: m.candidate.id,
        name: m.candidate.name,
        abbreviation: m.candidate.abbreviation,
        ageGroup: m.candidate.age_group,
        orgName: m.candidate.org_name,
        score: Number(m.score.toFixed(3)),
        autoApply: m.score >= 0.85,
      }));
    }
  }

  // ── Game suggestions: find existing games matching parsed date + teams ──
  const gameSuggestions = await suggestGames({
    gameDate: gameInfo.date,
    awayTeamId: matchedTeamMap[gameInfo.awayTeam] || null,
    homeTeamId: matchedTeamMap[gameInfo.homeTeam] || null,
    awayTeamName: gameInfo.awayTeam || null,
    homeTeamName: gameInfo.homeTeam || null,
    userId: userId || null,
  });

  // ── Annotate pitcher mappings with confidence scores ──
  for (const pm of pitcherMappings) {
    if (pm.suggestedPlayerId && pm.suggestedPlayerName) {
      pm.confidence = Number(similarity(pm.gcName, pm.suggestedPlayerName).toFixed(3));
    } else {
      pm.confidence = 0;
    }
  }

  return {
    headers,
    rows,
    detectedType: 'boxscore',
    gameInfo,
    teams: { away: gameInfo.awayTeam, home: gameInfo.homeTeam },
    unmatchedTeams,
    matchedTeams: matchedTeamMap,
    teamSuggestions,
    teamsList: teamsListForMapping,
    pitcherMappings,
    playersByTeam,
    gameSuggestions,
    _debug: parsed._debug || null,
    _rawText: (parsed.raw || '').slice(0, 5000),
  };
}

/**
 * Find existing games that look like a match for the parsed box score.
 * Returns ranked candidates within ±1 day, scored by date proximity + team match.
 * When userId is provided, results are scoped to games the user can score.
 */
async function suggestGames({ gameDate, awayTeamId, homeTeamId, awayTeamName, homeTeamName, userId }) {
  if (!gameDate) return [];

  // Pull a window of games around the parsed date so date typos still surface candidates.
  const { rows: games } = await pool.query(
    `SELECT g.id, g.game_date::text AS game_date, g.game_time, g.status,
            g.home_team_id, g.away_team_id, g.home_score, g.away_score,
            ht.name AS home_team_name, at.name AS away_team_name,
            ht.org_id AS home_org_id, at.org_id AS away_org_id
     FROM games g
     LEFT JOIN teams ht ON ht.id = g.home_team_id
     LEFT JOIN teams at ON at.id = g.away_team_id
     WHERE g.game_date BETWEEN ($1::date - INTERVAL '2 days') AND ($1::date + INTERVAL '2 days')
       AND g.deleted_at IS NULL
     ORDER BY g.game_date, g.game_time NULLS LAST
     LIMIT 50`,
    [gameDate]
  );

  if (!games.length) return [];

  // If userId given, scope to games user can score.
  let allowedTeamIds = null;
  let allowedOrgIds = null;
  let isSuperAdmin = false;
  if (userId) {
    const { rows: userRows } = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    isSuperAdmin = userRows[0]?.role === 'super_admin';
    if (!isSuperAdmin) {
      const perms = await getUserPermissions(userId);
      allowedTeamIds = new Set(perms.team_ids.map(Number));
      allowedOrgIds = new Set(perms.org_ids.map(Number));
    }
  }

  const target = new Date(gameDate + 'T00:00:00').getTime();
  const scored = [];
  for (const g of games) {
    // Permission filter
    if (!isSuperAdmin && allowedTeamIds) {
      const tHome = Number(g.home_team_id);
      const tAway = Number(g.away_team_id);
      const oHome = Number(g.home_org_id);
      const oAway = Number(g.away_org_id);
      const allowed = allowedTeamIds.has(tHome) || allowedTeamIds.has(tAway)
        || (oHome && allowedOrgIds.has(oHome))
        || (oAway && allowedOrgIds.has(oAway));
      if (!allowed) continue;
    }

    // Score: date proximity (max 0.4) + team match (max 0.6)
    const gDate = new Date(g.game_date + 'T00:00:00').getTime();
    const dayDiff = Math.abs(target - gDate) / (24 * 3600 * 1000);
    const dateScore = Math.max(0, 0.4 - dayDiff * 0.15); // 0.4 same day, 0.25 ±1d, 0.10 ±2d

    let teamScore = 0;
    if (awayTeamId && homeTeamId) {
      // Both directions: parsed away might match either DB side
      const exact = (g.away_team_id === awayTeamId && g.home_team_id === homeTeamId)
        || (g.away_team_id === homeTeamId && g.home_team_id === awayTeamId);
      if (exact) teamScore = 0.6;
      else if (g.away_team_id === awayTeamId || g.home_team_id === homeTeamId
            || g.away_team_id === homeTeamId || g.home_team_id === awayTeamId) {
        teamScore = 0.3;
      }
    } else if (awayTeamName || homeTeamName) {
      // Fall back to fuzzy name comparison when team IDs not yet resolved
      const sAwayDbAway = similarity(awayTeamName || '', g.away_team_name || '');
      const sHomeDbHome = similarity(homeTeamName || '', g.home_team_name || '');
      const sAwayDbHome = similarity(awayTeamName || '', g.home_team_name || '');
      const sHomeDbAway = similarity(homeTeamName || '', g.away_team_name || '');
      const best = Math.max(sAwayDbAway + sHomeDbHome, sAwayDbHome + sHomeDbAway) / 2;
      teamScore = Math.min(0.6, best * 0.6);
    }

    const score = dateScore + teamScore;
    if (score < 0.2) continue;

    scored.push({
      gameId: g.id,
      gameDate: g.game_date,
      gameTime: g.game_time,
      status: g.status,
      homeTeamId: g.home_team_id,
      awayTeamId: g.away_team_id,
      homeTeamName: g.home_team_name,
      awayTeamName: g.away_team_name,
      homeScore: g.home_score,
      awayScore: g.away_score,
      score: Number(score.toFixed(3)),
      confidence: score >= 0.85 ? 'high' : score >= 0.55 ? 'medium' : 'low',
      label: `${g.away_team_name || '?'} @ ${g.home_team_name || '?'} — ${g.game_date}`,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8);
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
        const preview = await buildBoxScorePreview(parsed, { userId: req.user?.id });
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
      const overwrite = req.body.overwrite === 'true' || req.body.overwrite === true;
      const pastedText = req.body.pastedText;

      if (!req.file && (!pastedText || pastedText.trim().length < 10)) {
        return res.status(400).json({ error: 'Upload a file or paste box score text' });
      }

      // Parse team mappings from frontend (JSON string OR already-parsed object)
      // When using pasted-text (JSON body), Express parses the body first, so these
      // arrive as objects rather than strings. Both cases must be handled.
      const parseBodyMapping = (raw) => {
        if (!raw) return {};
        if (typeof raw === 'object') return raw;
        try { return JSON.parse(raw); } catch { return {}; }
      };
      const teamMappings = parseBodyMapping(req.body.teamMappings);
      const playerMappings = parseBodyMapping(req.body.playerMappings);
      const columnMappings = parseBodyMapping(req.body.columnMappings);
      const createMissingBatters = req.body.createMissingBatters === 'true'
        || req.body.createMissingBatters === true;

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
          createMissingBatters,
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
          columnMappings,
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
  let { parsed, targetGameId, teamId, seasonId, overwrite,
        teamMappings, playerMappings, createMissingBatters } = opts;
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

  // ── Resolve & save team mappings as aliases for future imports.
  //    Sentinel '__new__' means "create a new team from this external name". ──
  const newlyCreatedTeamIds = new Set();
  if (teamMappings && typeof teamMappings === 'object') {
    for (const [externalName, mappedTeamId] of Object.entries(teamMappings)) {
      if (!externalName || !mappedTeamId) continue;
      try {
        let resolvedId;
        if (mappedTeamId === '__new__' || mappedTeamId === 'new') {
          resolvedId = await createTeamFromExternalName(externalName);
          newlyCreatedTeamIds.add(resolvedId);
          results.created++;
          // Replace sentinel in the working copy so downstream lookups work.
          teamMappings[externalName] = resolvedId;
        } else {
          resolvedId = parseInt(mappedTeamId);
          if (isNaN(resolvedId)) continue;
        }
        await pool.query(
          `INSERT INTO team_name_aliases (external_name, team_id, source)
           VALUES ($1, $2, 'gamechanger')
           ON CONFLICT (external_name, source) DO UPDATE SET team_id = $2`,
          [externalName, resolvedId]
        );
      } catch (err) {
        results.errors.push(`Could not save alias for "${externalName}": ${err.message}`);
      }
    }
  }

  // ── Permission gate: when attaching to an existing game, verify the user
  //    can score it BEFORE we mutate any data. ──
  if (targetGameId && req.user) {
    const { rows: gameRows } = await pool.query(
      'SELECT home_team_id, away_team_id FROM games WHERE id = $1 AND deleted_at IS NULL',
      [targetGameId]
    );
    if (!gameRows.length) {
      return res.status(404).json({ error: 'Target game not found' });
    }
    const allowed = await canScoreGame(req.user, gameRows[0].home_team_id, gameRows[0].away_team_id);
    if (!allowed) {
      return res.status(403).json({ error: 'You do not have permission to import a box score for this game' });
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
      `SELECT g.id, g.home_team_id, g.away_team_id,
              ht.name AS home_team_name, awt.name AS away_team_name
       FROM games g
       LEFT JOIN teams ht ON ht.id = g.home_team_id
       LEFT JOIN teams awt ON awt.id = g.away_team_id
       WHERE g.id = $1 AND g.deleted_at IS NULL LIMIT 1`,
      [targetGameId]
    );
    if (!targetGameRows.length) {
      return res.status(400).json({ error: 'Target game for import was not found' });
    }

    const targetGame = targetGameRows[0];

    // ── When attaching to an existing game, the target game's teams are the
    //    source of truth — NOT the parsed PDF team names. The team mapper
    //    may have resolved "MBL - Red Wing 12AA" to a stale external-opponent
    //    team, but the user's selection of this game tells us exactly which
    //    two teams these pitchers/batters belong to.
    //    Use name similarity to figure out which side of the PDF is which.
    const parsedHome = (gameInfo.homeTeam || '').toLowerCase();
    const parsedAway = (gameInfo.awayTeam || '').toLowerCase();
    const targetHome = (targetGame.home_team_name || '').toLowerCase();
    const targetAway = (targetGame.away_team_name || '').toLowerCase();

    // similarity is imported from utils/fuzzyMatch
    const sHomeHome = similarity(parsedHome, targetHome);
    const sHomeAway = similarity(parsedHome, targetAway);
    const sAwayHome = similarity(parsedAway, targetHome);
    const sAwayAway = similarity(parsedAway, targetAway);

    // If parsed home matches target away better than target home, the PDF
    // and target game have flipped home/away orientations.
    const flipped = (sHomeAway + sAwayHome) > (sHomeHome + sAwayAway);

    if (flipped) {
      homeTeamId = targetGame.away_team_id;
      awayTeamId = targetGame.home_team_id;
    } else {
      homeTeamId = targetGame.home_team_id;
      awayTeamId = targetGame.away_team_id;
    }

    if (overwrite) {
      // Full replace: scores, time, season, status
      await pool.query(
        `UPDATE games SET home_score = $1, away_score = $2, innings_played = $3,
         status = 'completed', game_time = COALESCE($4, game_time), season_id = COALESCE($6, season_id)
         WHERE id = $5`,
        [homeScore, awayScore, inningsPlayed, gameInfo.time, targetGameId, seasonId]
      );
    } else {
      // Non-destructive: only fill in missing values, mark completed
      await pool.query(
        `UPDATE games SET
           status = 'completed',
           game_time = COALESCE(game_time, $4),
           season_id = COALESCE(season_id, $6),
           home_score = COALESCE(home_score, $1),
           away_score = COALESCE(away_score, $2),
           innings_played = COALESCE(innings_played, $3)
         WHERE id = $5`,
        [homeScore, awayScore, inningsPlayed, gameInfo.time, targetGameId, seasonId]
      );
    }

    gameId = targetGameId;
    wasExisting = true;
    results.updated++;
    results.games = 1;
  }

  if (!gameId && gameDate) {
    // Check for existing game on same date with same teams.
    // Exclude soft-deleted rows so a re-import after delete creates a fresh game.
    let existingGameId = null;
    if (awayTeamId && homeTeamId) {
      const { rows: existingGames } = await pool.query(
        `SELECT id FROM games
         WHERE game_date = $1 AND home_team_id = $2 AND away_team_id = $3
           AND deleted_at IS NULL
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

  // ── Optionally seed roster from box score for newly-created opponent teams
  //    OR when the user opted in to "auto-create unmatched batters". ──
  const sidesForRoster = [
    { teamId: awayTeamId, batters: batting.away, pitchers: pitching.away, label: 'Away' },
    { teamId: homeTeamId, batters: batting.home, pitchers: pitching.home, label: 'Home' },
  ];
  for (const side of sidesForRoster) {
    if (!side.teamId) continue;
    const isNewTeam = newlyCreatedTeamIds.has(side.teamId);
    // Always seed the roster of brand-new teams; otherwise honor opt-in flag.
    if (!isNewTeam && !createMissingBatters) continue;

    const { lookup } = await buildPlayerLookup(side.teamId);
    // Walk batters first, then pitchers (pitcher loop later will skip dupes).
    const candidates = [
      ...(side.batters || []).map(p => ({ ...p, _src: 'batting' })),
      ...(side.pitchers || []).map(p => ({ ...p, _src: 'pitching' })),
    ];
    const seen = new Set();
    for (const p of candidates) {
      if (!p.name) continue;
      const key = `${(p.name || '').toLowerCase()}|${p.jersey || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Skip if already on roster
      if (matchPlayer(p.name, p.jersey, lookup)) continue;
      try {
        await createPlayerForTeam(side.teamId, p.name, p.jersey, p.firstName, p.lastName);
        results.created++;
        results.players++;
      } catch (err) {
        results.errors.push(`Could not auto-create ${side.label} player "${p.name}": ${err.message}`);
      }
    }
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
    if (overwrite) {
      results.warnings.push(
        'This game was already imported — scores, pitch counts, and box score were replaced with the new data.'
      );
    } else {
      results.warnings.push(
        'This game was already imported. Existing scores and pitch counts were kept. Re-run with "Overwrite existing data" turned ON to replace them.'
      );
    }
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

  // ── Persist parsed box score for in-game viewing ──
  // One row per game; re-import replaces it via UNIQUE(game_id) upsert.
  // For multi-team scenarios: a re-import only replaces the existing snapshot
  // when "Overwrite" is on. Otherwise the first import wins.
  if (gameId) {
    // Enrich batting/pitching rows with resolved player_id + canonical
    // first/last name from the roster, so the BoxScore UI can display the
    // proper player profile name and link to it.
    const enrichSide = async (rows, teamId) => {
      if (!Array.isArray(rows) || !rows.length || !teamId) return rows;
      const { lookup } = await buildPlayerLookup(teamId);
      return rows.map(r => {
        const m = matchPlayer(r.name, r.jersey, lookup);
        if (!m) return r;
        return {
          ...r,
          player_id: m.id,
          player_first_name: m.first_name,
          player_last_name: m.last_name,
          player_jersey: m.jersey,
        };
      });
    };
    if (batting) {
      batting.away = await enrichSide(batting.away, awayTeamId);
      batting.home = await enrichSide(batting.home, homeTeamId);
    }
    if (pitching) {
      pitching.away = await enrichSide(pitching.away, awayTeamId);
      pitching.home = await enrichSide(pitching.home, homeTeamId);
    }

    // ── Merge extras (HR, SB, 2B, 3B) from summary lines into batter records ──
    //   extras = { 'HR': { 'G Berktold': 1 }, 'SB': { 'H Finley': 3, ... }, ... }
    //   Match by player name (case-insensitive substring) since GC uses initials.
    const extras = (batting && batting.extras) || {};
    if (Object.keys(extras).length > 0) {
      const EXTRAS_FIELD_MAP = { 'HR': 'hr', 'SB': 'sb', '2B': 'doubles', '3B': 'triples' };
      const mergeExtras = (batters) => {
        for (const batter of batters) {
          const bn = (batter.name || '').toLowerCase().trim();
          for (const [key, playerMap] of Object.entries(extras)) {
            const field = EXTRAS_FIELD_MAP[key];
            if (!field) continue;
            for (const [ename, count] of Object.entries(playerMap)) {
              const en = ename.toLowerCase().trim();
              if (en === bn || bn.includes(en) || en.includes(bn)) {
                batter[field] = count;
                break;
              }
            }
          }
        }
      };
      mergeExtras(batting.away || []);
      mergeExtras(batting.home || []);
    }

    // ── Roll per-player batting + pitching stats up into player_game_stats so
    //    the PlayerDetail page can aggregate season/career totals from imports.
    //    Uses stat_definitions abbreviations: AB/H/R/RBI/HR/BB/K (batting) and
    //    IP/HA/RA/ER/BB/K/HR/PC (pitching). Honors the `overwrite` flag.
    try {
      const { rows: defs } = await pool.query(
        `SELECT id, abbreviation, category FROM stat_definitions WHERE is_active = TRUE`
      );
      const defByKey = {};
      for (const d of defs) {
        defByKey[`${d.category}:${d.abbreviation.toUpperCase()}`] = d.id;
      }

      // Parser-field → stat-definition-abbreviation per category.
      const battingMap = {
        ab: 'AB', h: 'H', r: 'R', rbi: 'RBI', hr: 'HR', bb: 'BB', so: 'K',
        doubles: '2B', triples: '3B', sb: 'SB',
      };
      const pitchingMap = {
        ip: 'IP', h: 'HA', r: 'RA', er: 'ER', bb: 'BB',
        so: 'K', k: 'K', hr: 'HR', pitches: 'PC', strikes: 'STK',
      };

      const writeStat = async (playerId, teamId, defId, value) => {
        if (value == null || Number.isNaN(value)) return;
        const sql = overwrite
          ? `INSERT INTO player_game_stats (player_id, game_id, team_id, stat_definition_id, value)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (player_id, game_id, stat_definition_id)
             DO UPDATE SET value = EXCLUDED.value, team_id = EXCLUDED.team_id`
          : `INSERT INTO player_game_stats (player_id, game_id, team_id, stat_definition_id, value)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (player_id, game_id, stat_definition_id) DO NOTHING`;
        await pool.query(sql, [playerId, gameId, teamId, defId, String(value)]);
      };

      const sidesForStats = [
        { batters: batting.away || [], pitchers: pitching.away || [], teamId: awayTeamId },
        { batters: batting.home || [], pitchers: pitching.home || [], teamId: homeTeamId },
      ];
      for (const side of sidesForStats) {
        if (!side.teamId) continue;
        for (const b of side.batters) {
          if (!b.player_id) continue;
          for (const [field, abbr] of Object.entries(battingMap)) {
            const defId = defByKey[`batting:${abbr}`];
            if (!defId) continue;
            await writeStat(b.player_id, side.teamId, defId, b[field]);
          }
        }
        for (const p of side.pitchers) {
          if (!p.player_id) continue;
          for (const [field, abbr] of Object.entries(pitchingMap)) {
            const defId = defByKey[`pitching:${abbr}`];
            if (!defId) continue;
            await writeStat(p.player_id, side.teamId, defId, p[field]);
          }
        }
      }
    } catch (err) {
      // Non-fatal — log but don't fail the import
      console.error('Failed to write player_game_stats:', err.message);
      results.errors.push(`Could not save per-player stats: ${err.message}`);
    }

    const teamResolution = {
      away_team_id: awayTeamId || null,
      home_team_id: homeTeamId || null,
      away_external_name: gameInfo.awayTeam || null,
      home_external_name: gameInfo.homeTeam || null,
    };
    try {
      const conflictClause = overwrite
        ? `ON CONFLICT (game_id) DO UPDATE SET
             source = EXCLUDED.source,
             linescore = EXCLUDED.linescore,
             batting = EXCLUDED.batting,
             pitching = EXCLUDED.pitching,
             team_resolution = EXCLUDED.team_resolution,
             player_resolution = EXCLUDED.player_resolution,
             raw_text = EXCLUDED.raw_text,
             imported_by = EXCLUDED.imported_by,
             updated_at = NOW()`
        : `ON CONFLICT (game_id) DO NOTHING`;
      await pool.query(
        `INSERT INTO game_box_scores
           (game_id, source, linescore, batting, pitching,
            team_resolution, player_resolution, raw_text, imported_by, updated_at)
         VALUES ($1, 'gamechanger', $2, $3, $4, $5, $6, $7, $8, NOW())
         ${conflictClause}`,
        [
          gameId,
          JSON.stringify(linescore || []),
          JSON.stringify(batting || { away: [], home: [] }),
          JSON.stringify(pitching || { away: [], home: [] }),
          JSON.stringify(teamResolution),
          JSON.stringify(playerMappings || {}),
          (parsed.raw || '').slice(0, 10000),
          req.user?.id || null,
        ]
      );
    } catch (err) {
      // Non-fatal — log but don't fail the import
      console.error('Failed to write game_box_scores:', err.message);
      results.errors.push(`Could not save box score snapshot: ${err.message}`);
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

  // Expose the resolved game id so the client can offer a "View imported game" link.
  results.gameId = gameId || null;

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
  const { teamId: defaultTeamId, overwrite, teamMappings, columnMappings } = opts;

  const text = req.file.buffer.toString('utf8');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    return res.status(400).json({ error: 'File appears to be empty' });
  }

  const headerLine = parseCSVLine(lines[0]).map(h => h.trim());

  // Build index map: lowercase header → column position
  const idx = {};
  headerLine.forEach((h, i) => { idx[h.toLowerCase()] = i; });

  // If columnMappings provided by frontend, use those; otherwise fall back to auto-detect
  const colFromMappings = (fieldKey, ...fallbackNames) => {
    if (columnMappings && columnMappings[fieldKey]) {
      const mapped = idx[columnMappings[fieldKey].toLowerCase()];
      if (mapped !== undefined) return mapped;
    }
    // Fall back to alias matching
    for (const n of fallbackNames) {
      if (idx[n.toLowerCase()] !== undefined) return idx[n.toLowerCase()];
    }
    return -1;
  };

  const iFirst   = colFromMappings('first_name', 'first', 'first name', 'firstname');
  const iLast    = colFromMappings('last_name', 'last', 'last name', 'lastname');
  const iName    = colFromMappings('full_name', 'player', 'name', 'full name', 'fullname');
  const iJersey  = colFromMappings('jersey', '#', 'jersey', 'number', 'jersey number', 'jersey #', 'uniform', 'uniform #');
  const iTeam    = colFromMappings('team', 'team', 'club', 'team name', 'teamname');
  const iDOB     = colFromMappings('dob', 'dob', 'date of birth', 'birthday', 'birth date', 'birthdate');
  const iBats    = colFromMappings('bats', 'bats', 'batting hand', 'batting', 'bat hand');
  const iThrows  = colFromMappings('throws', 'throws', 'throwing hand', 'throwing', 'throw hand');
  const iGrade   = colFromMappings('grade', 'grade', 'year', 'school year');

  // Parent / Guardian 1
  const iP1First = colFromMappings('parent1_first_name', 'parent first name', 'parent first', 'guardian first name', 'parent 1 first name', 'parent1 first name');
  const iP1Last  = colFromMappings('parent1_last_name', 'parent last name', 'parent last', 'guardian last name', 'parent 1 last name', 'parent1 last name');
  const iP1Email = colFromMappings('parent1_email', 'parent email', 'email', 'contact email', 'parent_email', 'parent 1 email', 'parent1 email', 'guardian email');
  const iP1Phone = colFromMappings('parent1_phone', 'parent phone', 'phone', 'contact phone', 'parent_phone', 'parent 1 phone', 'parent1 phone', 'guardian phone');

  // Parent / Guardian 2
  const iP2First = colFromMappings('parent2_first_name', 'parent 2 first name', 'parent2 first name', 'second parent first name');
  const iP2Last  = colFromMappings('parent2_last_name', 'parent 2 last name', 'parent2 last name', 'second parent last name');
  const iP2Email = colFromMappings('parent2_email', 'parent 2 email', 'parent2 email', 'second parent email');
  const iP2Phone = colFromMappings('parent2_phone', 'parent 2 phone', 'parent2 phone', 'second parent phone');

  // Build combined team lookup: user mappings take priority
  const teamLookup = await buildTeamLookup();
  const tMap = {};
  if (teamMappings && typeof teamMappings === 'object') {
    for (const [name, id] of Object.entries(teamMappings)) {
      if (id) tMap[name.toLowerCase()] = Number(id);
    }
  }

  const VALID_GRADES = ['Pre K','K','1','2','3','4','5','6','7','8','9','10','11','12'];

  const results = {
    success: true,
    players: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    contacts: 0,
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
      const grade = VALID_GRADES.includes(gradeRaw) ? gradeRaw : null;

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
               grade           = COALESCE($6,            grade),
               updated_at      = NOW()
             WHERE id = $7`,
            [firstName, lastName,
             normalizeDOB(get(iDOB)) || null,
             battingHand, throwingHand,
             grade,
             existingId]
          );
          playerId = existingId;
          results.updated++;
        } else {
          const { rows: newP } = await client.query(
            `INSERT INTO players
               (first_name, last_name, date_of_birth, batting_hand, throwing_hand, grade)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [firstName, lastName,
             normalizeDOB(get(iDOB)) || null,
             battingHand, throwingHand,
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

        // Insert parent/guardian contacts into guardians + player_guardians
        const p1Email = get(iP1Email);
        const p1Phone = get(iP1Phone);
        const p1First = get(iP1First);
        const p1Last  = get(iP1Last);
        if ((p1First && p1Last) || p1Email) {
          let gId;
          if (p1Email) {
            const { rows: byEmail } = await client.query(
              'SELECT id FROM guardians WHERE LOWER(email) = LOWER($1) LIMIT 1', [p1Email.trim()]
            );
            if (byEmail.length) {
              gId = byEmail[0].id;
              await client.query('UPDATE guardians SET phone = COALESCE(phone, $1), first_name = COALESCE(NULLIF(first_name,\'\'), $2), last_name = COALESCE(NULLIF(last_name,\'\'), $3), updated_at = NOW() WHERE id = $4',
                [p1Phone || null, p1First || null, p1Last || null, gId]);
            }
          }
          if (!gId && p1First && p1Last) {
            const { rows: byName } = await client.query(
              'SELECT id FROM guardians WHERE LOWER(first_name) = LOWER($1) AND LOWER(last_name) = LOWER($2) LIMIT 1',
              [p1First.trim(), p1Last.trim()]
            );
            if (byName.length) {
              gId = byName[0].id;
              await client.query('UPDATE guardians SET email = COALESCE(email, $1), phone = COALESCE(phone, $2), updated_at = NOW() WHERE id = $3',
                [p1Email || null, p1Phone || null, gId]);
            }
          }
          if (!gId) {
            const { rows: created } = await client.query(
              'INSERT INTO guardians (first_name, last_name, email, phone) VALUES ($1, $2, $3, $4) RETURNING id',
              [p1First?.trim() || null, p1Last?.trim() || null, p1Email || null, p1Phone || null]
            );
            gId = created[0].id;
          }
          await client.query(
            `INSERT INTO player_guardians (player_id, guardian_id, relationship, is_primary)
             VALUES ($1, $2, 'parent', true)
             ON CONFLICT (player_id, guardian_id) DO UPDATE SET is_primary = true`,
            [playerId, gId]
          );
          results.contacts++;
        }

        const p2Email = get(iP2Email);
        const p2Phone = get(iP2Phone);
        const p2First = get(iP2First);
        const p2Last  = get(iP2Last);
        if ((p2First && p2Last) || p2Email) {
          let gId;
          if (p2Email) {
            const { rows: byEmail } = await client.query(
              'SELECT id FROM guardians WHERE LOWER(email) = LOWER($1) LIMIT 1', [p2Email.trim()]
            );
            if (byEmail.length) {
              gId = byEmail[0].id;
              await client.query('UPDATE guardians SET phone = COALESCE(phone, $1), first_name = COALESCE(NULLIF(first_name,\'\'), $2), last_name = COALESCE(NULLIF(last_name,\'\'), $3), updated_at = NOW() WHERE id = $4',
                [p2Phone || null, p2First || null, p2Last || null, gId]);
            }
          }
          if (!gId && p2First && p2Last) {
            const { rows: byName } = await client.query(
              'SELECT id FROM guardians WHERE LOWER(first_name) = LOWER($1) AND LOWER(last_name) = LOWER($2) LIMIT 1',
              [p2First.trim(), p2Last.trim()]
            );
            if (byName.length) {
              gId = byName[0].id;
              await client.query('UPDATE guardians SET email = COALESCE(email, $1), phone = COALESCE(phone, $2), updated_at = NOW() WHERE id = $3',
                [p2Email || null, p2Phone || null, gId]);
            }
          }
          if (!gId) {
            const { rows: created } = await client.query(
              'INSERT INTO guardians (first_name, last_name, email, phone) VALUES ($1, $2, $3, $4) RETURNING id',
              [p2First?.trim() || null, p2Last?.trim() || null, p2Email || null, p2Phone || null]
            );
            gId = created[0].id;
          }
          await client.query(
            `INSERT INTO player_guardians (player_id, guardian_id, relationship, is_primary)
             VALUES ($1, $2, 'parent', false)
             ON CONFLICT (player_id, guardian_id) DO UPDATE SET is_primary = false`,
            [playerId, gId]
          );
          results.contacts++;
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

  results.message = `Imported ${results.created} new player${results.created !== 1 ? 's' : ''}, updated ${results.updated}, skipped ${results.skipped}. ${results.contacts} contact${results.contacts !== 1 ? 's' : ''} added.`;
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

      const rawDate = cols[colDate]?.trim();
      const date = rawDate && rawDate !== 'null' && rawDate !== 'undefined' && rawDate !== '0000-00-00' ? rawDate : null;
      const rawTime = cols[colTime]?.trim();
      const time = rawTime && rawTime !== 'null' && rawTime !== 'undefined' ? rawTime : null;
      const homeName = cols[colHome]?.trim();
      const awayName = cols[colAway]?.trim();
      const venueName = colVenue >= 0 ? (cols[colVenue]?.trim() || null) : null;
      const notes = colNotes >= 0 ? (cols[colNotes]?.trim() || null) : null;
      const seasonYear = colSeason >= 0 ? (cols[colSeason]?.trim() || null) : null;

      if (!homeName || !awayName) continue;

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

        // Check for duplicate (same date + same teams) — skip for unscheduled games
        if (g.date) {
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
        }

        const gameStatus = g.date ? 'scheduled' : 'unscheduled';
        const safeDate = g.date && g.date !== '' ? g.date : null;
        const safeTime = g.time && g.time !== '' ? g.time : null;
        if (importDebugLoggingEnabled) {
          console.log(`[import] Row ${g.row}: date=${JSON.stringify(g.date)} safeDate=${JSON.stringify(safeDate)} status=${gameStatus}`);
        }
        try {
          await client.query(
            `INSERT INTO games (season_id, home_team_id, away_team_id, location_id, game_date, game_time, status, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [seasonId, homeId, awayId, locationId, safeDate, safeTime, gameStatus, g.notes || null]
          );
          created++;
        } catch (insertErr) {
          skipped++;
          errors.push(`Row ${g.row}: ${insertErr.message}`);
          continue;
        }
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
