const express = require('express');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 } });

// Helper: attach divisions array to each team row
async function attachDivisions(teams) {
  if (!teams.length) return teams;
  const teamIds = teams.map(t => t.id);
  const { rows: divRows } = await pool.query(
    `SELECT td.team_id, ld.id, ld.name FROM team_divisions td
     JOIN league_divisions ld ON ld.id = td.division_id
     WHERE td.team_id = ANY($1)
     ORDER BY ld.sort_order, ld.name`, [teamIds]
  );
  const divMap = {};
  for (const r of divRows) {
    if (!divMap[r.team_id]) divMap[r.team_id] = [];
    divMap[r.team_id].push({ id: r.id, name: r.name });
  }
  return teams.map(t => ({ ...t, divisions: divMap[t.id] || [] }));
}

// Helper: sync team_divisions junction table
async function syncDivisions(teamId, divisionIds, client) {
  const q = client || pool;
  await q.query('DELETE FROM team_divisions WHERE team_id = $1', [teamId]);
  if (divisionIds && divisionIds.length) {
    const values = divisionIds.map((dId, i) => `($1, $${i + 2})`).join(', ');
    await q.query(
      `INSERT INTO team_divisions (team_id, division_id) VALUES ${values} ON CONFLICT DO NOTHING`,
      [teamId, ...divisionIds]
    );
  }
}

