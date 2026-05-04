const express = require('express');
const router = express.Router();
const pool = require('../db').pool;
const { authMiddleware, getUserPermissions } = require('../auth');
const cache = require('../cache');

const ACTIVITY_TTL = 30_000; // 30s — near-live feed
const SUMMARY_TTL = 60_000;  // 1 min — per-user scoped summary

// Slim game columns for dashboard (no officials, no coaches, no import log, no division)
const SLIM_GAME_COLS = `
  g.id,
  g.game_date::text AS game_date,
  g.game_time,
  g.status,
  g.home_score,
  g.away_score,
  g.home_team_id,
  g.away_team_id,
  ht.name AS home_team_name_base,
  ht.team_city AS home_team_city,
  ht.team_mascot AS home_team_mascot,
  ht.team_color AS home_team_color,
  ht.age_group AS home_age_group,
  ht.level AS home_level,
  ht.logo_url AS home_team_logo,
  ho.logo_url AS home_org_logo,
  ht.primary_color AS home_primary_color,
  ht.secondary_color AS home_secondary_color,
  at.name AS away_team_name_base,
  at.team_city AS away_team_city,
  at.team_mascot AS away_team_mascot,
  at.team_color AS away_team_color,
  at.age_group AS away_age_group,
  at.level AS away_level,
  at.logo_url AS away_team_logo,
  ao.logo_url AS away_org_logo,
  at.primary_color AS away_primary_color,
  at.secondary_color AS away_secondary_color,
  fl.name AS location_name,
  fl.latitude AS location_lat,
  fl.longitude AS location_lon
`;

const SLIM_GAME_FROM = `
  FROM games g
  LEFT JOIN teams ht ON ht.id = g.home_team_id
  LEFT JOIN organizations ho ON ho.id = ht.org_id
  LEFT JOIN teams at ON at.id = g.away_team_id
  LEFT JOIN organizations ao ON ao.id = at.org_id
  LEFT JOIN field_locations fl ON fl.id = g.location_id
`;

function enrichSlimGame(row) {
  function longName(city, mascot, color, ageGroup, level, base) {
    const parts = [city, mascot, color, ageGroup, level].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : (base || '(Unknown Team)');
  }
  return {
    id: row.id,
    game_date: row.game_date,
    game_time: row.game_time,
    status: row.status === 'completed' ? 'final' : row.status,
    home_score: row.home_score,
    away_score: row.away_score,
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    home_team_name: longName(row.home_team_city, row.home_team_mascot, row.home_team_color, row.home_age_group, row.home_level, row.home_team_name_base),
    home_team_city: row.home_team_city,
    home_age_group: row.home_age_group,
    home_level: row.home_level,
    home_logo: row.home_team_logo || row.home_org_logo || null,
    home_primary_color: row.home_primary_color || null,
    home_secondary_color: row.home_secondary_color || null,
    away_team_name: longName(row.away_team_city, row.away_team_mascot, row.away_team_color, row.away_age_group, row.away_level, row.away_team_name_base),
    away_team_city: row.away_team_city,
    away_age_group: row.away_age_group,
    away_level: row.away_level,
    away_logo: row.away_team_logo || row.away_org_logo || null,
    away_primary_color: row.away_primary_color || null,
    away_secondary_color: row.away_secondary_color || null,
    location_name: row.location_name,
    location_lat: row.location_lat,
    location_lon: row.location_lon,
  };
}

