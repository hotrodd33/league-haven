const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');

const router = express.Router();

// Org name normalization: team_name prefix → canonical org name
// Longer prefixes checked first so "Austin Stars" matches before "Austin"
const ORG_PREFIXES = [
  ['Austin Stars', 'Austin'],
  ['Austin Red', 'Austin'],
  ['Austin White', 'Austin'],
  ['Austin', 'Austin'],
  ['Blooming Prairie', 'Blooming Prairie'],
  ['BLOOMING PRAIRIE', 'Blooming Prairie'],
  ['Byron Bears', 'Byron Bears'],
  ['Cannon Falls Bombers', 'Cannon Falls Bombers'],
  ['Chatfield', 'Chatfield'],
  ['Chatfeid', 'Chatfield'],
  ['Chafield', 'Chatfield'],
  ['Dover-Eyota', 'Dover-Eyota'],
  ['Dover Eyota', 'Dover-Eyota'],
  ['Goodhue', 'Goodhue'],
  ['Hayfield', 'Hayfield'],
  ['Kasson-Mantorville', 'Kasson-Mantorville'],
  ['Kenyon-Wanamingo', 'Kenyon-Wanamingo'],
  ['Lake City', 'Lake City'],
  ['PEM', 'Plainview Elgin Millville'],
  ['Pine Island', 'Pine Island'],
  ['Plainview Elgin Millville', 'Plainview Elgin Millville'],
  ['Rochester Pulse', 'Rochester Pulse'],
  ['Rockets', 'Randolph Rockets'],
  ['Southern Minny Blues', 'Southern Minny Blues'],
  ['St. Charles', 'St. Charles'],
  ['Stewartville', 'Stewartville'],
  ['Triton', 'Triton'],
  ['Zumbrota Mazeppa', 'Zumbrota Mazeppa'],
];

// Sort by prefix length descending so longer matches win
ORG_PREFIXES.sort((a, b) => b[0].length - a[0].length);

function resolveOrg(teamName) {
  const upper = teamName.toUpperCase();
  for (const [prefix, org] of ORG_PREFIXES) {
    if (upper.startsWith(prefix.toUpperCase())) return org;
  }
  return teamName; // fallback: use team name as org
}

