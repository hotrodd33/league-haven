const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authMiddleware, requireRole } = require('../auth');

// GET /api/announcements — active announcements with per-user read status
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT a.*, u.name AS author_name,
              CASE WHEN ar.id IS NOT NULL THEN true ELSE false END AS read
       FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
       LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = $1
       WHERE a.is_active = true
         AND (a.expires_at IS NULL OR a.expires_at > NOW())
         AND (a.persistent = true OR ar.id IS NULL)
       ORDER BY
         CASE a.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
         a.created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Fetch announcements error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/announcements/all — all announcements including inactive (admin only)
router.get('/all', authMiddleware, requireRole('super_admin', 'org_admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, u.name AS author_name
       FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
       ORDER BY a.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Fetch all announcements error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/announcements/unread-count — count of unread announcements for badge
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS count
       FROM announcements a
       LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = $1
       WHERE a.is_active = true
         AND (a.expires_at IS NULL OR a.expires_at > NOW())
         AND ar.id IS NULL`,
      [req.user.id]
    );
    res.json({ count: parseInt(rows[0].count, 10) });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/announcements/:id/read — mark as read for current user
router.post('/:id/read', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO announcement_reads (announcement_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (announcement_id, user_id) DO NOTHING`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/announcements — create (admin only)
router.post('/', authMiddleware, requireRole('super_admin', 'org_admin'), async (req, res) => {
  try {
    const { title, body, priority, expires_at, persistent } = req.body;
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: 'Title and body are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO announcements (title, body, priority, expires_at, persistent, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title.trim(), body.trim(), priority || 'normal', expires_at || null, persistent || false, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create announcement error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/announcements/:id — update (admin only)
router.put('/:id', authMiddleware, requireRole('super_admin', 'org_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, body, priority, is_active, expires_at, persistent } = req.body;
    const { rows } = await pool.query(
      `UPDATE announcements
       SET title = COALESCE($1, title),
           body = COALESCE($2, body),
           priority = COALESCE($3, priority),
           is_active = COALESCE($4, is_active),
           expires_at = $5,
           persistent = COALESCE($6, persistent),
           updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [title?.trim() || null, body?.trim() || null, priority || null, is_active, expires_at, persistent, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Announcement not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Update announcement error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/announcements/:id — delete (admin only)
router.delete('/:id', authMiddleware, requireRole('super_admin', 'org_admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM announcements WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Announcement not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete announcement error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
