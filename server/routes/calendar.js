const express = require('express');
const { pool } = require('../db');
const cache = require('../cache');
const {
  buildCalendarICS,
  ICS_CACHE_CONTROL,
  ICS_ERROR_CACHE_CONTROL,
} = require('./calendar-ics');

const router = express.Router();

async function getLeagueTz() {
  const cached = cache.get('league-config:branding');
  if (cached?.timezone) return cached.timezone;
  const { rows } = await pool.query('SELECT timezone FROM app_branding WHERE id = 1');
  return rows[0]?.timezone || 'America/Chicago';
}

function sendICS(res, body) {
  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'inline; filename="leaguehaven-games.ics"',
    'Cache-Control': ICS_CACHE_CONTROL,
  });
  res.send(body);
}

/* ── GET /games.ics ── */

router.get('/games.ics', async (req, res) => {
  try {
    const { team_id, season_id, location_id, org_id, from, to } = req.query;
    const LEAGUE_TZ = await getLeagueTz();

    const cacheKey = `ics:${team_id||''}:${season_id||''}:${location_id||''}:${org_id||''}:${from||''}:${to||''}`;
    const cachedICS = cache.get(cacheKey);
    if (cachedICS) {
      return sendICS(res, cachedICS);
    }

    // A null game_date (unscheduled) cannot be an event. Leaving those rows in
    // used to throw while formatting the feed and 500 every subscriber poll.
    const conditions = ['g.deleted_at IS NULL', 'g.game_date IS NOT NULL'];
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

    const calName = 'LeagueHaven Games';

    let practices = [];
    if (team_id) {
      const { rows: practiceRows } = await pool.query(
        `SELECT r.id, r.title, r.event_type, r.event_date, r.start_time, r.end_time,
                r.notes, r.created_at,
                fl.name AS location_name, fl.address AS location_address,
                fl.city AS location_city, fl.state AS location_state
         FROM field_reservations r
         LEFT JOIN field_locations fl ON fl.id = r.location_id
         WHERE r.team_id = $1
           AND r.event_date IS NOT NULL
         ORDER BY r.event_date, r.start_time`,
        [team_id]
      );
      practices = practiceRows;
    }

    const { ical, skipped } = buildCalendarICS({
      games: rows,
      practices,
      timezone: LEAGUE_TZ,
      calName,
    });
    if (skipped.length) {
      const sample = skipped.slice(0, 20).map((item) => {
        const label = `${item.kind}:${item.id}`;
        return item.error ? `${label} (${item.error})` : label;
      }).join(', ');
      console.warn(`Calendar feed omitted ${skipped.length} event(s) with no usable date: ${sample}`);
    }

    // Per-instance dedupe only. Cache-Control on the response is what keeps
    // hourly polls off Neon; this just avoids a second query if the same warm
    // instance builds the feed again within 30 minutes.
    cache.set(cacheKey, ical, 30 * 60 * 1000);
    sendICS(res, ical);
  } catch (err) {
    console.error('Calendar feed error:', err);
    if (!res.headersSent) {
      // Vercel does not edge-cache 5xx. Retry-After / max-age ask the client
      // to wait. stale-if-error on a prior 200 is what actually stops a retry
      // storm; an empty 200 calendar would delete subscribed events.
      res.set({
        'Cache-Control': ICS_ERROR_CACHE_CONTROL,
        'Retry-After': '300',
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

module.exports = router;