// GET /api/dashboard/activity
// Returns recent activity scoped to the user's teams (admins see all)
router.get('/activity', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 15, 50);
    const userId = req.user.id;
    const role = req.user.role;
    const isSuperAdmin = role === 'super_admin';

    // super_admin sees everything; all other roles are scoped to their permitted teams
    let teamIds = null;
    if (!isSuperAdmin) {
      const perms = await getUserPermissions(userId);
      // org_admin: use teams from their orgs; team_manager: direct team_ids
      const allTeamIds = [
        ...perms.team_ids,
        ...(perms.team_org_ids?.length ? [] : []), // team_org_ids are org-level, resolve below
      ];
      // Resolve all teams belonging to the user's orgs
      const orgIds = [...(perms.org_ids || []), ...(perms.team_org_ids || [])];
      let orgTeamIds = [];
      if (orgIds.length) {
        const { rows } = await pool.query(
          'SELECT id FROM teams WHERE org_id = ANY($1)',
          [orgIds]
        );
        orgTeamIds = rows.map(r => r.id);
      }
      teamIds = [...new Set([...allTeamIds, ...orgTeamIds])];
      if (!teamIds.length) return res.json([]);
    }

    const cacheKey = isSuperAdmin
      ? `dashboard:activity:super:${limit}`
      : `dashboard:activity:user:${userId}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Build scoped queries
    const teamFilter = teamIds ? 'AND (g.home_team_id = ANY($2) OR g.away_team_id = ANY($2))' : '';
    const teamRegFilter = teamIds ? 'AND tr.team_id = ANY($2)' : '';
    const playerTeamFilter = teamIds
      ? 'JOIN team_players tp ON tp.player_id = p.id AND tp.team_id = ANY($2)'
      : '';

    const queryArgs = teamIds ? [limit, teamIds] : [limit];

    const [updatedGames, newPlayers, newRegistrations, recentImports] = await Promise.all([
      // Recently scored/updated games — scoped to user's teams
      pool.query(
        `SELECT g.id, g.updated_at, g.status,
                ht.name AS home_team_name, at.name AS away_team_name,
                g.home_score, g.away_score
         FROM games g
         LEFT JOIN teams ht ON ht.id = g.home_team_id
         LEFT JOIN teams at ON at.id = g.away_team_id
         WHERE g.updated_at IS NOT NULL AND g.deleted_at IS NULL
         ${teamFilter}
         ORDER BY g.updated_at DESC
         LIMIT $1`, queryArgs
      ),
      // Recently added players — scoped to user's teams
      pool.query(
        `SELECT DISTINCT p.id, p.first_name, p.last_name, p.created_at
         FROM players p
         ${playerTeamFilter}
         ORDER BY p.created_at DESC
         LIMIT $1`, queryArgs
      ),
      // Recent registrations — scoped to user's teams
      pool.query(
        `SELECT tr.id, tr.registered_at, tr.status,
                t.id AS team_id, t.name AS team_name
         FROM team_registrations tr
         JOIN teams t ON t.id = tr.team_id
         WHERE TRUE ${teamRegFilter}
         ORDER BY tr.registered_at DESC
         LIMIT $1`, queryArgs
      ),
      // Recent imports — only shown to super admins
      isSuperAdmin ? pool.query(
        `SELECT source, COUNT(*) AS games_imported, MAX(created_at) AS created_at
         FROM game_import_log
         GROUP BY source, DATE_TRUNC('minute', created_at)
         ORDER BY created_at DESC
         LIMIT $1`, [limit]
      ) : Promise.resolve({ rows: [] }),
    ]);

    const items = [];

    for (const row of updatedGames.rows) {
      const label = row.status === 'final'
        ? `${row.away_team_name} @ ${row.home_team_name} — Final ${row.away_score}-${row.home_score}`
        : `${row.away_team_name} @ ${row.home_team_name} updated`;
      items.push({ type: 'game_updated', message: label, timestamp: row.updated_at, icon: 'game', entity_id: row.id });
    }

    for (const row of newPlayers.rows) {
      items.push({ type: 'player_added', message: `${row.first_name} ${row.last_name} was added`, timestamp: row.created_at, icon: 'player', entity_id: row.id });
    }

    for (const row of newRegistrations.rows) {
      items.push({ type: 'registration', message: `${row.team_name} registration ${row.status}`, timestamp: row.registered_at, icon: 'registration', entity_id: row.team_id });
    }

    for (const row of recentImports.rows) {
      const count = parseInt(row.games_imported, 10);
      items.push({ type: 'import', message: `${row.source} import — ${count} game${count !== 1 ? 's' : ''}`, timestamp: row.created_at, icon: 'import', entity_id: null });
    }

    items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const result = items.slice(0, limit);
    cache.set(cacheKey, result, ACTIVITY_TTL);
    res.json(result);
  } catch (err) {
    console.error('Dashboard activity error:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// GET /api/dashboard/summary
// Returns all data the Dashboard needs in one round trip, scoped to the requesting user.
// Cached per user for SUMMARY_TTL (1 min).
router.get('/summary', authMiddleware, async (req, res) => {
  const cacheKey = `dashboard:summary:${req.user.id}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const perms = await getUserPermissions(req.user.id);
    const isAdmin = req.user.role === 'super_admin' || req.user.role === 'org_admin';

    // Effective team IDs — use -1 sentinel when empty so array checks return nothing
    const teamScopeIds = perms.team_ids.length > 0 ? perms.team_ids : [-1];

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Current week boundaries (Sun–Sat)
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const [
      todayGamesRes,
      upcomingRes,
      recentRes,
      unscoredRes,
      weeklyRes,
      totalRes,
      teamCountRes,
      orgCountRes,
      seasonRes,
      alertsRes,
    ] = await Promise.all([
      // Today's games
      pool.query(
        `SELECT ${SLIM_GAME_COLS} ${SLIM_GAME_FROM}
         WHERE g.game_date = $1::date AND g.status != 'cancelled' AND g.deleted_at IS NULL
         ${isAdmin ? '' : 'AND (g.home_team_id = ANY($2) OR g.away_team_id = ANY($2))'}
         ORDER BY g.game_time NULLS LAST`,
        isAdmin ? [today] : [today, teamScopeIds]
      ),

      // Upcoming games — next 5 not yet completed/cancelled
      pool.query(
        `SELECT ${SLIM_GAME_COLS} ${SLIM_GAME_FROM}
         WHERE g.game_date > $1::date AND g.status NOT IN ('completed', 'cancelled') AND g.deleted_at IS NULL
         ${isAdmin ? '' : 'AND (g.home_team_id = ANY($2) OR g.away_team_id = ANY($2))'}
         ORDER BY g.game_date, g.game_time NULLS LAST
         LIMIT 5`,
        isAdmin ? [today] : [today, teamScopeIds]
      ),

      // Recent results — last 5 completed
      pool.query(
        `SELECT ${SLIM_GAME_COLS} ${SLIM_GAME_FROM}
         WHERE g.status = 'completed' AND g.deleted_at IS NULL
         ${isAdmin ? '' : 'AND (g.home_team_id = ANY($1) OR g.away_team_id = ANY($1))'}
         ORDER BY g.game_date DESC, g.game_time DESC
         LIMIT 5`,
        isAdmin ? [] : [teamScopeIds]
      ),

      // Unscored past games (past date + still scheduled)
      pool.query(
        `SELECT ${SLIM_GAME_COLS} ${SLIM_GAME_FROM}
         WHERE g.game_date < $1::date AND g.status = 'scheduled' AND g.deleted_at IS NULL
         ${isAdmin ? '' : 'AND (g.home_team_id = ANY($2) OR g.away_team_id = ANY($2))'}
         ORDER BY g.game_date ASC
         LIMIT 25`,
        isAdmin ? [today] : [today, teamScopeIds]
      ),

      // Games this week count
      pool.query(
        `SELECT COUNT(*) AS count FROM games g
         WHERE g.game_date BETWEEN $1::date AND $2::date AND g.status != 'cancelled' AND g.deleted_at IS NULL
         ${isAdmin ? '' : 'AND (g.home_team_id = ANY($3) OR g.away_team_id = ANY($3))'}`,
        isAdmin ? [weekStartStr, weekEndStr] : [weekStartStr, weekEndStr, teamScopeIds]
      ),

      // Total and completed game counts
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE g.status != 'cancelled') AS total,
           COUNT(*) FILTER (WHERE g.status = 'completed') AS completed
         FROM games g
         ${isAdmin ? 'WHERE g.deleted_at IS NULL' : 'WHERE g.deleted_at IS NULL AND (g.home_team_id = ANY($1) OR g.away_team_id = ANY($1))'}`,
        isAdmin ? [] : [teamScopeIds]
      ),

      // Team count
      pool.query(
        isAdmin
          ? 'SELECT COUNT(*) AS count FROM teams'
          : 'SELECT COUNT(*) AS count FROM teams WHERE id = ANY($1)',
        isAdmin ? [] : [teamScopeIds]
      ),

      // Org count
      pool.query(
        isAdmin
          ? 'SELECT COUNT(*) AS count FROM organizations'
          : 'SELECT COUNT(DISTINCT org_id) AS count FROM teams WHERE id = ANY($1) AND org_id IS NOT NULL',
        isAdmin ? [] : [teamScopeIds]
      ),

      // Current season (most recent by year)
      pool.query(
        `SELECT id, name, year FROM league_seasons ORDER BY year DESC, id DESC LIMIT 1`
      ),

      // Roster alerts — players missing DOB or jersey number
      pool.query(
        isAdmin
          ? `SELECT p.id,
               CONCAT(p.first_name, ' ', p.last_name) AS name,
               (p.date_of_birth IS NULL) AS missing_dob,
               array_agg(DISTINCT t.name ORDER BY t.name) AS all_team_names,
               array_agg(DISTINCT t.name ORDER BY t.name)
                 FILTER (WHERE tp.jersey_number IS NULL) AS jersey_missing_teams
             FROM players p
             JOIN team_players tp ON tp.player_id = p.id
             JOIN teams t ON t.id = tp.team_id
             GROUP BY p.id, p.first_name, p.last_name, p.date_of_birth
             HAVING p.date_of_birth IS NULL OR bool_or(tp.jersey_number IS NULL)
             ORDER BY p.last_name, p.first_name
             LIMIT 50`
          : `SELECT p.id,
               CONCAT(p.first_name, ' ', p.last_name) AS name,
               (p.date_of_birth IS NULL) AS missing_dob,
               array_agg(DISTINCT t.name ORDER BY t.name) AS all_team_names,
               array_agg(DISTINCT t.name ORDER BY t.name)
                 FILTER (WHERE tp.jersey_number IS NULL) AS jersey_missing_teams
             FROM players p
             JOIN team_players tp ON tp.player_id = p.id
             JOIN teams t ON t.id = tp.team_id
             WHERE tp.team_id = ANY($1)
             GROUP BY p.id, p.first_name, p.last_name, p.date_of_birth
             HAVING p.date_of_birth IS NULL OR bool_or(tp.jersey_number IS NULL)
             ORDER BY p.last_name, p.first_name
             LIMIT 50`,
        isAdmin ? [] : [teamScopeIds]
      ),
    ]);

    // Format roster alerts into the shape Dashboard expects
    const rosterAlerts = alertsRes.rows.map(row => {
      const issues = [];
      if (row.missing_dob) issues.push('Missing DOB');
      if (row.jersey_missing_teams?.length > 0) {
        issues.push(`No jersey # on ${row.jersey_missing_teams.join(', ')}`);
      }
      return {
        id: row.id,
        name: row.name,
        issues,
        teams: (row.all_team_names || []).map(tn => ({ team_name: tn })),
      };
    });

    const result = {
      todaysGames: todayGamesRes.rows.map(enrichSlimGame),
      upcomingGames: upcomingRes.rows.map(enrichSlimGame),
      recentResults: recentRes.rows.map(enrichSlimGame),
      unscoredGames: unscoredRes.rows.map(enrichSlimGame),
      counts: {
        gamesThisWeek: parseInt(weeklyRes.rows[0]?.count || '0', 10),
        completedGames: parseInt(totalRes.rows[0]?.completed || '0', 10),
        totalGames: parseInt(totalRes.rows[0]?.total || '0', 10),
        teams: parseInt(teamCountRes.rows[0]?.count || '0', 10),
        orgs: parseInt(orgCountRes.rows[0]?.count || '0', 10),
      },
      currentSeason: seasonRes.rows[0] || null,
      rosterAlerts,
    };

    cache.set(cacheKey, result, SUMMARY_TTL);
    res.json(result);
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

module.exports = router;
