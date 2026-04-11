const sgMail = require('@sendgrid/mail');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'ZVBL <noreply@zvbl.org>';
const APP_URL = process.env.APP_URL || 'https://portal.zvbl.org';

async function sendEmail({ to, bcc, subject, html }) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('[EMAIL] SENDGRID_API_KEY not set — email not sent:', { to, subject });
    return null;
  }
  try {
    const msg = { from: FROM_EMAIL, to, subject, html };
    if (bcc) msg.bcc = bcc;
    const result = await sgMail.send(msg);
    return result;
  } catch (err) {
    console.error('[EMAIL] Send failed:', err?.response?.body || err);
    return null;
  }
}

// ── Email Templates ──

function sendWelcomeEmail(to, name) {
  return sendEmail({
    to,
    subject: 'Welcome to ZVBL!',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e3a5f;">⚾ Welcome to ZVBL, ${esc(name)}!</h2>
        <p>Your account has been created. You can sign in at:</p>
        <p><a href="${APP_URL}" style="color:#1d4ed8;">${APP_URL}</a></p>
        <p style="color:#888;font-size:13px;">If you didn't register for this account, you can ignore this email.</p>
      </div>
    `,
  });
}

function sendInviteEmail(to, name, tempPassword) {
  return sendEmail({
    to,
    subject: 'You\'ve been invited to ZVBL',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e3a5f;">⚾ Welcome to ZVBL, ${esc(name)}!</h2>
        <p>An account has been created for you. Sign in with these credentials:</p>
        <div style="background:#f3f4f6;padding:12px 16px;border-radius:8px;margin:12px 0;">
          <p style="margin:4px 0;"><strong>Username:</strong> ${esc(to)}</p>
          <p style="margin:4px 0;"><strong>Temporary Password:</strong> ${esc(tempPassword)}</p>
        </div>
        <p>Sign in at: <a href="${APP_URL}" style="color:#1d4ed8;">${APP_URL}</a></p>
        <p><strong>Please change your password after your first login.</strong></p>
      </div>
    `,
  });
}

function sendPasswordResetEmail(to, name, resetToken) {
  const resetUrl = `${APP_URL}?reset=${resetToken}`;
  return sendEmail({
    to,
    subject: 'ZVBL — Password Reset Request',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e3a5f;">⚾ Password Reset</h2>
        <p>Hi ${esc(name)}, we received a request to reset your password.</p>
        <p style="margin:16px 0;">
          <a href="${resetUrl}" style="display:inline-block;padding:10px 24px;background:#1e3a5f;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
            Reset Password
          </a>
        </p>
        <p style="font-size:13px;color:#888;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        <p style="font-size:12px;color:#aaa;word-break:break-all;">Or copy this link: ${resetUrl}</p>
      </div>
    `,
  });
}

function sendPasswordChangedEmail(to, name) {
  return sendEmail({
    to,
    subject: 'ZVBL — Your password was changed',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e3a5f;">⚾ Password Changed</h2>
        <p>Hi ${esc(name)}, your ZVBL password was just changed.</p>
        <p style="font-size:13px;color:#888;">If you didn't make this change, please contact a league administrator immediately.</p>
      </div>
    `,
  });
}

/**
 * Notify staff when a game's date or time changes.
 * @param {string[]} emails - recipient email addresses
 * @param {object} opts
 * @param {string} opts.homeTeam - home team name
 * @param {string} opts.awayTeam - away team name
 * @param {string|null} opts.oldDate
 * @param {string|null} opts.newDate
 * @param {string|null} opts.oldTime
 * @param {string|null} opts.newTime
 * @param {string} opts.changedBy - name of user who made the change
 */
function sendGameChangeEmail(emails, { homeTeam, awayTeam, oldDate, newDate, oldTime, newTime, changedBy }) {
  if (!emails.length) return Promise.resolve(null);

  const changes = [];
  if (oldDate !== newDate) {
    changes.push(`<tr><td style="padding:4px 12px;font-weight:600;color:#555;">Date</td><td style="padding:4px 12px;color:#b91c1c;text-decoration:line-through;">${esc(formatDate(oldDate))}</td><td style="padding:4px 8px;color:#555;">→</td><td style="padding:4px 12px;color:#15803d;font-weight:600;">${esc(formatDate(newDate))}</td></tr>`);
  }
  if (oldTime !== newTime) {
    changes.push(`<tr><td style="padding:4px 12px;font-weight:600;color:#555;">Time</td><td style="padding:4px 12px;color:#b91c1c;text-decoration:line-through;">${esc(formatTime(oldTime))}</td><td style="padding:4px 8px;color:#555;">→</td><td style="padding:4px 12px;color:#15803d;font-weight:600;">${esc(formatTime(newTime))}</td></tr>`);
  }
  if (!changes.length) return Promise.resolve(null);

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#1e3a5f;">⚾ Game Schedule Change</h2>
      <p style="font-size:15px;">
        The game <strong>${esc(awayTeam)}</strong> @ <strong>${esc(homeTeam)}</strong> has been updated:
      </p>
      <table style="border-collapse:collapse;margin:12px 0;">
        <thead><tr style="border-bottom:2px solid #e5e7eb;">
          <th style="padding:4px 12px;text-align:left;font-size:12px;color:#888;">Field</th>
          <th style="padding:4px 12px;text-align:left;font-size:12px;color:#888;">Was</th>
          <th></th>
          <th style="padding:4px 12px;text-align:left;font-size:12px;color:#888;">Now</th>
        </tr></thead>
        <tbody>${changes.join('')}</tbody>
      </table>
      <p style="font-size:13px;color:#888;margin-top:16px;">Changed by ${esc(changedBy)}</p>
      <p style="margin-top:12px;"><a href="${APP_URL}" style="color:#1d4ed8;">View in ZVBL</a></p>
    </div>
  `;

  if (emails.length === 1) {
    return sendEmail({ to: emails[0], subject: 'ZVBL — Game Schedule Change', html });
  }
  return sendEmail({
    to: FROM_EMAIL,
    bcc: emails,
    subject: 'ZVBL — Game Schedule Change',
    html,
  });
}

function formatDate(d) {
  if (!d) return 'TBD';
  const s = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${parseInt(m)}/${parseInt(day)}/${y}`;
}

function formatTime(t) {
  if (!t) return 'TBD';
  const [hh, mm] = t.split(':');
  const h = parseInt(hh);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${ampm}`;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendInviteEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendGameChangeEmail,
};
