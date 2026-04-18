const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');
const { normalizeDOB } = require('../utils/dob');

const router = express.Router();

// ── CSV Parsing ──

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

function parseLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

function csvEsc(v) {
  const s = String(v ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

function findCol(headers, ...names) {
  return headers.find(h => names.includes(h)) || null;
}

// Build team lookup supporting bare names (if unique), "Name (Org)" format, and abbreviation
async function buildTeamLookup() {
  const { rows } = await pool.query(
    'SELECT t.id, t.name, t.abbreviation, o.name AS org_name FROM teams t LEFT JOIN organizations o ON o.id = t.org_id'
  );
  const byName = {};
  const lookup = {};
  for (const t of rows) {
    const key = t.name.toLowerCase();
    if (!byName[key]) byName[key] = [];
    byName[key].push(t.id);
    if (t.org_name) lookup[`${t.name} (${t.org_name})`.toLowerCase()] = t.id;
    if (t.abbreviation) lookup[t.abbreviation.toLowerCase()] = t.id;
  }
  for (const [name, ids] of Object.entries(byName)) {
    if (ids.length === 1) lookup[name] = ids[0];
  }
  return lookup;
}

// ── CLEAR DATA ──

// POST /data-manager/clear
// body: { entities: ['teams','players','staff','games','organizations','locations','divisions','seasons','age_groups','levels'] }
router.post('/clear', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { entities } = req.body;
    if (!entities || !Array.isArray(entities) || !entities.length) {
      return res.status(400).json({ error: 'entities array is required' });
    }

    const cleared = [];

    // Order matters for FK constraints — delete dependents first
    const deleteOrder = [
      'games',       // depends on teams, seasons, locations
      'players',     // team_players depends on teams+players
      'staff',       // team_staff_assignments depends on teams+staff
      'divisions',   // team_divisions depends on teams+divisions
      'teams',       // depends on orgs
      'locations',   // depends on orgs
      'organizations',
      'seasons',     // divisions depend on seasons (already cleared)
      'age_groups',
      'levels',
    ];

    for (const entity of deleteOrder) {
      if (!entities.includes(entity)) continue;
      switch (entity) {
        case 'games':
          await pool.query('DELETE FROM game_pitch_counts');
          await pool.query('DELETE FROM games');
          cleared.push('games');
          break;
        case 'players':
          await pool.query('DELETE FROM player_positions');
          await pool.query('DELETE FROM team_players');
          await pool.query('DELETE FROM players');
          cleared.push('players');
          break;
        case 'staff':
          await pool.query('DELETE FROM team_staff_assignments');
          await pool.query('DELETE FROM staff_members');
          cleared.push('staff');
          break;
        case 'divisions':
          await pool.query('DELETE FROM team_divisions');
          await pool.query('DELETE FROM league_divisions');
          cleared.push('divisions');
          break;
        case 'teams':
          await pool.query('DELETE FROM team_divisions');
          await pool.query('DELETE FROM team_players');
          await pool.query('DELETE FROM team_staff_assignments');
          // Nullify game references instead of deleting games
          await pool.query('UPDATE games SET home_team_id = NULL WHERE home_team_id IS NOT NULL');
          await pool.query('UPDATE games SET away_team_id = NULL WHERE away_team_id IS NOT NULL');
          await pool.query('DELETE FROM teams');
          cleared.push('teams');
          break;
        case 'locations':
          await pool.query('UPDATE games SET location_id = NULL WHERE location_id IS NOT NULL');
          await pool.query('DELETE FROM field_locations');
          cleared.push('locations');
          break;
        case 'organizations':
          // Must clear locations and detach teams first
          if (!entities.includes('locations')) {
            await pool.query('UPDATE games SET location_id = NULL WHERE location_id IN (SELECT id FROM field_locations)');
            await pool.query('DELETE FROM field_locations');
          }
          await pool.query('UPDATE teams SET org_id = NULL WHERE org_id IS NOT NULL');
          await pool.query('DELETE FROM user_permissions WHERE org_id IS NOT NULL');
          await pool.query('DELETE FROM organizations');
          cleared.push('organizations');
          break;
        case 'seasons':
          if (!entities.includes('divisions')) {
            await pool.query('DELETE FROM team_divisions');
            await pool.query('DELETE FROM league_divisions');
          }
          await pool.query('UPDATE games SET season_id = NULL WHERE season_id IS NOT NULL');
          await pool.query('DELETE FROM league_seasons');
          cleared.push('seasons');
          break;
        case 'age_groups':
          await pool.query('DELETE FROM league_age_groups');
          cleared.push('age_groups');
          break;
        case 'levels':
          await pool.query('DELETE FROM league_levels');
          cleared.push('levels');
          break;
      }
    }

    res.json({ cleared });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── EXPORT ──

// GET /data-manager/export/:entity
// Optional query params: ?team_id=N&org_id=N to narrow results
router.get('/export/:entity', async (req, res) => {
  try {
    const { entity } = req.params;
    const teamId = req.query.team_id ? parseInt(req.query.team_id) : null;
    const orgId = req.query.org_id ? parseInt(req.query.org_id) : null;
    let csvLines = [];

    switch (entity) {
      case 'organizations': {
        const params = [];
        let where = '';
        if (orgId) { params.push(orgId); where = ' WHERE id = $1'; }
        const { rows } = await pool.query(`SELECT name, contact_name, contact_email, contact_phone, address, city, state, zip, notes FROM organizations${where} ORDER BY name`, params);
        csvLines = ['name,contact_name,contact_email,contact_phone,address,city,state,zip,notes'];
        for (const r of rows) {
          csvLines.push([r.name, r.contact_name, r.contact_email, r.contact_phone, r.address, r.city, r.state, r.zip, r.notes].map(csvEsc).join(','));
        }
        break;
      }
      case 'teams': {
        const params = [];
        const conditions = [];
        if (orgId) { params.push(orgId); conditions.push(`t.org_id = $${params.length}`); }
        if (teamId) { params.push(teamId); conditions.push(`t.id = $${params.length}`); }
        const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
        const { rows } = await pool.query(
          `SELECT t.id, t.name, t.abbreviation, t.team_city, t.team_color, t.team_mascot, t.primary_color, t.secondary_color, o.name AS org_name, t.age_group, t.level
           FROM teams t LEFT JOIN organizations o ON o.id = t.org_id${where} ORDER BY o.name, t.name`, params
        );
        const { rows: divRows } = await pool.query(
          `WITH RECURSIVE tree AS (
            SELECT id, name, parent_id, name::text AS path FROM league_divisions WHERE parent_id IS NULL
            UNION ALL
            SELECT d.id, d.name, d.parent_id, (tree.path || ' / ' || d.name)::text FROM league_divisions d JOIN tree ON tree.id = d.parent_id
          ) SELECT td.team_id, tree.path AS name FROM team_divisions td JOIN tree ON tree.id = td.division_id ORDER BY td.team_id, tree.path`
        );
        const divMap = {};
        for (const r of divRows) { if (!divMap[r.team_id]) divMap[r.team_id] = []; divMap[r.team_id].push(r.name); }
        csvLines = ['abbreviation,team_city,team_mascot,team_color,primary_color,secondary_color,team_name,org_name,age_group,level,division'];
        for (const t of rows) {
          const divs = divMap[t.id] ? divMap[t.id].join('; ') : '';
          csvLines.push([t.abbreviation, t.team_city, t.team_mascot, t.team_color, t.primary_color, t.secondary_color, t.name, t.org_name, t.age_group, t.level, divs].map(csvEsc).join(','));
        }
        break;
      }
      case 'players': {
        const params = [];
        const conditions = [];
        if (teamId) { params.push(teamId); conditions.push(`tp.team_id = $${params.length}`); }
        if (orgId) { params.push(orgId); conditions.push(`t.org_id = $${params.length}`); }
        const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
        const { rows } = await pool.query(
          `SELECT p.first_name, p.last_name, p.date_of_birth, p.batting_hand, p.throwing_hand, p.grade,
                  p.jersey_size, p.hat_size, p.needs_new_jersey, p.needs_new_hat,
                  pc1.first_name AS parent1_first_name, pc1.last_name AS parent1_last_name,
                  pc1.email AS parent1_email, pc1.phone AS parent1_phone,
                  pc2.first_name AS parent2_first_name, pc2.last_name AS parent2_last_name,
                  pc2.email AS parent2_email, pc2.phone AS parent2_phone,
                  COALESCE(string_agg(DISTINCT CASE WHEN o.name IS NOT NULL THEN t.name || ' (' || o.name || ')' ELSE t.name END, '; '), '') AS teams,
                  COALESCE(string_agg(DISTINCT tp.jersey_number::text, '; '), '') AS jersey_numbers
           FROM players p
           LEFT JOIN team_players tp ON tp.player_id = p.id
           LEFT JOIN teams t ON t.id = tp.team_id
           LEFT JOIN organizations o ON o.id = t.org_id
           LEFT JOIN LATERAL (SELECT first_name, last_name, email, phone FROM player_contacts WHERE player_id = p.id ORDER BY is_primary DESC, created_at LIMIT 1) pc1 ON TRUE
           LEFT JOIN LATERAL (SELECT first_name, last_name, email, phone FROM player_contacts WHERE player_id = p.id ORDER BY is_primary DESC, created_at LIMIT 1 OFFSET 1) pc2 ON TRUE
           ${where}
           GROUP BY p.id, pc1.first_name, pc1.last_name, pc1.email, pc1.phone, pc2.first_name, pc2.last_name, pc2.email, pc2.phone
           ORDER BY p.last_name, p.first_name`, params
        );
        csvLines = ['first_name,last_name,date_of_birth,batting_hand,throwing_hand,grade,jersey_size,hat_size,needs_new_jersey,needs_new_hat,team,jersey_number,parent1_first_name,parent1_last_name,parent1_email,parent1_phone,parent2_first_name,parent2_last_name,parent2_email,parent2_phone'];
        for (const r of rows) {
          csvLines.push([r.first_name, r.last_name, r.date_of_birth, r.batting_hand, r.throwing_hand, r.grade, r.jersey_size, r.hat_size, r.needs_new_jersey, r.needs_new_hat, r.teams, r.jersey_numbers, r.parent1_first_name, r.parent1_last_name, r.parent1_email, r.parent1_phone, r.parent2_first_name, r.parent2_last_name, r.parent2_email, r.parent2_phone].map(csvEsc).join(','));
        }
        break;
      }
      case 'staff': {
        const params = [];
        const conditions = [];
        if (teamId) { params.push(teamId); conditions.push(`tsa.team_id = $${params.length}`); }
        if (orgId) { params.push(orgId); conditions.push(`t.org_id = $${params.length}`); }
        const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
        const { rows } = await pool.query(
          `SELECT sm.name, sm.email, sm.phone,
                  COALESCE(string_agg(DISTINCT CASE WHEN o.name IS NOT NULL THEN t.name || ' (' || o.name || ')' ELSE t.name END, '; '), '') AS teams,
                  COALESCE(string_agg(DISTINCT tsa.role, '; '), '') AS roles
           FROM staff_members sm
           LEFT JOIN team_staff_assignments tsa ON tsa.staff_id = sm.id
           LEFT JOIN teams t ON t.id = tsa.team_id
           LEFT JOIN organizations o ON o.id = t.org_id
           ${where}
           GROUP BY sm.id ORDER BY sm.name`, params
        );
        csvLines = ['name,email,phone,team,role'];
        for (const r of rows) {
          csvLines.push([r.name, r.email, r.phone, r.teams, r.roles].map(csvEsc).join(','));
        }
        break;
      }
      case 'locations': {
        const params = [];
        let where = '';
        if (orgId) { params.push(orgId); where = ' WHERE fl.org_id = $1'; }
        const { rows } = await pool.query(
          `SELECT fl.name, o.name AS org_name, fl.address, fl.city, fl.state, fl.zip, fl.latitude, fl.longitude, fl.comments
           FROM field_locations fl LEFT JOIN organizations o ON o.id = fl.org_id${where} ORDER BY o.name, fl.name`, params
        );
        csvLines = ['name,org_name,address,city,state,zip,latitude,longitude,comments'];
        for (const r of rows) {
          csvLines.push([r.name, r.org_name, r.address, r.city, r.state, r.zip, r.latitude, r.longitude, r.comments].map(csvEsc).join(','));
        }
        break;
      }
      case 'games': {
        const params = [];
        const conditions = [];
        if (teamId) { params.push(teamId); conditions.push(`(g.home_team_id = $${params.length} OR g.away_team_id = $${params.length})`); }
        if (orgId) { params.push(orgId); conditions.push(`(ht.org_id = $${params.length} OR at.org_id = $${params.length})`); }
        const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
        const { rows } = await pool.query(
          `SELECT g.game_date, g.game_time, g.status, g.home_score, g.away_score, g.innings_played, g.notes,
                  CASE WHEN ho.name IS NOT NULL THEN ht.name || ' (' || ho.name || ')' ELSE ht.name END AS home_team,
                  CASE WHEN ao.name IS NOT NULL THEN at.name || ' (' || ao.name || ')' ELSE at.name END AS away_team,
                  fl.name AS location, ls.name AS season
           FROM games g
           LEFT JOIN teams ht ON ht.id = g.home_team_id
           LEFT JOIN organizations ho ON ho.id = ht.org_id
           LEFT JOIN teams at ON at.id = g.away_team_id
           LEFT JOIN organizations ao ON ao.id = at.org_id
           LEFT JOIN field_locations fl ON fl.id = g.location_id
           LEFT JOIN league_seasons ls ON ls.id = g.season_id
           ${where}
           ORDER BY g.game_date, g.game_time`, params
        );
        csvLines = ['game_date,game_time,home_team,away_team,location,season,status,home_score,away_score,innings_played,notes'];
        for (const r of rows) {
          csvLines.push([r.game_date, r.game_time, r.home_team, r.away_team, r.location, r.season, r.status, r.home_score, r.away_score, r.innings_played, r.notes].map(csvEsc).join(','));
        }
        break;
      }
      case 'divisions': {
        const { rows } = await pool.query(
          `WITH RECURSIVE tree AS (
            SELECT id, name, parent_id, season_id, name::text AS path, sort_order, 0 AS depth
            FROM league_divisions WHERE parent_id IS NULL
            UNION ALL
            SELECT d.id, d.name, d.parent_id, d.season_id,
              (tree.path || ' / ' || d.name)::text, d.sort_order, tree.depth + 1
            FROM league_divisions d JOIN tree ON tree.id = d.parent_id
          )
          SELECT tree.path AS division_path, ls.name AS season, ls.year AS season_year, tree.sort_order
          FROM tree LEFT JOIN league_seasons ls ON ls.id = tree.season_id
          ORDER BY ls.year, ls.name, tree.path`
        );
        csvLines = ['division_path,season,season_year,sort_order'];
        for (const r of rows) {
          csvLines.push([r.division_path, r.season, r.season_year, r.sort_order].map(csvEsc).join(','));
        }
        break;
      }
      case 'seasons': {
        const { rows } = await pool.query('SELECT name, year, is_active, sort_order FROM league_seasons ORDER BY year, name');
        csvLines = ['name,year,is_active,sort_order'];
        for (const r of rows) {
          csvLines.push([r.name, r.year, r.is_active, r.sort_order].map(csvEsc).join(','));
        }
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown entity: ${entity}` });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${entity}.csv`);
    res.send(csvLines.join('\n'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── IMPORT ──

// POST /data-manager/import/:entity
// body: { csv: string, mode: 'create_update' | 'create_only' }
router.post('/import/:entity', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { entity } = req.params;
    const { csv, mode, season_id } = req.body;
    if (!csv) return res.status(400).json({ error: 'csv field required' });

    const { headers, rows } = parseCSV(csv);
    if (!rows.length) return res.status(400).json({ error: 'CSV has no data rows' });

    const results = { created: 0, updated: 0, skipped: 0, errors: [] };

    switch (entity) {

      // ── Organizations ──
      case 'organizations': {
        const nameCol = findCol(headers, 'name', 'org_name', 'organization');
        if (!nameCol) return res.status(400).json({ error: 'CSV must have a "name" column' });

        const { rows: existing } = await pool.query('SELECT id, name FROM organizations');
        const lookup = {};
        for (const o of existing) lookup[o.name.toLowerCase()] = o.id;

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const name = r[nameCol];
          if (!name) { results.skipped++; continue; }

          try {
            const ex = lookup[name.toLowerCase()];
            if (ex && mode !== 'create_only') {
              await pool.query(
                `UPDATE organizations SET contact_name = COALESCE(NULLIF($1,''), contact_name),
                  contact_email = COALESCE(NULLIF($2,''), contact_email),
                  contact_phone = COALESCE(NULLIF($3,''), contact_phone),
                  address = COALESCE(NULLIF($4,''), address),
                  city = COALESCE(NULLIF($5,''), city),
                  state = COALESCE(NULLIF($6,''), state),
                  zip = COALESCE(NULLIF($7,''), zip),
                  notes = COALESCE(NULLIF($8,''), notes)
                WHERE id = $9`,
                [r.contact_name, r.contact_email, r.contact_phone, r.address, r.city, r.state, r.zip, r.notes, ex]
              );
              results.updated++;
            } else if (!ex) {
              const { rows: nr } = await pool.query(
                'INSERT INTO organizations (name, contact_name, contact_email, contact_phone, address, city, state, zip, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
                [name, r.contact_name || null, r.contact_email || null, r.contact_phone || null, r.address || null, r.city || null, r.state || null, r.zip || null, r.notes || null]
              );
              lookup[name.toLowerCase()] = nr[0].id;
              results.created++;
            } else {
              results.skipped++;
            }
          } catch (err) { results.errors.push(`Row ${i + 2}: ${err.message}`); }
        }
        break;
      }

      // ── Locations ──
      case 'locations': {
        const nameCol = findCol(headers, 'name', 'field_name', 'location');
        if (!nameCol) return res.status(400).json({ error: 'CSV must have a "name" column' });
        const orgCol = findCol(headers, 'org_name', 'organization', 'org');

        const { rows: orgs } = await pool.query('SELECT id, name FROM organizations');
        const orgLookup = {};
        for (const o of orgs) orgLookup[o.name.toLowerCase()] = o.id;

        const { rows: existing } = await pool.query('SELECT id, name, org_id FROM field_locations');
        const locLookup = {};
        for (const l of existing) locLookup[(l.name + '|' + (l.org_id || '')).toLowerCase()] = l.id;

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const name = r[nameCol];
          if (!name) { results.skipped++; continue; }
          const orgName = orgCol ? r[orgCol] : '';
          const orgId = orgName ? (orgLookup[orgName.toLowerCase()] || null) : null;
          if (orgName && !orgId) { results.errors.push(`Row ${i + 2}: org "${orgName}" not found`); }
          if (!orgId) { results.errors.push(`Row ${i + 2}: org_id required for location "${name}"`); results.skipped++; continue; }

          try {
            const key = (name + '|' + (orgId || '')).toLowerCase();
            const exId = locLookup[key];
            if (exId && mode !== 'create_only') {
              await pool.query(
                `UPDATE field_locations SET address = COALESCE(NULLIF($1,''), address),
                  city = COALESCE(NULLIF($2,''), city), state = COALESCE(NULLIF($3,''), state),
                  zip = COALESCE(NULLIF($4,''), zip),
                  latitude = COALESCE($5, latitude), longitude = COALESCE($6, longitude),
                  comments = COALESCE(NULLIF($7,''), comments)
                WHERE id = $8`,
                [r.address, r.city, r.state, r.zip, r.latitude ? parseFloat(r.latitude) : null, r.longitude ? parseFloat(r.longitude) : null, r.comments, exId]
              );
              results.updated++;
            } else if (!exId) {
              const { rows: nr } = await pool.query(
                'INSERT INTO field_locations (org_id, name, address, city, state, zip, latitude, longitude, comments) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
                [orgId, name, r.address || null, r.city || null, r.state || null, r.zip || null, r.latitude ? parseFloat(r.latitude) : null, r.longitude ? parseFloat(r.longitude) : null, r.comments || null]
              );
              locLookup[key] = nr[0].id;
              results.created++;
            } else { results.skipped++; }
          } catch (err) { results.errors.push(`Row ${i + 2}: ${err.message}`); }
        }
        break;
      }

      // ── Teams ──
      case 'teams': {
        const cityCol = findCol(headers, 'team_city', 'city');
        const colorCol = findCol(headers, 'team_color', 'color');
        const mascotCol = findCol(headers, 'team_mascot', 'mascot');
        const nameCol = findCol(headers, 'team_name', 'name', 'team');
        const orgCol = findCol(headers, 'org_name', 'organization', 'org');
        const ageCol = findCol(headers, 'age_group', 'age', 'agegroup');
        const lvlCol = findCol(headers, 'level', 'lvl');
        const divCol = findCol(headers, 'division', 'divisions', 'div');
        const primaryCol = findCol(headers, 'primary_color');
        const secondaryCol = findCol(headers, 'secondary_color');

        if (!cityCol && !nameCol) return res.status(400).json({ error: 'CSV must have a "team_city" or "team_name" column' });

        const { rows: allOrgs } = await pool.query('SELECT id, name FROM organizations');
        const orgLookup = {};
        for (const o of allOrgs) orgLookup[o.name.toLowerCase()] = o.id;

        let divLookup = {};
        if (season_id) {
          const { rows: allDivs } = await pool.query(
            `WITH RECURSIVE tree AS (
              SELECT id, name, parent_id, name::text AS path FROM league_divisions WHERE parent_id IS NULL AND season_id = $1
              UNION ALL
              SELECT d.id, d.name, d.parent_id, (tree.path || ' / ' || d.name)::text FROM league_divisions d JOIN tree ON tree.id = d.parent_id
            ) SELECT id, name, path FROM tree`, [season_id]
          );
          for (const d of allDivs) {
            divLookup[d.name.toLowerCase()] = d.id;
            divLookup[d.path.toLowerCase()] = d.id;
          }
        }

        const { rows: existingTeams } = await pool.query('SELECT id, name FROM teams');
        const teamLookup = {};
        for (const t of existingTeams) teamLookup[t.name.toLowerCase()] = t.id;

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const city = cityCol ? r[cityCol] : '';
          const color = colorCol ? r[colorCol] : '';
          const mascot = mascotCol ? r[mascotCol] : '';
          const ageGroup = ageCol ? r[ageCol] : '';
          const level = lvlCol ? r[lvlCol] : '';
          const primaryColor = primaryCol ? r[primaryCol] : '';
          const secondaryColor = secondaryCol ? r[secondaryCol] : '';
          const name = city ? [city, color, ageGroup, level].filter(Boolean).join(' ') : (nameCol ? r[nameCol] : '');
          if (!name) { results.skipped++; continue; }
          const orgName = orgCol ? r[orgCol] : '';
          const orgId = orgName ? (orgLookup[orgName.toLowerCase()] || null) : null;
          if (orgName && !orgId) results.errors.push(`Row ${i + 2}: org "${orgName}" not found`);
          const divText = divCol ? r[divCol] : '';

          const divisionIds = [];
          if (divText && season_id) {
            for (const dn of divText.split(/[;|]/).map(s => s.trim()).filter(Boolean)) {
              const did = divLookup[dn.toLowerCase()];
              if (did) divisionIds.push(did);
              else results.errors.push(`Row ${i + 2}: division "${dn}" not found`);
            }
          }

          try {
            // Compute abbreviation
            let abbr = '';
            if (city) {
              const words = city.trim().split(/\s+/);
              abbr = words.length > 1 ? words.map(w => w[0]).join('') : city.substring(0, 3);
            }
            if (mascot) abbr += mascot[0];
            if (color) abbr += color[0];
            if (ageGroup) abbr += ageGroup.replace(/\s+/g, '');
            if (level) abbr += level.replace(/\s+/g, '');
            abbr = abbr.toUpperCase();

            const exId = teamLookup[name.toLowerCase()];
            if (exId && mode !== 'create_only') {
              await pool.query(
                `UPDATE teams SET name = $1, abbreviation = $2, team_city = COALESCE(NULLIF($3,''), team_city), team_color = COALESCE(NULLIF($4,''), team_color),
                 team_mascot = COALESCE(NULLIF($5,''), team_mascot), age_group = COALESCE(NULLIF($6,''), age_group),
                 level = COALESCE(NULLIF($7,''), level), org_id = COALESCE($8, org_id),
                 primary_color = COALESCE(NULLIF($10,''), primary_color), secondary_color = COALESCE(NULLIF($11,''), secondary_color) WHERE id = $9`,
                [name, abbr || null, city, color, mascot, ageGroup, level, orgId, exId, primaryColor, secondaryColor]
              );
              if (divisionIds.length) {
                await pool.query('DELETE FROM team_divisions WHERE team_id = $1', [exId]);
                for (const did of divisionIds) {
                  await pool.query('INSERT INTO team_divisions (team_id, division_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [exId, did]);
                }
              }
              results.updated++;
            } else if (!exId) {
              const { rows: nr } = await pool.query(
                'INSERT INTO teams (name, abbreviation, team_city, team_color, team_mascot, age_group, level, org_id, primary_color, secondary_color) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
                [name, abbr || null, city || null, color || null, mascot || null, ageGroup || null, level || null, orgId, primaryColor || null, secondaryColor || null]
              );
              teamLookup[name.toLowerCase()] = nr[0].id;
              if (divisionIds.length) {
                for (const did of divisionIds) {
                  await pool.query('INSERT INTO team_divisions (team_id, division_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [nr[0].id, did]);
                }
              }
              results.created++;
            } else { results.skipped++; }
          } catch (err) { results.errors.push(`Row ${i + 2}: ${err.message}`); }
        }
        break;
      }

      // ── Players ──
      case 'players': {
        const fnCol = findCol(headers, 'first_name', 'firstname', 'first');
        const lnCol = findCol(headers, 'last_name', 'lastname', 'last');
        if (!fnCol || !lnCol) return res.status(400).json({ error: 'CSV must have "first_name" and "last_name" columns' });
        const dobCol = findCol(headers, 'date_of_birth', 'dob', 'birthday');
        const batCol = findCol(headers, 'batting_hand', 'bats', 'bat');
        const thrCol = findCol(headers, 'throwing_hand', 'throws', 'throw');
        const gradeCol = findCol(headers, 'grade');
        const teamCol = findCol(headers, 'team', 'team_name', 'teams');
        const jerseyCol = findCol(headers, 'jersey_number', 'jersey', 'number');
        const jerseySizeCol = findCol(headers, 'jersey_size');
        const hatSizeCol = findCol(headers, 'hat_size');
        const needsJerseyCol = findCol(headers, 'needs_new_jersey');
        const needsHatCol = findCol(headers, 'needs_new_hat');

        // Parent / Guardian contacts
        const p1FnCol = findCol(headers, 'parent1_first_name', 'parent_first_name', 'parent first name', 'parent first');
        const p1LnCol = findCol(headers, 'parent1_last_name', 'parent_last_name', 'parent last name', 'parent last');
        const p1EmailCol = findCol(headers, 'parent1_email', 'parent_email', 'parent email', 'email');
        const p1PhoneCol = findCol(headers, 'parent1_phone', 'parent_phone', 'parent phone', 'phone');
        const p2FnCol = findCol(headers, 'parent2_first_name', 'parent 2 first name');
        const p2LnCol = findCol(headers, 'parent2_last_name', 'parent 2 last name');
        const p2EmailCol = findCol(headers, 'parent2_email', 'parent 2 email');
        const p2PhoneCol = findCol(headers, 'parent2_phone', 'parent 2 phone');

        const VALID_GRADES = ['Pre K','K','1','2','3','4','5','6','7','8','9','10','11','12'];
        const teamLookup = await buildTeamLookup();

        const { rows: existing } = await pool.query('SELECT id, first_name, last_name FROM players');
        const playerLookup = {};
        for (const p of existing) playerLookup[(p.first_name + '|' + p.last_name).toLowerCase()] = p.id;

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const fn = r[fnCol], ln = r[lnCol];
          if (!fn || !ln) { results.skipped++; continue; }

          const hand = (v) => { const u = (v || '').toUpperCase(); return ['R', 'L', 'S'].includes(u) ? u : null; };
          const grade = (v) => VALID_GRADES.includes(v) ? v : null;
          const toBool = (v) => v ? ['true','1','yes'].includes(String(v).toLowerCase()) : null;

          try {
            const key = (fn + '|' + ln).toLowerCase();
            const exId = playerLookup[key];
            if (exId && mode !== 'create_only') {
              await pool.query(
                `UPDATE players SET date_of_birth = COALESCE(NULLIF($1,''), date_of_birth),
                  batting_hand = COALESCE($2, batting_hand), throwing_hand = COALESCE($3, throwing_hand),
                  grade = COALESCE($4, grade),
                  jersey_size = COALESCE(NULLIF($6,''), jersey_size),
                  hat_size = COALESCE(NULLIF($7,''), hat_size),
                  needs_new_jersey = COALESCE($8, needs_new_jersey),
                  needs_new_hat = COALESCE($9, needs_new_hat),
                  updated_at = NOW()
                WHERE id = $5`,
                [dobCol ? (normalizeDOB(r[dobCol]) || '') : '', hand(batCol ? r[batCol] : ''), hand(thrCol ? r[thrCol] : ''),
                 grade(gradeCol ? r[gradeCol] : ''), exId,
                 jerseySizeCol ? r[jerseySizeCol] || '' : '', hatSizeCol ? r[hatSizeCol] || '' : '',
                 toBool(needsJerseyCol ? r[needsJerseyCol] : ''), toBool(needsHatCol ? r[needsHatCol] : '')]
              );
              results.updated++;
            } else if (!exId) {
              const { rows: nr } = await pool.query(
                'INSERT INTO players (first_name, last_name, date_of_birth, batting_hand, throwing_hand, grade, jersey_size, hat_size, needs_new_jersey, needs_new_hat) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
                [fn, ln, dobCol ? normalizeDOB(r[dobCol]) : null, hand(batCol ? r[batCol] : ''), hand(thrCol ? r[thrCol] : ''),
                 grade(gradeCol ? r[gradeCol] : ''),
                 jerseySizeCol ? r[jerseySizeCol] || null : null, hatSizeCol ? r[hatSizeCol] || null : null,
                 toBool(needsJerseyCol ? r[needsJerseyCol] : ''), toBool(needsHatCol ? r[needsHatCol] : '')]
              );
              playerLookup[key] = nr[0].id;
              results.created++;
            } else { results.skipped++; continue; }

            // Assign to teams
            const playerId = exId || playerLookup[key];
            if (teamCol && r[teamCol]) {
              const teamNames = r[teamCol].split(/[;|]/).map(s => s.trim()).filter(Boolean);
              const jerseys = jerseyCol && r[jerseyCol] ? r[jerseyCol].split(/[;|]/).map(s => s.trim()) : [];
              for (let j = 0; j < teamNames.length; j++) {
                const tid = teamLookup[teamNames[j].toLowerCase()];
                if (tid) {
                  const jn = jerseys[j] ? parseInt(jerseys[j]) || null : null;
                  await pool.query(
                    'INSERT INTO team_players (team_id, player_id, jersey_number) VALUES ($1, $2, $3) ON CONFLICT (team_id, player_id) DO UPDATE SET jersey_number = COALESCE($3, team_players.jersey_number)',
                    [tid, playerId, jn]
                  );
                } else {
                  results.errors.push(`Row ${i + 2}: team "${teamNames[j]}" not found`);
                }
              }
            }

            // Insert parent/guardian contacts
            const p1Fn = p1FnCol ? r[p1FnCol] : '';
            const p1Ln = p1LnCol ? r[p1LnCol] : '';
            const p1Email = p1EmailCol ? r[p1EmailCol] : '';
            const p1Phone = p1PhoneCol ? r[p1PhoneCol] : '';
            if (p1Fn || p1Ln || p1Email || p1Phone) {
              await pool.query(
                `INSERT INTO player_contacts (player_id, relationship, first_name, last_name, email, phone, is_primary)
                 VALUES ($1, 'parent', $2, $3, $4, $5, true) ON CONFLICT DO NOTHING`,
                [playerId, p1Fn || null, p1Ln || null, p1Email || null, p1Phone || null]
              );
            }

            const p2Fn = p2FnCol ? r[p2FnCol] : '';
            const p2Ln = p2LnCol ? r[p2LnCol] : '';
            const p2Email = p2EmailCol ? r[p2EmailCol] : '';
            const p2Phone = p2PhoneCol ? r[p2PhoneCol] : '';
            if (p2Fn || p2Ln || p2Email || p2Phone) {
              await pool.query(
                `INSERT INTO player_contacts (player_id, relationship, first_name, last_name, email, phone, is_primary)
                 VALUES ($1, 'parent', $2, $3, $4, $5, false) ON CONFLICT DO NOTHING`,
                [playerId, p2Fn || null, p2Ln || null, p2Email || null, p2Phone || null]
              );
            }
          } catch (err) { results.errors.push(`Row ${i + 2}: ${err.message}`); }
        }
        break;
      }

      // ── Staff ──
      case 'staff': {
        const nameCol = findCol(headers, 'name', 'staff_name', 'coach');
        if (!nameCol) return res.status(400).json({ error: 'CSV must have a "name" column' });
        const emailCol = findCol(headers, 'email');
        const phoneCol = findCol(headers, 'phone');
        const teamCol = findCol(headers, 'team', 'team_name', 'teams');
        const roleCol = findCol(headers, 'role', 'roles', 'position');

        const VALID_ROLES = ['head_coach', 'assistant_coach', 'scorekeeper', 'org_admin'];
        const teamLookup = await buildTeamLookup();

        const { rows: existing } = await pool.query('SELECT id, name FROM staff_members');
        const staffLookup = {};
        for (const s of existing) staffLookup[s.name.toLowerCase()] = s.id;

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const name = r[nameCol];
          if (!name) { results.skipped++; continue; }

          try {
            const exId = staffLookup[name.toLowerCase()];
            if (exId && mode !== 'create_only') {
              await pool.query(
                `UPDATE staff_members SET email = COALESCE(NULLIF($1,''), email), phone = COALESCE(NULLIF($2,''), phone) WHERE id = $3`,
                [emailCol ? r[emailCol] : '', phoneCol ? r[phoneCol] : '', exId]
              );
              results.updated++;
            } else if (!exId) {
              const { rows: nr } = await pool.query(
                'INSERT INTO staff_members (name, email, phone) VALUES ($1, $2, $3) RETURNING id',
                [name, (emailCol ? r[emailCol] : null) || null, (phoneCol ? r[phoneCol] : null) || null]
              );
              staffLookup[name.toLowerCase()] = nr[0].id;
              results.created++;
            } else { results.skipped++; continue; }

            // Assign to teams
            const staffId = exId || staffLookup[name.toLowerCase()];
            if (teamCol && r[teamCol]) {
              const teamNames = r[teamCol].split(/[;|]/).map(s => s.trim()).filter(Boolean);
              const roles = roleCol && r[roleCol] ? r[roleCol].split(/[;|]/).map(s => s.trim()) : [];
              for (let j = 0; j < teamNames.length; j++) {
                const tid = teamLookup[teamNames[j].toLowerCase()];
                const role = (roles[j] || 'assistant_coach').toLowerCase().replace(/ /g, '_');
                const validRole = VALID_ROLES.includes(role) ? role : 'assistant_coach';
                if (tid) {
                  await pool.query(
                    'INSERT INTO team_staff_assignments (team_id, staff_id, role) VALUES ($1, $2, $3) ON CONFLICT (team_id, staff_id) DO UPDATE SET role = $3',
                    [tid, staffId, validRole]
                  );
                } else {
                  results.errors.push(`Row ${i + 2}: team "${teamNames[j]}" not found`);
                }
              }
            }
          } catch (err) { results.errors.push(`Row ${i + 2}: ${err.message}`); }
        }
        break;
      }

      // ── Games ──
      case 'games': {
        const dateCol = findCol(headers, 'game_date', 'date');
        if (!dateCol) return res.status(400).json({ error: 'CSV must have a "game_date" column' });
        const timeCol = findCol(headers, 'game_time', 'time');
        const homeCol = findCol(headers, 'home_team', 'home');
        const awayCol = findCol(headers, 'away_team', 'away');
        const locCol = findCol(headers, 'location', 'field', 'field_name');
        const seasonCol = findCol(headers, 'season', 'season_name');
        const statusCol = findCol(headers, 'status');
        const hsCol = findCol(headers, 'home_score');
        const asCol = findCol(headers, 'away_score');
        const innCol = findCol(headers, 'innings_played', 'innings');
        const notesCol = findCol(headers, 'notes');

        const teamLookup = await buildTeamLookup();

        const { rows: allLocs } = await pool.query('SELECT id, name FROM field_locations');
        const locLookup = {};
        for (const l of allLocs) locLookup[l.name.toLowerCase()] = l.id;

        const { rows: allSeasons } = await pool.query('SELECT id, name FROM league_seasons');
        const seasonLookup = {};
        for (const s of allSeasons) seasonLookup[s.name.toLowerCase()] = s.id;

        const VALID_STATUS = ['scheduled', 'in_progress', 'completed', 'cancelled', 'postponed'];

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const gameDate = r[dateCol];
          if (!gameDate) { results.skipped++; continue; }

          const homeTeamId = homeCol && r[homeCol] ? (teamLookup[r[homeCol].toLowerCase()] || null) : null;
          const awayTeamId = awayCol && r[awayCol] ? (teamLookup[r[awayCol].toLowerCase()] || null) : null;
          if (homeCol && r[homeCol] && !homeTeamId) results.errors.push(`Row ${i + 2}: home team "${r[homeCol]}" not found`);
          if (awayCol && r[awayCol] && !awayTeamId) results.errors.push(`Row ${i + 2}: away team "${r[awayCol]}" not found`);

          const locationId = locCol && r[locCol] ? (locLookup[r[locCol].toLowerCase()] || null) : null;
          const seasonId = seasonCol && r[seasonCol] ? (seasonLookup[r[seasonCol].toLowerCase()] || null) : (season_id || null);
          const status = statusCol && r[statusCol] && VALID_STATUS.includes(r[statusCol].toLowerCase()) ? r[statusCol].toLowerCase() : 'scheduled';
          const homeScore = hsCol && r[hsCol] !== '' ? parseInt(r[hsCol]) || null : null;
          const awayScore = asCol && r[asCol] !== '' ? parseInt(r[asCol]) || null : null;
          const innings = innCol && r[innCol] !== '' ? parseInt(r[innCol]) || null : null;
          const notes = notesCol ? r[notesCol] || null : null;
          const gameTime = timeCol ? r[timeCol] || null : null;

          try {
            // Games are always created (no natural key for matching)
            await pool.query(
              `INSERT INTO games (game_date, game_time, home_team_id, away_team_id, location_id, season_id, status, home_score, away_score, innings_played, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
              [gameDate, gameTime, homeTeamId, awayTeamId, locationId, seasonId, status, homeScore, awayScore, innings, notes]
            );
            results.created++;
          } catch (err) { results.errors.push(`Row ${i + 2}: ${err.message}`); }
        }
        break;
      }

      // ── Seasons ──
      case 'seasons': {
        const nameCol = findCol(headers, 'name', 'season_name', 'season');
        const yearCol = findCol(headers, 'year');
        if (!nameCol || !yearCol) return res.status(400).json({ error: 'CSV must have "name" and "year" columns' });
        const activeCol = findCol(headers, 'is_active', 'active');
        const sortCol = findCol(headers, 'sort_order', 'sort');

        const { rows: existing } = await pool.query('SELECT id, name, year FROM league_seasons');
        const lookup = {};
        for (const s of existing) lookup[(s.name + '|' + s.year).toLowerCase()] = s.id;

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const name = r[nameCol], year = r[yearCol];
          if (!name || !year) { results.skipped++; continue; }

          try {
            const key = (name + '|' + year).toLowerCase();
            const exId = lookup[key];
            const isActive = activeCol ? ['true', '1', 'yes'].includes((r[activeCol] || '').toLowerCase()) : false;
            const sortOrder = sortCol ? parseInt(r[sortCol]) || 0 : 0;

            if (exId && mode !== 'create_only') {
              await pool.query('UPDATE league_seasons SET is_active = $1, sort_order = $2 WHERE id = $3', [isActive, sortOrder, exId]);
              results.updated++;
            } else if (!exId) {
              const { rows: nr } = await pool.query(
                'INSERT INTO league_seasons (name, year, is_active, sort_order) VALUES ($1,$2,$3,$4) RETURNING id',
                [name, parseInt(year), isActive, sortOrder]
              );
              lookup[key] = nr[0].id;
              results.created++;
            } else { results.skipped++; }
          } catch (err) { results.errors.push(`Row ${i + 2}: ${err.message}`); }
        }
        break;
      }

      // ── Divisions ──
      case 'divisions': {
        const pathCol = findCol(headers, 'division_path', 'path', 'division', 'name');
        if (!pathCol) return res.status(400).json({ error: 'CSV must have a "division_path" column' });
        const seasonCol = findCol(headers, 'season', 'season_name');
        const yearCol = findCol(headers, 'season_year', 'year');
        const sortCol = findCol(headers, 'sort_order', 'sort');

        // Resolve season
        const { rows: allSeasons } = await pool.query('SELECT id, name, year FROM league_seasons');
        const seasonLookup = {};
        for (const s of allSeasons) {
          seasonLookup[s.name.toLowerCase()] = s.id;
          seasonLookup[(s.name + '|' + s.year).toLowerCase()] = s.id;
        }

        // Load existing divisions indexed by path+season
        const { rows: existingDivs } = await pool.query(
          `WITH RECURSIVE tree AS (
            SELECT id, name, parent_id, season_id, name::text AS path
            FROM league_divisions WHERE parent_id IS NULL
            UNION ALL
            SELECT d.id, d.name, d.parent_id, d.season_id, (tree.path || ' / ' || d.name)::text
            FROM league_divisions d JOIN tree ON tree.id = d.parent_id
          ) SELECT id, path, season_id FROM tree`
        );
        const divLookup = {};
        for (const d of existingDivs) divLookup[(d.path + '|' + d.season_id).toLowerCase()] = d.id;

        // Also index by just name for parent lookup
        const divByName = {};
        for (const d of existingDivs) divByName[(d.path + '|' + d.season_id).toLowerCase()] = d.id;

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const fullPath = r[pathCol];
          if (!fullPath) { results.skipped++; continue; }

          const seasonName = seasonCol ? r[seasonCol] : '';
          const seasonYear = yearCol ? r[yearCol] : '';
          let sid = season_id || null;
          if (seasonName) {
            const skey = seasonYear ? (seasonName + '|' + seasonYear).toLowerCase() : seasonName.toLowerCase();
            sid = seasonLookup[skey] || sid;
          }

          const sortOrder = sortCol ? parseInt(r[sortCol]) || 0 : 0;
          const parts = fullPath.split('/').map(s => s.trim()).filter(Boolean);

          try {
            let parentId = null;
            let currentPath = '';
            // Create each level in the path if needed
            for (const part of parts) {
              currentPath = currentPath ? currentPath + ' / ' + part : part;
              const key = (currentPath + '|' + sid).toLowerCase();
              if (divLookup[key]) {
                parentId = divLookup[key];
              } else {
                const { rows: nr } = await pool.query(
                  'INSERT INTO league_divisions (name, parent_id, season_id, sort_order) VALUES ($1,$2,$3,$4) RETURNING id',
                  [part, parentId, sid, sortOrder]
                );
                divLookup[key] = nr[0].id;
                parentId = nr[0].id;
                results.created++;
              }
            }
            // If we only traversed existing nodes, count as skipped
            if (parts.length > 0 && divLookup[(fullPath + '|' + sid).toLowerCase()] && results.created === 0) {
              results.skipped++;
            }
          } catch (err) { results.errors.push(`Row ${i + 2}: ${err.message}`); }
        }
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown entity: ${entity}` });
    }

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
