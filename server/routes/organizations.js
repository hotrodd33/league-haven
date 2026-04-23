const express = require('express');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, requireAdmin, canEditOrg } = require('../auth');
const cache = require('../cache');

const DIRECTORY_TTL = 120_000; // 120s
const ORGS_TTL = 60_000; // 60s
const ORGS_CACHE_KEY = 'orgs:all';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 } });

function computeTeamFields(t) {
  t.long_name = t.team_city
    ? [t.team_city, t.team_mascot, t.team_color, t.age_group, t.level].filter(Boolean).join(' ')
    : t.name;
  if (t.team_city) {
    const words = t.team_city.trim().split(/\s+/);
    t.city_abbr = (words.length > 1 ? words.map(w => w[0]).join('') : t.team_city.substring(0, 3)).toUpperCase();
  } else {
    t.city_abbr = (t.name || '?')[0];
  }
}

async function enrich(org) {
  if (!org) return null;
  const { rows: locations } = await pool.query('SELECT * FROM field_locations WHERE org_id = $1 ORDER BY name', [org.id]);
  const { rows: teams } = await pool.query(
    `SELECT t.*, ag.sort_order AS age_group_sort_order, ll.sort_order AS level_sort_order
     FROM teams t
     LEFT JOIN league_age_groups ag ON LOWER(TRIM(ag.name)) = LOWER(TRIM(t.age_group))
     LEFT JOIN league_levels ll ON LOWER(TRIM(ll.name)) = LOWER(TRIM(t.level))
     WHERE t.org_id = $1
     ORDER BY COALESCE(ag.sort_order, 2147483647), LOWER(COALESCE(t.age_group, '')), COALESCE(ll.sort_order, 2147483647), LOWER(COALESCE(t.level, '')), t.name`,
    [org.id]
  );
  for (const t of teams) computeTeamFields(t);
  return { ...org, locations, teams, team_count: teams.length };
}

