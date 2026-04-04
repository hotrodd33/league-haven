const express = require('express');
const { pool } = require('../db');
const { authMiddleware, canEditOrg } = require('../auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { org_id } = req.query;
    let result;
    if (org_id) {
      result = await pool.query('SELECT * FROM field_locations WHERE org_id = $1 ORDER BY name', [org_id]);
    } else {
      result = await pool.query(
        `SELECT fl.*, o.name as org_name FROM field_locations fl
         LEFT JOIN organizations o ON o.id = fl.org_id
         ORDER BY o.name, fl.name`
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM field_locations WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Location not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { org_id, name, address, city, state, zip, latitude, longitude, comments } = req.body;
    if (!org_id || !name) return res.status(400).json({ error: 'org_id and name are required' });
    if (!(await canEditOrg(req.user, org_id))) return res.status(403).json({ error: 'No permission for this organization' });

    const { rows: orgCheck } = await pool.query('SELECT id FROM organizations WHERE id = $1', [org_id]);
    if (!orgCheck.length) return res.status(400).json({ error: 'Organization not found' });

    const { rows } = await pool.query(
      `INSERT INTO field_locations (org_id, name, address, city, state, zip, latitude, longitude, comments)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [org_id, name, address || null, city || null, state || null, zip || null, latitude || null, longitude || null, comments || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query('SELECT * FROM field_locations WHERE id = $1', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Location not found' });
    const old = existing[0];
    if (!(await canEditOrg(req.user, old.org_id))) return res.status(403).json({ error: 'No permission for this organization' });

    const { name, address, city, state, zip, latitude, longitude, comments } = req.body;

    const { rows } = await pool.query(
      `UPDATE field_locations SET name = $1, address = $2, city = $3, state = $4, zip = $5,
       latitude = $6, longitude = $7, comments = $8 WHERE id = $9 RETURNING *`,
      [
        name ?? old.name, address ?? old.address, city ?? old.city,
        state ?? old.state, zip ?? old.zip, latitude ?? old.latitude,
        longitude ?? old.longitude, comments ?? old.comments, id
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id, org_id FROM field_locations WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Location not found' });
    if (!(await canEditOrg(req.user, rows[0].org_id))) return res.status(403).json({ error: 'No permission for this organization' });

    await pool.query('DELETE FROM field_locations WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
