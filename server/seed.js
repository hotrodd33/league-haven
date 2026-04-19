const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { pool, ensureReady } = require('./db');

async function seed() {
  await ensureReady();

  // ─── Admin user ───────────────────────────────────────────────────────────
  const { rows: [{ count: userCount }] } = await pool.query('SELECT COUNT(*) AS count FROM users');
  let adminId;
  if (parseInt(userCount) === 0) {
    const hash = await bcrypt.hash('admin', 10);
    const { rows: [user] } = await pool.query(
      `INSERT INTO users (username, password_hash, name, role, email_confirmed, approval_status)
       VALUES ($1, $2, $3, $4, TRUE, 'approved') RETURNING id`,
      ['admin', hash, 'League Admin', 'super_admin']
    );
    adminId = user.id;
    console.log('Created admin user: admin / admin  ← CHANGE THIS PASSWORD!');
  } else {
    const { rows: [u] } = await pool.query(`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`);
    adminId = u?.id;
    console.log(`${userCount} user(s) already exist — skipping admin seed.`);
  }

  // ─── App branding ─────────────────────────────────────────────────────────
  // app_branding is upserted by migrate(); update with sensible defaults.
  await pool.query(
    `UPDATE app_branding SET app_name = $1 WHERE id = 1 AND app_name = 'LeagueHaven'`,
    ['My League']
  );

  // ─── Age groups ───────────────────────────────────────────────────────────
  const { rows: [{ count: ageCount }] } = await pool.query('SELECT COUNT(*) AS count FROM league_age_groups');
  if (parseInt(ageCount) === 0) {
    const ageGroups = [
      { name: '6U',  sort_order: 1,  umpire_rate: null, ump_required: false },
      { name: '7U',  sort_order: 2,  umpire_rate: null, ump_required: false },
      { name: '8U',  sort_order: 3,  umpire_rate: 40,   ump_required: true  },
      { name: '9U',  sort_order: 4,  umpire_rate: 45,   ump_required: true  },
      { name: '10U', sort_order: 5,  umpire_rate: 50,   ump_required: true  },
      { name: '11U', sort_order: 6,  umpire_rate: 55,   ump_required: true  },
      { name: '12U', sort_order: 7,  umpire_rate: 60,   ump_required: true  },
      { name: '13U', sort_order: 8,  umpire_rate: 65,   ump_required: true  },
      { name: '14U', sort_order: 9,  umpire_rate: 70,   ump_required: true  },
      { name: '15U', sort_order: 10, umpire_rate: 70,   ump_required: true  },
    ];
    for (const ag of ageGroups) {
      await pool.query(
        `INSERT INTO league_age_groups (name, sort_order, umpire_rate, ump_required)
         VALUES ($1,$2,$3,$4)`,
        [ag.name, ag.sort_order, ag.umpire_rate, ag.ump_required]
      );
    }
    console.log(`Created ${ageGroups.length} age groups.`);
  } else {
    console.log(`${ageCount} age group(s) already exist — skipping.`);
  }

  // ─── Levels ───────────────────────────────────────────────────────────────
  const { rows: [{ count: levelCount }] } = await pool.query('SELECT COUNT(*) AS count FROM league_levels');
  if (parseInt(levelCount) === 0) {
    const levels = [
      { name: 'Recreational', sort_order: 1 },
      { name: 'A',            sort_order: 2 },
      { name: 'AA',           sort_order: 3 },
      { name: 'AAA',          sort_order: 4 },
    ];
    for (const lv of levels) {
      await pool.query(
        `INSERT INTO league_levels (name, sort_order) VALUES ($1,$2)`,
        [lv.name, lv.sort_order]
      );
    }
    console.log(`Created ${levels.length} league levels.`);
  } else {
    console.log(`${levelCount} level(s) already exist — skipping.`);
  }

  // ─── Season ───────────────────────────────────────────────────────────────
  const { rows: [{ count: seasonCount }] } = await pool.query('SELECT COUNT(*) AS count FROM league_seasons');
  let seasonId;
  if (parseInt(seasonCount) === 0) {
    const year = new Date().getFullYear();
    const { rows: [season] } = await pool.query(
      `INSERT INTO league_seasons (year, name, is_active, sort_order)
       VALUES ($1, $2, TRUE, 1) RETURNING id`,
      [year, `${year} Season`]
    );
    seasonId = season.id;
    console.log(`Created ${year} Season.`);
  } else {
    const { rows: [s] } = await pool.query(`SELECT id FROM league_seasons WHERE is_active = TRUE LIMIT 1`);
    seasonId = s?.id;
    console.log(`${seasonCount} season(s) already exist — skipping.`);
  }

  // ─── Organizations ────────────────────────────────────────────────────────
  const { rows: [{ count: orgCount }] } = await pool.query('SELECT COUNT(*) AS count FROM organizations');
  let org1Id, org2Id;
  if (parseInt(orgCount) === 0) {
    const { rows: [o1] } = await pool.query(
      `INSERT INTO organizations (name, contact_email)
       VALUES ($1,$2) RETURNING id`,
      ['Northside Youth Baseball', 'northside@example.com']
    );
    const { rows: [o2] } = await pool.query(
      `INSERT INTO organizations (name, contact_email)
       VALUES ($1,$2) RETURNING id`,
      ['Southside Athletic Club', 'southside@example.com']
    );
    org1Id = o1.id;
    org2Id = o2.id;
    console.log('Created 2 sample organizations.');
  } else {
    const { rows } = await pool.query(`SELECT id FROM organizations ORDER BY id LIMIT 2`);
    org1Id = rows[0]?.id;
    org2Id = rows[1]?.id;
    console.log(`${orgCount} organization(s) already exist — skipping.`);
  }

  // ─── Teams ────────────────────────────────────────────────────────────────
  const { rows: [{ count: teamCount }] } = await pool.query('SELECT COUNT(*) AS count FROM teams');
  if (parseInt(teamCount) === 0) {
    const teams = [
      { name: 'Northside Tigers',   team_city: 'Northside', team_mascot: 'Tigers',   age_group: '10U', primary_color: '#f59e0b', secondary_color: '#1c1c1c', org_id: org1Id },
      { name: 'Northside Eagles',   team_city: 'Northside', team_mascot: 'Eagles',   age_group: '12U', primary_color: '#2563eb', secondary_color: '#ffffff', org_id: org1Id },
      { name: 'Northside Wolves',   team_city: 'Northside', team_mascot: 'Wolves',   age_group: '14U', primary_color: '#6d28d9', secondary_color: '#e5e7eb', org_id: org1Id },
      { name: 'Southside Hawks',    team_city: 'Southside', team_mascot: 'Hawks',    age_group: '10U', primary_color: '#dc2626', secondary_color: '#ffffff', org_id: org2Id },
      { name: 'Southside Bulldogs', team_city: 'Southside', team_mascot: 'Bulldogs', age_group: '12U', primary_color: '#15803d', secondary_color: '#fbbf24', org_id: org2Id },
      { name: 'Southside Sharks',   team_city: 'Southside', team_mascot: 'Sharks',   age_group: '14U', primary_color: '#0369a1', secondary_color: '#e0f2fe', org_id: org2Id },
    ];
    for (const t of teams) {
      await pool.query(
        `INSERT INTO teams (name, team_city, team_mascot, age_group, primary_color, secondary_color, org_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [t.name, t.team_city, t.team_mascot, t.age_group, t.primary_color, t.secondary_color, t.org_id]
      );
    }
    console.log(`Created ${teams.length} sample teams.`);
  } else {
    console.log(`${teamCount} team(s) already exist — skipping.`);
  }

  // ─── Divisions ────────────────────────────────────────────────────────────
  const { rows: [{ count: divCount }] } = await pool.query('SELECT COUNT(*) AS count FROM league_divisions');
  if (parseInt(divCount) === 0 && seasonId) {
    const divisions = [
      { name: '10U Recreational', sort_order: 1 },
      { name: '10U Competitive',  sort_order: 2 },
      { name: '12U Recreational', sort_order: 3 },
      { name: '12U Competitive',  sort_order: 4 },
      { name: '14U Recreational', sort_order: 5 },
      { name: '14U Competitive',  sort_order: 6 },
    ];
    for (const d of divisions) {
      await pool.query(
        `INSERT INTO league_divisions (name, season_id, sort_order) VALUES ($1,$2,$3)`,
        [d.name, seasonId, d.sort_order]
      );
    }
    console.log(`Created ${divisions.length} divisions.`);
  } else {
    console.log(`${divCount} division(s) already exist — skipping.`);
  }

  // ─── Stat definitions ─────────────────────────────────────────────────────
  const { rows: [{ count: statCount }] } = await pool.query('SELECT COUNT(*) AS count FROM stat_definitions');
  if (parseInt(statCount) === 0) {
    const stats = [
      // Batting
      { name: 'At Bats',              abbreviation: 'AB',  category: 'batting',  sort_order: 1  },
      { name: 'Hits',                 abbreviation: 'H',   category: 'batting',  sort_order: 2  },
      { name: 'Runs',                 abbreviation: 'R',   category: 'batting',  sort_order: 3  },
      { name: 'RBI',                  abbreviation: 'RBI', category: 'batting',  sort_order: 4  },
      { name: 'Home Runs',            abbreviation: 'HR',  category: 'batting',  sort_order: 5  },
      { name: 'Doubles',              abbreviation: '2B',  category: 'batting',  sort_order: 6  },
      { name: 'Triples',              abbreviation: '3B',  category: 'batting',  sort_order: 7  },
      { name: 'Walks',                abbreviation: 'BB',  category: 'batting',  sort_order: 8  },
      { name: 'Strikeouts',           abbreviation: 'K',   category: 'batting',  sort_order: 9  },
      { name: 'Stolen Bases',         abbreviation: 'SB',  category: 'batting',  sort_order: 10 },
      // Pitching
      { name: 'Innings Pitched',      abbreviation: 'IP',  category: 'pitching', sort_order: 1  },
      { name: 'Hits Allowed',         abbreviation: 'HA',  category: 'pitching', sort_order: 2  },
      { name: 'Runs Allowed',         abbreviation: 'RA',  category: 'pitching', sort_order: 3  },
      { name: 'Earned Runs',          abbreviation: 'ER',  category: 'pitching', sort_order: 4  },
      { name: 'Walks Issued',         abbreviation: 'BB',  category: 'pitching', sort_order: 5  },
      { name: 'Strikeouts (Pitching)',abbreviation: 'K',   category: 'pitching', sort_order: 6  },
      { name: 'Pitches Thrown',       abbreviation: 'PC',  category: 'pitching', sort_order: 7  },
      { name: 'Wins',                 abbreviation: 'W',   category: 'pitching', sort_order: 8  },
      { name: 'Losses',               abbreviation: 'L',   category: 'pitching', sort_order: 9  },
      { name: 'Saves',                abbreviation: 'SV',  category: 'pitching', sort_order: 10 },
    ];
    for (const s of stats) {
      await pool.query(
        `INSERT INTO stat_definitions (name, abbreviation, category, sort_order)
         VALUES ($1,$2,$3,$4)`,
        [s.name, s.abbreviation, s.category, s.sort_order]
      );
    }
    console.log(`Created ${stats.length} stat definitions.`);
  } else {
    console.log(`${statCount} stat definition(s) already exist — skipping.`);
  }

  // ─── Volunteer roles ──────────────────────────────────────────────────────
  const { rows: [{ count: volCount }] } = await pool.query('SELECT COUNT(*) AS count FROM volunteer_roles');
  if (parseInt(volCount) === 0) {
    const roles = [
      { name: 'Team Parent',              sort_order: 1 },
      { name: 'Scorekeeper',              sort_order: 2 },
      { name: 'Concessions Volunteer',    sort_order: 3 },
      { name: 'Field Setup / Breakdown',  sort_order: 4 },
      { name: 'Umpire',                   sort_order: 5 },
      { name: 'Photographer',             sort_order: 6 },
    ];
    for (const r of roles) {
      await pool.query(
        `INSERT INTO volunteer_roles (name, sort_order) VALUES ($1,$2)`,
        [r.name, r.sort_order]
      );
    }
    console.log(`Created ${roles.length} volunteer roles.`);
  } else {
    console.log(`${volCount} volunteer role(s) already exist — skipping.`);
  }

  // ─── Welcome announcement ─────────────────────────────────────────────────
  const { rows: [{ count: annCount }] } = await pool.query('SELECT COUNT(*) AS count FROM announcements');
  if (parseInt(annCount) === 0 && adminId) {
    await pool.query(
      `INSERT INTO announcements (title, body, created_by, is_active, priority)
       VALUES ($1,$2,$3, TRUE, 'normal')`,
      [
        'Welcome to LeagueHaven!',
        'Welcome to your new league management platform. To get started, update your league name and branding in Admin > Settings, then add your teams, players, and schedule your first games.',
        adminId,
      ]
    );
    console.log('Created welcome announcement.');
  } else {
    console.log(`${annCount} announcement(s) already exist — skipping.`);
  }

  console.log('\nSeed complete!');
  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
