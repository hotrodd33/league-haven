// Upsert the default stat definitions into one or all databases.
// Safe to re-run — uses INSERT ... ON CONFLICT DO NOTHING.
// Usage from baseball-roster-app/:
//   node server/migrations/seed_stat_definitions.js            — DATABASE_URL (localhost)
//   node server/migrations/seed_stat_definitions.js stage      — DATABASE_URL_STAGE
//   node server/migrations/seed_stat_definitions.js zvbl       — DATABASE_URL_ZVBL
//   node server/migrations/seed_stat_definitions.js lcysba     — DATABASE_URL_LCYSBA
//   node server/migrations/seed_stat_definitions.js all        — all four

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

const STATS = [
  // Batting
  { name: 'At Bats',               abbreviation: 'AB',  category: 'batting',  sort_order: 1  },
  { name: 'Hits',                  abbreviation: 'H',   category: 'batting',  sort_order: 2  },
  { name: 'Runs',                  abbreviation: 'R',   category: 'batting',  sort_order: 3  },
  { name: 'RBI',                   abbreviation: 'RBI', category: 'batting',  sort_order: 4  },
  { name: 'Home Runs',             abbreviation: 'HR',  category: 'batting',  sort_order: 5  },
  { name: 'Doubles',               abbreviation: '2B',  category: 'batting',  sort_order: 6  },
  { name: 'Triples',               abbreviation: '3B',  category: 'batting',  sort_order: 7  },
  { name: 'Walks',                 abbreviation: 'BB',  category: 'batting',  sort_order: 8  },
  { name: 'Strikeouts',            abbreviation: 'K',   category: 'batting',  sort_order: 9  },
  { name: 'Stolen Bases',          abbreviation: 'SB',  category: 'batting',  sort_order: 10 },
  // Pitching
  { name: 'Innings Pitched',       abbreviation: 'IP',  category: 'pitching', sort_order: 1  },
  { name: 'Hits Allowed',          abbreviation: 'HA',  category: 'pitching', sort_order: 2  },
  { name: 'Runs Allowed',          abbreviation: 'RA',  category: 'pitching', sort_order: 3  },
  { name: 'Earned Runs',           abbreviation: 'ER',  category: 'pitching', sort_order: 4  },
  { name: 'Walks Issued',          abbreviation: 'BB',  category: 'pitching', sort_order: 5  },
  { name: 'Strikeouts (Pitching)', abbreviation: 'K',   category: 'pitching', sort_order: 6  },
  { name: 'Pitches Thrown',        abbreviation: 'PC',  category: 'pitching', sort_order: 7  },
  { name: 'Wins',                  abbreviation: 'W',   category: 'pitching', sort_order: 8  },
  { name: 'Losses',                abbreviation: 'L',   category: 'pitching', sort_order: 9  },
  { name: 'Saves',                 abbreviation: 'SV',  category: 'pitching', sort_order: 10 },  { name: 'Strikes Thrown',        abbreviation: 'STK', category: 'pitching', sort_order: 11 },];

const DB_MAP = {
  default: process.env.DATABASE_URL,
  stage:   process.env.DATABASE_URL_STAGE,
  zvbl:    process.env.DATABASE_URL_ZVBL,
  lcysba:  process.env.DATABASE_URL_LCYSBA,
};

async function runAgainst(label, url) {
  if (!url) { console.error(`  [${label}] No connection string found — skipping`); return; }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    console.log(`\n[${label}] Connecting...`);
    let inserted = 0;
    let skipped = 0;
    for (const s of STATS) {
      const { rowCount } = await pool.query(
        `INSERT INTO stat_definitions (name, abbreviation, category, sort_order)
         SELECT $1, $2, $3, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM stat_definitions WHERE name = $1 AND category = $3
         )`,
        [s.name, s.abbreviation, s.category, s.sort_order]
      );
      rowCount > 0 ? inserted++ : skipped++;
    }
    console.log(`  [${label}] Done — ${inserted} inserted, ${skipped} already existed`);
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
    if (!url && !['default', 'stage', 'zvbl', 'lcysba'].includes(arg)) {
      console.error(`Unknown target "${arg}". Use: default | stage | zvbl | lcysba | all`);
      process.exit(1);
    }
    await runAgainst(arg, url);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
