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
    fl.org_id AS location_org_id,
    ls.name AS season_name, ls.year AS season_year,
    gd.division_id, gd.division_name, gd.division_sort,
    gil.is_gamechanger_imported,
    goa.official_ids, goa.official_names, goa.officials,
    gua.interested_official_ids, gua.interested_umpire_names, gua.interested_umpires,
    hsc.name AS home_sched_name, hsc.email AS home_sched_email, hsc.phone AS home_sched_phone, hsc.role AS home_sched_role,
    asched.name AS away_sched_name, asched.email AS away_sched_email, asched.phone AS away_sched_phone, asched.role AS away_sched_role,
    scu.name AS scoring_user_name
  FROM games g
  LEFT JOIN teams ht ON ht.id = g.home_team_id
  LEFT JOIN organizations ho ON ho.id = ht.org_id
  LEFT JOIN teams at ON at.id = g.away_team_id
  LEFT JOIN organizations ao ON ao.id = at.org_id
  LEFT JOIN field_locations fl ON fl.id = g.location_id
  LEFT JOIN league_seasons ls ON ls.id = g.season_id
  LEFT JOIN users scu ON scu.id = g.scoring_user_id
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
  SELECT
    g.id, g.season_id, g.home_team_id, g.away_team_id,
    g.game_date, g.game_time, g.status,
    g.home_score, g.away_score,
    g.location_id,
    g.game_duration_minutes,
    g.innings_played,
    g.notes,
    g.deleted_at,
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
    fl.name AS location_name,
    fl.address AS location_address, fl.city AS location_city,
    fl.latitude AS location_lat, fl.longitude AS location_lon,
    fl.org_id AS location_org_id,
    gd.division_name, gd.division_sort,
    goa.official_names,
    hag.ump_required AS home_ump_required
  FROM games g
  LEFT JOIN teams ht ON ht.id = g.home_team_id
  LEFT JOIN organizations ho ON ho.id = ht.org_id
  LEFT JOIN teams at ON at.id = g.away_team_id
  LEFT JOIN organizations ao ON ao.id = at.org_id
  LEFT JOIN field_locations fl ON fl.id = g.location_id
  LEFT JOIN league_age_groups hag ON LOWER(TRIM(hag.name)) = LOWER(TRIM(ht.age_group))
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
    SELECT
      COALESCE(array_agg(o.id ORDER BY o.name) FILTER (WHERE o.id IS NOT NULL), ARRAY[]::INTEGER[]) AS official_ids,
      COALESCE(array_agg(o.name ORDER BY o.name) FILTER (WHERE o.id IS NOT NULL), ARRAY[]::TEXT[]) AS official_names
    FROM game_official_assignments go
    JOIN officials o ON o.id = go.official_id
    WHERE go.game_id = g.id
  ) goa ON true
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

