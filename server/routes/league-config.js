const express = require('express');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 } });

async function getBranding() {
  const { rows } = await pool.query(
    `SELECT app_name, logo_url, game_start_time, game_end_time, game_time_increment_minutes
     FROM app_branding WHERE id = 1`
  );
  return rows[0] || { app_name: 'ZVBL', logo_url: null };
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h * 60) + m;
}

function formatTime(value) {
  if (!value) return null;
  const parts = String(value).split(':');
  return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
}

// ── App Branding ──

router.get('/branding', async (req, res) => {
  try {
    res.json(await getBranding());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/branding', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const appName = String(req.body?.app_name || '').trim();
    if (!appName) return res.status(400).json({ error: 'App name is required' });

    await pool.query(
      `UPDATE app_branding
       SET app_name = $1, updated_at = NOW()
       WHERE id = 1`,
      [appName.slice(0, 48)]
    );

    res.json(await getBranding());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/branding/logo', authMiddleware, requireAdmin, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const mime = req.file.mimetype;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(mime)) {
      return res.status(400).json({ error: 'File must be an image (PNG, JPEG, GIF, WebP, SVG)' });
    }

    const dataUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
    await pool.query(
      'UPDATE app_branding SET logo_url = $1, updated_at = NOW() WHERE id = 1',
      [dataUrl]
    );
    res.json({ logo_url: dataUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/branding/logo', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE app_branding SET logo_url = NULL, updated_at = NOW() WHERE id = 1');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Scheduling Settings ──

router.get('/schedule-settings', async (req, res) => {
  try {
    const branding = await getBranding();
    res.json({
      game_start_time: formatTime(branding.game_start_time) || '08:00',
      game_end_time: formatTime(branding.game_end_time) || '20:00',
      game_time_increment_minutes: Number(branding.game_time_increment_minutes) || 30,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/schedule-settings', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const start = String(req.body?.game_start_time || '').trim();
    const end = String(req.body?.game_end_time || '').trim();
    const increment = Number(req.body?.game_time_increment_minutes);

    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(start)) {
      return res.status(400).json({ error: 'Start time must be HH:MM (24-hour)' });
    }
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(end)) {
      return res.status(400).json({ error: 'End time must be HH:MM (24-hour)' });
    }
    if (!Number.isInteger(increment) || increment < 5 || increment > 120) {
      return res.status(400).json({ error: 'Increment must be between 5 and 120 minutes' });
    }
    if (toMinutes(start) >= toMinutes(end)) {
      return res.status(400).json({ error: 'End time must be later than start time' });
    }

    await pool.query(
      `UPDATE app_branding
       SET game_start_time = $1,
           game_end_time = $2,
           game_time_increment_minutes = $3,
           updated_at = NOW()
       WHERE id = 1`,
      [start, end, increment]
    );

    const branding = await getBranding();
    res.json({
      game_start_time: formatTime(branding.game_start_time),
      game_end_time: formatTime(branding.game_end_time),
      game_time_increment_minutes: Number(branding.game_time_increment_minutes),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Age Groups ──

router.get('/age-groups', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM league_age_groups ORDER BY sort_order, name');
    const canSeeFinancials = ['super_admin', 'accountant', 'org_admin'].includes(req.user.role);
    res.json(rows.map(r => {
      const result = { ...r, umpire_rate: r.umpire_rate != null ? Number(r.umpire_rate) : 50, league_fee: r.league_fee != null ? Number(r.league_fee) : null };
      if (!canSeeFinancials) {
        delete result.umpire_rate;
        delete result.league_fee;
      }
      return result;
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/age-groups', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order, umpire_rate, ump_required, league_fee } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const rate = umpire_rate != null && umpire_rate !== '' ? Number(umpire_rate) : 50;
    if (!Number.isFinite(rate) || rate < 0) return res.status(400).json({ error: 'Umpire rate must be a non-negative number' });
    const parsedLeagueFee = league_fee != null && league_fee !== '' ? Number(league_fee) : null;
    if (parsedLeagueFee != null && (!Number.isFinite(parsedLeagueFee) || parsedLeagueFee < 0)) return res.status(400).json({ error: 'League fee must be a non-negative number' });
    const { rows } = await pool.query(
      'INSERT INTO league_age_groups (name, sort_order, umpire_rate, ump_required, league_fee) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name.trim(), sort_order ?? 0, Math.round(rate * 100) / 100, ump_required !== false, parsedLeagueFee != null ? Math.round(parsedLeagueFee * 100) / 100 : null]
    );
    const r = rows[0];
    res.status(201).json({ ...r, umpire_rate: Number(r.umpire_rate), league_fee: r.league_fee != null ? Number(r.league_fee) : null });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Age group already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/age-groups/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order, umpire_rate, ump_required, league_fee } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const rate = umpire_rate != null && umpire_rate !== '' ? Number(umpire_rate) : 50;
    if (!Number.isFinite(rate) || rate < 0) return res.status(400).json({ error: 'Umpire rate must be a non-negative number' });
    const parsedLeagueFee = league_fee != null && league_fee !== '' ? Number(league_fee) : null;
    if (parsedLeagueFee != null && (!Number.isFinite(parsedLeagueFee) || parsedLeagueFee < 0)) return res.status(400).json({ error: 'League fee must be a non-negative number' });
    const { rows } = await pool.query(
      'UPDATE league_age_groups SET name = $1, sort_order = $2, umpire_rate = $3, ump_required = $4, league_fee = $5 WHERE id = $6 RETURNING *',
      [name.trim(), sort_order ?? 0, Math.round(rate * 100) / 100, ump_required !== false, parsedLeagueFee != null ? Math.round(parsedLeagueFee * 100) / 100 : null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const r = rows[0];
    res.json({ ...r, umpire_rate: Number(r.umpire_rate), league_fee: r.league_fee != null ? Number(r.league_fee) : null });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Age group already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/age-groups/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM league_age_groups WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Levels ──

router.get('/levels', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM league_levels ORDER BY sort_order, name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/levels', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'INSERT INTO league_levels (name, sort_order) VALUES ($1, $2) RETURNING *',
      [name.trim(), sort_order ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Level already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/levels/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'UPDATE league_levels SET name = $1, sort_order = $2 WHERE id = $3 RETURNING *',
      [name.trim(), sort_order ?? 0, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Level already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/levels/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM league_levels WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Seasons ──

router.get('/seasons', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM league_seasons ORDER BY sort_order, year DESC, name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/seasons', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { year, name, is_active, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    if (!year) return res.status(400).json({ error: 'Year is required' });
    // If marking active, deactivate others first
    if (is_active) {
      await pool.query('UPDATE league_seasons SET is_active = false');
    }
    const { rows } = await pool.query(
      'INSERT INTO league_seasons (year, name, is_active, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [year, name.trim(), !!is_active, sort_order ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/seasons/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { year, name, is_active, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    if (!year) return res.status(400).json({ error: 'Year is required' });
    // If marking active, deactivate others first
    if (is_active) {
      await pool.query('UPDATE league_seasons SET is_active = false WHERE id != $1', [req.params.id]);
    }
    const { rows } = await pool.query(
      'UPDATE league_seasons SET year = $1, name = $2, is_active = $3, sort_order = $4 WHERE id = $5 RETURNING *',
      [year, name.trim(), !!is_active, sort_order ?? 0, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/seasons/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    // CASCADE will delete linked divisions
    const { rows } = await pool.query('DELETE FROM league_seasons WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Divisions (hierarchical) ──

// Helper: build full path labels for each division using a recursive CTE
async function getDivisionsWithPaths(seasonId) {
  const whereClause = seasonId ? 'WHERE parent_id IS NULL AND season_id = $1' : 'WHERE parent_id IS NULL';
  const params = seasonId ? [seasonId] : [];
  const { rows } = await pool.query(`
    WITH RECURSIVE div_tree AS (
      SELECT id, parent_id, season_id, name, sort_order, name::text AS path, 0 AS depth
      FROM league_divisions ${whereClause}
      UNION ALL
      SELECT d.id, d.parent_id, d.season_id, d.name, d.sort_order, (dt.path || ' / ' || d.name)::text, dt.depth + 1
      FROM league_divisions d JOIN div_tree dt ON d.parent_id = dt.id
    )
    SELECT * FROM div_tree ORDER BY path
  `, params);
  return rows;
}

router.get('/divisions', async (req, res) => {
  try {
    const seasonId = req.query.season_id || null;
    const rows = await getDivisionsWithPaths(seasonId);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/divisions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order, parent_id, season_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'INSERT INTO league_divisions (name, sort_order, parent_id, season_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name.trim(), sort_order ?? 0, parent_id || null, season_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/divisions/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order, parent_id, season_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    // Prevent setting parent to self or descendant
    if (parent_id && Number(parent_id) === Number(req.params.id)) {
      return res.status(400).json({ error: 'Cannot set parent to self' });
    }
    const { rows } = await pool.query(
      'UPDATE league_divisions SET name = $1, sort_order = $2, parent_id = $3, season_id = $4 WHERE id = $5 RETURNING *',
      [name.trim(), sort_order ?? 0, parent_id || null, season_id || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/divisions/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    // CASCADE will delete children too
    const { rows } = await pool.query('DELETE FROM league_divisions WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
