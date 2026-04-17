const express = require('express');
const router = express.Router();
const pool = require('../db').pool;
const { authMiddleware } = require('../auth');

// GET /api/dashboard/activity
// Returns recent activity aggregated from existing tables
router.get('/activity', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 15, 50);

    // Run all queries in parallel
    const [newPlayers, updatedGames, newTeams, newRegistrations, recentImports] = await Promise.all([
      // Recently added players
      pool.query(
        `SELECT p.id, p.first_name, p.last_name, p.created_at,
                'player_added' AS type
         FROM players p
         ORDER BY p.created_at DESC
         LIMIT $1`, [limit]
      ),
      // Recently scored/updated games
      pool.query(
        `SELECT g.id, g.updated_at, g.status,
                ht.name AS home_team_name, at.name AS away_team_name,
                g.home_score, g.away_score,
                'game_updated' AS type
         FROM games g
         LEFT JOIN teams ht ON ht.id = g.home_team_id
         LEFT JOIN teams at ON at.id = g.away_team_id
         WHERE g.updated_at IS NOT NULL
         ORDER BY g.updated_at DESC
         LIMIT $1`, [limit]
      ),
      // Recently created teams
      pool.query(
        `SELECT t.id, t.name, t.created_at,
                o.name AS org_name,
                'team_added' AS type
         FROM teams t
         LEFT JOIN organizations o ON o.id = t.org_id
         ORDER BY t.created_at DESC
         LIMIT $1`, [limit]
      ),
      // Recent team registrations
      pool.query(
        `SELECT tr.id, tr.registered_at, tr.status,
                t.name AS team_name,
                'registration' AS type
         FROM team_registrations tr
         JOIN teams t ON t.id = tr.team_id
         ORDER BY tr.registered_at DESC
         LIMIT $1`, [limit]
      ),
      // Recent imports (grouped by source + timestamp batch)
      pool.query(
        `SELECT source, COUNT(*) AS games_imported, MAX(created_at) AS created_at,
                'import' AS type
         FROM game_import_log
         GROUP BY source, DATE_TRUNC('minute', created_at)
         ORDER BY created_at DESC
         LIMIT $1`, [limit]
      ),
    ]);

    // Merge and sort all activity items by timestamp
    const items = [];

    for (const row of newPlayers.rows) {
      items.push({
        type: 'player_added',
        message: `${row.first_name} ${row.last_name} was added`,
        timestamp: row.created_at,
        icon: 'player',
      });
    }

    for (const row of updatedGames.rows) {
      const label = row.status === 'final'
        ? `${row.away_team_name} @ ${row.home_team_name} — Final ${row.away_score}-${row.home_score}`
        : `${row.away_team_name} @ ${row.home_team_name} updated`;
      items.push({
        type: 'game_updated',
        message: label,
        timestamp: row.updated_at,
        icon: 'game',
      });
    }

    for (const row of newTeams.rows) {
      items.push({
        type: 'team_added',
        message: `${row.name}${row.org_name ? ` (${row.org_name})` : ''} was created`,
        timestamp: row.created_at,
        icon: 'team',
      });
    }

    for (const row of newRegistrations.rows) {
      items.push({
        type: 'registration',
        message: `${row.team_name} registration ${row.status}`,
        timestamp: row.registered_at,
        icon: 'registration',
      });
    }

    for (const row of recentImports.rows) {
      const count = parseInt(row.games_imported, 10);
      items.push({
        type: 'import',
        message: `${row.source} import — ${count} game${count !== 1 ? 's' : ''}`,
        timestamp: row.created_at,
        icon: 'import',
      });
    }

    // Sort descending by timestamp, take top N
    items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(items.slice(0, limit));
  } catch (err) {
    console.error('Dashboard activity error:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

module.exports = router;