// Slim version for schedule list tiles — only the fields tiles actually render.
// Avoids shipping raw source columns (city, mascot, logos) after computing the
// enriched values, and drops fields that are only needed in GameDetail.
function enrichGameSlim(row) {
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
  function cityAbbr(city) {
    if (!city) return '?';
    const words = city.trim().split(/\s+/);
    return (words.length > 1 ? words.map(w => w[0]).join('') : city.substring(0, 3)).toUpperCase();
  }
  return {
    id: row.id,
    season_id: row.season_id,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    home_org_id: row.home_org_id,
    away_org_id: row.away_org_id,
    game_date: gameDate,
    game_time: row.game_time || null,
    status: row.status,
    status_label: STATUS_LABELS[row.status] || row.status,
    home_score: row.home_score ?? null,
    away_score: row.away_score ?? null,
    home_team_name: homeLong || row.home_team_name || '(Deleted Team)',
    away_team_name: awayLong || row.away_team_name || '(Deleted Team)',
    home_logo: row.home_team_logo || row.home_org_logo || null,
    away_logo: row.away_team_logo || row.away_org_logo || null,
    home_age_group: row.home_age_group || null,
    away_age_group: row.away_age_group || null,
    home_level: row.home_level || null,
    away_level: row.away_level || null,
    home_primary_color: row.home_primary_color || null,
    home_secondary_color: row.home_secondary_color || null,
    away_primary_color: row.away_primary_color || null,
    away_secondary_color: row.away_secondary_color || null,
    home_city_abbr: cityAbbr(row.home_team_city),
    away_city_abbr: cityAbbr(row.away_team_city),
    home_team_abbr: row.home_team_abbr || null,
    away_team_abbr: row.away_team_abbr || null,
    location_name: row.location_name || null,
    location_address: row.location_address || null,
    location_city: row.location_city || null,
    location_lat: row.location_lat || null,
    location_lon: row.location_lon || null,
    location_org_id: row.location_org_id || null,
    location_id: row.location_id || null,
    game_duration_minutes: row.game_duration_minutes ?? null,
    innings_played: row.innings_played ?? null,
    notes: row.notes ?? null,
    division_name: row.division_name || null,
    home_ump_required: row.home_ump_required === null || row.home_ump_required === undefined ? null : !!row.home_ump_required,
    is_gamechanger_imported: false, // not in SLIM_SELECT — omitted intentionally
    // Fields used by umpire interest & official assignment display
    official_ids: row.official_ids || [],
    official_names: row.official_names || [],
    officials: (row.official_names || []).map((name) => ({ name })),
    interested_official_ids: [],
    interested_umpire_names: [],
    interested_umpires: [],
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

// GET /games/org-stats — per-org game summary counts (avoids loading all rows into memory)
router.get('/org-stats', async (req, res) => {
  try {
    const cacheKey = 'games:org-stats';
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const { rows } = await pool.query(`
      WITH game_orgs AS (
        SELECT DISTINCT g.id AS game_id, t.org_id, g.status, g.game_date
        FROM games g
        JOIN teams t ON (t.id = g.home_team_id OR t.id = g.away_team_id)
        WHERE g.deleted_at IS NULL AND t.org_id IS NOT NULL
      )
      SELECT
        org_id,
        COUNT(*) FILTER (WHERE status = 'completed') AS played,
        COUNT(*) FILTER (WHERE game_date >= CURRENT_DATE AND status IN ('scheduled', 'in_progress', 'postponed')) AS scheduled,
        COUNT(*) FILTER (WHERE game_date < CURRENT_DATE AND status NOT IN ('cancelled', 'completed')) AS missing_scores
      FROM game_orgs
      GROUP BY org_id
    `);

    // Convert bigint strings to numbers
    const result = {};
    for (const row of rows) {
      result[row.org_id] = {
        played: Number(row.played),
        scheduled: Number(row.scheduled),
        missingScores: Number(row.missing_scores),
      };
    }
    cache.set(cacheKey, result, GAMES_TTL);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET games — supports filters: ?team_id=, ?team_ids=1,2,3, ?season_id=, ?status=, ?from=, ?to=, ?slim=true
router.get('/', async (req, res) => {
  try {
    const { team_id, team_ids, season_id, status, from, to, slim } = req.query;
    const isSlim = slim === 'true';

    // Parse team_ids (comma-separated list for multi-team queries like "my teams")
    const teamIdList = team_ids
      ? team_ids.split(',').map(Number).filter(Number.isFinite)
      : null;

    const cacheKey = `games:${isSlim ? 'slim' : 'full'}:${team_id||''}:${teamIdList ? teamIdList.sort().join('_') : ''}:${season_id||''}:${status||''}:${from||''}:${to||''}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const conditions = ['g.deleted_at IS NULL'];
    const params = [];
    let idx = 1;

    if (team_id) {
      conditions.push(`(g.home_team_id = $${idx} OR g.away_team_id = $${idx})`);
      params.push(Number(team_id));
      idx++;
    } else if (teamIdList && teamIdList.length > 0) {
      conditions.push(`(g.home_team_id = ANY($${idx}::int[]) OR g.away_team_id = ANY($${idx}::int[]))`);
      params.push(teamIdList);
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
    const result = rows.map(isSlim ? enrichGameSlim : enrichGame);
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

// GET /games/sweep — called by Vercel cron (and local setInterval) to expire stale scorers.
// Must be registered before /:id to avoid the wildcard swallowing it.
// Protect with CRON_SECRET env var if set.
router.get('/sweep', async (req, res) => {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const count = await expireStaleScorers();
    res.json({ expired: count });
  } catch (err) {
    console.error('[SWEEP] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET single game
router.get('/:id', async (req, res) => {
  try {
    // Fire-and-forget stale claim expiry so any page load cleans up abandoned live sessions
    expireStaleScorers().catch(() => {});
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
    const { season_id, home_team_id, away_team_id, location_id, game_date, game_time, game_duration_minutes, status, notes, official_ids } = req.body;
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
        // At least one team must belong to the org_admin's organization.
        // Using some() (not every()) so they can schedule inter-org games
        // against opponents from other organizations.
        const hasAccess = teamOrgs.some(t => t.org_id && perms.org_ids.includes(t.org_id));
        if (!hasAccess) {
          return res.status(403).json({ error: 'You can only schedule games involving a team in your organization' });
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
      `INSERT INTO games (season_id, home_team_id, away_team_id, location_id, game_date, game_time, game_duration_minutes, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [season_id || null, home_team_id, away_team_id, location_id || null,
       game_date || null, game_time || null, game_duration_minutes ? Number(game_duration_minutes) : 150,
       // Auto-promote: treat explicit 'unscheduled' (sent by the form default) the same as no status.
       // Promote to 'scheduled' when date + time + location are all provided.
       (!status || status === 'unscheduled')
         ? (game_date && game_time && location_id ? 'scheduled' : 'unscheduled')
         : status,
       notes || null]
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

    const { season_id, home_team_id, away_team_id, location_id, game_date, game_time, game_duration_minutes, home_score, away_score, innings_played, notes, official_ids } = req.body;
    let { status } = req.body;
    const hasGameDate = Object.prototype.hasOwnProperty.call(req.body, 'game_date');
    const hasGameTime = Object.prototype.hasOwnProperty.call(req.body, 'game_time');
    const hasLocationId = Object.prototype.hasOwnProperty.call(req.body, 'location_id');
    const hasNotes = Object.prototype.hasOwnProperty.call(req.body, 'notes');

    // Live-scoring claim enforcement: if someone else has claimed this game
    // for live scoring, only that user (or super_admin) may push score /
    // innings / status updates here. Other fields (date/time/notes/officials)
    // remain editable by anyone with canScoreGame.
    const touchesLiveScore =
      Object.prototype.hasOwnProperty.call(req.body, 'home_score') ||
      Object.prototype.hasOwnProperty.call(req.body, 'away_score') ||
      Object.prototype.hasOwnProperty.call(req.body, 'innings_played') ||
      Object.prototype.hasOwnProperty.call(req.body, 'status');
    if (touchesLiveScore) {
      const { rows: scRows } = await client.query(
        'SELECT scoring_user_id FROM games WHERE id = $1', [id]
      );
      const claimer = scRows[0]?.scoring_user_id;
      if (
        claimer &&
        Number(claimer) !== Number(req.user.id) &&
        req.user.role !== 'super_admin'
      ) {
        return res.status(409).json({
          error: 'Another user is currently scoring this game. Take over scoring to change the score.',
          scoring_user_id: claimer,
        });
      }
    }

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
        location_id = ${hasLocationId ? '$4' : 'COALESCE($4, location_id)'},
        game_date = COALESCE($5, game_date),
        game_time = ${hasGameTime ? '$6' : 'COALESCE($6, game_time)'},
        game_duration_minutes = COALESCE($7, game_duration_minutes),
        status = COALESCE($8, status),
        home_score = $9,
        away_score = $10,
        innings_played = $11,
        notes = ${hasNotes ? '$12' : 'COALESCE($12, notes)'},
        updated_at = NOW()
       WHERE id = $13`,
      [season_id, home_team_id, away_team_id, location_id ?? null,
       game_date, game_time ?? null, game_duration_minutes ? Number(game_duration_minutes) : null,
       status, home_score ?? null, away_score ?? null,
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

// PUT /:id/heartbeat — scorer keepalive; bumps timestamps so the stale-claim sweeper knows the game is still active
router.put('/:id/heartbeat', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT home_team_id, away_team_id FROM games WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Game not found' });
    const allowed = await canScoreGame(req.user, rows[0].home_team_id, rows[0].away_team_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });
    await pool.query('UPDATE games SET updated_at = NOW(), scoring_last_active_at = NOW() WHERE id = $1', [id]);
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
      // League-wide feature gate — non-super-admins can only delete when enabled
      const { rows: brandingRows } = await pool.query(
        'SELECT feature_game_delete FROM app_branding WHERE id = 1'
      );
      if (!brandingRows[0]?.feature_game_delete) {
        return res.status(403).json({ error: 'Game deletion is disabled in league settings' });
      }

      const perms = await getUserPermissions(req.user.id);
      if (req.user.role === 'org_admin') {
        const { rows: teamOrgs } = await pool.query(
          'SELECT id, org_id FROM teams WHERE id IN ($1, $2)',
          [rows[0].home_team_id, rows[0].away_team_id]
        );
        // At least one team must belong to the org_admin's organization.
        const hasAccess = teamOrgs.some(t => t.org_id && perms.org_ids.includes(t.org_id));
        if (!hasAccess) {
          return res.status(403).json({ error: 'You can only delete games involving a team in your organization' });
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

// Determine which side(s) of a game a user has authority over.
// Returns 'home' | 'away' | 'both' | null.
async function getUserGameSide(user, game) {
  if (!user) return null;
  if (user.role === 'super_admin') return 'both';
  const perms = await getUserPermissions(user.id);
  const homeId = Number(game.home_team_id);
  const awayId = Number(game.away_team_id);
  let home = perms.team_ids.includes(homeId);
  let away = perms.team_ids.includes(awayId);
  if (!home || !away) {
    // Org-level access promotes the matching side(s).
    const { rows } = await pool.query(
      'SELECT id, org_id FROM teams WHERE id = ANY($1)',
      [[homeId, awayId]]
    );
    for (const t of rows) {
      if (t.org_id && perms.org_ids.includes(t.org_id)) {
        if (Number(t.id) === homeId) home = true;
        if (Number(t.id) === awayId) away = true;
      }
    }
  }
  if (home && away) return 'both';
  if (home) return 'home';
  if (away) return 'away';
  return null;
}

// ─── Live Scoring Claim ──────────────────────────
// One user at a time owns the live scoreboard (score / innings / status).
// Pitch counts remain editable by either side for their own pitchers.

// POST /api/games/:id/scoring-claim — claim or take over live scoring.
router.post('/:id/scoring-claim', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.body?.force === true || req.body?.force === 'true';
    const { rows } = await pool.query(
      'SELECT id, home_team_id, away_team_id, scoring_user_id FROM games WHERE id = $1',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Game not found' });
    const game = rows[0];
    const allowed = await canScoreGame(req.user, game.home_team_id, game.away_team_id);
    if (!allowed) return res.status(403).json({ error: 'Not authorized to score this game' });

    // If already claimed by someone else, require force=true.
    if (
      game.scoring_user_id &&
      Number(game.scoring_user_id) !== Number(req.user.id) &&
      !force
    ) {
      return res.status(409).json({ error: 'Game is already being scored', scoring_user_id: game.scoring_user_id });
    }

    await pool.query(
      'UPDATE games SET scoring_user_id = $1, scoring_started_at = NOW(), scoring_last_active_at = NOW() WHERE id = $2',
      [req.user.id, id]
    );
    const { rows: out } = await pool.query(BASE_SELECT + ' WHERE g.id = $1', [id]);
    res.json(enrichGame(out[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/games/:id/scoring-claim — release the claim (current claimer or admin).
router.delete('/:id/scoring-claim', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'SELECT scoring_user_id FROM games WHERE id = $1', [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Game not found' });
    const claimer = rows[0].scoring_user_id;
    if (req.user.role !== 'super_admin' && claimer && Number(claimer) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Only the current scorer can release the claim' });
    }
    await pool.query(
      'UPDATE games SET scoring_user_id = NULL, scoring_started_at = NULL WHERE id = $1',
      [id]
    );
    res.json({ success: true });
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
    // Verify team_id is actually one of the teams in this game.
    const { rows: gameRows } = await pool.query(
      'SELECT home_team_id, away_team_id FROM games WHERE id = $1', [gameId]
    );
    const isHome = Number(team_id) === Number(gameRows[0].home_team_id);
    const isAway = Number(team_id) === Number(gameRows[0].away_team_id);
    if (!isHome && !isAway) {
      return res.status(400).json({ error: 'team_id must be one of the teams in this game' });
    }
    // No side-scope restriction: any coach affiliated with either team may
    // enter pitch counts for both teams (e.g. when the opposing team has no
    // one entering their own data).
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
    // Side-scope: a user can only edit pitch counts for their own team(s).
    const { rows: pcRows } = await pool.query(
      `SELECT gpc.team_id, g.home_team_id, g.away_team_id
       FROM game_pitch_counts gpc JOIN games g ON g.id = gpc.game_id
       WHERE gpc.id = $1 AND gpc.game_id = $2`,
      [id, gameId]
    );
    if (!pcRows.length) return res.status(404).json({ error: 'Pitch count entry not found' });
    // No side-scope restriction: any coach affiliated with either team may
    // edit pitch counts for both teams.
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
    // Side-scope: only the team that owns the pitcher can remove the row.
    const { rows: pcRows } = await pool.query(
      `SELECT gpc.team_id, g.home_team_id, g.away_team_id
       FROM game_pitch_counts gpc JOIN games g ON g.id = gpc.game_id
       WHERE gpc.id = $1 AND gpc.game_id = $2`,
      [id, gameId]
    );
    if (!pcRows.length) return res.status(404).json({ error: 'Pitch count entry not found' });
    // No side-scope restriction: any coach affiliated with either team may
    // delete pitch counts for both teams.
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

// ── GET /api/games/:id/box-score — return saved GC box score snapshot ──
router.get('/:id/box-score', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT bs.id, bs.game_id, bs.source, bs.linescore, bs.batting, bs.pitching,
              bs.team_resolution, bs.player_resolution, bs.imported_at, bs.updated_at,
              u.username AS imported_by_username
       FROM game_box_scores bs
       LEFT JOIN users u ON u.id = bs.imported_by
       WHERE bs.game_id = $1
       LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No box score for this game' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET box-score error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Stale Scorer Expiry ─────────────────────────────────────────────────────
// Clears live-scoring claims that have had no heartbeat for 30+ minutes.
// Transitions in_progress games: if scores present → completed; otherwise → scheduled.
// Safe to call concurrently (each UPDATE is scoped to a single game row).

const STALE_SCORER_TIMEOUT_MINUTES = 30;

async function expireStaleScorers() {
  const { rows } = await pool.query(`
    SELECT id, status, home_score, away_score
    FROM games
    WHERE scoring_user_id IS NOT NULL
      AND scoring_last_active_at < NOW() - INTERVAL '${STALE_SCORER_TIMEOUT_MINUTES} minutes'
  `);
  if (!rows.length) return 0;

  for (const game of rows) {
    let newStatus = game.status;
    if (game.status === 'in_progress') {
      newStatus = (game.home_score != null && game.away_score != null) ? 'completed' : 'scheduled';
    }
    await pool.query(
      `UPDATE games
       SET scoring_user_id = NULL,
           scoring_started_at = NULL,
           scoring_last_active_at = NULL,
           status = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [newStatus, game.id]
    );
    console.log(`[SWEEP] Expired stale scorer for game ${game.id}; status ${game.status} → ${newStatus}`);
  }

  cache.invalidatePrefix('games:');
  cache.invalidatePrefix('standings:');
  return rows.length;
}

module.exports = { router, expireStaleScorers };
