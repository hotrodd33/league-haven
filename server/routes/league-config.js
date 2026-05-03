const express = require('express');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');
const cache = require('../cache');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 } });

const CONFIG_TTL = 5 * 60_000; // 5 minutes — lookup tables rarely change
const BRANDING_KEY = 'league-config:branding';
const AGE_GROUPS_KEY = 'league-config:age-groups';
const LEVELS_KEY = 'league-config:levels';
const SEASONS_KEY = 'league-config:seasons';
const divisionsKey = (seasonId) => `league-config:divisions:${seasonId || 'all'}`;

async function getBranding() {
  const cached = cache.get(BRANDING_KEY);
  if (cached) return cached;
  const { rows } = await pool.query(
    `SELECT app_name, logo_url, public_site_url, game_start_time, game_end_time, game_time_increment_minutes,
            feature_live_scoring, feature_pitch_tracking, feature_officials,
            feature_stats, feature_documents, feature_financials,
            feature_registration, feature_public_site, feature_push_notifications,
            feature_game_delete, feature_chat, timezone, email_redirect
     FROM app_branding WHERE id = 1`
  );
  const result = rows[0] || { app_name: 'LeagueHaven', logo_url: null };
  cache.set(BRANDING_KEY, result, CONFIG_TTL);
  return result;
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
    res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    res.json(await getBranding());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/branding', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const sets = [];
    const vals = [];
    let idx = 1;

    if (req.body?.app_name !== undefined) {
      const appName = String(req.body.app_name || '').trim();
      if (!appName) return res.status(400).json({ error: 'App name is required' });
      sets.push(`app_name = $${idx++}`);
      vals.push(appName.slice(0, 48));
    }

    if (req.body?.public_site_url !== undefined) {
      const raw = String(req.body.public_site_url || '').trim();
      if (raw) {
        try {
          const url = new URL(raw);
          if (!['http:', 'https:'].includes(url.protocol)) {
            return res.status(400).json({ error: 'Public site URL must use http or https' });
          }
        } catch {
          return res.status(400).json({ error: 'Public site URL must be a valid URL' });
        }
      }
      sets.push(`public_site_url = $${idx++}`);
      vals.push(raw || null);
    }

    if (req.body?.timezone !== undefined) {
      const tz = String(req.body.timezone || '').trim();
      const VALID_TIMEZONES = [
        'America/New_York', 'America/Chicago', 'America/Denver',
        'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage',
        'Pacific/Honolulu', 'America/Puerto_Rico',
      ];
      if (!VALID_TIMEZONES.includes(tz)) {
        return res.status(400).json({ error: 'Invalid timezone' });
      }
      sets.push(`timezone = $${idx++}`);
      vals.push(tz);
    }

    if (req.body?.email_redirect !== undefined) {
      const raw = String(req.body.email_redirect || '').trim().toLowerCase();
      if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        return res.status(400).json({ error: 'email_redirect must be a valid email address or empty' });
      }
      sets.push(`email_redirect = $${idx++}`);
      vals.push(raw || null);
    }

    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });

    await pool.query(
      `UPDATE app_branding SET ${sets.join(', ')}, updated_at = NOW() WHERE id = 1`,
      vals
    );
    cache.del(BRANDING_KEY);
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
    cache.del(BRANDING_KEY);
    res.json({ logo_url: dataUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/branding/logo', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE app_branding SET logo_url = NULL, updated_at = NOW() WHERE id = 1');
    cache.del(BRANDING_KEY);
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
    cache.del(BRANDING_KEY);
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

// ── Feature Toggles ──

const FEATURE_KEYS = [
  'feature_live_scoring', 'feature_pitch_tracking', 'feature_officials',
  'feature_stats', 'feature_documents', 'feature_financials',
  'feature_registration', 'feature_public_site', 'feature_push_notifications',
  'feature_game_delete', 'feature_chat',
];

router.get('/features', async (req, res) => {
  try {
    const branding = await getBranding();
    const features = {};
    for (const key of FEATURE_KEYS) features[key] = branding[key] !== false;
    res.json(features);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/features', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const key of FEATURE_KEYS) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${idx++}`);
        vals.push(!!req.body[key]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No valid feature toggles provided' });
    vals.push(1);
    await pool.query(`UPDATE app_branding SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, vals);
    cache.del(BRANDING_KEY);
    const branding = await getBranding();
    const features = {};
    for (const key of FEATURE_KEYS) features[key] = branding[key] !== false;
    res.json(features);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Age Groups ──

router.get('/age-groups', authMiddleware, async (req, res) => {
  try {
    let rows = cache.get(AGE_GROUPS_KEY);
    if (!rows) {
      ({ rows } = await pool.query('SELECT * FROM league_age_groups ORDER BY sort_order, name'));
      cache.set(AGE_GROUPS_KEY, rows, CONFIG_TTL);
    }
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
    cache.del(AGE_GROUPS_KEY);
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
    cache.del(AGE_GROUPS_KEY);
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
    cache.del(AGE_GROUPS_KEY);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Levels ──

router.get('/levels', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    const cached = cache.get(LEVELS_KEY);
    if (cached) return res.json(cached);
    const { rows } = await pool.query('SELECT * FROM league_levels ORDER BY sort_order, name');
    cache.set(LEVELS_KEY, rows, CONFIG_TTL);
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
    cache.del(LEVELS_KEY);
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
    cache.del(LEVELS_KEY);
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
    cache.del(LEVELS_KEY);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Seasons ──

router.get('/seasons', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    const cached = cache.get(SEASONS_KEY);
    if (cached) return res.json(cached);
    const { rows } = await pool.query('SELECT * FROM league_seasons ORDER BY sort_order, year DESC, name');
    cache.set(SEASONS_KEY, rows, CONFIG_TTL);
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
    cache.del(SEASONS_KEY);
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
    cache.del(SEASONS_KEY);
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
    cache.del(SEASONS_KEY);
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
    res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    const seasonId = req.query.season_id || null;
    const cacheKey = divisionsKey(seasonId);
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);
    const rows = await getDivisionsWithPaths(seasonId);
    cache.set(cacheKey, rows, CONFIG_TTL);
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
    cache.invalidatePrefix('league-config:divisions:');
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
    cache.invalidatePrefix('league-config:divisions:');
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
    cache.invalidatePrefix('league-config:divisions:');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Volunteer Roles ──

router.get('/volunteer-roles', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM volunteer_roles ORDER BY sort_order, name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/volunteer-roles', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'INSERT INTO volunteer_roles (name, sort_order) VALUES ($1, $2) RETURNING *',
      [name.trim(), sort_order ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Volunteer role already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/volunteer-roles/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'UPDATE volunteer_roles SET name = $1, sort_order = $2 WHERE id = $3 RETURNING *',
      [name.trim(), sort_order ?? 0, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Volunteer role already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/volunteer-roles/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM volunteer_roles WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
