const express = require('express');
const { pool } = require('../db');
const { authMiddleware, canEditOrg, canEditTeam } = require('../auth');

const router = express.Router();

// Postgres DATE columns arrive as JS Date objects; normalize to YYYY-MM-DD strings.
function normalizeEventDate(row) {
  let d = row.event_date;
  if (d instanceof Date) d = d.toISOString().slice(0, 10);
  else if (typeof d === 'string' && d.length > 10) d = d.slice(0, 10);
  return { ...row, event_date: d };
}

// Default game prep time in minutes — used only for proximity warnings (not hard block)
const GAME_PROXIMITY_MINUTES = 180;
// Default game duration in minutes (fallback when column missing)
const GAME_DURATION_MINUTES = 150;

// ── GET /reservations?location_id=&from=&to= ──
// Returns reservations + game holds for a field in a date range
router.get('/', async (req, res) => {
  try {
    const { location_id, from, to } = req.query;
    if (!location_id) return res.status(400).json({ error: 'location_id is required' });

    const dateFrom = from || new Date().toISOString().slice(0, 10);
    const dateTo = to || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

    // 1) Manual reservations (practices, events, maintenance)
    const { rows: reservations } = await pool.query(
      `SELECT r.*, t.name AS team_name,
              t.age_group AS team_age_group, t.level AS team_level,
              u.name AS created_by_name, u.email AS created_by_email
       FROM field_reservations r
       LEFT JOIN teams t ON t.id = r.team_id
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.location_id = $1
         AND r.event_date >= $2 AND r.event_date <= $3
       ORDER BY r.event_date, r.start_time`,
      [location_id, dateFrom, dateTo]
    );

    // 2) Games scheduled at this field — generate game_hold entries (actual game window only)
    const { rows: games } = await pool.query(
      `SELECT g.id AS game_id, g.game_date, g.game_time, g.status, g.game_duration_minutes,
              g.home_team_id, g.away_team_id,
              ht.name AS home_team_name, at.name AS away_team_name,
              ht.age_group AS home_team_age_group, ht.level AS home_team_level,
              at.age_group AS away_team_age_group, at.level AS away_team_level,
              hag.ump_required AS home_ump_required,
              goa.official_names
       FROM games g
       JOIN teams ht ON ht.id = g.home_team_id
       JOIN teams at ON at.id = g.away_team_id
       LEFT JOIN league_age_groups hag ON LOWER(TRIM(hag.name)) = LOWER(TRIM(ht.age_group))
       LEFT JOIN LATERAL (
         SELECT COALESCE(array_agg(o.name ORDER BY o.name) FILTER (WHERE o.id IS NOT NULL), ARRAY[]::TEXT[]) AS official_names
         FROM game_official_assignments go
         JOIN officials o ON o.id = go.official_id
         WHERE go.game_id = g.id
       ) goa ON true
       WHERE g.location_id = $1
         AND g.game_date >= $2 AND g.game_date <= $3
         AND g.status IN ('scheduled', 'in_progress')
         AND g.deleted_at IS NULL
       ORDER BY g.game_date, g.game_time`,
      [location_id, dateFrom, dateTo]
    );

    const gameHolds = games.map(g => {
      const gameTime = g.game_time || '18:00:00';
      const [gh, gm] = gameTime.split(':').map(Number);
      const gameStartMin = gh * 60 + gm;
      const durationMin = g.game_duration_minutes || GAME_DURATION_MINUTES;
      const gameEndMin = gameStartMin + durationMin;

      const fmt = (mins) => {
        const h = Math.floor(Math.max(0, mins) / 60);
        const m = Math.max(0, mins) % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      };

      const fmt12 = (timeStr) => {
        const [hh, mm] = timeStr.split(':').map(Number);
        const ampm = hh >= 12 ? 'PM' : 'AM';
        const h12 = hh % 12 || 12;
        return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
      };

      return {
        id: `game-${g.game_id}`,
        location_id: Number(location_id),
        team_id: g.home_team_id,
        team_ids: [g.home_team_id, g.away_team_id].filter(Boolean),
        home_team_id: g.home_team_id,
        away_team_id: g.away_team_id,
        home_team_name: g.home_team_name,
        away_team_name: g.away_team_name,
        home_team_age_group: g.home_team_age_group,
        home_team_level: g.home_team_level,
        away_team_age_group: g.away_team_age_group,
        away_team_level: g.away_team_level,
        home_ump_required: g.home_ump_required === null || g.home_ump_required === undefined ? null : !!g.home_ump_required,
        official_names: g.official_names || [],
        title: `${g.home_team_name} vs ${g.away_team_name}`,
        event_type: 'game_hold',
        event_date: g.game_date,
        start_time: fmt(gameStartMin),
        end_time: fmt(gameEndMin),
        game_id: g.game_id,
        notes: `Game at ${fmt12(gameTime)}`,
        team_name: g.home_team_name,
        team_age_group: g.home_team_age_group,
        team_level: g.home_team_level,
        is_game: true,
      };
    });

    res.json([...reservations, ...gameHolds]);
  } catch (err) {
    console.error('List reservations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /reservations ──
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { location_id, team_id, title, event_type, event_date, start_time, end_time, notes } = req.body;
    if (!location_id || !title || !event_date || !start_time || !end_time) {
      return res.status(400).json({ error: 'location_id, title, event_date, start_time, and end_time are required' });
    }
    if (start_time >= end_time) {
      return res.status(400).json({ error: 'end_time must be after start_time' });
    }

    // Auth: must be able to edit the field's org
    const { rows: locRows } = await pool.query('SELECT org_id FROM field_locations WHERE id = $1', [location_id]);
    if (!locRows.length) return res.status(404).json({ error: 'Field not found' });
    if (!(await canEditOrg(req.user, locRows[0].org_id))) {
      return res.status(403).json({ error: 'No permission for this field' });
    }

    // Conflict check: overlapping reservations (include contact info for notifications)
    const { rows: conflicts } = await pool.query(
      `SELECT r.id, r.title, r.start_time, r.end_time, r.event_type, r.team_id, r.created_at,
              t.name AS team_name, u.name AS created_by_name, u.email AS created_by_email
       FROM field_reservations r
       LEFT JOIN teams t ON t.id = r.team_id
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.location_id = $1 AND r.event_date = $2
         AND r.start_time < $4 AND r.end_time > $3`,
      [location_id, event_date, start_time, end_time]
    );

    // Also check game conflicts — hard block only if reservation overlaps actual game window;
    // return warning if within 3 hours of game start but not overlapping
    const { rows: gameConflicts } = await pool.query(
      `SELECT g.id, g.game_time, g.game_duration_minutes FROM games g
       WHERE g.location_id = $1 AND g.game_date = $2
         AND g.status IN ('scheduled', 'in_progress')
         AND g.deleted_at IS NULL`,
      [location_id, event_date]
    );

    const gameOverlaps = [];
    const gameWarnings = [];
    for (const g of gameConflicts) {
      const gameTime = g.game_time || '18:00:00';
      const [gh, gm] = gameTime.split(':').map(Number);
      const gameStartMin = gh * 60 + gm;
      const durationMin = g.game_duration_minutes || GAME_DURATION_MINUTES;
      const gameEndMin = gameStartMin + durationMin;
      const [sh, sm] = start_time.split(':').map(Number);
      const [eh, em] = end_time.split(':').map(Number);
      const reqStart = sh * 60 + sm;
      const reqEnd = eh * 60 + em;
      if (reqStart < gameEndMin && reqEnd > gameStartMin) {
        gameOverlaps.push(g);
      } else if (reqStart >= gameEndMin && reqStart < gameEndMin + GAME_PROXIMITY_MINUTES) {
        // After game but within 3-hour proximity
        gameWarnings.push(gameTime);
      } else if (reqEnd > gameStartMin - GAME_PROXIMITY_MINUTES && reqEnd <= gameStartMin) {
        // Before game, within 3-hour proximity window
        gameWarnings.push(gameTime);
      }
    }

    if (conflicts.length > 0 || gameOverlaps.length > 0) {
      const msgs = [];
      conflicts.forEach(c => msgs.push(`"${c.title}" (${c.start_time.slice(0, 5)}–${c.end_time.slice(0, 5)})`));
      gameOverlaps.forEach(() => msgs.push('a scheduled game'));
      return res.status(409).json({
        error: `Time conflict with ${msgs.join(' and ')}`,
        conflicts: conflicts.map(c => ({
          id: c.id, type: c.event_type, title: c.title,
          start_time: c.start_time, end_time: c.end_time,
          team_name: c.team_name,
          created_by_name: c.created_by_name,
          created_by_email: c.created_by_email,
          created_at: c.created_at,
        })),
        game_conflicts: gameOverlaps.map(g => ({ id: g.id, type: 'game' })),
      });
    }

    const validTypes = ['practice', 'event', 'maintenance'];
    const type = validTypes.includes(event_type) ? event_type : 'practice';

    const { rows } = await pool.query(
      `INSERT INTO field_reservations (location_id, team_id, title, event_type, event_date, start_time, end_time, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [location_id, team_id || null, title, type, event_date, start_time, end_time, notes || null, req.user.id]
    );
    const row = rows[0];
    const warning = gameWarnings.length > 0
      ? `This reservation is within 3 hours of a game starting at ${gameWarnings[0].slice(0,5)}.`
      : null;
    res.status(201).json(warning ? { ...row, warning } : row);
  } catch (err) {
    console.error('Create reservation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /reservations/:id ──
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query(
      `SELECT r.*, fl.org_id FROM field_reservations r
       JOIN field_locations fl ON fl.id = r.location_id
       WHERE r.id = $1`, [id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Reservation not found' });
    if (existing[0].game_id) return res.status(400).json({ error: 'Cannot edit game reservations' });
    if (!(await canEditOrg(req.user, existing[0].org_id))) {
      return res.status(403).json({ error: 'No permission' });
    }

    const old = existing[0];
    const title = req.body.title ?? old.title;
    const event_type = req.body.event_type ?? old.event_type;
    const event_date = req.body.event_date ?? old.event_date;
    const start_time = req.body.start_time ?? old.start_time;
    const end_time = req.body.end_time ?? old.end_time;
    const team_id = req.body.team_id !== undefined ? req.body.team_id : old.team_id;
    const notes = req.body.notes !== undefined ? req.body.notes : old.notes;

    if (start_time >= end_time) {
      return res.status(400).json({ error: 'end_time must be after start_time' });
    }

    // Conflict check (excluding self)
    const { rows: conflicts } = await pool.query(
      `SELECT r.id, r.title, r.start_time, r.end_time, r.event_type, r.created_at,
              t.name AS team_name, u.name AS created_by_name, u.email AS created_by_email
       FROM field_reservations r
       LEFT JOIN teams t ON t.id = r.team_id
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.location_id = $1 AND r.event_date = $2 AND r.id != $3
         AND r.start_time < $5 AND r.end_time > $4`,
      [old.location_id, event_date, id, start_time, end_time]
    );

    const { rows: gameConflicts } = await pool.query(
      `SELECT g.id, g.game_time, g.game_duration_minutes FROM games g
       WHERE g.location_id = $1 AND g.game_date = $2
         AND g.status IN ('scheduled', 'in_progress')
         AND g.deleted_at IS NULL`,
      [old.location_id, event_date]
    );

    const gameOverlaps = [];
    const gameWarningsPut = [];
    for (const g of gameConflicts) {
      const gameTime = g.game_time || '18:00:00';
      const [gh, gm] = gameTime.split(':').map(Number);
      const gameStartMin = gh * 60 + gm;
      const durationMin = g.game_duration_minutes || GAME_DURATION_MINUTES;
      const gameEndMin = gameStartMin + durationMin;
      const [sh, sm] = start_time.split(':').map(Number);
      const [eh, em] = end_time.split(':').map(Number);
      const reqStart = sh * 60 + sm;
      const reqEnd = eh * 60 + em;
      if (reqStart < gameEndMin && reqEnd > gameStartMin) {
        gameOverlaps.push(g);
      } else if (reqEnd > gameStartMin - GAME_PROXIMITY_MINUTES && reqEnd <= gameStartMin) {
        gameWarningsPut.push(gameTime);
      } else if (reqStart >= gameEndMin && reqStart < gameEndMin + GAME_PROXIMITY_MINUTES) {
        gameWarningsPut.push(gameTime);
      }
    }

    if (conflicts.length > 0 || gameOverlaps.length > 0) {
      const msgs = [];
      conflicts.forEach(c => msgs.push(`"${c.title}" (${c.start_time.slice(0, 5)}–${c.end_time.slice(0, 5)})`));
      gameOverlaps.forEach(() => msgs.push('a scheduled game'));
      return res.status(409).json({
        error: `Time conflict with ${msgs.join(' and ')}`,
        conflicts: conflicts.map(c => ({
          id: c.id, type: c.event_type, title: c.title,
          start_time: c.start_time, end_time: c.end_time,
          team_name: c.team_name,
          created_by_name: c.created_by_name,
          created_by_email: c.created_by_email,
          created_at: c.created_at,
        })),
        game_conflicts: gameOverlaps.map(g => ({ id: g.id, type: 'game' })),
      });
    }

    const validTypes = ['practice', 'event', 'maintenance'];
    const type = validTypes.includes(event_type) ? event_type : old.event_type;

    const { rows } = await pool.query(
      `UPDATE field_reservations
       SET title = $1, event_type = $2, event_date = $3, start_time = $4, end_time = $5,
           team_id = $6, notes = $7
       WHERE id = $8 RETURNING *`,
      [title, type, event_date, start_time, end_time, team_id || null, notes || null, id]
    );
    const rowPut = rows[0];
    const warningPut = gameWarningsPut.length > 0
      ? `This reservation is within 3 hours of a game starting at ${gameWarningsPut[0].slice(0,5)}.`
      : null;
    res.json(warningPut ? { ...rowPut, warning: warningPut } : rowPut);
  } catch (err) {
    console.error('Update reservation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /reservations/:id ──
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT r.*, fl.org_id FROM field_reservations r
       JOIN field_locations fl ON fl.id = r.location_id
       WHERE r.id = $1`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Reservation not found' });
    if (rows[0].game_id) return res.status(400).json({ error: 'Cannot delete game reservations — remove the game from the schedule instead' });
    if (!(await canEditOrg(req.user, rows[0].org_id))) {
      return res.status(403).json({ error: 'No permission' });
    }

    await pool.query('DELETE FROM field_reservations WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete reservation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /reservations/check-game-conflicts ──
// Check for existing reservations that would conflict with a game's actual duration window.
// Also returns warnings for reservations within 3 hours of game start.
router.get('/check-game-conflicts', async (req, res) => {
  try {
    const { location_id, game_date, game_time, game_duration_minutes } = req.query;
    if (!location_id || !game_date || !game_time) {
      return res.status(400).json({ error: 'location_id, game_date, and game_time are required' });
    }

    const [gh, gm] = game_time.split(':').map(Number);
    const gameStartMin = gh * 60 + gm;
    const durationMin = game_duration_minutes ? Number(game_duration_minutes) : GAME_DURATION_MINUTES;
    const gameEndMin = gameStartMin + durationMin;

    const fmt = (mins) => {
      const h = Math.floor(Math.max(0, mins) / 60);
      const m = Math.max(0, mins) % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const gameStart = fmt(gameStartMin);
    const gameEnd = fmt(gameEndMin);
    // 3-hour warning window before game start
    const warnStart = fmt(Math.max(0, gameStartMin - GAME_PROXIMITY_MINUTES));

    // Find reservations that overlap the actual game window (hard conflict)
    const { rows: conflicts } = await pool.query(
      `SELECT r.id, r.title, r.start_time, r.end_time, r.event_type, r.team_id, r.created_at,
              t.name AS team_name, u.name AS created_by_name, u.email AS created_by_email
       FROM field_reservations r
       LEFT JOIN teams t ON t.id = r.team_id
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.location_id = $1 AND r.event_date = $2
         AND r.start_time < $4 AND r.end_time > $3`,
      [location_id, game_date, gameStart, gameEnd]
    );

    // Find reservations within the 3-hour proximity window before game (warning only)
    const { rows: warningRows } = await pool.query(
      `SELECT r.id, r.title, r.start_time, r.end_time, r.event_type, r.team_id, r.created_at,
              t.name AS team_name, u.name AS created_by_name, u.email AS created_by_email
       FROM field_reservations r
       LEFT JOIN teams t ON t.id = r.team_id
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.location_id = $1 AND r.event_date = $2
         AND r.start_time < $4 AND r.end_time > $3
         AND NOT (r.start_time < $6 AND r.end_time > $5)`,
      [location_id, game_date, warnStart, gameStart, gameStart, gameEnd]
    );

    const mapRow = c => ({
      id: c.id, title: c.title, event_type: c.event_type,
      start_time: c.start_time, end_time: c.end_time,
      team_name: c.team_name,
      created_by_name: c.created_by_name,
      created_by_email: c.created_by_email,
      created_at: c.created_at,
    });

    res.json({
      has_conflicts: conflicts.length > 0,
      has_warnings: warningRows.length > 0,
      game_start: gameStart,
      game_end: gameEnd,
      conflicts: conflicts.map(mapRow),
      warnings: warningRows.map(mapRow),
    });
  } catch (err) {
    console.error('Check game conflicts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /reservations/all ──
// Returns all practices/events across the league (no game_holds)
router.get('/all', async (req, res) => {
  try {
    const { team_id, team_ids, event_type, from, to } = req.query;
    // Parse comma-separated team_ids list
    const teamIdList = team_ids
      ? team_ids.split(',').map(Number).filter(Number.isFinite)
      : null;
    let sql = `SELECT r.*, fl.name AS location_name, fl.address AS location_address,
                fl.city AS location_city, fl.state AS location_state,
                t.name AS team_name
         FROM field_reservations r
         LEFT JOIN field_locations fl ON fl.id = r.location_id
         LEFT JOIN teams t ON t.id = r.team_id
         WHERE r.event_type != 'game_hold'`;
    const params = [];
    if (team_id) { params.push(Number(team_id)); sql += ` AND r.team_id = $${params.length}`; }
    else if (teamIdList && teamIdList.length > 0) { params.push(teamIdList); sql += ` AND r.team_id = ANY($${params.length}::int[])`; }
    if (event_type) { params.push(event_type); sql += ` AND r.event_type = $${params.length}`; }
    if (from) { params.push(from); sql += ` AND r.event_date >= $${params.length}`; }
    if (to) { params.push(to); sql += ` AND r.event_date <= $${params.length}`; }
    sql += ' ORDER BY r.event_date, r.start_time LIMIT 500';
    const { rows } = await pool.query(sql, params);
    res.json(rows.map(normalizeEventDate));
  } catch (err) {
    console.error('Fetch all reservations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /reservations/team/:teamId ──
// Returns practices/events for a specific team (no auth required, public data)
router.get('/team/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { rows } = await pool.query(
      `SELECT r.*, fl.name AS location_name, fl.address AS location_address,
              fl.city AS location_city, fl.state AS location_state
       FROM field_reservations r
       LEFT JOIN field_locations fl ON fl.id = r.location_id
       WHERE r.team_id = $1
       ORDER BY r.event_date, r.start_time`,
      [teamId]
    );
    res.json(rows.map(normalizeEventDate));
  } catch (err) {
    console.error('Fetch team reservations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
