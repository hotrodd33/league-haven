// Backfill Strikes Thrown (STK) into player_game_stats from existing game_box_scores JSON.
// Safe to re-run — uses ON CONFLICT DO UPDATE so it only overwrites STK rows.
// Usage from baseball-roster-app/:
//   node server/migrations/backfill_strikes.js            — DATABASE_URL (localhost)
//   node server/migrations/backfill_strikes.js stage      — DATABASE_URL_STAGE
//   node server/migrations/backfill_strikes.js zvbl       — DATABASE_URL_ZVBL
//   node server/migrations/backfill_strikes.js lcysba     — DATABASE_URL_LCYSBA
//   node server/migrations/backfill_strikes.js all        — all four

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

const DB_MAP = {
  default: process.env.DATABASE_URL,
  stage:   process.env.DATABASE_URL_STAGE,
  zvbl:    process.env.DATABASE_URL_ZVBL,
  lcysba:  process.env.DATABASE_URL_LCYSBA,
};

async function runAgainst(label, url) {
  if (!url) { console.error(`  [${label}] No connection string — skipping`); return; }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    console.log(`\n[${label}] Connecting...`);

    // Get the STK stat_definition id
    const { rows: defRows } = await pool.query(
      `SELECT id FROM stat_definitions WHERE abbreviation = 'STK' AND category = 'pitching' LIMIT 1`
    );
    if (!defRows.length) {
      console.log(`  [${label}] STK stat_definition not found — run seed_stat_definitions.js first`);
      return;
    }
    const stkDefId = defRows[0].id;

    // Pull all box scores that have pitching data
    const { rows: boxScores } = await pool.query(
      `SELECT gbs.game_id, gbs.pitching, gbs.team_resolution
       FROM game_box_scores gbs
       WHERE gbs.pitching IS NOT NULL`
    );

    console.log(`  [${label}] Found ${boxScores.length} box score(s) to scan`);

    let written = 0;
    let skipped = 0;

    for (const bs of boxScores) {
      const pitching = typeof bs.pitching === 'string' ? JSON.parse(bs.pitching) : bs.pitching;
      const teamRes  = typeof bs.team_resolution === 'string' ? JSON.parse(bs.team_resolution) : bs.team_resolution;

      const awayTeamId = teamRes?.away_team_id || null;
      const homeTeamId = teamRes?.home_team_id || null;

      const sides = [
        { pitchers: pitching?.away || [], teamId: awayTeamId },
        { pitchers: pitching?.home || [], teamId: homeTeamId },
      ];

      for (const side of sides) {
        if (!side.teamId) continue;
        for (const p of side.pitchers) {
          if (!p.player_id) continue;
          if (p.strikes == null || isNaN(Number(p.strikes))) { skipped++; continue; }

          await pool.query(
            `INSERT INTO player_game_stats (player_id, game_id, team_id, stat_definition_id, value)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (player_id, game_id, stat_definition_id)
             DO UPDATE SET value = EXCLUDED.value`,
            [p.player_id, bs.game_id, side.teamId, stkDefId, String(p.strikes)]
          );
          written++;
        }
      }
    }

    console.log(`  [${label}] Done — ${written} strike rows written, ${skipped} pitchers skipped (no strikes data)`);
  } finally {
    await pool.end();
  }
}

async function main() {
  const arg = process.argv[2] || 'default';
  if (arg === 'all') {
    for (const [label, url] of Object.entries(DB_MAP)) {
      await runAgainst(label, url);
    }
  } else {
    const url = DB_MAP[arg];
    if (url === undefined) {
      console.error(`Unknown target "${arg}". Use: default | stage | zvbl | lcysba | all`);
      process.exit(1);
    }
    await runAgainst(arg, url);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