// Raw CSV data from WordPress export
const TEAM_DATA = [
  { team_name: 'Chatfield Black', age_group: '10u', level: 'AA' },
  { team_name: 'St. Charles', age_group: '12u', level: 'AA' },
  { team_name: 'Cannon Falls Bombers', age_group: '10u', level: 'A' },
  { team_name: 'Cannon Falls Bombers', age_group: '12u', level: 'A' },
  { team_name: 'PEM', age_group: '13u', level: 'A' },
  { team_name: 'PEM', age_group: '14/15u', level: 'A' },
  { team_name: 'Triton', age_group: '11u', level: 'A' },
  { team_name: 'Chatfield', age_group: '11u', level: 'AA' },
  { team_name: 'Chatfield Maroon', age_group: '10u', level: 'AA' },
  { team_name: 'Chatfield', age_group: '12u', level: 'AA' },
  { team_name: 'Chatfield', age_group: '9u', level: 'AA' },
  { team_name: 'Goodhue', age_group: '12u', level: 'A' },
  { team_name: 'Goodhue', age_group: '10u', level: 'A' },
  { team_name: 'Goodhue', age_group: '11u', level: 'AA' },
  { team_name: 'Goodhue', age_group: '13u', level: 'A' },
  { team_name: 'Goodhue', age_group: '14/15u', level: 'A' },
  { team_name: 'Goodhue', age_group: '14/15u', level: 'AA' },
  { team_name: 'Rochester Pulse', age_group: '14/15u', level: 'A' },
  { team_name: 'Blooming Prairie', age_group: '10u', level: 'A' },
  { team_name: 'Blooming Prairie', age_group: '9u', level: 'A' },
  { team_name: 'Blooming Prairie', age_group: '11u', level: 'A' },
  { team_name: 'Blooming Prairie', age_group: '14/15u', level: 'A' },
  { team_name: 'Zumbrota Mazeppa', age_group: '8u', level: 'A' },
  { team_name: 'Zumbrota Mazeppa', age_group: '9u', level: 'A' },
  { team_name: 'Zumbrota Mazeppa Silver', age_group: '10u', level: 'AA' },
  { team_name: 'Zumbrota Mazeppa Blue', age_group: '10u', level: 'AA' },
  { team_name: 'Zumbrota Mazeppa', age_group: '11u', level: 'A' },
  { team_name: 'Zumbrota Mazeppa', age_group: '11u', level: 'AA' },
  { team_name: 'Zumbrota Mazeppa', age_group: '12u', level: 'A' },
  { team_name: 'Zumbrota Mazeppa', age_group: '12u', level: 'AA' },
  { team_name: 'Zumbrota Mazeppa', age_group: '13u', level: 'AA' },
  { team_name: 'Zumbrota Mazeppa', age_group: '14/15u', level: 'AA' },
  { team_name: 'Blooming Prairie', age_group: '12u', level: 'A' },
  { team_name: 'Lake City', age_group: '9u', level: 'A' },
  { team_name: 'Lake City', age_group: '11u', level: 'AA' },
  { team_name: 'Lake City', age_group: '12u', level: 'AA' },
  { team_name: 'Lake City', age_group: '13u', level: 'A' },
  { team_name: 'Stewartville', age_group: '8u', level: 'AA' },
  { team_name: 'Stewartville Gold', age_group: '9u', level: 'AA' },
  { team_name: 'Stewartville Maroon', age_group: '9u', level: 'AA' },
  { team_name: 'Stewartville Gold', age_group: '10u', level: 'AA' },
  { team_name: 'Stewartville Maroon', age_group: '10u', level: 'AA' },
  { team_name: 'Stewartville Gold', age_group: '11u', level: 'AA' },
  { team_name: 'Stewartville Maroon', age_group: '11u', level: 'AA' },
  { team_name: 'Stewartville White', age_group: '11u', level: 'AA' },
  { team_name: 'Stewartville Gold', age_group: '12u', level: 'AA' },
  { team_name: 'Stewartville Maroon', age_group: '12u', level: 'AA' },
  { team_name: 'Stewartville', age_group: '13u', level: 'AA' },
  { team_name: 'Randolph Rockets', age_group: '8u', level: 'A' },
  { team_name: 'Randolph Rockets', age_group: '9u', level: 'A' },
  { team_name: 'Randolph Rockets', age_group: '10u', level: 'A' },
  { team_name: 'Randolph Rockets', age_group: '11u', level: 'A' },
  { team_name: 'Randolph Rockets', age_group: '12u', level: 'A' },
  { team_name: 'Hayfield', age_group: '10u', level: 'A' },
  { team_name: 'Hayfield', age_group: '9u', level: 'A' },
  { team_name: 'Hayfield', age_group: '8u', level: 'A' },
  { team_name: 'Hayfield', age_group: '11u', level: 'A' },
  { team_name: 'Hayfield', age_group: '12u', level: 'AA' },
  { team_name: 'Hayfield', age_group: '14/15u', level: 'AA' },
  { team_name: 'Dover-Eyota', age_group: '12u', level: 'AA' },
  { team_name: 'Dover-Eyota', age_group: '14/15u', level: 'A' },
  { team_name: 'Kasson-Mantorville', age_group: '14/15u', level: 'AA' },
  { team_name: 'Dover-Eyota', age_group: '10u', level: 'AA' },
  { team_name: 'Byron Bears Gray', age_group: '8u', level: 'A' },
  { team_name: 'Byron Bears Gold', age_group: '8u', level: 'A' },
  { team_name: 'Byron Bears', age_group: '9u', level: 'AA' },
  { team_name: 'Byron Bears', age_group: '9u', level: 'A' },
  { team_name: 'Byron Bears', age_group: '10u', level: 'A' },
  { team_name: 'Byron Bears', age_group: '12u', level: 'A' },
  { team_name: 'Byron Bears', age_group: '14/15u', level: 'A' },
  { team_name: 'Austin Red', age_group: '9u', level: 'A' },
  { team_name: 'Austin White', age_group: '9u', level: 'A' },
  { team_name: 'Austin Red', age_group: '10u', level: 'A' },
  { team_name: 'Austin White', age_group: '10u', level: 'A' },
  { team_name: 'Austin', age_group: '11u', level: 'A' },
  { team_name: 'Austin', age_group: '13u', level: 'A' },
  { team_name: 'Kasson-Mantorville', age_group: '13u', level: 'A' },
  { team_name: 'Kasson-Mantorville', age_group: '11u', level: 'A' },
  { team_name: 'Kenyon-Wanamingo', age_group: '9u', level: 'A' },
  { team_name: 'Kenyon-Wanamingo', age_group: '11u', level: 'A' },
  { team_name: 'Kenyon-Wanamingo', age_group: '12u', level: 'A' },
  { team_name: 'Kenyon-Wanamingo', age_group: '13u', level: 'AA' },
  { team_name: 'Kenyon-Wanamingo', age_group: '14/15u', level: 'AA' },
  { team_name: 'Pine Island Gold', age_group: '10u', level: 'AA' },
  { team_name: 'Pine Island Maroon', age_group: '10u', level: 'AA' },
  { team_name: 'Pine Island Grey', age_group: '10u', level: 'AA' },
  { team_name: 'Pine Island', age_group: '11u', level: 'A' },
  { team_name: 'Pine Island', age_group: '12u', level: 'AA' },
  { team_name: 'Pine Island', age_group: '14/15u', level: 'AA' },
  { team_name: 'Pine Island', age_group: '9u', level: 'AA' },
  { team_name: 'Plainview Elgin Millville', age_group: '9u', level: 'A' },
  { team_name: 'Plainview Elgin Millville', age_group: '10u', level: 'A' },
  { team_name: 'Plainview Elgin Millville', age_group: '11u', level: 'A' },
  { team_name: 'Plainview Elgin Millville', age_group: '12u', level: 'A' },
  { team_name: 'Plainview Elgin Millville', age_group: '13u', level: 'A' },
  { team_name: 'Kasson-Mantorville', age_group: '12u', level: 'AA' },
  { team_name: 'Kasson-Mantorville Blue', age_group: '9u', level: 'A' },
  { team_name: 'Kasson-Mantorville White', age_group: '9u', level: 'A' },
  { team_name: 'Kasson-Mantorville Gray', age_group: '9u', level: 'A' },
  { team_name: 'Austin Stars', age_group: '9u', level: 'AA' },
  { team_name: 'Southern Minny Blues', age_group: '13u', level: 'A' },
  { team_name: 'Southern Minny Blues', age_group: '10u', level: 'A' },
  { team_name: 'Southern Minny Blues', age_group: '9u', level: 'A' },
  { team_name: 'Southern Minny Blues', age_group: '11u', level: 'A' },
  { team_name: 'Plainview Elgin Millville', age_group: '9u', level: 'A' },
  { team_name: 'Plainview Elgin Millville', age_group: '14/15u', level: 'A' },
  { team_name: 'Lake City Black', age_group: '8u', level: 'A' },
  { team_name: 'Lake City Orange', age_group: '8u', level: 'A' },
  { team_name: 'Lake City White', age_group: '8u', level: 'A' },
  { team_name: 'Lake City Black', age_group: '10u', level: 'A' },
  { team_name: 'Lake City Orange', age_group: '10u', level: 'AA' },
  { team_name: 'Lake City', age_group: '14/15u', level: 'AA' },
];

