const express = require('express');
const { pool } = require('../db');
const { authMiddleware, canEditOrg } = require('../auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { org_id, age_group } = req.query;
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

    // Attach age_group_ids to each field
    const fieldIds = result.rows.map(r => r.id);
    let ageGroupMap = {};
    if (fieldIds.length > 0) {
      const agResult = await pool.query(
        `SELECT fag.field_id, fag.age_group_id, lag.name as age_group_name
         FROM field_age_groups fag
         JOIN league_age_groups lag ON lag.id = fag.age_group_id
         WHERE fag.field_id = ANY($1)`,
        [fieldIds]
      );
      for (const row of agResult.rows) {
        if (!ageGroupMap[row.field_id]) ageGroupMap[row.field_id] = [];
        ageGroupMap[row.field_id].push({ id: row.age_group_id, name: row.age_group_name });
      }
    }

    let rows = result.rows.map(r => ({
      ...r,
      age_groups: ageGroupMap[r.id] || [],
    }));

    // Filter by age group name if requested
    if (age_group) {
      rows = rows.filter(r => r.age_groups.length === 0 || r.age_groups.some(ag => ag.name === age_group));
    }

    res.json(rows);
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
    const { org_id, name, address, city, state, zip, latitude, longitude, comments, age_group_ids } = req.body;
    if (!org_id || !name) return res.status(400).json({ error: 'org_id and name are required' });
    if (!(await canEditOrg(req.user, org_id))) return res.status(403).json({ error: 'No permission for this organization' });

    const { rows: orgCheck } = await pool.query('SELECT id FROM organizations WHERE id = $1', [org_id]);
    if (!orgCheck.length) return res.status(400).json({ error: 'Organization not found' });

    const { rows } = await pool.query(
      `INSERT INTO field_locations (org_id, name, address, city, state, zip, latitude, longitude, comments)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [org_id, name, address || null, city || null, state || null, zip || null, latitude || null, longitude || null, comments || null]
    );
    const field = rows[0];

    // Save age group associations
    if (Array.isArray(age_group_ids) && age_group_ids.length > 0) {
      const values = age_group_ids.map((agId, i) => `($1, $${i + 2})`).join(', ');
      await pool.query(
        `INSERT INTO field_age_groups (field_id, age_group_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [field.id, ...age_group_ids.map(Number)]
      );
    }

    field.age_groups = [];
    if (Array.isArray(age_group_ids) && age_group_ids.length > 0) {
      const agResult = await pool.query(
        `SELECT fag.age_group_id as id, lag.name FROM field_age_groups fag
         JOIN league_age_groups lag ON lag.id = fag.age_group_id
         WHERE fag.field_id = $1`, [field.id]
      );
      field.age_groups = agResult.rows;
    }

    res.status(201).json(field);
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

    const { name, address, city, state, zip, latitude, longitude, comments, age_group_ids } = req.body;

    const { rows } = await pool.query(
      `UPDATE field_locations SET name = $1, address = $2, city = $3, state = $4, zip = $5,
       latitude = $6, longitude = $7, comments = $8 WHERE id = $9 RETURNING *`,
      [
        name ?? old.name, address ?? old.address, city ?? old.city,
        state ?? old.state, zip ?? old.zip, latitude ?? old.latitude,
        longitude ?? old.longitude, comments ?? old.comments, id
      ]
    );
    const field = rows[0];

    // Update age group associations if provided
    if (Array.isArray(age_group_ids)) {
      await pool.query('DELETE FROM field_age_groups WHERE field_id = $1', [id]);
      if (age_group_ids.length > 0) {
        const values = age_group_ids.map((agId, i) => `($1, $${i + 2})`).join(', ');
        await pool.query(
          `INSERT INTO field_age_groups (field_id, age_group_id) VALUES ${values} ON CONFLICT DO NOTHING`,
          [Number(id), ...age_group_ids.map(Number)]
        );
      }
    }

    // Return age groups
    const agResult = await pool.query(
      `SELECT fag.age_group_id as id, lag.name FROM field_age_groups fag
       JOIN league_age_groups lag ON lag.id = fag.age_group_id
       WHERE fag.field_id = $1`, [id]
    );
    field.age_groups = agResult.rows;

    res.json(field);
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
