const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');

const router = express.Router();

// Haversine formula — returns distance in miles between two lat/lng points
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET / — return the full travel matrix for all orgs with lat/lng
router.get('/', async (req, res) => {
  try {
    const { rows: orgs } = await pool.query(
      `SELECT id, name FROM organizations ORDER BY name`
    );
    if (orgs.length === 0) {
      return res.json({ orgs: [], matrix: [], method: 'haversine' });
    }

    const orgIds = orgs.map((o) => o.id);
    const { rows: distRows } = await pool.query(
      `SELECT org_a_id, org_b_id, distance_miles::float, method
       FROM travel_distances
       WHERE org_a_id = ANY($1) AND org_b_id = ANY($1)`,
      [orgIds]
    );

    // Build lookup: key = "a-b" (a < b)
    const lookup = {};
    for (const r of distRows) {
      const key =
        r.org_a_id < r.org_b_id
          ? `${r.org_a_id}-${r.org_b_id}`
          : `${r.org_b_id}-${r.org_a_id}`;
      lookup[key] = { distance: r.distance_miles, method: r.method };
    }

    // Build NxN matrix in org order
    const n = orgs.length;
    const matrix = Array.from({ length: n }, () => Array(n).fill(null));
    let hasDrivingMethod = false;
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 0;
      for (let j = i + 1; j < n; j++) {
        const key = orgs[i].id < orgs[j].id
          ? `${orgs[i].id}-${orgs[j].id}`
          : `${orgs[j].id}-${orgs[i].id}`;
        const entry = lookup[key];
        if (entry) {
          matrix[i][j] = Math.round(entry.distance);
          matrix[j][i] = Math.round(entry.distance);
          if (entry.method === 'driving') {
            hasDrivingMethod = true;
          }
        }
      }
    }

    const method = hasDrivingMethod ? 'driving' : 'haversine';

    res.json({ orgs, matrix, method });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /recalculate — super_admin only, recompute all distances
router.post('/recalculate', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { rows: orgs } = await pool.query(
      `SELECT id, name, latitude, longitude FROM organizations WHERE latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY name`
    );

    if (orgs.length < 2) {
      return res.status(400).json({
        error: 'At least 2 organizations must have latitude/longitude set to calculate distances.',
      });
    }

    // Check if driving distance API is enabled
    const { rows: branding } = await pool.query(
      `SELECT driving_distance_enabled, driving_distance_api_key FROM app_branding WHERE id = 1`
    );
    const useDriving =
      branding[0]?.driving_distance_enabled && branding[0]?.driving_distance_api_key;

    const pairs = [];
    for (let i = 0; i < orgs.length; i++) {
      for (let j = i + 1; j < orgs.length; j++) {
        const a = orgs[i];
        const b = orgs[j];
        const dist = haversine(a.latitude, a.longitude, b.latitude, b.longitude);
        pairs.push({
          org_a_id: Math.min(a.id, b.id),
          org_b_id: Math.max(a.id, b.id),
          distance: Math.round(dist * 10) / 10,
          method: 'haversine',
        });
      }
    }

    // Upsert all pairs atomically in a single bulk query
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orgAIds = pairs.map((p) => p.org_a_id);
      const orgBIds = pairs.map((p) => p.org_b_id);
      const distances = pairs.map((p) => p.distance);
      const methods = pairs.map((p) => p.method);

      await client.query(
        `INSERT INTO travel_distances (org_a_id, org_b_id, distance_miles, method, calculated_at)
         SELECT org_a_id, org_b_id, distance_miles, method, NOW()
         FROM UNNEST($1::int[], $2::int[], $3::numeric[], $4::text[])
           AS t(org_a_id, org_b_id, distance_miles, method)
         ON CONFLICT (org_a_id, org_b_id) DO UPDATE
         SET distance_miles = EXCLUDED.distance_miles,
             method = EXCLUDED.method,
             calculated_at = NOW()`,
        [orgAIds, orgBIds, distances, methods]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      pairs_calculated: pairs.length,
      orgs_included: orgs.length,
      method: 'haversine',
      note: 'Distances are approximate straight-line (Haversine) calculations. Actual driving distance may be ~20% higher.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
