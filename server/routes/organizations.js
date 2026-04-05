const express = require('express');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, requireAdmin, canEditOrg } = require('../auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 } });

async function enrich(org) {
  if (!org) return null;
  const { rows: locations } = await pool.query('SELECT * FROM field_locations WHERE org_id = $1 ORDER BY name', [org.id]);
  const { rows: teams } = await pool.query('SELECT * FROM teams WHERE org_id = $1 ORDER BY name', [org.id]);
  return { ...org, locations, teams, team_count: teams.length };
}

router.get('/', async (req, res) => {
  try {
    const { rows: orgs } = await pool.query('SELECT * FROM organizations ORDER BY name');
    const enriched = await Promise.all(orgs.map(enrich));
    res.json(enriched);
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
    const { name, contact_name, contact_email, contact_phone, address, city, state, zip, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Organization name is required' });

    const { rows } = await pool.query(
      `INSERT INTO organizations (name, contact_name, contact_email, contact_phone, address, city, state, zip, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, contact_name || null, contact_email || null, contact_phone || null, address || null, city || null, state || null, zip || null, notes || null]
    );
    res.status(201).json(await enrich(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await canEditOrg(req.user, id))) return res.status(403).json({ error: 'No permission for this organization' });
    const { rows: existing } = await pool.query('SELECT * FROM organizations WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Organization not found' });
    const old = existing[0];

    const { name, contact_name, contact_email, contact_phone, address, city, state, zip, notes } = req.body;

    const { rows } = await pool.query(
      `UPDATE organizations SET name = $1, contact_name = $2, contact_email = $3, contact_phone = $4,
       address = $5, city = $6, state = $7, zip = $8, notes = $9 WHERE id = $10 RETURNING *`,
      [
        name ?? old.name, contact_name ?? old.contact_name, contact_email ?? old.contact_email,
        contact_phone ?? old.contact_phone, address ?? old.address, city ?? old.city,
        state ?? old.state, zip ?? old.zip, notes ?? old.notes, id
      ]
    );
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
