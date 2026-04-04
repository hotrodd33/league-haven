const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { pool, ensureReady } = require('./db');

async function seed() {
  await ensureReady();

  // Create a default admin user if none exists
  const { rows: [{ count: userCount }] } = await pool.query('SELECT COUNT(*) as count FROM users');
  if (parseInt(userCount) === 0) {
    const hash = await bcrypt.hash('admin', 10);
    await pool.query(
      'INSERT INTO users (username, password_hash, name, role) VALUES ($1, $2, $3, $4)',
      ['admin', hash, 'Admin', 'admin']
    );
    console.log('Created default admin user: admin / admin');
    console.log('IMPORTANT: Change this password after first login!');
  } else {
    console.log(`${userCount} user(s) already exist. Skipping seed.`);
  }

  // Seed some example teams if none exist
  const { rows: [{ count: teamCount }] } = await pool.query('SELECT COUNT(*) as count FROM teams');
  if (parseInt(teamCount) === 0) {
    await pool.query("INSERT INTO teams (name, age_group, division) VALUES ($1, $2, $3)", ['Tigers', '10U', 'A']);
    await pool.query("INSERT INTO teams (name, age_group, division) VALUES ($1, $2, $3)", ['Eagles', '12U', 'A']);
    await pool.query("INSERT INTO teams (name, age_group, division) VALUES ($1, $2, $3)", ['Sharks', '14U', 'B']);
    console.log('Created 3 example teams.');
  } else {
    console.log(`${teamCount} team(s) already exist. Skipping team seed.`);
  }

  console.log('Seed complete!');
  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
