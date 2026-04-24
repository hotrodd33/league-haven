const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireAdmin, canEditTeam, canScoreGame, getUserPermissions } = require('../auth');
const { sendGameChangeEmail } = require('../email');
const { notifyTeamUsers } = require('../push');
const cache = require('../cache');

const STANDINGS_TTL = 5 * 60_000; // 5 min — public site reads frequently
const GAMES_TTL = 45_000;    // 45s — short enough admins see changes quickly

const router = express.Router();

const VALID_STATUSES = ['unscheduled', 'scheduled', 'in_progress', 'completed', 'cancelled', 'postponed'];
const STATUS_LABELS = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Final',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
};

const BASE_SELECT = `
  SELECT g.*,
    ht.name AS home_team_name, ht.logo_url AS home_team_logo,
    ht.org_id AS home_org_id,
    ht.team_city AS home_team_city, ht.team_mascot AS home_team_mascot,
    ht.team_color AS home_team_color, ht.age_group AS home_age_group, ht.level AS home_level,
    ht.primary_color AS home_primary_color, ht.secondary_color AS home_secondary_color,
    ht.abbreviation AS home_team_abbr,
    ho.logo_url AS home_org_logo,
    at.name AS away_team_name, at.logo_url AS away_team_logo,
    at.org_id AS away_org_id,
    at.team_city AS away_team_city, at.team_mascot AS away_team_mascot,
    at.team_color AS away_team_color, at.age_group AS away_age_group, at.level AS away_level,
    at.primary_color AS away_primary_color, at.secondary_color AS away_secondary_color,
    at.abbreviation AS away_team_abbr,
    ao.logo_url AS away_org_logo,
    fl.name AS location_name, fl.address AS location_address,
    fl.city AS location_city, fl.state AS location_state,
    fl.latitude AS location_lat, fl.longitude AS location_lon,
    ls.name AS season_name, ls.year AS season_year,
    gd.division_id, gd.division_name, gd.division_sort,
    gil.is_gamechanger_imported,
    goa.official_ids, goa.official_names, goa.officials,
    gua.interested_official_ids, gua.interested_umpire_names, gua.interested_umpires,
    hsc.name AS home_sched_name, hsc.email AS home_sched_email, hsc.phone AS home_sched_phone, hsc.role AS home_sched_role,
    asched.name AS away_sched_name, asched.email AS away_sched_email, asched.phone AS away_sched_phone, asched.role AS away_sched_role
  FROM games g
  LEFT JOIN teams ht ON ht.id = g.home_team_id
  LEFT JOIN organizations ho ON ho.id = ht.org_id
  LEFT JOIN teams at ON at.id = g.away_team_id
  LEFT JOIN organizations ao ON ao.id = at.org_id
  LEFT JOIN field_locations fl ON fl.id = g.location_id
  LEFT JOIN league_seasons ls ON ls.id = g.season_id
  LEFT JOIN LATERAL (
    SELECT ld.id AS division_id, ld.name AS division_name, ld.sort_order AS division_sort
    FROM team_divisions htd
    JOIN team_divisions atd ON htd.division_id = atd.division_id
    JOIN league_divisions ld ON ld.id = htd.division_id
    WHERE htd.team_id = g.home_team_id AND atd.team_id = g.away_team_id
    ORDER BY ld.sort_order
    LIMIT 1
  ) gd ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(bool_or(gil.source = 'gamechanger'), false) AS is_gamechanger_imported
    FROM game_import_log gil
    WHERE gil.game_id = g.id
  ) gil ON true
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(array_agg(o.id ORDER BY o.name) FILTER (WHERE o.id IS NOT NULL), ARRAY[]::INTEGER[]) AS official_ids,
      COALESCE(array_agg(o.name ORDER BY o.name) FILTER (WHERE o.id IS NOT NULL), ARRAY[]::TEXT[]) AS official_names,
      COALESCE(
        json_agg(
          json_build_object(
            'id', o.id,
            'name', o.name,
            'org_ids', COALESCE((SELECT array_agg(oo.org_id) FROM official_organizations oo WHERE oo.official_id = o.id), ARRAY[]::INTEGER[]),
            'rate_per_game', o.rate_per_game
          )
          ORDER BY o.name
        ) FILTER (WHERE o.id IS NOT NULL),
        '[]'::json
      ) AS officials
    FROM game_official_assignments go
    JOIN officials o ON o.id = go.official_id
    WHERE go.game_id = g.id
  ) goa ON true
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(array_agg(i.official_id ORDER BY i.name) FILTER (WHERE i.official_id IS NOT NULL), ARRAY[]::INTEGER[]) AS interested_official_ids,
      COALESCE(array_agg(i.name ORDER BY i.name) FILTER (WHERE i.name IS NOT NULL), ARRAY[]::TEXT[]) AS interested_umpire_names,
      COALESCE(
        json_agg(
          json_build_object(
            'user_id', i.user_id,
            'official_id', i.official_id,
            'name', i.name,
            'interested_at', i.interested_at
          )
          ORDER BY i.name
        ) FILTER (WHERE i.user_id IS NOT NULL),
        '[]'::json
      ) AS interested_umpires
    FROM (
      SELECT
        ugi.user_id,
        o.id AS official_id,
        COALESCE(o.name, u.name) AS name,
        ugi.interested_at
      FROM umpire_game_interests ugi
      JOIN users u ON u.id = ugi.user_id
      LEFT JOIN officials o ON o.user_id = ugi.user_id
      WHERE ugi.game_id = g.id
    ) i
  ) gua ON true
  LEFT JOIN LATERAL (
    SELECT sm.name, sm.email, sm.phone,
      CASE WHEN tsa.is_scheduling_contact THEN 'scheduling_contact' ELSE tsa.role END AS role,
      CASE WHEN tsa.is_scheduling_contact THEN 0
           WHEN tsa.role = 'head_coach' THEN 2
           WHEN tsa.role = 'org_admin' THEN 3
           ELSE 4 END AS prio
    FROM team_staff_assignments tsa
    JOIN staff_members sm ON sm.id = tsa.staff_id
    WHERE tsa.team_id = g.home_team_id
      AND (tsa.is_scheduling_contact = true OR tsa.role IN ('head_coach', 'org_admin'))
    UNION ALL
    SELECT o.contact_name, o.contact_email, o.contact_phone, 'org_scheduler' AS role, 1 AS prio
    FROM organizations o
    WHERE o.id = ht.org_id AND o.scheduling_contact_is_org_contact = true
    ORDER BY prio
    LIMIT 1
  ) hsc ON true
  LEFT JOIN LATERAL (
    SELECT sm.name, sm.email, sm.phone,
      CASE WHEN tsa.is_scheduling_contact THEN 'scheduling_contact' ELSE tsa.role END AS role,
      CASE WHEN tsa.is_scheduling_contact THEN 0
           WHEN tsa.role = 'head_coach' THEN 2
           WHEN tsa.role = 'org_admin' THEN 3
           ELSE 4 END AS prio
    FROM team_staff_assignments tsa
    JOIN staff_members sm ON sm.id = tsa.staff_id
    WHERE tsa.team_id = g.away_team_id
      AND (tsa.is_scheduling_contact = true OR tsa.role IN ('head_coach', 'org_admin'))
    UNION ALL
    SELECT ao2.contact_name, ao2.contact_email, ao2.contact_phone, 'org_scheduler' AS role, 1 AS prio
    FROM organizations ao2
    WHERE ao2.id = at.org_id AND ao2.scheduling_contact_is_org_contact = true
    ORDER BY prio
    LIMIT 1
  ) asched ON true
`;

