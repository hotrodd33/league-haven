// Run the games performance indexes against one or all databases.
// Usage from baseball-roster-app/:
//   node server/migrations/run_indexes.js            — runs against DATABASE_URL
//   node server/migrations/run_indexes.js zvbl       — DATABASE_URL_ZVBL
//   node server/migrations/run_indexes.js lcysba     — DATABASE_URL_LCYSBA
//   node server/migrations/run_indexes.js stage      — DATABASE_URL_STAGE
//   node server/migrations/run_indexes.js all        — all three

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const SQL = fs.readFileSync(path.join(__dirname, 'add_games_performance_indexes.sql'), 'utf8');

const DB_MAP = {
  default: process.env.DATABASE_URL,
  zvbl:    process.env.DATABASE_URL_ZVBL,
  lcysba:  process.env.DATABASE_URL_LCYSBA,
  stage:   process.env.DATABASE_URL_STAGE,
};

async function runAgainst(label, url) {
  if (!url) { console.error(`  [${label}] No connection string found — skipping`); return; }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    console.log(`\n[${label}] Connecting...`);
    // Run each statement individually (CREATE INDEX doesn't like being batched)
    const statements = SQL
      .split(';')
      .map(s => s.replace(/--.*$/gm, '').trim())
      .filter(Boolean);
    for (const stmt of statements) {
      process.stdout.write(`  ${stmt.split('\n')[0].trim().substring(0, 70)}... `);
      await pool.query(stmt);
      console.log('OK');
    }
    console.log(`[${label}] Done ✓`);
  } finally {
    await pool.end();
  }
}

async function main() {
  const target = (process.argv[2] || 'default').toLowerCase();
  if (target === 'all') {
    for (const [label, url] of Object.entries(DB_MAP)) {
      await runAgainst(label, url);
    }
  } else {
    const url = DB_MAP[target];
    if (url === undefined) {
      console.error(`Unknown target "${target}". Use: default | zvbl | lcysba | stage | all`);
      process.exit(1);
    }
    await runAgainst(target, url);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
