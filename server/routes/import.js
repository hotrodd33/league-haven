/* ═══════════════════════════════════════════════════════
   Import Routes — /api/import/*
   Handles GameChanger file uploads (PDF box scores, CSV).
   ═══════════════════════════════════════════════════════ */

const express = require('express');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');
const { parseBoxScorePDF } = require('../parsers/boxscore-pdf');

const router = express.Router();

// Accept files up to 5 MB (PDFs can be a few MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/* ── Team + Player lookups (shared helpers) ── */

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
  return lookup;
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
    const firstInitialLast = `${p.first_name[0]}. ${p.last_name}`.toLowerCase();
    lookup[fullName] = { id: p.id, jersey: p.jersey_number };
    // Store last name only if unambiguous
    if (!lookup[lastName]) lookup[lastName] = { id: p.id, jersey: p.jersey_number };
    else lookup[lastName] = null; // Ambiguous
    lookup[firstInitialLast] = { id: p.id, jersey: p.jersey_number };
    if (p.jersey_number) {
      lookup[`#${p.jersey_number}`] = { id: p.id, jersey: p.jersey_number };
    }
  }
  return lookup;
}

function matchPlayer(name, playerLookup) {
  if (!name) return null;
  const clean = name.replace(/\s+/g, ' ').trim().toLowerCase();
  if (playerLookup[clean]) return playerLookup[clean];

  // Try "Last, First" → "First Last"
  const commaMatch = clean.match(/^(.+?),\s*(.+)$/);
  if (commaMatch) {
    const flipped = `${commaMatch[2]} ${commaMatch[1]}`;
    if (playerLookup[flipped]) return playerLookup[flipped];
  }

  // Try last name only
  const parts = clean.split(' ');
  const lastName = parts[parts.length - 1];
  if (playerLookup[lastName] && playerLookup[lastName] !== null) return playerLookup[lastName];

  return null;
}

/* ═══════════════════════════════════════════════════════
   POST /api/import/gamechanger/preview
   Parse the file and return preview rows + detected type.
   ═══════════════════════════════════════════════════════ */
router.post(
  '/gamechanger/preview',
  authMiddleware,
  upload.single('gamechangerFile'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const importType = req.body.importType || 'boxscore';
      const fileName = req.file.originalname || '';
      const isPDF = fileName.toLowerCase().endsWith('.pdf') ||
                    req.file.mimetype === 'application/pdf';

      if (importType === 'boxscore') {
        if (!isPDF) {
          return res.status(400).json({ error: 'Box score import requires a PDF file' });
        }

        const parsed = await parseBoxScorePDF(req.file.buffer);
        const { gameInfo, linescore, batting, pitching } = parsed;

        // Build preview rows from the parsed data
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

        // Pitching rows
        for (const side of ['away', 'home']) {
          const teamName = side === 'away' ? gameInfo.awayTeam : gameInfo.homeTeam;
          for (const p of pitching[side]) {
            rows.push({
              type: 'Pitching',
              team: teamName || side,
              player: `${p.name}${p.decision ? ` (${p.decision})` : ''}`,
              stat_line: [
                p.ip != null ? `${p.ip} IP` : null,
                p.k != null ? `${p.k} K` : null,
                p.bb != null ? `${p.bb} BB` : null,
                p.er != null ? `${p.er} ER` : null,
                p.pitches != null ? `${p.pitches} pitches` : null,
              ].filter(Boolean).join(', '),
            });
          }
        }

        return res.json({
          headers,
          rows,
          detectedType: 'boxscore',
          gameInfo,
          teams: {
            away: gameInfo.awayTeam,
            home: gameInfo.homeTeam,
          },
        });
      }

      // CSV-based import types (schedule, stats, roster)
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
      res.status(500).json({ error: 'Failed to parse file', detail: err.message });
    }
  }
);

/* ═══════════════════════════════════════════════════════
   POST /api/import/gamechanger
   Full import — parse, match, and insert into DB.
   ═══════════════════════════════════════════════════════ */
router.post(
  '/gamechanger',
  authMiddleware,
  upload.single('gamechangerFile'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const importType = req.body.importType || 'boxscore';
      const teamId = req.body.teamId ? parseInt(req.body.teamId) : null;
      const seasonId = req.body.seasonId ? parseInt(req.body.seasonId) : null;
      const overwrite = req.body.overwrite === 'true';
      const fileName = req.file.originalname || '';
      const isPDF = fileName.toLowerCase().endsWith('.pdf') ||
                    req.file.mimetype === 'application/pdf';

      if (importType === 'boxscore') {
        return await importBoxScore(req, res, {
          buffer: req.file.buffer,
          isPDF,
          teamId,
          seasonId,
          overwrite,
        });
      }

      // Future: CSV stat imports, schedule imports, roster imports
      return res.status(400).json({ error: `Import type "${importType}" is not yet supported` });

    } catch (err) {
      console.error('Import error:', err);
      res.status(500).json({ error: 'Import failed', detail: err.message });
    }
  }
);

/* ── Box Score Import Logic ── */
async function importBoxScore(req, res, opts) {
  const { buffer, isPDF, teamId, seasonId, overwrite } = opts;

  if (!isPDF) {
    return res.status(400).json({ error: 'Box score import requires a PDF file' });
  }

  const parsed = await parseBoxScorePDF(buffer);
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

  // ── Resolve teams ──
  const teamLookup = await buildTeamLookup();
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
    // Build player lookups for both teams
    const awayPlayers = awayTeamId ? await buildPlayerLookup(awayTeamId) : {};
    const homePlayers = homeTeamId ? await buildPlayerLookup(homeTeamId) : {};

    // Process away pitchers
    for (const pitcher of pitching.away) {
      const player = matchPlayer(pitcher.name, awayPlayers);
      if (!player) {
        results.errors.push(`Away pitcher "${pitcher.name}" not matched to a player`);
        results.skipped++;
        continue;
      }

      const pitchCount = pitcher.pitches ?? pitcher.np ?? null;
      const ip = pitcher.ip != null ? String(pitcher.ip) : null;

      if (pitchCount == null && ip == null) {
        results.skipped++;
        continue;
      }

      await upsertPitchCount(gameId, player.id, awayTeamId, pitchCount, ip, overwrite);
      results.stats++;
      results.players++;
    }

    // Process home pitchers
    for (const pitcher of pitching.home) {
      const player = matchPlayer(pitcher.name, homePlayers);
      if (!player) {
        results.errors.push(`Home pitcher "${pitcher.name}" not matched to a player`);
        results.skipped++;
        continue;
      }

      const pitchCount = pitcher.pitches ?? pitcher.np ?? null;
      const ip = pitcher.ip != null ? String(pitcher.ip) : null;

      if (pitchCount == null && ip == null) {
        results.skipped++;
        continue;
      }

      await upsertPitchCount(gameId, player.id, homeTeamId, pitchCount, ip, overwrite);
      results.stats++;
      results.players++;
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

module.exports = router;