// Lightweight SELECT for list views — omits officials, interested umpires, coach contacts,
// and gamechanger import log. GameDetail uses BASE_SELECT; GameSchedule/Dashboard use SLIM_SELECT.
const SLIM_SELECT = `
  SELECT g.*,
    ht.name AS home_team_name, ht.logo_url AS home_team_logo,
    ht.org_id AS home_org_id,
    ht.team_city AS home_team_city, ht.team_mascot AS home_team_mascot,
    ht.team_color AS home_team_color, ht.age_group AS home_age_group, ht.level AS home_level,
    ht.primary_color AS home_primary_color, ht.secondary_color AS home_secondary_color,
    ht.abbreviation AS home_team_abbr,
    ho.logo_url AS home_org_logo,
    at.name AS away_team_name, at.logo_url AS away_team_logo,
    at.org_id AS away_org_id,
    at.team_city AS away_team_city, at.team_mascot AS away_team_mascot,
    at.team_color AS away_team_color, at.age_group AS away_age_group, at.level AS away_level,
    at.primary_color AS away_primary_color, at.secondary_color AS away_secondary_color,
    at.abbreviation AS away_team_abbr,
    ao.logo_url AS away_org_logo,
    fl.name AS location_name, fl.address AS location_address,
    fl.city AS location_city, fl.state AS location_state,
    fl.latitude AS location_lat, fl.longitude AS location_lon,
    ls.name AS season_name, ls.year AS season_year,
    gd.division_id, gd.division_name, gd.division_sort,
    hsc.name AS home_sched_name, hsc.email AS home_sched_email, hsc.phone AS home_sched_phone, hsc.role AS home_sched_role,
    asched.name AS away_sched_name, asched.email AS away_sched_email, asched.phone AS away_sched_phone, asched.role AS away_sched_role
  FROM games g
  LEFT JOIN teams ht ON ht.id = g.home_team_id
  LEFT JOIN organizations ho ON ho.id = ht.org_id
  LEFT JOIN teams at ON at.id = g.away_team_id
  LEFT JOIN organizations ao ON ao.id = at.org_id
  LEFT JOIN field_locations fl ON fl.id = g.location_id
  LEFT JOIN league_seasons ls ON ls.id = g.season_id
  LEFT JOIN LATERAL (
    SELECT ld.id AS division_id, ld.name AS division_name, ld.sort_order AS division_sort
    FROM team_divisions htd
    JOIN team_divisions atd ON htd.division_id = atd.division_id
    JOIN league_divisions ld ON ld.id = htd.division_id
    WHERE htd.team_id = g.home_team_id AND atd.team_id = g.away_team_id
    ORDER BY ld.sort_order
    LIMIT 1
  ) gd ON true
  LEFT JOIN LATERAL (
    SELECT sm.name, sm.email, sm.phone,
      CASE WHEN tsa.is_scheduling_contact THEN 'scheduling_contact' ELSE tsa.role END AS role,
      CASE WHEN tsa.is_scheduling_contact THEN 0
           WHEN tsa.role = 'head_coach' THEN 2
           WHEN tsa.role = 'org_admin' THEN 3
           ELSE 4 END AS prio
    FROM team_staff_assignments tsa
    JOIN staff_members sm ON sm.id = tsa.staff_id
    WHERE tsa.team_id = g.home_team_id
      AND (tsa.is_scheduling_contact = true OR tsa.role IN ('head_coach', 'org_admin'))
    UNION ALL
    SELECT o.contact_name, o.contact_email, o.contact_phone, 'org_scheduler' AS role, 1 AS prio
    FROM organizations o
    WHERE o.id = ht.org_id AND o.scheduling_contact_is_org_contact = true
    ORDER BY prio
    LIMIT 1
  ) hsc ON true
  LEFT JOIN LATERAL (
    SELECT sm.name, sm.email, sm.phone,
      CASE WHEN tsa.is_scheduling_contact THEN 'scheduling_contact' ELSE tsa.role END AS role,
      CASE WHEN tsa.is_scheduling_contact THEN 0
           WHEN tsa.role = 'head_coach' THEN 2
           WHEN tsa.role = 'org_admin' THEN 3
           ELSE 4 END AS prio
    FROM team_staff_assignments tsa
    JOIN staff_members sm ON sm.id = tsa.staff_id
    WHERE tsa.team_id = g.away_team_id
      AND (tsa.is_scheduling_contact = true OR tsa.role IN ('head_coach', 'org_admin'))
    UNION ALL
    SELECT ao2.contact_name, ao2.contact_email, ao2.contact_phone, 'org_scheduler' AS role, 1 AS prio
    FROM organizations ao2
    WHERE ao2.id = at.org_id AND ao2.scheduling_contact_is_org_contact = true
    ORDER BY prio
    LIMIT 1
  ) asched ON true
`;