router.get('/', async (req, res) => {
  try {
    const { org_id } = req.query;
    let result;
    if (org_id) {
      result = await pool.query(
        `SELECT t.*, o.name as org_name, o.logo_url as org_logo_url FROM teams t
         LEFT JOIN organizations o ON o.id = t.org_id
         WHERE t.org_id = $1 ORDER BY t.name`, [org_id]
      );
    } else {
      result = await pool.query(
        `SELECT t.*, o.name as org_name, o.logo_url as org_logo_url FROM teams t
         LEFT JOIN organizations o ON o.id = t.org_id
         ORDER BY o.name, t.name`
      );
    }
    const teams = await attachDivisions(result.rows);
    res.json(teams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, age_group, level, division, division_ids, org_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Team name is required' });

    const { rows } = await pool.query(
      'INSERT INTO teams (name, age_group, level, division, org_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, age_group || null, level || null, division || null, org_id || null]
    );
    const teamId = rows[0].id;
    if (division_ids && division_ids.length) {
      await syncDivisions(teamId, division_ids);
    }
    const result = await pool.query(
      `SELECT t.*, o.name as org_name, o.logo_url as org_logo_url FROM teams t
       LEFT JOIN organizations o ON o.id = t.org_id WHERE t.id = $1`, [teamId]
    );
    const teams = await attachDivisions(result.rows);
    res.status(201).json(teams[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, age_group, level, division, division_ids, org_id } = req.body;
    const { id } = req.params;
    if (!name) return res.status(400).json({ error: 'Team name is required' });

    const { rows: existing } = await pool.query('SELECT id FROM teams WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Team not found' });

    await pool.query(
      'UPDATE teams SET name = $1, age_group = $2, level = $3, division = $4, org_id = $5 WHERE id = $6',
      [name, age_group || null, level || null, division || null, org_id ?? null, id]
    );
    if (division_ids !== undefined) {
      await syncDivisions(id, division_ids || []);
    }
    const result = await pool.query(
      `SELECT t.*, o.name as org_name, o.logo_url as org_logo_url FROM teams t
       LEFT JOIN organizations o ON o.id = t.org_id WHERE t.id = $1`, [id]
    );
    const teams = await attachDivisions(result.rows);
    res.json(teams[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id FROM teams WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Team not found' });

    await pool.query('DELETE FROM teams WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload team logo
router.post('/:id/logo', authMiddleware, requireAdmin, upload.single('logo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id FROM teams WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Team not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const mime = req.file.mimetype;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(mime)) {
      return res.status(400).json({ error: 'File must be an image (PNG, JPEG, GIF, WebP, SVG)' });
    }
    const dataUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
    await pool.query('UPDATE teams SET logo_url = $1 WHERE id = $2', [dataUrl, id]);
    res.json({ logo_url: dataUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove team logo
router.delete('/:id/logo', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id FROM teams WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Team not found' });

    await pool.query('UPDATE teams SET logo_url = NULL WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── CSV Import ──

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

// POST /teams/import  — bulk CSV import
// Expected columns: team_name (required), org_name, age_group, level, division (comma-sep or single)
router.post('/import', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { csv, season_id, mode } = req.body;
    if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'csv field is required (string)' });

    const { headers, rows } = parseCSV(csv);
    if (!rows.length) return res.status(400).json({ error: 'CSV has no data rows' });

    const nameCol = headers.find(h => ['team_name', 'name', 'team'].includes(h));
    if (!nameCol) return res.status(400).json({ error: 'CSV must have a "team_name" or "name" column' });

    const orgCol = headers.find(h => ['org_name', 'organization', 'org'].includes(h));
    const ageCol = headers.find(h => ['age_group', 'age', 'agegroup'].includes(h));
    const lvlCol = headers.find(h => ['level', 'lvl'].includes(h));
    const divCol = headers.find(h => ['division', 'divisions', 'div'].includes(h));

    // Pre-load orgs and divisions for name matching
    const { rows: allOrgs } = await pool.query('SELECT id, name FROM organizations');
    const orgLookup = {};
    for (const o of allOrgs) orgLookup[o.name.toLowerCase().trim()] = o.id;

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
        divLookup[d.name.toLowerCase().trim()] = d.id;
        divLookup[d.path.toLowerCase().trim()] = d.id;
      }
    }

    // Pre-load existing teams for update matching
    const { rows: existingTeams } = await pool.query('SELECT id, name, org_id FROM teams');
    const existingMap = {};
    for (const t of existingTeams) {
      existingMap[t.name.toLowerCase().trim()] = t;
    }

    const results = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const teamName = row[nameCol]?.trim();
      if (!teamName) { results.skipped++; continue; }

      const orgName = orgCol ? row[orgCol]?.trim() : '';
      const ageGroup = ageCol ? row[ageCol]?.trim() : '';
      const level = lvlCol ? row[lvlCol]?.trim() : '';
      const divText = divCol ? row[divCol]?.trim() : '';

      const orgId = orgName ? (orgLookup[orgName.toLowerCase()] || null) : null;

      // Resolve division names to IDs
      const divisionIds = [];
      if (divText && season_id) {
        const divNames = divText.split(/[;|]/).map(s => s.trim()).filter(Boolean);
        for (const dn of divNames) {
          const did = divLookup[dn.toLowerCase()];
          if (did) divisionIds.push(did);
          else results.errors.push(`Row ${i + 2}: division "${dn}" not found`);
        }
      }

      try {
        const existing = existingMap[teamName.toLowerCase()];
        if (existing && mode !== 'create_only') {
          // Update existing team
          await pool.query(
            'UPDATE teams SET age_group = COALESCE(NULLIF($1, \'\'), age_group), level = COALESCE(NULLIF($2, \'\'), level), org_id = COALESCE($3, org_id) WHERE id = $4',
            [ageGroup, level, orgId, existing.id]
          );
          if (divisionIds.length) await syncDivisions(existing.id, divisionIds);
          results.updated++;
        } else if (!existing) {
          // Create new team
          const { rows: newRows } = await pool.query(
            'INSERT INTO teams (name, age_group, level, org_id) VALUES ($1, $2, $3, $4) RETURNING id',
            [teamName, ageGroup || null, level || null, orgId]
          );
          if (divisionIds.length) await syncDivisions(newRows[0].id, divisionIds);
          existingMap[teamName.toLowerCase()] = { id: newRows[0].id, name: teamName };
          results.created++;
        } else {
          results.skipped++;
        }
      } catch (err) {
        results.errors.push(`Row ${i + 2}: ${err.message}`);
      }
    }

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /teams/export — download CSV of all teams
router.get('/export', async (req, res) => {
  try {
    const { rows: teams } = await pool.query(
      `SELECT t.name AS team_name, o.name AS org_name, t.age_group, t.level
       FROM teams t LEFT JOIN organizations o ON o.id = t.org_id
       ORDER BY o.name, t.name`
    );
    // Attach divisions
    const { rows: divRows } = await pool.query(
      `SELECT td.team_id, ld.name FROM team_divisions td
       JOIN league_divisions ld ON ld.id = td.division_id
       JOIN teams t ON t.id = td.team_id
       ORDER BY td.team_id, ld.sort_order, ld.name`
    );
    const divMap = {};
    for (const r of divRows) {
      if (!divMap[r.team_id]) divMap[r.team_id] = [];
      divMap[r.team_id].push(r.name);
    }

    // Get team IDs in order
    const { rows: teamIds } = await pool.query(
      'SELECT id, name FROM teams ORDER BY name'
    );
    const teamIdMap = {};
    for (const t of teamIds) teamIdMap[t.name] = t.id;

    const csvLines = ['team_name,org_name,age_group,level,division'];
    for (const t of teams) {
      const tid = teamIdMap[t.team_name];
      const divs = divMap[tid] ? divMap[tid].join('; ') : '';
      csvLines.push([t.team_name, t.org_name || '', t.age_group || '', t.level || '', divs].map(v => `"${v.replace(/"/g, '""')}"`).join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=teams.csv');
    res.send(csvLines.join('\n'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
