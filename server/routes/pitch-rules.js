const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

// ── ZVBL Pitch Count Rules ──
const RULES = {
  '9u-12u': {
    dailyLimit: 50,
    restThresholds: [
      { min: 56, days: 3 },
      { min: 41, days: 2 },
      { min: 21, days: 1 },
      { min: 1, days: 0 },
    ],
  },
  '13u-15u': {
    dailyLimit: 65,
    restThresholds: [
      { min: 61, days: 3 },
      { min: 41, days: 2 },
      { min: 26, days: 1 },
      { min: 1, days: 0 },
    ],
  },
};

function getAgeCategory(ageGroup) {
  if (!ageGroup) return null;
  const ag = ageGroup.toLowerCase().replace(/\s+/g, '');
  if (['8u', '9u', '10u', '11u', '12u'].includes(ag)) return '9u-12u';
  if (['13u', '14u', '15u', '14/15u'].includes(ag)) return '13u-15u';
  return null;
}

function getRestDays(pitchCount, rules) {
  for (const t of rules.restThresholds) {
    if (pitchCount >= t.min) return t.days;
  }
  return 0;
}

function datePlusDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// GET /api/pitch-rules/eligibility?team_id=X&game_date=YYYY-MM-DD&game_id=Y
router.get('/eligibility', authMiddleware, async (req, res) => {
  const { team_id, game_date, game_id } = req.query;
  if (!team_id || !game_date) {
    return res.status(400).json({ error: 'team_id and game_date are required' });
  }

  try {
    // Team's age group
    const { rows: [team] } = await pool.query('SELECT age_group FROM teams WHERE id = $1', [team_id]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const ageCategory = getAgeCategory(team.age_group);
    const rules = ageCategory ? RULES[ageCategory] : null;

    // Team players
    const { rows: players } = await pool.query(
      `SELECT p.id, p.first_name, p.last_name, tp.jersey_number
       FROM team_players tp JOIN players p ON p.id = tp.player_id
       WHERE tp.team_id = $1 ORDER BY p.last_name, p.first_name`,
      [team_id]
    );

    const playerIds = players.map(p => p.id);
    let recentPC = [];

    if (playerIds.length > 0) {
      const lookback = datePlusDays(game_date, -7);
      const params = [playerIds, lookback, game_date];
      let excludeClause = '';
      if (game_id) {
        excludeClause = 'AND g.id != $4';
        params.push(game_id);
      }
      const { rows } = await pool.query(
        `SELECT gpc.player_id, gpc.pitch_count, g.game_date::text AS game_date, g.id AS game_id
         FROM game_pitch_counts gpc
         JOIN games g ON g.id = gpc.game_id
         WHERE gpc.player_id = ANY($1)
           AND g.season_id IS NOT NULL
           AND g.game_date >= $2::date
           AND g.game_date <= $3::date
           AND g.status != 'cancelled'
           ${excludeClause}
         ORDER BY g.game_date DESC`,
        params
      );
      recentPC = rows;
    }

    // Group by player → date → total pitches
    const byPlayer = {};
    for (const pc of recentPC) {
      if (!byPlayer[pc.player_id]) byPlayer[pc.player_id] = {};
      byPlayer[pc.player_id][pc.game_date] = (byPlayer[pc.player_id][pc.game_date] || 0) + pc.pitch_count;
    }

    const gd = game_date;
    const yesterday = datePlusDays(gd, -1);
    const dayBefore = datePlusDays(gd, -2);

    const eligibility = players.map(player => {
      const dateMap = byPlayer[player.id] || {};
      const pitchDates = Object.keys(dateMap).sort().reverse();
      const todayPitches = dateMap[gd] || 0;

      const result = {
        player_id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        jersey_number: player.jersey_number,
        eligible: true,
        reasons: [],
        daily_limit: rules?.dailyLimit ?? null,
        today_pitches: todayPitches,
        remaining_today: rules ? Math.max(0, rules.dailyLimit - todayPitches) : null,
        rest_days_required: 0,
        available_date: gd,
        recent_games: recentPC
          .filter(r => r.player_id === player.id)
          .map(r => ({ game_date: r.game_date, pitch_count: r.pitch_count, game_id: r.game_id })),
      };

      if (!rules) return result;

      // Already at daily limit from other games today
      if (todayPitches >= rules.dailyLimit) {
        result.eligible = false;
        result.reasons.push(`Already at daily limit (${todayPitches}/${rules.dailyLimit} pitches today)`);
      }

      // Rest from most recent pitching date BEFORE game_date
      const priorDates = pitchDates.filter(d => d < gd);
      if (priorDates.length > 0) {
        const lastDate = priorDates[0];
        const totalOnDate = dateMap[lastDate];
        const rest = getRestDays(totalOnDate, rules);
        if (rest > 0) {
          const avail = datePlusDays(lastDate, rest + 1);
          result.rest_days_required = rest;
          result.available_date = avail;
          if (gd < avail) {
            result.eligible = false;
            result.reasons.push(
              `Threw ${totalOnDate} pitches on ${lastDate} — ${rest} rest day${rest !== 1 ? 's' : ''} required (available ${avail})`
            );
          }
        }
      }

      // 3 consecutive calendar days
      if (dateMap[yesterday] && dateMap[dayBefore]) {
        result.eligible = false;
        result.reasons.push('Cannot pitch 3 consecutive calendar days');
      }

      return result;
    });

    res.json({
      team_id: Number(team_id),
      game_date: gd,
      age_category: ageCategory,
      daily_limit: rules?.dailyLimit ?? null,
      rules: rules ? {
        daily_limit: rules.dailyLimit,
        rest_thresholds: rules.restThresholds,
        max_consecutive_days: 2,
      } : null,
      players: eligibility,
    });
  } catch (err) {
    console.error('Pitch rules eligibility error:', err);
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

// GET /api/pitch-rules/team-stats?team_id=X
// Returns pitcher rest status, recent history, and season totals for all players on a team
router.get('/team-stats', authMiddleware, async (req, res) => {
  const { team_id } = req.query;
  if (!team_id) return res.status(400).json({ error: 'team_id is required' });

  try {
    const today = new Date().toISOString().split('T')[0];
    const lookback7 = datePlusDays(today, -7);
    const yesterday = datePlusDays(today, -1);
    const dayBefore = datePlusDays(today, -2);

    // Team info
    const { rows: [team] } = await pool.query('SELECT age_group FROM teams WHERE id = $1', [team_id]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const ageCategory = getAgeCategory(team.age_group);
    const rules = ageCategory ? RULES[ageCategory] : null;

    // Active season
    const { rows: [season] } = await pool.query(
      'SELECT id, name, year FROM league_seasons WHERE is_active = true LIMIT 1'
    );

    // Team players
    const { rows: players } = await pool.query(
      `SELECT p.id, p.first_name, p.last_name, tp.jersey_number
       FROM team_players tp JOIN players p ON p.id = tp.player_id
       WHERE tp.team_id = $1 ORDER BY p.last_name, p.first_name`,
      [team_id]
    );

    const playerIds = players.map(p => p.id);
    if (playerIds.length === 0) {
      return res.json({
        team_id: Number(team_id),
        today,
        age_category: ageCategory,
        daily_limit: rules?.dailyLimit ?? null,
        rules: rules ? { daily_limit: rules.dailyLimit, rest_thresholds: rules.restThresholds, max_consecutive_days: 2 } : null,
        season: season || null,
        players: [],
      });
    }

    // Last 7 days pitch counts
    const { rows: recent7 } = await pool.query(
      `SELECT gpc.player_id, gpc.pitch_count,
              g.game_date::text AS game_date, g.id AS game_id, g.game_time::text AS game_time,
              COALESCE(opp.name, '?') AS opponent_name,
              CASE WHEN g.home_team_id = $2 THEN 'vs' ELSE '@' END AS home_away
       FROM game_pitch_counts gpc
       JOIN games g ON g.id = gpc.game_id
       LEFT JOIN teams opp ON opp.id = CASE WHEN g.home_team_id = $2 THEN g.away_team_id ELSE g.home_team_id END
       WHERE gpc.player_id = ANY($1)
         AND gpc.team_id = $2
         AND g.season_id IS NOT NULL
         AND g.game_date >= $3::date
         AND g.game_date <= $4::date
         AND g.status != 'cancelled'
       ORDER BY g.game_date DESC, g.game_time DESC`,
      [playerIds, team_id, lookback7, today]
    );

    // Season totals
    const seasonQuery = season
      ? await pool.query(
          `SELECT gpc.player_id,
                  COUNT(DISTINCT g.id) AS appearances,
                  SUM(gpc.pitch_count) AS total_pitches,
                  MAX(g.game_date::text) AS last_pitched
           FROM game_pitch_counts gpc
           JOIN games g ON g.id = gpc.game_id
           WHERE gpc.player_id = ANY($1)
             AND gpc.team_id = $2
             AND g.season_id = $3
             AND g.status != 'cancelled'
           GROUP BY gpc.player_id`,
          [playerIds, team_id, season.id]
        )
      : { rows: [] };

    const seasonMap = {};
    for (const r of seasonQuery.rows) seasonMap[r.player_id] = r;

    // Group 7-day data by player → date
    const byPlayer7 = {};
    for (const pc of recent7) {
      if (!byPlayer7[pc.player_id]) byPlayer7[pc.player_id] = {};
      if (!byPlayer7[pc.player_id][pc.game_date]) {
        byPlayer7[pc.player_id][pc.game_date] = { total: 0, games: [] };
      }
      byPlayer7[pc.player_id][pc.game_date].total += pc.pitch_count;
      byPlayer7[pc.player_id][pc.game_date].games.push({
        game_id: pc.game_id,
        pitch_count: pc.pitch_count,
        opponent_name: pc.opponent_name,
        home_away: pc.home_away,
      });
    }

    const stats = players.map(player => {
      const dateMap = byPlayer7[player.id] || {};
      const pitchDates = Object.keys(dateMap).sort().reverse();
      const todayPitches = dateMap[today]?.total || 0;
      const seasonData = seasonMap[player.id];

      const result = {
        player_id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        jersey_number: player.jersey_number,
        // Rest / eligibility
        eligible_today: true,
        reasons: [],
        rest_days_required: 0,
        available_date: today,
        today_pitches: todayPitches,
        remaining_today: rules ? Math.max(0, rules.dailyLimit - todayPitches) : null,
        // Recent 7 days
        last_7_days: pitchDates.map(d => ({
          date: d,
          total_pitches: dateMap[d].total,
          games: dateMap[d].games,
        })),
        pitches_last_7: Object.values(dateMap).reduce((s, d) => s + d.total, 0),
        // Season totals
        season_appearances: seasonData ? Number(seasonData.appearances) : 0,
        season_total_pitches: seasonData ? Number(seasonData.total_pitches) : 0,
        last_pitched: seasonData?.last_pitched || null,
      };

      if (!rules) return result;

      // Daily limit check
      if (todayPitches >= rules.dailyLimit) {
        result.eligible_today = false;
        result.reasons.push(`Already at daily limit (${todayPitches}/${rules.dailyLimit} pitches today)`);
      }

      // Rest from most recent pitching date
      const priorDates = pitchDates.filter(d => d < today);
      if (priorDates.length > 0) {
        const lastDate = priorDates[0];
        const totalOnDate = dateMap[lastDate].total;
        const rest = getRestDays(totalOnDate, rules);
        if (rest > 0) {
          const avail = datePlusDays(lastDate, rest + 1);
          result.rest_days_required = rest;
          result.available_date = avail;
          if (today < avail) {
            result.eligible_today = false;
            result.reasons.push(
              `Threw ${totalOnDate} on ${lastDate} — ${rest} rest day${rest !== 1 ? 's' : ''} required (available ${avail})`
            );
          }
        }
      }

      // Also check rest from today's pitching (for display — what rest they'll need after today)
      if (todayPitches > 0) {
        const restAfterToday = getRestDays(todayPitches, rules);
        result.rest_after_today = restAfterToday;
        result.next_available_after_today = datePlusDays(today, restAfterToday + 1);
      }

      // 3 consecutive days
      if (dateMap[yesterday] && dateMap[dayBefore]) {
        result.eligible_today = false;
        result.reasons.push('Cannot pitch 3 consecutive calendar days');
      }

      return result;
    });

    res.json({
      team_id: Number(team_id),
      today,
      age_category: ageCategory,
      daily_limit: rules?.dailyLimit ?? null,
      rules: rules ? { daily_limit: rules.dailyLimit, rest_thresholds: rules.restThresholds, max_consecutive_days: 2 } : null,
      season: season || null,
      players: stats,
    });
  } catch (err) {
    console.error('Pitch rules team-stats error:', err);
    res.status(500).json({ error: 'Failed to fetch team stats' });
  }
});

// GET /api/pitch-rules/all-rest
// Returns a lightweight map of player_id → { eligible_today, available_date } for all players
router.get('/all-rest', authMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const lookback7 = datePlusDays(today, -7);
    const yesterday = datePlusDays(today, -1);
    const dayBefore = datePlusDays(today, -2);

    // Get all players with their team's age_group
    const { rows: playerTeams } = await pool.query(
      `SELECT DISTINCT tp.player_id, t.age_group
       FROM team_players tp
       JOIN teams t ON t.id = tp.team_id`
    );

    const playerIds = [...new Set(playerTeams.map(r => r.player_id))];
    if (playerIds.length === 0) return res.json({});

    // Build player → rules map (use most restrictive age category if on multiple teams)
    const playerRulesMap = {};
    for (const pt of playerTeams) {
      const cat = getAgeCategory(pt.age_group);
      if (!cat) continue;
      const existing = playerRulesMap[pt.player_id];
      if (!existing || (cat === '9u-12u' && existing !== '9u-12u')) {
        playerRulesMap[pt.player_id] = cat;
      }
    }

    // Recent pitch counts (last 7 days)
    const { rows: recent } = await pool.query(
      `SELECT gpc.player_id, gpc.pitch_count, g.game_date::text AS game_date
       FROM game_pitch_counts gpc
       JOIN games g ON g.id = gpc.game_id
       WHERE gpc.player_id = ANY($1)
         AND g.game_date >= $2::date
         AND g.game_date <= $3::date
         AND g.status != 'cancelled'
       ORDER BY g.game_date DESC`,
      [playerIds, lookback7, today]
    );

    // Group by player → date → total pitches
    const byPlayer = {};
    for (const pc of recent) {
      if (!byPlayer[pc.player_id]) byPlayer[pc.player_id] = {};
      byPlayer[pc.player_id][pc.game_date] = (byPlayer[pc.player_id][pc.game_date] || 0) + pc.pitch_count;
    }

    // Compute rest status per player
    const result = {};
    for (const pid of playerIds) {
      const dateMap = byPlayer[pid] || {};
      const pitchDates = Object.keys(dateMap).sort().reverse();
      const cat = playerRulesMap[pid];
      const rules = cat ? RULES[cat] : null;

      let eligible = true;
      let availableDate = today;
      let restDays = 0;

      if (rules) {
        const todayPitches = dateMap[today] || 0;
        if (todayPitches >= rules.dailyLimit) eligible = false;

        const priorDates = pitchDates.filter(d => d < today);
        if (priorDates.length > 0) {
          const lastDate = priorDates[0];
          const total = dateMap[lastDate];
          const rest = getRestDays(total, rules);
          if (rest > 0) {
            const avail = datePlusDays(lastDate, rest + 1);
            restDays = rest;
            availableDate = avail;
            if (today < avail) eligible = false;
          }
        }

        if (dateMap[yesterday] && dateMap[dayBefore]) eligible = false;
      }

      // Only include players who have actually pitched recently (skip those with no data)
      if (pitchDates.length > 0) {
        result[pid] = { eligible_today: eligible, available_date: availableDate, rest_days: restDays };
      }
    }

    res.json(result);
  } catch (err) {
    console.error('Pitch rules all-rest error:', err);
    res.status(500).json({ error: 'Failed to fetch rest data' });
  }
});

module.exports = router;