function enrichGame(row) {
  // Postgres DATE comes as JS Date object; normalize to YYYY-MM-DD string
  let gameDate = row.game_date;
  if (gameDate instanceof Date) {
    gameDate = gameDate.toISOString().slice(0, 10);
  } else if (typeof gameDate === 'string' && gameDate.length > 10) {
    gameDate = gameDate.slice(0, 10);
  }
  const homeLong = row.home_team_city
    ? [row.home_team_city, row.home_team_mascot, row.home_team_color, row.home_age_group, row.home_level].filter(Boolean).join(' ')
    : null;
  const awayLong = row.away_team_city
    ? [row.away_team_city, row.away_team_mascot, row.away_team_color, row.away_age_group, row.away_level].filter(Boolean).join(' ')
    : null;
  // City abbreviation for fallback logos
  function cityAbbr(city) {
    if (!city) return '?';
    const words = city.trim().split(/\s+/);
    return (words.length > 1 ? words.map(w => w[0]).join('') : city.substring(0, 3)).toUpperCase();
  }
  return {
    ...row,
    game_date: gameDate,
    is_gamechanger_imported: !!row.is_gamechanger_imported,
    status_label: STATUS_LABELS[row.status] || row.status,
    home_team_name: homeLong || row.home_team_name || '(Deleted Team)',
    away_team_name: awayLong || row.away_team_name || '(Deleted Team)',
    home_logo: row.home_team_logo || row.home_org_logo || null,
    away_logo: row.away_team_logo || row.away_org_logo || null,
    home_primary_color: row.home_primary_color || null,
    home_secondary_color: row.home_secondary_color || null,
    home_city_abbr: cityAbbr(row.home_team_city),
    away_primary_color: row.away_primary_color || null,
    away_secondary_color: row.away_secondary_color || null,
    away_city_abbr: cityAbbr(row.away_team_city),
    home_team_abbr: row.home_team_abbr || null,
    away_team_abbr: row.away_team_abbr || null,
    official_ids: row.official_ids || [],
    official_names: row.official_names || [],
    officials: (row.officials || []).map(({ rate_per_game, ...rest }) => rest),
    interested_official_ids: row.interested_official_ids || [],
    interested_umpire_names: row.interested_umpire_names || [],
    interested_umpires: row.interested_umpires || [],
  };
}

