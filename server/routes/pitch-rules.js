const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

// ── Pitch Count Rules (per age group, loaded from league_age_groups) ──
//
// Each rules object: { dailyLimit, restThresholds: [{min, days}, ...], maxConsecutiveDays }
// `restThresholds` MUST be sorted descending by `min`. `null` rules ⇒ no enforcement.

function normaliseRules(row) {
  if (!row) return null;
  const dailyLimit = row.daily_pitch_limit != null ? Number(row.daily_pitch_limit) : null;
  let thresholds = row.rest_thresholds;
  if (typeof thresholds === 'string') {
    try { thresholds = JSON.parse(thresholds); } catch { thresholds = null; }
  }
  if (!Array.isArray(thresholds)) thresholds = null;
  else thresholds = thresholds
    .map(t => ({ min: Number(t?.min), days: Number(t?.days) }))
    .filter(t => Number.isFinite(t.min) && Number.isFinite(t.days))
    .sort((a, b) => b.min - a.min);
  if (dailyLimit == null && (!thresholds || thresholds.length === 0)) return null;
  return {
    dailyLimit, // may be null ⇒ no daily limit enforced
    restThresholds: thresholds || [],
    maxConsecutiveDays: row.max_consecutive_days != null ? Number(row.max_consecutive_days) : 2,
    ageGroupName: row.name || null,
  };
}

// Load rules for the given team ids → Map<team_id, rules|null>
async function loadRulesForTeams(teamIds) {
  const map = new Map();
  if (!teamIds || teamIds.length === 0) return map;
  const { rows } = await pool.query(
    `SELECT t.id AS team_id, ag.name, ag.daily_pitch_limit, ag.rest_thresholds, ag.max_consecutive_days
       FROM teams t
       LEFT JOIN league_age_groups ag
         ON LOWER(TRIM(ag.name)) = LOWER(TRIM(t.age_group))
      WHERE t.id = ANY($1)`,
    [teamIds]
  );
  for (const r of rows) map.set(r.team_id, normaliseRules(r));
  return map;
}

async function loadRulesForTeam(teamId) {
  const map = await loadRulesForTeams([teamId]);
  return map.get(Number(teamId)) ?? null;
}

// Load rules for *every* age group → Map<lowercased+trimmed age_group name, rules|null>
async function loadAllAgeGroupRules() {
  const { rows } = await pool.query(
    `SELECT name, daily_pitch_limit, rest_thresholds, max_consecutive_days FROM league_age_groups`
  );
  const map = new Map();
  for (const r of rows) {
    const key = String(r.name || '').toLowerCase().trim();
    if (key) map.set(key, normaliseRules(r));
  }
  return map;
}

function rulesToWire(rules) {
  if (!rules) return null;
  return {
    daily_limit: rules.dailyLimit,
    rest_thresholds: rules.restThresholds,
    max_consecutive_days: rules.maxConsecutiveDays,
  };
}

function getRestDays(pitchCount, rules) {
  if (!rules?.restThresholds) return 0;
  for (const t of rules.restThresholds) {
    if (pitchCount >= t.min) return t.days;
  }
  return 0;
}

// Count consecutive calendar days ENDING on the day before `targetDate` on which
// the player pitched (any number of pitches). E.g. pitched Sat+Sun, targetDate=Mon
// returns 2. Used to enforce maxConsecutiveDays.
function consecutiveDaysBefore(dateMap, targetDate) {
  let count = 0;
  let cursor = datePlusDays(targetDate, -1);
  while (dateMap[cursor]) {
    count += 1;
    cursor = datePlusDays(cursor, -1);
  }
  return count;
}

function datePlusDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) throw new RangeError(`Invalid date: ${dateStr}`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// GET /api/pitch-rules/eligibility?team_id=X&game_date=YYYY-MM-DD&game_id=Y&tournament_id=Z
router.get('/eligibility', authMiddleware, async (req, res) => {
  const { team_id, game_date, game_id, tournament_id } = req.query;
  if (!team_id || !game_date) {
    return res.status(400).json({ error: 'team_id and game_date are required' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(game_date) || isNaN(new Date(game_date + 'T00:00:00').getTime())) {
    return res.status(400).json({ error: 'game_date must be a valid YYYY-MM-DD date' });
  }

  try {
    // Team's age group + rules
    const { rows: [team] } = await pool.query('SELECT age_group FROM teams WHERE id = $1', [team_id]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const rules = await loadRulesForTeam(team_id);
    const ageCategory = team.age_group || null;

    let tournamentConfig = null;
    if (tournament_id) {
      const { rows: tRows } = await pool.query(
        `SELECT id, pitch_limit_mode, pitch_limit_per_day, pitch_limit_per_tournament
         FROM tournaments
         WHERE id = $1`,
        [tournament_id]
      );
      if (!tRows.length) return res.status(404).json({ error: 'Tournament not found' });
      tournamentConfig = tRows[0];
    }

    const tournamentUsesCustomLimits = tournamentConfig?.pitch_limit_mode === 'tournament_custom';
    const effectiveDailyLimit = tournamentUsesCustomLimits && tournamentConfig?.pitch_limit_per_day != null
      ? Number(tournamentConfig.pitch_limit_per_day)
      : (rules?.dailyLimit ?? null);
    const effectiveTournamentLimit = tournamentConfig?.pitch_limit_per_tournament != null
      ? Number(tournamentConfig.pitch_limit_per_tournament)
      : null;

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

      let scopeClause = 'AND g.season_id IS NOT NULL';
      if (tournament_id) {
        const tournamentParamIndex = params.length + 1;
        scopeClause = `AND g.tournament_id = $${tournamentParamIndex}`;
        params.push(tournament_id);
      }

      const { rows } = await pool.query(
        `SELECT gpc.player_id, gpc.pitch_count, g.game_date::text AS game_date, g.id AS game_id
         FROM game_pitch_counts gpc
         JOIN games g ON g.id = gpc.game_id AND g.deleted_at IS NULL
         WHERE gpc.player_id = ANY($1)
           ${scopeClause}
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
        daily_limit: effectiveDailyLimit,
        tournament_limit: effectiveTournamentLimit,
        today_pitches: todayPitches,
        tournament_pitches: recentPC
          .filter(r => r.player_id === player.id)
          .reduce((sum, r) => sum + Number(r.pitch_count || 0), 0),
        remaining_today: effectiveDailyLimit != null ? Math.max(0, effectiveDailyLimit - todayPitches) : null,
        remaining_tournament: effectiveTournamentLimit != null
          ? Math.max(0, effectiveTournamentLimit - recentPC
            .filter(r => r.player_id === player.id)
            .reduce((sum, r) => sum + Number(r.pitch_count || 0), 0))
          : null,
        rest_days_required: 0,
        available_date: gd,
        recent_games: recentPC
          .filter(r => r.player_id === player.id)
          .map(r => ({ game_date: r.game_date, pitch_count: r.pitch_count, game_id: r.game_id })),
      };

      if (!rules) return result;

      // Already at daily limit from other games today
      if (effectiveDailyLimit != null && todayPitches >= effectiveDailyLimit) {
        result.eligible = false;
        result.reasons.push(`Already at daily limit (${todayPitches}/${effectiveDailyLimit} pitches today)`);
      }

      if (effectiveTournamentLimit != null && result.tournament_pitches >= effectiveTournamentLimit) {
        result.eligible = false;
        result.reasons.push(
          `Already at tournament limit (${result.tournament_pitches}/${effectiveTournamentLimit} pitches in this tournament)`
        );
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

      // Consecutive calendar days cap
      const consec = consecutiveDaysBefore(dateMap, gd);
      if (rules.maxConsecutiveDays != null && consec >= rules.maxConsecutiveDays) {
        result.eligible = false;
        result.reasons.push(
          `Cannot pitch more than ${rules.maxConsecutiveDays} consecutive day${rules.maxConsecutiveDays !== 1 ? 's' : ''} (already pitched ${consec} in a row)`
        );
      }

      return result;
    });

    res.json({
      team_id: Number(team_id),
      game_date: gd,
      tournament_id: tournament_id ? Number(tournament_id) : null,
      age_category: ageCategory,
      daily_limit: effectiveDailyLimit,
      tournament_limit: effectiveTournamentLimit,
      rules: rulesToWire(rules),
      pitch_limit_mode: tournamentConfig?.pitch_limit_mode || 'league_default',
      players: eligibility,
    });
  } catch (err) {
    console.error('Pitch rules eligibility error:', err);
    res.status(500).json({ error: 'Failed to check eligibility', detail: err.message });
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

    // Team info + rules
    const { rows: [team] } = await pool.query('SELECT age_group FROM teams WHERE id = $1', [team_id]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const rules = await loadRulesForTeam(team_id);
    const ageCategory = team.age_group || null;

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
        rules: rulesToWire(rules),
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
       JOIN games g ON g.id = gpc.game_id AND g.deleted_at IS NULL
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
           JOIN games g ON g.id = gpc.game_id AND g.deleted_at IS NULL
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
        remaining_today: (rules && rules.dailyLimit != null) ? Math.max(0, rules.dailyLimit - todayPitches) : null,
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
      if (rules.dailyLimit != null && todayPitches >= rules.dailyLimit) {
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

      // Consecutive calendar days cap
      const consec = consecutiveDaysBefore(dateMap, today);
      if (rules.maxConsecutiveDays != null && consec >= rules.maxConsecutiveDays) {
        result.eligible_today = false;
        result.reasons.push(
          `Cannot pitch more than ${rules.maxConsecutiveDays} consecutive day${rules.maxConsecutiveDays !== 1 ? 's' : ''} (already pitched ${consec} in a row)`
        );
      }

      return result;
    });

    res.json({
      team_id: Number(team_id),
      today,
      age_category: ageCategory,
      daily_limit: rules?.dailyLimit ?? null,
      rules: rulesToWire(rules),
      season: season || null,
      players: stats,
    });
  } catch (err) {
    console.error('Pitch rules team-stats error:', err);
    res.status(500).json({ error: 'Failed to fetch team stats', detail: err.message });
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

    // Build player → rules map (use most restrictive: lowest dailyLimit wins) using DB-loaded rules
    const ageGroupRules = await loadAllAgeGroupRules();
    const playerRulesMap = {};
    for (const pt of playerTeams) {
      const key = String(pt.age_group || '').toLowerCase().trim();
      if (!key) continue;
      const rules = ageGroupRules.get(key);
      if (!rules) continue;
      const existing = playerRulesMap[pt.player_id];
      const existingLimit = existing?.dailyLimit ?? Infinity;
      const newLimit = rules.dailyLimit ?? Infinity;
      if (!existing || newLimit < existingLimit) {
        playerRulesMap[pt.player_id] = rules;
      }
    }

    // Recent pitch counts (last 7 days)
    const { rows: recent } = await pool.query(
      `SELECT gpc.player_id, gpc.pitch_count, g.game_date::text AS game_date
       FROM game_pitch_counts gpc
       JOIN games g ON g.id = gpc.game_id AND g.deleted_at IS NULL
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
      const rules = playerRulesMap[pid] || null;

      let eligible = true;
      let availableDate = today;
      let restDays = 0;

      if (rules) {
        const todayPitches = dateMap[today] || 0;
        if (rules.dailyLimit != null && todayPitches >= rules.dailyLimit) eligible = false;

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
        if (rules.maxConsecutiveDays != null) {
          const consec = consecutiveDaysBefore(dateMap, today);
          if (consec >= rules.maxConsecutiveDays) eligible = false;
        }
      }

      // Only include players who have actually pitched recently (skip those with no data)
      if (pitchDates.length > 0) {
        result[pid] = { eligible_today: eligible, available_date: availableDate, rest_days: restDays };
      }
    }

    // Enrich result with player names and team assignments for dashboard use
    const restPlayerIds = Object.keys(result).map(Number);
    if (restPlayerIds.length > 0) {
      const { rows: nameRows } = await pool.query(
        `SELECT p.id,
                CONCAT(p.first_name, ' ', p.last_name) AS name,
                json_agg(json_build_object('team_id', tp.team_id, 'team_name', t.name)) AS teams
         FROM players p
         JOIN team_players tp ON tp.player_id = p.id
         JOIN teams t ON t.id = tp.team_id
         WHERE p.id = ANY($1)
         GROUP BY p.id, p.first_name, p.last_name`,
        [restPlayerIds]
      );
      for (const row of nameRows) {
        if (result[row.id]) {
          result[row.id].name = row.name;
          result[row.id].teams = row.teams;
        }
      }
    }

    res.json(result);
  } catch (err) {
    console.error('Pitch rules all-rest error:', err);
    res.status(500).json({ error: 'Failed to fetch rest data', detail: err.message });
  }
});

module.exports = router;
