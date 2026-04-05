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

module.exports = router;
