const express = require('express');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware } = require('../auth');
const { canEditPlayer } = require('./players');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];

// GET /player-documents/:playerId
router.get('/:playerId', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, player_id, doc_type, file_name, mime_type, uploaded_by, created_at
       FROM player_documents WHERE player_id = $1 ORDER BY created_at DESC`,
      [req.params.playerId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /player-documents/:playerId/:id/download — return the data URL
router.get('/:playerId/:id/download', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM player_documents WHERE id=$1 AND player_id=$2',
      [req.params.id, req.params.playerId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });
    res.json({ data_url: rows[0].data_url, file_name: rows[0].file_name, mime_type: rows[0].mime_type });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /player-documents/:playerId
router.post('/:playerId', authMiddleware, upload.single('document'), async (req, res) => {
  try {
    const { playerId } = req.params;
    if (!(await canEditPlayer(req.user, playerId))) return res.status(403).json({ error: 'No permission' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const mime = req.file.mimetype;
    if (!ALLOWED_TYPES.includes(mime)) {
      return res.status(400).json({ error: 'File type not allowed. Use PNG, JPEG, GIF, WebP, or PDF.' });
    }

    const dataUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
    const docType = req.body.doc_type || 'birth_certificate';

    const { rows } = await pool.query(
      `INSERT INTO player_documents (player_id, doc_type, file_name, mime_type, data_url, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, player_id, doc_type, file_name, mime_type, uploaded_by, created_at`,
      [playerId, docType, req.file.originalname, mime, dataUrl, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /player-documents/:playerId/:id
router.delete('/:playerId/:id', authMiddleware, async (req, res) => {
  try {
    const { playerId, id } = req.params;
    if (!(await canEditPlayer(req.user, playerId))) return res.status(403).json({ error: 'No permission' });
    const { rowCount } = await pool.query('DELETE FROM player_documents WHERE id=$1 AND player_id=$2', [id, playerId]);
    if (!rowCount) return res.status(404).json({ error: 'Document not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