router.get('/', async (req, res) => {
  try {
    const cached = cache.get(ORGS_CACHE_KEY);
    if (cached) return res.json(cached);

    const [{ rows: orgs }, { rows: allTeams }, { rows: allLocations }] = await Promise.all([
      pool.query('SELECT * FROM organizations ORDER BY name'),
      pool.query(
        `SELECT t.*, ag.sort_order AS age_group_sort_order, ll.sort_order AS level_sort_order
         FROM teams t
         LEFT JOIN league_age_groups ag ON LOWER(TRIM(ag.name)) = LOWER(TRIM(t.age_group))
         LEFT JOIN league_levels ll ON LOWER(TRIM(ll.name)) = LOWER(TRIM(t.level))
         ORDER BY COALESCE(ag.sort_order, 2147483647), LOWER(COALESCE(t.age_group, '')), COALESCE(ll.sort_order, 2147483647), LOWER(COALESCE(t.level, '')), t.name`
      ),
      pool.query('SELECT * FROM field_locations ORDER BY org_id, name'),
    ]);

    for (const t of allTeams) computeTeamFields(t);

    const teamsByOrg = {};
    for (const t of allTeams) {
      if (!teamsByOrg[t.org_id]) teamsByOrg[t.org_id] = [];
      teamsByOrg[t.org_id].push(t);
    }
    const locationsByOrg = {};
    for (const l of allLocations) {
      if (!locationsByOrg[l.org_id]) locationsByOrg[l.org_id] = [];
      locationsByOrg[l.org_id].push(l);
    }

    const result = orgs.map(o => {
      const teams = teamsByOrg[o.id] || [];
      return { ...o, locations: locationsByOrg[o.id] || [], teams, team_count: teams.length };
    });

    cache.set(ORGS_CACHE_KEY, result, ORGS_TTL);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /directory — orgs with teams and staff contacts (public, read-only)
router.get('/directory', async (req, res) => {
  try {
    const cached = cache.get('directory');
    if (cached) return res.json(cached);
    const { rows: orgs } = await pool.query('SELECT * FROM organizations ORDER BY name');
    const { rows: teams } = await pool.query(
      `SELECT t.*, o.name AS org_name, o.logo_url AS org_logo
      , ag.sort_order AS age_group_sort_order, ll.sort_order AS level_sort_order
       FROM teams t LEFT JOIN organizations o ON o.id = t.org_id
       LEFT JOIN league_age_groups ag ON LOWER(TRIM(ag.name)) = LOWER(TRIM(t.age_group))
       LEFT JOIN league_levels ll ON LOWER(TRIM(ll.name)) = LOWER(TRIM(t.level))
       ORDER BY o.name, COALESCE(ag.sort_order, 2147483647), LOWER(COALESCE(t.age_group, '')), COALESCE(ll.sort_order, 2147483647), LOWER(COALESCE(t.level, '')), t.name`
    );
    const teamIds = teams.map(t => t.id);
    let staffRows = [];
    if (teamIds.length > 0) {
      const { rows } = await pool.query(
        `SELECT tsa.team_id, tsa.role, sm.name, sm.email, sm.phone
         FROM team_staff_assignments tsa
         JOIN staff_members sm ON sm.id = tsa.staff_id
         WHERE tsa.team_id = ANY($1)
         ORDER BY tsa.role, sm.name`, [teamIds]
      );
      staffRows = rows;
    }
    // Group staff by team
    const staffByTeam = {};
    for (const s of staffRows) {
      if (!staffByTeam[s.team_id]) staffByTeam[s.team_id] = [];
      staffByTeam[s.team_id].push(s);
    }
    // Group teams by org
    const teamsByOrg = {};
    for (const t of teams) {
      computeTeamFields(t);
      if (!teamsByOrg[t.org_id]) teamsByOrg[t.org_id] = [];
      teamsByOrg[t.org_id].push({ ...t, staff: staffByTeam[t.id] || [] });
    }
    const result = orgs.map(o => ({
      ...o,
      teams: teamsByOrg[o.id] || [],
    }));
    cache.set('directory', result, DIRECTORY_TTL);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM organizations WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Organization not found' });
    res.json(await enrich(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, contact_name, contact_email, contact_phone, address, city, state, zip, officials_enabled, notes, latitude, longitude } = req.body;
    if (!name) return res.status(400).json({ error: 'Organization name is required' });

    const { rows } = await pool.query(
      `INSERT INTO organizations (name, contact_name, contact_email, contact_phone, address, city, state, zip, officials_enabled, notes, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [name, contact_name || null, contact_email || null, contact_phone || null, address || null, city || null, state || null, zip || null, !!officials_enabled, notes || null, latitude ?? null, longitude ?? null]
    );
    cache.del('directory');
    cache.del(ORGS_CACHE_KEY);
    res.status(201).json(await enrich(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /organizations/:id/admin-users endpoint removed — no longer needed

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await canEditOrg(req.user, id))) return res.status(403).json({ error: 'No permission for this organization' });
    const { rows: existing } = await pool.query('SELECT * FROM organizations WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Organization not found' });
    const old = existing[0];

    const { name, contact_name, contact_email, contact_phone, address, city, state, zip, officials_enabled, notes, latitude, longitude, scheduling_contact_is_org_contact } = req.body;

    const { rows } = await pool.query(
      `UPDATE organizations SET name = $1, contact_name = $2, contact_email = $3, contact_phone = $4,
       address = $5, city = $6, state = $7, zip = $8, officials_enabled = $9, notes = $10,
       latitude = $11, longitude = $12, scheduling_contact_is_org_contact = $13 WHERE id = $14 RETURNING *`,
      [
        name ?? old.name, contact_name ?? old.contact_name, contact_email ?? old.contact_email,
        contact_phone ?? old.contact_phone, address ?? old.address, city ?? old.city,
        state ?? old.state, zip ?? old.zip,
        officials_enabled === undefined ? old.officials_enabled : !!officials_enabled,
        notes ?? old.notes,
        latitude !== undefined ? latitude : old.latitude,
        longitude !== undefined ? longitude : old.longitude,
        scheduling_contact_is_org_contact === undefined ? old.scheduling_contact_is_org_contact : !!scheduling_contact_is_org_contact,
        id
      ]
    );
    cache.del('directory');
    cache.del(ORGS_CACHE_KEY);
    res.json(await enrich(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id FROM organizations WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Organization not found' });

    await pool.query('DELETE FROM organizations WHERE id = $1', [id]);
    cache.del('directory');
    cache.del(ORGS_CACHE_KEY);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload org logo
router.post('/:id/logo', authMiddleware, upload.single('logo'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await canEditOrg(req.user, id))) return res.status(403).json({ error: 'No permission for this organization' });
    const { rows } = await pool.query('SELECT id FROM organizations WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Organization not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const mime = req.file.mimetype;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(mime)) {
      return res.status(400).json({ error: 'File must be an image (PNG, JPEG, GIF, WebP, SVG)' });
    }
    const dataUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
    await pool.query('UPDATE organizations SET logo_url = $1 WHERE id = $2', [dataUrl, id]);
    cache.del('directory');
    cache.del(ORGS_CACHE_KEY);
    res.json({ logo_url: dataUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove org logo
router.delete('/:id/logo', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await canEditOrg(req.user, id))) return res.status(403).json({ error: 'No permission for this organization' });
    const { rows } = await pool.query('SELECT id FROM organizations WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Organization not found' });

    await pool.query('UPDATE organizations SET logo_url = NULL WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
