const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authMiddleware, requireRole } = require('../auth');

// GET /api/announcements — active announcements (all authenticated users)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, u.name AS author_name
       FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
       WHERE a.is_active = true
         AND (a.expires_at IS NULL OR a.expires_at > NOW())
       ORDER BY
         CASE a.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
         a.created_at DESC`
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

// POST /api/announcements — create (admin only)
router.post('/', authMiddleware, requireRole('super_admin', 'org_admin'), async (req, res) => {
  try {
    const { title, body, priority, expires_at } = req.body;
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: 'Title and body are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO announcements (title, body, priority, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title.trim(), body.trim(), priority || 'normal', expires_at || null, req.user.id]
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
    const { title, body, priority, is_active, expires_at } = req.body;
    const { rows } = await pool.query(
      `UPDATE announcements
       SET title = COALESCE($1, title),
           body = COALESCE($2, body),
           priority = COALESCE($3, priority),
           is_active = COALESCE($4, is_active),
           expires_at = $5,
           updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [title?.trim() || null, body?.trim() || null, priority || null, is_active, expires_at, id]
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