async function replaceGameOfficials(client, gameId, officialIds = []) {
  await client.query('DELETE FROM game_official_assignments WHERE game_id = $1', [gameId]);
  if (!officialIds.length) return;

  const uniqueIds = [...new Set(officialIds.map((id) => Number(id)).filter(Number.isFinite))];
  if (!uniqueIds.length) return;

  const { rows } = await client.query('SELECT id FROM officials WHERE id = ANY($1)', [uniqueIds]);
  const validSet = new Set(rows.map((r) => Number(r.id)));
  const validIds = uniqueIds.filter((id) => validSet.has(id));
  if (!validIds.length) return;

  await client.query(
    'INSERT INTO game_official_assignments (game_id, official_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
    [gameId, validIds]
  );
}

async function canAssignOfficialsForTeam(client, teamId) {
  if (!teamId) return false;
  const { rows } = await client.query(
    `SELECT COALESCE(o.officials_enabled, false) AS officials_enabled
     FROM teams t
     LEFT JOIN organizations o ON o.id = t.org_id
     WHERE t.id = $1`,
    [teamId]
  );
  return !!rows[0]?.officials_enabled;
}

// GET games — supports filters: ?team_id=, ?season_id=, ?status=, ?from=, ?to=, ?slim=true
router.get('/', async (req, res) => {
  try {
    const { team_id, season_id, status, from, to, slim } = req.query;
    const isSlim = slim === 'true';

    const cacheKey = `games:${isSlim ? 'slim' : 'full'}:${team_id||''}:${season_id||''}:${status||''}:${from||''}:${to||''}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

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
    if (status) {
      conditions.push(`g.status = $${idx}`);
      params.push(status);
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
    const selectBase = isSlim ? SLIM_SELECT : BASE_SELECT;
    const sql = selectBase + where + ' ORDER BY gd.division_sort NULLS LAST, gd.division_name NULLS LAST, g.game_date, g.game_time NULLS LAST';
    const { rows } = await pool.query(sql, params);
    const result = rows.map(enrichGame);
    cache.set(cacheKey, result, GAMES_TTL);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET standings — ?season_id= required
router.get('/standings', async (req, res) => {
  try {
    const { season_id } = req.query;
    if (!season_id) return res.status(400).json({ error: 'season_id is required' });
    const cacheKey = `standings:${season_id}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Build division paths first
    const { rows: divRows } = await pool.query(`
      WITH RECURSIVE div_tree AS (
        SELECT id, parent_id, name, sort_order,
          name::text AS path,
          LPAD(COALESCE(sort_order, 0)::text, 5, '0') AS sort_path
        FROM league_divisions WHERE parent_id IS NULL AND season_id = $1
        UNION ALL
        SELECT d.id, d.parent_id, d.name, d.sort_order,
          (dt.path || ' > ' || d.name)::text,
          (dt.sort_path || '.' || LPAD(COALESCE(d.sort_order, 0)::text, 5, '0'))::text
        FROM league_divisions d JOIN div_tree dt ON d.parent_id = dt.id
      )
      SELECT * FROM div_tree
    `, [season_id]);

    // Build a lookup: division_id -> {path, sort_path}
    const divLookup = {};
    for (const d of divRows) {
      divLookup[d.id] = { division_id: d.id, division_name: d.path, sort_path: d.sort_path };
    }

    // Get all teams in divisions for this season, with optional standings from completed games
    const { rows } = await pool.query(`
      WITH completed_games AS (
        SELECT id, home_team_id, away_team_id, home_score, away_score
        FROM games
        WHERE status = 'completed' AND season_id = $1 AND deleted_at IS NULL
      ),
      team_results AS (
        SELECT home_team_id AS team_id,
          1 AS gp,
          CASE WHEN home_score > away_score THEN 1 ELSE 0 END AS wins,
          CASE WHEN home_score < away_score THEN 1 ELSE 0 END AS losses,
          CASE WHEN home_score = away_score THEN 1 ELSE 0 END AS ties,
          COALESCE(home_score, 0) AS runs_for,
          COALESCE(away_score, 0) AS runs_against
        FROM completed_games
        UNION ALL
        SELECT away_team_id AS team_id,
          1 AS gp,
          CASE WHEN away_score > home_score THEN 1 ELSE 0 END AS wins,
          CASE WHEN away_score < home_score THEN 1 ELSE 0 END AS losses,
          CASE WHEN away_score = home_score THEN 1 ELSE 0 END AS ties,
          COALESCE(away_score, 0) AS runs_for,
          COALESCE(home_score, 0) AS runs_against
        FROM completed_games
      ),
      standings AS (
        SELECT team_id,
          SUM(gp)::int AS gp,
          SUM(wins)::int AS wins,
          SUM(losses)::int AS losses,
          SUM(ties)::int AS ties,
          SUM(runs_for)::int AS runs_for,
          SUM(runs_against)::int AS runs_against
        FROM team_results
        WHERE team_id IS NOT NULL
        GROUP BY team_id
      ),
      season_divs AS (
        SELECT id FROM league_divisions WHERE season_id = $1
      )
      SELECT
        t.id AS team_id,
        COALESCE(s.gp, 0) AS gp,
        COALESCE(s.wins, 0) AS wins,
        COALESCE(s.losses, 0) AS losses,
        COALESCE(s.ties, 0) AS ties,
        COALESCE(s.runs_for, 0) AS runs_for,
        COALESCE(s.runs_against, 0) AS runs_against,
        t.name AS team_name, t.logo_url AS team_logo, t.org_id,
        t.age_group, t.level,
        t.team_city, t.team_mascot, t.team_color,
        t.primary_color, t.secondary_color,
        o.name AS org_name, o.logo_url AS org_logo,
        td.division_id
      FROM team_divisions td
      JOIN season_divs sd ON sd.id = td.division_id
      JOIN teams t ON t.id = td.team_id
      LEFT JOIN standings s ON s.team_id = t.id
      LEFT JOIN organizations o ON o.id = t.org_id
      ORDER BY t.name
    `, [season_id]);

    // Keep only one division row per team: the deepest assigned division in this season.
    const bestRowByTeam = {};
    function divisionDepth(divisionId) {
      const sortPath = divLookup[divisionId]?.sort_path;
      if (!sortPath) return 0;
      return String(sortPath).split('.').length;
    }
    for (const row of rows) {
      const existing = bestRowByTeam[row.team_id];
      if (!existing) {
        bestRowByTeam[row.team_id] = row;
        continue;
      }
      const rowDepth = divisionDepth(row.division_id);
      const existingDepth = divisionDepth(existing.division_id);
      if (rowDepth > existingDepth) {
        bestRowByTeam[row.team_id] = row;
        continue;
      }
      if (rowDepth === existingDepth) {
        const rowSort = divLookup[row.division_id]?.sort_path || 'zzz';
        const existingSort = divLookup[existing.division_id]?.sort_path || 'zzz';
        if (rowSort < existingSort) bestRowByTeam[row.team_id] = row;
      }
    }

    // Enrich with division path and points (W=3, T=2, L=1)
    const result = Object.values(bestRowByTeam).map(r => {
      let div = null;
      if (r.division_id && divLookup[r.division_id]) {
        div = divLookup[r.division_id];
      }
      const points = (r.wins * 3) + (r.ties * 2) + (r.losses * 1);
      const longName = r.team_city
        ? [r.team_city, r.team_mascot, r.team_color, r.age_group, r.level].filter(Boolean).join(' ')
        : null;
      const cityWords = (r.team_city || '').trim().split(/\s+/);
      const cityAbbr = r.team_city
        ? (cityWords.length > 1 ? cityWords.map(w => w[0]).join('') : r.team_city.substring(0, 3)).toUpperCase()
        : null;
      return {
        ...r,
        points,
        team_name: longName || r.team_name,
        city_abbr: cityAbbr,
        logo: r.team_logo || r.org_logo || null,
        division_id: div?.division_id || null,
        division_name: div?.division_name || null,
        division_sort: div?.sort_path || null,
      };
    });

    // Sort by division path, then points desc, then run differential
    result.sort((a, b) => {
      const da = a.division_sort || 'zzz';
      const db = b.division_sort || 'zzz';
      if (da !== db) return da.localeCompare(db);
      if (a.points !== b.points) return b.points - a.points;
      if (a.wins !== b.wins) return b.wins - a.wins;
      return (b.runs_for - b.runs_against) - (a.runs_for - a.runs_against);
    });

    cache.set(cacheKey, result, STANDINGS_TTL);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET deleted games — super_admin only
router.get('/deleted', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      SLIM_SELECT + ' WHERE g.deleted_at IS NOT NULL ORDER BY g.deleted_at DESC LIMIT 200'
    );
    res.json(rows.map(enrichGame));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET single game
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(BASE_SELECT + ' WHERE g.id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Game not found' });
    res.json(enrichGame(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CREATE game (super_admin or org_admin for their org's teams)
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { season_id, home_team_id, away_team_id, location_id, game_date, game_time, status, notes, official_ids } = req.body;
    if (!home_team_id || !away_team_id) {
      return res.status(400).json({ error: 'home_team_id and away_team_id are required' });
    }
    if (Number(home_team_id) === Number(away_team_id)) {
      return res.status(400).json({ error: 'Home and away teams must be different' });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Permission check: super_admin can schedule any game; org_admin for their org; team_manager for their teams
    if (req.user.role !== 'super_admin') {
      const perms = await getUserPermissions(req.user.id);
      if (req.user.role === 'org_admin') {
        const { rows: teamOrgs } = await pool.query(
          'SELECT id, org_id FROM teams WHERE id IN ($1, $2)',
          [home_team_id, away_team_id]
        );
        const hasAccess = teamOrgs.every(t => t.org_id && perms.org_ids.includes(t.org_id));
        if (!hasAccess) {
          return res.status(403).json({ error: 'You can only schedule games for teams in your organization' });
        }
      } else if (req.user.role === 'team_manager') {
        const teamIds = [Number(home_team_id), Number(away_team_id)];
        const hasAccess = teamIds.some(id => perms.team_ids.includes(id));
        if (!hasAccess) {
          return res.status(403).json({ error: 'You can only schedule games for your teams' });
        }
      } else {
        return res.status(403).json({ error: 'Not authorized to schedule games' });
      }
    }

    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO games (season_id, home_team_id, away_team_id, location_id, game_date, game_time, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [season_id || null, home_team_id, away_team_id, location_id || null,
       game_date || null, game_time || null, status || (game_date && game_time && location_id ? 'scheduled' : 'unscheduled'), notes || null]
    );
    const gameId = rows[0].id;
    const officialIds = Array.isArray(official_ids) ? official_ids : [];
    if (officialIds.length) {
      const allowed = await canAssignOfficialsForTeam(client, home_team_id);
      if (!allowed) {
        // Still allow if all officials being assigned are league-level (no org assignments)
        const { rows: offRows } = await client.query(
          'SELECT DISTINCT o.id FROM officials o JOIN official_organizations oo ON oo.official_id = o.id WHERE o.id = ANY($1)',
          [officialIds.map(Number).filter(Number.isFinite)]
        );
        if (offRows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Officials are not enabled for the home organization' });
        }
      }
    }
    await replaceGameOfficials(client, gameId, officialIds);
    await client.query('COMMIT');

    cache.invalidatePrefix('games:');
    cache.invalidatePrefix('standings:');
    cache.invalidatePrefix('umpires:');
    const { rows: gameRows } = await pool.query(BASE_SELECT + ' WHERE g.id = $1', [gameId]);
    res.status(201).json(enrichGame(gameRows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// UPDATE game (admin or manager of either team)
router.put('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { rows: existing } = await client.query(
      'SELECT id, home_team_id, away_team_id, game_date, game_time, status FROM games WHERE id = $1', [id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Game not found' });

    const game = existing[0];
    const allowed = await canScoreGame(req.user, game.home_team_id, game.away_team_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized to update this game' });

    const { season_id, home_team_id, away_team_id, location_id, game_date, game_time, home_score, away_score, innings_played, notes, official_ids } = req.body;
    let { status } = req.body;
    const hasGameDate = Object.prototype.hasOwnProperty.call(req.body, 'game_date');

    // Auto-promote: if date + time + location are all set and status is unscheduled, promote to scheduled
    const effectiveDate = game_date || game.game_date;
    const effectiveTime = game_time || game.game_time;
    const effectiveLocation = location_id || game.location_id;
    if ((!status || status === 'unscheduled') && effectiveDate && effectiveTime && effectiveLocation) {
      status = 'scheduled';
    }

    // Only clear schedule if status is still unscheduled after auto-promote check
    const shouldClearSchedule = status === 'unscheduled' || (hasGameDate && game_date === null);
    if (home_team_id && away_team_id && Number(home_team_id) === Number(away_team_id)) {
      return res.status(400).json({ error: 'Home and away teams must be different' });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Capture old values for change detection
    const oldDate = normalizeDate(game.game_date);
    const oldTime = normalizeTime(game.game_time);

    await client.query('BEGIN');
    if (shouldClearSchedule) {
      await client.query(
        'UPDATE games SET game_date = NULL, game_time = NULL WHERE id = $1',
        [id]
      );
    }
    await client.query(
      `UPDATE games SET
        season_id = COALESCE($1, season_id),
        home_team_id = COALESCE($2, home_team_id),
        away_team_id = COALESCE($3, away_team_id),
        location_id = $4,
        game_date = COALESCE($5, game_date),
        game_time = $6,
        status = COALESCE($7, status),
        home_score = $8,
        away_score = $9,
        innings_played = $10,
        notes = $11,
        updated_at = NOW()
       WHERE id = $12`,
      [season_id, home_team_id, away_team_id, location_id ?? null,
       game_date, game_time ?? null, status, home_score ?? null, away_score ?? null,
       innings_played ?? null, notes ?? null, id]
    );

    if (official_ids !== undefined) {
      const officialIds = Array.isArray(official_ids) ? official_ids : [];
      if (officialIds.length) {
        const effectiveHomeTeamId = home_team_id || game.home_team_id;
        const orgAllowed = await canAssignOfficialsForTeam(client, effectiveHomeTeamId);
        if (!orgAllowed) {
          // Still allow if all officials being assigned are league-level (no org assignments)
          const { rows: offRows } = await client.query(
            'SELECT DISTINCT o.id FROM officials o JOIN official_organizations oo ON oo.official_id = o.id WHERE o.id = ANY($1)',
            [officialIds.map(Number).filter(Number.isFinite)]
          );
          if (offRows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Officials are not enabled for the home organization' });
          }
        }
      }
      await replaceGameOfficials(client, id, officialIds);
    }

    await client.query('COMMIT');

    const { rows } = await pool.query(BASE_SELECT + ' WHERE g.id = $1', [id]);
    const updated = enrichGame(rows[0]);

    // Detect date/time changes and notify staff
    const newDate = normalizeDate(game_date || game.game_date);
    const newTime = normalizeTime(game_time !== undefined ? game_time : game.game_time);
    if (oldDate !== newDate || oldTime !== newTime) {
      notifyGameChange(updated, oldDate, newDate, oldTime, newTime, req.user);
    }

    // Push notification for status changes (cancelled/postponed)
    if (status && status !== game.status && (status === 'cancelled' || status === 'postponed')) {
      const statusTeamIds = [updated.home_team_id, updated.away_team_id].filter(Boolean);
      const label = status === 'cancelled' ? 'Cancelled' : 'Postponed';
      notifyTeamUsers(statusTeamIds, {
        title: `Game ${label}`,
        body: `${updated.home_team_name} vs ${updated.away_team_name} has been ${status}`,
        tag: `game-status-${updated.id}`,
        url: '/',
      }, 'cancellations').catch(() => {});
    }

    cache.invalidatePrefix('games:');
    cache.invalidatePrefix('standings:');
    cache.invalidatePrefix('umpires:');
    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

function normalizeDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// Normalize time to HH:MM so DB values (HH:MM:SS) compare equal to request values (HH:MM)
function normalizeTime(t) {
  if (!t) return null;
  return String(t).slice(0, 5);
}

async function notifyGameChange(game, oldDate, newDate, oldTime, newTime, user) {
  try {
    const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean);
    if (!teamIds.length) return;

    // Look up sender's email for Reply-To
    const { rows: senderRows } = await pool.query('SELECT email FROM users WHERE id = $1', [user.id]);
    const senderEmail = senderRows[0]?.email || null;
    const replyTo = senderEmail ? { email: senderEmail, name: user.name || user.username } : undefined;

    const placeholders = teamIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(
      `SELECT DISTINCT s.email
       FROM staff_members s
       JOIN team_staff_assignments tsa ON tsa.staff_id = s.id
       WHERE tsa.team_id IN (${placeholders}) AND s.email IS NOT NULL AND s.email != ''`,
      teamIds
    );
    const emails = rows.map(r => r.email);
    if (!emails.length) return;

    await sendGameChangeEmail(emails, {
      homeTeam: game.home_team_name,
      awayTeam: game.away_team_name,
      oldDate,
      newDate,
      oldTime,
      newTime,
      changedBy: user.name || user.username || 'Unknown',
      replyTo,
    });

    // Also send push notification
    notifyTeamUsers(teamIds, {
      title: 'Schedule Change',
      body: `${game.home_team_name} vs ${game.away_team_name} has been updated`,
      tag: `game-change-${game.id}`,
      url: '/',
    }, 'schedule_changes').catch(() => {});
  } catch (err) {
    console.error('[GAME-NOTIFY] Failed to send game change email:', err);
  }
}

// PUT /:id/heartbeat — scorer keepalive; bumps updated_at so the live ticker knows the game is active
router.put('/:id/heartbeat', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT home_team_id, away_team_id FROM games WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Game not found' });
    const allowed = await canScoreGame(req.user, rows[0].home_team_id, rows[0].away_team_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });
    await pool.query('UPDATE games SET updated_at = NOW() WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE game (super_admin or org_admin for their org's teams)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id, home_team_id, away_team_id FROM games WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Game not found' });

    if (req.user.role !== 'super_admin') {
      const perms = await getUserPermissions(req.user.id);
      if (req.user.role === 'org_admin') {
        const { rows: teamOrgs } = await pool.query(
          'SELECT id, org_id FROM teams WHERE id IN ($1, $2)',
          [rows[0].home_team_id, rows[0].away_team_id]
        );
        const hasAccess = teamOrgs.every(t => t.org_id && perms.org_ids.includes(t.org_id));
        if (!hasAccess) {
          return res.status(403).json({ error: 'You can only delete games for teams in your organization' });
        }
      } else if (req.user.role === 'team_manager') {
        const teamIds = [Number(rows[0].home_team_id), Number(rows[0].away_team_id)];
        const hasAccess = teamIds.some(id => perms.team_ids.includes(id));
        if (!hasAccess) {
          return res.status(403).json({ error: 'You can only delete games for your teams' });
        }
      } else {
        return res.status(403).json({ error: 'Not authorized to delete games' });
      }
    }

    await pool.query('UPDATE games SET deleted_at = NOW() WHERE id = $1', [id]);
    cache.invalidatePrefix('games:');
    cache.invalidatePrefix('standings:');
    cache.invalidatePrefix('umpires:');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH restore deleted game — super_admin only
router.patch('/:id/restore', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'UPDATE games SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Deleted game not found' });
    cache.invalidatePrefix('games:');
    cache.invalidatePrefix('standings:');
    cache.invalidatePrefix('umpires:');
    res.json({ success: true, id: rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Pitch Counts ───────────────────────────────

// GET pitch counts for a game
router.get('/:gameId/pitch-counts', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT gpc.*, p.first_name, p.last_name,
        tp.jersey_number
      FROM game_pitch_counts gpc
      JOIN players p ON p.id = gpc.player_id
      LEFT JOIN team_players tp ON tp.player_id = p.id AND tp.team_id = gpc.team_id
      WHERE gpc.game_id = $1
      ORDER BY gpc.team_id, p.last_name, p.first_name
    `, [req.params.gameId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: check if user can edit pitch counts / scores for a game
async function canEditGame(user, gameId) {
  if (user.role === 'super_admin') return true;
  const { rows } = await pool.query('SELECT home_team_id, away_team_id FROM games WHERE id = $1', [gameId]);
  if (!rows.length) return false;
  return canScoreGame(user, rows[0].home_team_id, rows[0].away_team_id);
}

// ADD pitch count entry
router.post('/:gameId/pitch-counts', authMiddleware, async (req, res) => {
  try {
    const { gameId } = req.params;
    if (!(await canEditGame(req.user, gameId))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { player_id, team_id, pitch_count } = req.body;
    if (!player_id || !team_id || pitch_count == null) {
      return res.status(400).json({ error: 'player_id, team_id, and pitch_count are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO game_pitch_counts (game_id, player_id, team_id, pitch_count)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [gameId, player_id, team_id, pitch_count]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE pitch count entry
router.put('/:gameId/pitch-counts/:id', authMiddleware, async (req, res) => {
  try {
    const { gameId, id } = req.params;
    if (!(await canEditGame(req.user, gameId))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { pitch_count } = req.body;
    const { rows } = await pool.query(
      `UPDATE game_pitch_counts SET pitch_count = $1 WHERE id = $2 AND game_id = $3 RETURNING *`,
      [pitch_count, id, gameId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pitch count entry not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE pitch count entry
router.delete('/:gameId/pitch-counts/:id', authMiddleware, async (req, res) => {
  try {
    const { gameId, id } = req.params;
    if (!(await canEditGame(req.user, gameId))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { rows } = await pool.query(
      'DELETE FROM game_pitch_counts WHERE id = $1 AND game_id = $2 RETURNING id', [id, gameId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pitch count entry not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
