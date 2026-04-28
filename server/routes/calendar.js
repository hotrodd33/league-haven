const express = require('express');
const { pool } = require('../db');
const cache = require('../cache');

const router = express.Router();

async function getLeagueTz() {
  const cached = cache.get('league-config:branding');
  if (cached?.timezone) return cached.timezone;
  const { rows } = await pool.query('SELECT timezone FROM app_branding WHERE id = 1');
  return rows[0]?.timezone || 'America/Chicago';
}

/* ── helpers ── */

function esc(str) {
  // Escape special iCalendar characters
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function foldLine(line) {
  // RFC 5545 §3.1: lines > 75 octets must be folded
  const octets = Buffer.from(line, 'utf8');
  if (octets.length <= 75) return line;
  const parts = [];
  let start = 0;
  while (start < octets.length) {
    const chunk = start === 0 ? 75 : 74; // continuation lines start with space
    const end = Math.min(start + chunk, octets.length);
    const slice = octets.slice(start, end).toString('utf8');
    parts.push(start === 0 ? slice : ' ' + slice);
    start = end;
  }
  return parts.join('\r\n');
}

function formatICSDate(dateStr, timeStr) {
  // dateStr = 'YYYY-MM-DD', timeStr = 'HH:MM' or null
  const d = dateStr.replace(/-/g, '');
  if (!timeStr) return d; // all-day: VALUE=DATE
  const t = timeStr.replace(/:/g, '').padEnd(6, '0');
  return d + 'T' + t;
}

function uid(gameId) {
  return `game-${gameId}@leaguehaven`;
}

function practiceUid(reservationId) {
  return `practice-${reservationId}@leaguehaven`;
}

/* ── GET /games.ics ── */

router.get('/games.ics', async (req, res) => {
  try {
    const { team_id, season_id, location_id, org_id, from, to } = req.query;
    const LEAGUE_TZ = await getLeagueTz();

    const cacheKey = `ics:${team_id||''}:${season_id||''}:${location_id||''}:${org_id||''}:${from||''}:${to||''}`;
    const cachedICS = cache.get(cacheKey);
    if (cachedICS) {
      res.set({
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="leaguehaven-games.ics"',
        'Cache-Control': 'public, max-age=1800',
      });
      return res.send(cachedICS);
    }

    const conditions = ['g.deleted_at IS NULL'];
    const params = [];
    let idx = 1;

    if (team_id) {
      conditions.push(`(g.home_team_id = $${idx} OR g.away_team_id = $${idx})`);
      params.push(team_id);
      idx++;
    }
    if (season_id) {
      conditions.push(`g.season_id = $${idx}`);
      params.push(season_id);
      idx++;
    }
    if (location_id) {
      conditions.push(`g.location_id = $${idx}`);
      params.push(location_id);
      idx++;
    }
    if (org_id) {
      conditions.push(`(ht.org_id = $${idx} OR at.org_id = $${idx})`);
      params.push(org_id);
      idx++;
    }
    if (from) {
      conditions.push(`g.game_date >= $${idx}`);
      params.push(from);
      idx++;
    }
    if (to) {
      conditions.push(`g.game_date <= $${idx}`);
      params.push(to);
      idx++;
    }

    const where = ' WHERE ' + conditions.join(' AND ');

    const sql = `
      SELECT g.id, g.game_date, g.game_time, g.status, g.notes,
        g.home_score, g.away_score,
        ht.name AS home_team_name, ht.team_city AS home_team_city,
        ht.team_mascot AS home_team_mascot, ht.team_color AS home_team_color,
        ht.age_group AS home_age_group, ht.level AS home_level,
        at.name AS away_team_name, at.team_city AS away_team_city,
        at.team_mascot AS away_team_mascot, at.team_color AS away_team_color,
        at.age_group AS away_age_group, at.level AS away_level,
        fl.name AS location_name, fl.address AS location_address,
        fl.city AS location_city, fl.state AS location_state,
        ls.name AS season_name, ls.year AS season_year,
        g.updated_at
      FROM games g
      LEFT JOIN teams ht ON ht.id = g.home_team_id
      LEFT JOIN teams at ON at.id = g.away_team_id
      LEFT JOIN field_locations fl ON fl.id = g.location_id
      LEFT JOIN league_seasons ls ON ls.id = g.season_id
      ${where}
      ORDER BY g.game_date, g.game_time NULLS LAST
    `;

    const { rows } = await pool.query(sql, params);

    // Build calendar title
    let calName = 'LeagueHaven Games';
    if (team_id && rows.length) {
      // Find team name from first appearance
      const r = rows[0];
      const teamName = String(r.home_team_name).includes(team_id)
        ? r.home_team_name : (r.away_team_name || 'Team');
      // Better: just label with first row's perspective
      calName = 'LeagueHaven Games';
    }

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//LeagueHaven//Game Schedule//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc(calName)}`,
      `X-WR-TIMEZONE:${LEAGUE_TZ}`,
    ];

    for (const g of rows) {
      // Normalize date
      let gameDate = g.game_date;
      if (gameDate instanceof Date) gameDate = gameDate.toISOString().slice(0, 10);
      else if (typeof gameDate === 'string' && gameDate.length > 10) gameDate = gameDate.slice(0, 10);

      // Build team display names
      const homeName = g.home_team_city
        ? [g.home_team_city, g.home_team_mascot, g.home_team_color, g.home_age_group, g.home_level].filter(Boolean).join(' ')
        : (g.home_team_name || 'TBD');
      const awayName = g.away_team_city
        ? [g.away_team_city, g.away_team_mascot, g.away_team_color, g.away_age_group, g.away_level].filter(Boolean).join(' ')
        : (g.away_team_name || 'TBD');

      // Summary
      let summary = `${awayName} @ ${homeName}`;
      if (g.status === 'completed' && g.home_score != null && g.away_score != null) {
        summary += ` (${g.away_score}-${g.home_score})`;
      } else if (g.status === 'cancelled') {
        summary = `[CANCELLED] ${summary}`;
      } else if (g.status === 'postponed') {
        summary = `[POSTPONED] ${summary}`;
      }

      // Location
      const locParts = [g.location_name, g.location_address, g.location_city, g.location_state].filter(Boolean);
      const location = locParts.join(', ');

      // Description
      const descParts = [];
      if (g.season_name) descParts.push(`Season: ${g.season_name} ${g.season_year || ''}`);
      if (g.status) descParts.push(`Status: ${g.status.charAt(0).toUpperCase() + g.status.slice(1)}`);
      if (g.status === 'completed' && g.home_score != null && g.away_score != null) {
        descParts.push(`Final: ${awayName} ${g.away_score} - ${homeName} ${g.home_score}`);
      }
      if (g.notes) descParts.push(`Notes: ${g.notes}`);
      const description = descParts.join('\\n');

      // Timestamps
      const dtstart = formatICSDate(gameDate, g.game_time);
      const isAllDay = !g.game_time;
      const updatedAt = g.updated_at
        ? new Date(g.updated_at).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
        : new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

      lines.push('BEGIN:VEVENT');
      lines.push(foldLine(`UID:${uid(g.id)}`));
      lines.push(foldLine(`DTSTAMP:${updatedAt}`));

      if (isAllDay) {
        lines.push(foldLine(`DTSTART;VALUE=DATE:${dtstart}`));
        // All-day event: end = next day
        const nextDay = new Date(gameDate + 'T00:00:00');
        nextDay.setDate(nextDay.getDate() + 1);
        const nd = nextDay.toISOString().slice(0, 10).replace(/-/g, '');
        lines.push(foldLine(`DTEND;VALUE=DATE:${nd}`));
      } else {
        lines.push(foldLine(`DTSTART;TZID=${LEAGUE_TZ}:${dtstart}`));
        // Default 2.5 hour game duration
        const [h, m] = g.game_time.split(':').map(Number);
        const endMin = h * 60 + m + 150;
        const endH = String(Math.floor(endMin / 60)).padStart(2, '0');
        const endM = String(endMin % 60).padStart(2, '0');
        const dtend = formatICSDate(gameDate, `${endH}:${endM}`);
        lines.push(foldLine(`DTEND;TZID=${LEAGUE_TZ}:${dtend}`));
      }

      lines.push(foldLine(`SUMMARY:${esc(summary)}`));
      if (location) lines.push(foldLine(`LOCATION:${esc(location)}`));
      if (description) lines.push(foldLine(`DESCRIPTION:${esc(description)}`));

      // Status mapping
      if (g.status === 'cancelled') lines.push('STATUS:CANCELLED');
      else if (g.status === 'completed') lines.push('STATUS:CONFIRMED');
      else lines.push('STATUS:TENTATIVE');

      lines.push('END:VEVENT');
    }

    // ── Practices / team events (when team_id is specified) ──
    if (team_id) {
      const { rows: practices } = await pool.query(
        `SELECT r.id, r.title, r.event_type, r.event_date, r.start_time, r.end_time,
                r.notes, r.created_at,
                fl.name AS location_name, fl.address AS location_address,
                fl.city AS location_city, fl.state AS location_state
         FROM field_reservations r
         LEFT JOIN field_locations fl ON fl.id = r.location_id
         WHERE r.team_id = $1
         ORDER BY r.event_date, r.start_time`,
        [team_id]
      );

      for (const p of practices) {
        let eventDate = p.event_date;
        if (eventDate instanceof Date) eventDate = eventDate.toISOString().slice(0, 10);
        else if (typeof eventDate === 'string' && eventDate.length > 10) eventDate = eventDate.slice(0, 10);

        const typeLabel = p.event_type === 'practice' ? 'Practice'
          : p.event_type === 'event' ? 'Event' : p.event_type || 'Practice';
        const summary = `[${typeLabel}] ${p.title}`;

        const locParts = [p.location_name, p.location_address, p.location_city, p.location_state].filter(Boolean);
        const location = locParts.join(', ');

        const descParts = [`Type: ${typeLabel}`];
        if (p.notes) descParts.push(`Notes: ${p.notes}`);
        const description = descParts.join('\\n');

        const startTime = p.start_time ? String(p.start_time).slice(0, 5) : null;
        const endTime = p.end_time ? String(p.end_time).slice(0, 5) : null;

        const dtstart = formatICSDate(eventDate, startTime);
        const pStamp = p.created_at
          ? new Date(p.created_at).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
          : new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

        lines.push('BEGIN:VEVENT');
        lines.push(foldLine(`UID:${practiceUid(p.id)}`));
        lines.push(foldLine(`DTSTAMP:${pStamp}`));

        if (!startTime) {
          lines.push(foldLine(`DTSTART;VALUE=DATE:${dtstart}`));
          const nextDay = new Date(eventDate + 'T00:00:00');
          nextDay.setDate(nextDay.getDate() + 1);
          const nd = nextDay.toISOString().slice(0, 10).replace(/-/g, '');
          lines.push(foldLine(`DTEND;VALUE=DATE:${nd}`));
        } else {
          lines.push(foldLine(`DTSTART;TZID=${LEAGUE_TZ}:${dtstart}`));
          if (endTime) {
            const dtend = formatICSDate(eventDate, endTime);
            lines.push(foldLine(`DTEND;TZID=${LEAGUE_TZ}:${dtend}`));
          }
        }

        lines.push(foldLine(`SUMMARY:${esc(summary)}`));
        if (location) lines.push(foldLine(`LOCATION:${esc(location)}`));
        if (description) lines.push(foldLine(`DESCRIPTION:${esc(description)}`));
        lines.push('STATUS:CONFIRMED');
        lines.push('END:VEVENT');
      }
    }

    lines.push('END:VCALENDAR');

    const ical = lines.join('\r\n') + '\r\n';

    cache.set(cacheKey, ical, 30 * 60 * 1000);
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="leaguehaven-games.ics"',
      'Cache-Control': 'public, max-age=1800',
    });
    res.send(ical);
  } catch (err) {
    console.error('Calendar feed error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
