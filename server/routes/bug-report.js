const express = require('express');
const { authMiddleware } = require('../auth');

const router = express.Router();

// POST /api/bug-report
router.post('/', authMiddleware, async (req, res) => {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_BUG_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(503).json({ error: 'Bug reporting is not configured on this server.' });
  }

  const { description, area, steps, url: pageUrl } = req.body;
  if (!description?.trim()) {
    return res.status(400).json({ error: 'Description is required.' });
  }

  const user = req.user;
  const timestamp = new Date().toISOString();

  const embed = {
    title: '🐛 Bug Report',
    color: 0xe74c3c,
    fields: [
      { name: 'Reported By', value: `${user.name || user.username} (${user.email || user.username})`, inline: true },
      { name: 'Role', value: user.role?.replace(/_/g, ' ') || 'Unknown', inline: true },
      { name: 'Area / Page', value: area?.trim() || 'Not specified', inline: false },
      { name: 'Description', value: description.trim().slice(0, 1024), inline: false },
    ],
    timestamp,
  };

  if (steps?.trim()) {
    embed.fields.push({ name: 'Steps to Reproduce', value: steps.trim().slice(0, 1024), inline: false });
  }
  if (pageUrl?.trim()) {
    embed.fields.push({ name: 'Page URL', value: pageUrl.trim(), inline: false });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[BUG REPORT] Discord webhook error:', response.status, text);
      return res.status(502).json({ error: 'Failed to send report to Discord.' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[BUG REPORT] Error sending to Discord:', err);
    res.status(500).json({ error: 'Failed to send bug report.' });
  }
});

module.exports = router;
