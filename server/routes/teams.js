const express = require('express');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 } });

// ── Name builders ──
function buildShortName(city, color, ageGroup, level) {
  return [city, color, ageGroup, level].filter(Boolean).join(' ');
}

function buildLongName(city, color, mascot, ageGroup, level) {
  return [city, color, mascot, ageGroup, level].filter(Boolean).join(' ');
}

function buildAbbreviation(city, color, ageGroup, level) {
  let abbr = '';
  if (city) {
    const words = city.trim().split(/\s+/);
    abbr = words.length > 1 ? words.map(w => w[0].toUpperCase()).join('') : city.substring(0, 3).toUpperCase();
  }
  if (color) abbr += color[0].toUpperCase();
  const suffix = [ageGroup, level].filter(Boolean).join(' ');
  return suffix ? `${abbr} ${suffix}` : abbr;
}

function addComputedNames(team) {
  if (team.team_city) {
    team.long_name = buildLongName(team.team_city, team.team_color, team.team_mascot, team.age_group, team.level);
    team.abbreviation = buildAbbreviation(team.team_city, team.team_color, team.age_group, team.level);
  } else {
    team.long_name = team.name;
    team.abbreviation = team.name;
  }
  return team;
}

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
    res.json(teams.map(addComputedNames));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { team_city, team_color, team_mascot, age_group, level, division, division_ids, org_id } = req.body;
    const name = buildShortName(team_city, team_color, age_group, level) || req.body.name;
    if (!name) return res.status(400).json({ error: 'Team city is required' });

    const { rows } = await pool.query(
      'INSERT INTO teams (name, team_city, team_color, team_mascot, age_group, level, division, org_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [name, team_city || null, team_color || null, team_mascot || null, age_group || null, level || null, division || null, org_id || null]
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
    res.status(201).json(addComputedNames(teams[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { team_city, team_color, team_mascot, age_group, level, division, division_ids, org_id } = req.body;
    const { id } = req.params;
    const name = buildShortName(team_city, team_color, age_group, level) || req.body.name;
    if (!name) return res.status(400).json({ error: 'Team city is required' });

    const { rows: existing } = await pool.query('SELECT id FROM teams WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Team not found' });

    await pool.query(
      'UPDATE teams SET name = $1, team_city = $2, team_color = $3, team_mascot = $4, age_group = $5, level = $6, division = $7, org_id = $8 WHERE id = $9',
      [name, team_city || null, team_color || null, team_mascot || null, age_group || null, level || null, division || null, org_id ?? null, id]
    );
    if (division_ids !== undefined) {
      await syncDivisions(id, division_ids || []);
    }
    const result = await pool.query(
      `SELECT t.*, o.name as org_name, o.logo_url as org_logo_url FROM teams t
       LEFT JOIN organizations o ON o.id = t.org_id WHERE t.id = $1`, [id]
    );
    const teams = await attachDivisions(result.rows);
    res.json(addComputedNames(teams[0]));
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

module.exports = router;
