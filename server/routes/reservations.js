const express = require('express');
const { pool } = require('../db');
const { authMiddleware, canEditOrg, canEditTeam } = require('../auth');

const router = express.Router();

// Default game prep time in minutes (blocked before a game)
const GAME_PREP_MINUTES = 60;
// Default game duration in minutes
const GAME_DURATION_MINUTES = 120;

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
              u.name AS created_by_name
       FROM field_reservations r
       LEFT JOIN teams t ON t.id = r.team_id
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.location_id = $1
         AND r.event_date >= $2 AND r.event_date <= $3
       ORDER BY r.event_date, r.start_time`,
      [location_id, dateFrom, dateTo]
    );

    // 2) Games scheduled at this field — generate game_hold entries
    const { rows: games } = await pool.query(
      `SELECT g.id AS game_id, g.game_date, g.game_time, g.status,
              ht.name AS home_team_name, at.name AS away_team_name
       FROM games g
       JOIN teams ht ON ht.id = g.home_team_id
       JOIN teams at ON at.id = g.away_team_id
       WHERE g.location_id = $1
         AND g.game_date >= $2 AND g.game_date <= $3
         AND g.status IN ('scheduled', 'in_progress')
       ORDER BY g.game_date, g.game_time`,
      [location_id, dateFrom, dateTo]
    );

    const gameHolds = games.map(g => {
      const gameTime = g.game_time || '18:00:00';
      // Parse game start, compute prep start and game end
      const [gh, gm] = gameTime.split(':').map(Number);
      const gameStartMin = gh * 60 + gm;
      const prepStartMin = gameStartMin - GAME_PREP_MINUTES;
      const gameEndMin = gameStartMin + GAME_DURATION_MINUTES;

      const fmt = (mins) => {
        const h = Math.floor(Math.max(0, mins) / 60);
        const m = Math.max(0, mins) % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      };

      return {
        id: `game-${g.game_id}`,
        location_id: Number(location_id),
        team_id: null,
        title: `${g.home_team_name} vs ${g.away_team_name}`,
        event_type: 'game_hold',
        event_date: g.game_date,
        start_time: fmt(prepStartMin),
        end_time: fmt(gameEndMin),
        game_id: g.game_id,
        notes: `Game at ${gameTime.slice(0, 5)} — field reserved from ${fmt(prepStartMin)} for prep`,
        team_name: g.home_team_name,
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

    // Conflict check: overlapping reservations
    const { rows: conflicts } = await pool.query(
      `SELECT id, title, start_time, end_time FROM field_reservations
       WHERE location_id = $1 AND event_date = $2
         AND start_time < $4 AND end_time > $3`,
      [location_id, event_date, start_time, end_time]
    );

    // Also check game conflicts
    const { rows: gameConflicts } = await pool.query(
      `SELECT g.id, g.game_time FROM games g
       WHERE g.location_id = $1 AND g.game_date = $2
         AND g.status IN ('scheduled', 'in_progress')`,
      [location_id, event_date]
    );

    const gameOverlaps = gameConflicts.filter(g => {
      const gameTime = g.game_time || '18:00:00';
      const [gh, gm] = gameTime.split(':').map(Number);
      const gameStartMin = gh * 60 + gm;
      const prepStartMin = gameStartMin - GAME_PREP_MINUTES;
      const gameEndMin = gameStartMin + GAME_DURATION_MINUTES;

      const [sh, sm] = start_time.split(':').map(Number);
      const [eh, em] = end_time.split(':').map(Number);
      const reqStart = sh * 60 + sm;
      const reqEnd = eh * 60 + em;

      return reqStart < gameEndMin && reqEnd > prepStartMin;
    });

    if (conflicts.length > 0 || gameOverlaps.length > 0) {
      const msgs = [];
      conflicts.forEach(c => msgs.push(`"${c.title}" (${c.start_time.slice(0, 5)}–${c.end_time.slice(0, 5)})`));
      gameOverlaps.forEach(() => msgs.push('a scheduled game (including prep time)'));
      return res.status(409).json({
        error: `Time conflict with ${msgs.join(' and ')}`,
        conflicts: [...conflicts, ...gameOverlaps.map(g => ({ id: g.id, type: 'game' }))],
      });
    }

    const validTypes = ['practice', 'event', 'maintenance'];
    const type = validTypes.includes(event_type) ? event_type : 'practice';

    const { rows } = await pool.query(
      `INSERT INTO field_reservations (location_id, team_id, title, event_type, event_date, start_time, end_time, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [location_id, team_id || null, title, type, event_date, start_time, end_time, notes || null, req.user.id]
    );
    res.status(201).json(rows[0]);
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
      `SELECT id, title, start_time, end_time FROM field_reservations
       WHERE location_id = $1 AND event_date = $2 AND id != $3
         AND start_time < $5 AND end_time > $4`,
      [old.location_id, event_date, id, start_time, end_time]
    );

    const { rows: gameConflicts } = await pool.query(
      `SELECT g.id, g.game_time FROM games g
       WHERE g.location_id = $1 AND g.game_date = $2
         AND g.status IN ('scheduled', 'in_progress')`,
      [old.location_id, event_date]
    );

    const gameOverlaps = gameConflicts.filter(g => {
      const gameTime = g.game_time || '18:00:00';
      const [gh, gm] = gameTime.split(':').map(Number);
      const prepStartMin = gh * 60 + gm - GAME_PREP_MINUTES;
      const gameEndMin = gh * 60 + gm + GAME_DURATION_MINUTES;
      const [sh, sm] = start_time.split(':').map(Number);
      const [eh, em] = end_time.split(':').map(Number);
      return (sh * 60 + sm) < gameEndMin && (eh * 60 + em) > prepStartMin;
    });

    if (conflicts.length > 0 || gameOverlaps.length > 0) {
      const msgs = [];
      conflicts.forEach(c => msgs.push(`"${c.title}" (${c.start_time.slice(0, 5)}–${c.end_time.slice(0, 5)})`));
      gameOverlaps.forEach(() => msgs.push('a scheduled game'));
      return res.status(409).json({ error: `Time conflict with ${msgs.join(' and ')}` });
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
    res.json(rows[0]);
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

module.exports = router;