// POST /api/seed/teams — admin-only, seeds orgs + teams + age groups + levels
router.post('/teams', authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 0. Clear existing data (order matters for FK constraints)
    await client.query('DELETE FROM game_pitch_counts');
    await client.query('DELETE FROM games');
    await client.query('DELETE FROM team_divisions');
    await client.query('DELETE FROM team_players');
    await client.query('DELETE FROM team_staff_assignments');
    await client.query('DELETE FROM teams');
    await client.query('DELETE FROM field_locations');
    await client.query('DELETE FROM organizations');
    await client.query('DELETE FROM league_divisions');
    await client.query('DELETE FROM league_seasons');
    await client.query('DELETE FROM league_age_groups');
    await client.query('DELETE FROM league_levels');

    // 1. Seed age groups
    const ageGroups = ['8u', '9u', '10u', '11u', '12u', '13u', '14/15u'];
    for (let i = 0; i < ageGroups.length; i++) {
      await client.query(
        'INSERT INTO league_age_groups (name, sort_order) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [ageGroups[i], i]
      );
    }

    // 2. Seed levels
    const levels = ['A', 'AA'];
    for (let i = 0; i < levels.length; i++) {
      await client.query(
        'INSERT INTO league_levels (name, sort_order) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [levels[i], i]
      );
    }

    // 3. Create orgs (deduplicated)
    const orgNames = [...new Set(TEAM_DATA.map(t => resolveOrg(t.team_name)))];
    const orgIdMap = {};
    for (const name of orgNames) {
      const { rows } = await client.query(
        `INSERT INTO organizations (name) VALUES ($1)
         ON CONFLICT DO NOTHING RETURNING id`,
        [name]
      );
      if (rows.length) {
        orgIdMap[name] = rows[0].id;
      } else {
        // Already exists — look it up
        const existing = await client.query('SELECT id FROM organizations WHERE name = $1', [name]);
        orgIdMap[name] = existing.rows[0].id;
      }
    }

    // 4. Create teams
    let created = 0;
    let skipped = 0;
    for (const t of TEAM_DATA) {
      const orgName = resolveOrg(t.team_name);
      const orgId = orgIdMap[orgName];
      // Check for existing team with same name + age_group + level + org
      const existing = await client.query(
        `SELECT id FROM teams WHERE name = $1 AND age_group = $2 AND level = $3 AND org_id = $4`,
        [t.team_name, t.age_group, t.level, orgId]
      );
      if (existing.rows.length) {
        skipped++;
        continue;
      }
      await client.query(
        'INSERT INTO teams (name, age_group, level, org_id) VALUES ($1, $2, $3, $4)',
        [t.team_name, t.age_group, t.level, orgId]
      );
      created++;
    }

    // 5. Create season
    const { rows: seasonRows } = await client.query(
      `INSERT INTO league_seasons (year, name, is_active, sort_order)
       VALUES (2026, '2026 Season', true, 0) RETURNING id`
    );
    const seasonId = seasonRows[0].id;

    // 6. Build divisions from age_group + level combos in data
    // Hierarchy: age_group parent → age_group + level child
    const ageLevelPairs = [...new Set(TEAM_DATA.map(t => `${t.age_group}|${t.level}`))];
    const parentAges = [...new Set(TEAM_DATA.map(t => t.age_group))];
    // Sort by age numerically
    parentAges.sort((a, b) => parseInt(a) - parseInt(b));

    const parentDivIds = {};  // age_group → division id
    const childDivIds = {};   // "age_group|level" → division id

    for (let i = 0; i < parentAges.length; i++) {
      const ag = parentAges[i];
      const { rows } = await client.query(
        `INSERT INTO league_divisions (name, season_id, parent_id, sort_order)
         VALUES ($1, $2, NULL, $3) RETURNING id`,
        [ag, seasonId, i]
      );
      parentDivIds[ag] = rows[0].id;
    }

    // Create child divisions (e.g. "10u A", "10u AA")
    const levelOrder = { A: 0, AA: 1 };
    for (const pair of ageLevelPairs) {
      const [ag, lvl] = pair.split('|');
      const parentId = parentDivIds[ag];
      const { rows } = await client.query(
        `INSERT INTO league_divisions (name, season_id, parent_id, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [`${ag} ${lvl}`, seasonId, parentId, levelOrder[lvl] ?? 0]
      );
      childDivIds[pair] = rows[0].id;
    }

    // 7. Assign teams to their leaf division
    let divAssigned = 0;
    const allTeams = await client.query('SELECT id, age_group, level FROM teams');
    for (const team of allTeams.rows) {
      const key = `${team.age_group}|${team.level}`;
      const divId = childDivIds[key];
      if (divId) {
        await client.query(
          'INSERT INTO team_divisions (team_id, division_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [team.id, divId]
        );
        divAssigned++;
      }
    }

    await client.query('COMMIT');
    res.json({
      message: 'Seed complete',
      orgs: orgNames.length,
      teams_created: created,
      teams_skipped: skipped,
      age_groups: ageGroups.length,
      levels: levels.length,
      season_id: seasonId,
      divisions_parent: parentAges.length,
      divisions_child: Object.keys(childDivIds).length,
      teams_assigned_to_divisions: divAssigned,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
