const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../auth');
const { sendEmail } = require('../email');

const router = express.Router();

// POST /api/contact — send an email
// Body: { scope, scopeId?, subject, body }
// scope: 'individual' | 'team' | 'org' | 'league'
// scopeId: staff_id (individual), team_id (team), org_id (org) — not needed for league
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { scope, scopeId, subject, body } = req.body;

    if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required' });
    if (!body || !body.trim()) return res.status(400).json({ error: 'Message body is required' });
    if (!scope) return res.status(400).json({ error: 'Scope is required' });

    let recipients = [];

    switch (scope) {
      case 'individual': {
        if (!scopeId) return res.status(400).json({ error: 'scopeId (staff_id) is required' });
        const { rows } = await pool.query('SELECT name, email FROM staff_members WHERE id = $1', [scopeId]);
        if (!rows.length) return res.status(404).json({ error: 'Staff member not found' });
        if (!rows[0].email) return res.status(400).json({ error: `${rows[0].name} has no email address on file` });
        recipients = [{ name: rows[0].name, email: rows[0].email }];
        break;
      }

      case 'team': {
        if (!scopeId) return res.status(400).json({ error: 'scopeId (team_id) is required' });
        const { rows } = await pool.query(
          `SELECT DISTINCT s.id, s.name, s.email
           FROM staff_members s
           JOIN team_staff_assignments tsa ON tsa.staff_id = s.id
           WHERE tsa.team_id = $1 AND s.email IS NOT NULL AND s.email != ''`,
          [scopeId]
        );
        recipients = rows.map(r => ({ name: r.name, email: r.email }));
        break;
      }

      case 'org': {
        if (!scopeId) return res.status(400).json({ error: 'scopeId (org_id) is required' });
        // Staff on any team in this org + org contact email
        const { rows: staffRows } = await pool.query(
          `SELECT DISTINCT s.id, s.name, s.email
           FROM staff_members s
           JOIN team_staff_assignments tsa ON tsa.staff_id = s.id
           JOIN teams t ON t.id = tsa.team_id
           WHERE t.org_id = $1 AND s.email IS NOT NULL AND s.email != ''`,
          [scopeId]
        );
        recipients = staffRows.map(r => ({ name: r.name, email: r.email }));
        // Also add org contact if it exists and isn't already in the list
        const { rows: orgRows } = await pool.query(
          'SELECT contact_name, contact_email FROM organizations WHERE id = $1',
          [scopeId]
        );
        if (orgRows[0]?.contact_email) {
          const orgEmail = orgRows[0].contact_email;
          if (!recipients.some(r => r.email.toLowerCase() === orgEmail.toLowerCase())) {
            recipients.push({ name: orgRows[0].contact_name || 'Org Contact', email: orgEmail });
          }
        }
        break;
      }

      case 'league': {
        // All staff with emails across all teams
        const { rows } = await pool.query(
          `SELECT DISTINCT s.id, s.name, s.email
           FROM staff_members s
           WHERE s.email IS NOT NULL AND s.email != ''`
        );
        recipients = rows.map(r => ({ name: r.name, email: r.email }));
        // Also add all org contacts
        const { rows: orgRows } = await pool.query(
          `SELECT contact_name, contact_email FROM organizations
           WHERE contact_email IS NOT NULL AND contact_email != ''`
        );
        const existingEmails = new Set(recipients.map(r => r.email.toLowerCase()));
        for (const org of orgRows) {
          if (!existingEmails.has(org.contact_email.toLowerCase())) {
            recipients.push({ name: org.contact_name || 'Org Contact', email: org.contact_email });
            existingEmails.add(org.contact_email.toLowerCase());
          }
        }
        break;
      }

      default:
        return res.status(400).json({ error: 'Invalid scope. Must be: individual, team, org, or league' });
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients with email addresses found for this scope' });
    }

    // Deduplicate by email
    const seen = new Set();
    const unique = [];
    for (const r of recipients) {
      const key = r.email.toLowerCase();
      if (!seen.has(key)) { seen.add(key); unique.push(r); }
    }

    // Build HTML body
    const senderName = req.user.name || 'ZVBL Admin';
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;">
        <div style="border-bottom:3px solid #1e3a5f;padding-bottom:12px;margin-bottom:16px;">
          <h2 style="color:#1e3a5f;margin:0;">⚾ ZVBL</h2>
        </div>
        <div style="white-space:pre-wrap;line-height:1.6;color:#333;">${escapeHtml(body.trim())}</div>
        <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;color:#888;font-size:13px;">
          Sent by ${escapeHtml(senderName)} via <a href="${process.env.APP_URL || 'https://portal.zvbl.org'}" style="color:#1d4ed8;">ZVBL</a>
        </div>
      </div>
    `;

    // Send to all recipients (BCC for privacy when multiple)
    if (unique.length === 1) {
      await sendEmail({ to: unique[0].email, subject: subject.trim(), html });
    } else {
      // Send as BCC so recipients don't see each other's emails
      await sendEmail({
        to: process.env.FROM_EMAIL || 'noreply@zvbl.org',
        bcc: unique.map(r => r.email),
        subject: subject.trim(),
        html,
      });
    }

    res.json({
      success: true,
      recipientCount: unique.length,
      recipients: unique.map(r => r.name),
    });
  } catch (err) {
    console.error('[CONTACT] Error:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// GET /api/contact/recipients — preview who will receive the email
// Query: ?scope=team&scopeId=1
router.get('/recipients', authMiddleware, async (req, res) => {
  try {
    const { scope, scopeId } = req.query;
    let recipients = [];

    switch (scope) {
      case 'individual': {
        if (!scopeId) return res.status(400).json({ error: 'scopeId required' });
        const { rows } = await pool.query('SELECT name, email FROM staff_members WHERE id = $1', [scopeId]);
        recipients = rows.filter(r => r.email).map(r => ({ name: r.name, email: r.email }));
        break;
      }
      case 'team': {
        if (!scopeId) return res.status(400).json({ error: 'scopeId required' });
        const { rows } = await pool.query(
          `SELECT DISTINCT s.name, s.email, tsa.role
           FROM staff_members s
           JOIN team_staff_assignments tsa ON tsa.staff_id = s.id
           WHERE tsa.team_id = $1 AND s.email IS NOT NULL AND s.email != ''`,
          [scopeId]
        );
        recipients = rows.map(r => ({ name: r.name, email: r.email, role: r.role }));
        break;
      }
      case 'org': {
        if (!scopeId) return res.status(400).json({ error: 'scopeId required' });
        const { rows } = await pool.query(
          `SELECT DISTINCT s.name, s.email, tsa.role
           FROM staff_members s
           JOIN team_staff_assignments tsa ON tsa.staff_id = s.id
           JOIN teams t ON t.id = tsa.team_id
           WHERE t.org_id = $1 AND s.email IS NOT NULL AND s.email != ''`,
          [scopeId]
        );
        recipients = rows.map(r => ({ name: r.name, email: r.email, role: r.role }));
        const { rows: orgRows } = await pool.query('SELECT contact_name, contact_email FROM organizations WHERE id = $1', [scopeId]);
        if (orgRows[0]?.contact_email) {
          const existing = new Set(recipients.map(r => r.email.toLowerCase()));
          if (!existing.has(orgRows[0].contact_email.toLowerCase())) {
            recipients.push({ name: orgRows[0].contact_name || 'Org Contact', email: orgRows[0].contact_email, role: 'org_contact' });
          }
        }
        break;
      }
      case 'league': {
        const { rows } = await pool.query(
          `SELECT DISTINCT s.name, s.email
           FROM staff_members s
           WHERE s.email IS NOT NULL AND s.email != ''`
        );
        recipients = rows.map(r => ({ name: r.name, email: r.email }));
        const { rows: orgRows } = await pool.query(
          `SELECT contact_name, contact_email FROM organizations WHERE contact_email IS NOT NULL AND contact_email != ''`
        );
        const existing = new Set(recipients.map(r => r.email.toLowerCase()));
        for (const org of orgRows) {
          if (!existing.has(org.contact_email.toLowerCase())) {
            recipients.push({ name: org.contact_name || 'Org Contact', email: org.contact_email, role: 'org_contact' });
            existing.add(org.contact_email.toLowerCase());
          }
        }
        break;
      }
      default:
        return res.status(400).json({ error: 'Invalid scope' });
    }

    res.json({ recipients });
  } catch (err) {
    console.error('[CONTACT] Recipients error:', err);
    res.status(500).json({ error: 'Failed to fetch recipients' });
  }
});

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = router;
