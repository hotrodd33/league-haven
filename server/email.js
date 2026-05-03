const sgMail = require('@sendgrid/mail');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'LeagueHaven <noreply@leaguehaven.com>';
const APP_URL = process.env.APP_URL || 'https://leaguehaven.com';

async function sendEmail({ to, bcc, subject, html, replyTo }) {
  // Email redirect: check BEFORE SendGrid guard so logs always show effective recipient.
  // When configured, all emails go to the override address instead of real recipients.
  let effectiveTo = to;
  let effectiveBcc;
  try {
    const { pool } = require('./db');
    const { rows } = await pool.query('SELECT email_redirect FROM app_branding WHERE id = 1');
    const redirect = rows[0]?.email_redirect?.trim();
    if (redirect) {
      console.warn(`[EMAIL] Redirecting email to ${redirect} (original: ${to}, subject: ${subject})`);
      effectiveTo = redirect;
      effectiveBcc = undefined; // suppress BCC when redirecting
      subject = `[REDIRECT from ${Array.isArray(to) ? to.join(', ') : to}] ${subject}`;
    } else {
      effectiveBcc = bcc;
    }
  } catch {
    effectiveBcc = bcc;
  }

  if (!process.env.SENDGRID_API_KEY) {
    console.warn('[EMAIL] SENDGRID_API_KEY not set — email not sent:', { to: effectiveTo, subject });
    return null;
  }

  try {
    const msg = { from: FROM_EMAIL, to: effectiveTo, subject, html };
    if (effectiveBcc) msg.bcc = effectiveBcc;
    if (replyTo) msg.replyTo = replyTo;
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
    subject: 'Welcome to LeagueHaven!',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e3a5f;">Welcome to LeagueHaven, ${esc(name)}!</h2>
        <p>Your account has been created. You can sign in at:</p>
        <p><a href="${APP_URL}" style="color:#1d4ed8;">${APP_URL}</a></p>
        <p style="color:#888;font-size:13px;">If you didn't register for this account, you can ignore this email.</p>
      </div>
    `,
  });
}

function sendInviteEmail(to, name, tempPassword, { replyTo } = {}) {
  return sendEmail({
    to,
    replyTo,
    subject: 'You\'ve been invited to LeagueHaven',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e3a5f;">Welcome to LeagueHaven, ${esc(name)}!</h2>
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
    subject: 'LeagueHaven — Password Reset Request',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e3a5f;">Password Reset</h2>
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
    subject: 'LeagueHaven — Your password was changed',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e3a5f;">Password Changed</h2>
        <p>Hi ${esc(name)}, your LeagueHaven password was just changed.</p>
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
function sendGameChangeEmail(emails, { homeTeam, awayTeam, oldDate, newDate, oldTime, newTime, changedBy, replyTo }) {
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
      <p style="margin-top:12px;"><a href="${APP_URL}" style="color:#1d4ed8;">View in LeagueHaven</a></p>
    </div>
  `;

  if (emails.length === 1) {
    return sendEmail({ to: emails[0], subject: 'LeagueHaven — Game Schedule Change', html, replyTo });
  }
  return sendEmail({
    to: FROM_EMAIL,
    bcc: emails,
    subject: 'LeagueHaven — Game Schedule Change',
    html,
    replyTo,
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

function sendCoachInviteEmail(to, name, tempPassword, assignment, { replyTo } = {}) {
  const roleLabel = assignment?.role || 'Coach';
  const teamsSummary = assignment?.teams || (typeof assignment === 'string' ? assignment : null);
  return sendEmail({
    to,
    replyTo,
    subject: `LeagueHaven — You've been added as ${roleLabel}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e3a5f;">Welcome to LeagueHaven, ${esc(name)}!</h2>
        <p>You've been added as <strong>${esc(roleLabel)}</strong>${teamsSummary ? ` for <strong>${esc(teamsSummary)}</strong>` : ''}.</p>
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

function sendConfirmationEmail(to, name, confirmToken) {
  const confirmUrl = `${APP_URL}?confirm=${confirmToken}`;
  return sendEmail({
    to,
    subject: 'LeagueHaven — Confirm Your Email',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e3a5f;">Welcome to LeagueHaven, ${esc(name)}!</h2>
        <p>Thanks for registering! Please confirm your email address to activate your account.</p>
        <p style="margin:16px 0;">
          <a href="${confirmUrl}" style="display:inline-block;padding:10px 24px;background:#1e3a5f;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
            Confirm Email
          </a>
        </p>
        <p style="font-size:13px;color:#888;">If you didn't create this account, you can ignore this email.</p>
        <p style="font-size:12px;color:#aaa;word-break:break-all;">Or copy this link: ${confirmUrl}</p>
      </div>
    `,
  });
}

const ROLE_DISPLAY = {
  score_reporter: 'Scorekeeper',
  team_manager: 'Coach',
  org_admin: 'Organization Admin',
  umpire: 'Umpire',
};

function sendApprovalRequestEmail(to, approverName, registrantName, registrantRole) {
  const roleLabel = ROLE_DISPLAY[registrantRole] || registrantRole;
  return sendEmail({
    to,
    subject: `LeagueHaven — New ${roleLabel} Registration Pending Approval`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e3a5f;">Approval Needed</h2>
        <p>Hi ${esc(approverName)},</p>
        <p><strong>${esc(registrantName)}</strong> has registered as a <strong>${esc(roleLabel)}</strong> and needs your approval.</p>
        <p style="margin:16px 0;">
          <a href="${APP_URL}" style="display:inline-block;padding:10px 24px;background:#1e3a5f;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
            Review in LeagueHaven
          </a>
        </p>
        <p style="font-size:13px;color:#888;">Log in to review and approve or reject this registration.</p>
      </div>
    `,
  });
}

function sendApprovalEmail(to, name, { replyTo } = {}) {
  return sendEmail({
    to,
    replyTo,
    subject: 'LeagueHaven — Your Account Has Been Approved!',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e3a5f;">You're Approved!</h2>
        <p>Hi ${esc(name)}, your LeagueHaven account has been approved. You can now sign in and access all your features.</p>
        <p style="margin:16px 0;">
          <a href="${APP_URL}" style="display:inline-block;padding:10px 24px;background:#1e3a5f;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
            Sign In
          </a>
        </p>
      </div>
    `,
  });
}

function sendRejectionEmail(to, name, { replyTo } = {}) {
  return sendEmail({
    to,
    replyTo,
    subject: 'LeagueHaven — Registration Not Approved',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#1e3a5f;">Registration Update</h2>
        <p>Hi ${esc(name)}, unfortunately your LeagueHaven registration was not approved at this time.</p>
        <p>If you believe this is an error, please contact a league administrator.</p>
        <p style="font-size:13px;color:#888;">You may re-apply after 30 days.</p>
      </div>
    `,
  });
}

function sendGuardianClaimApprovedEmail(to, guardianName, playerName) {
  return sendEmail({
    to,
    subject: 'LeagueHaven — Your player claim was approved!',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#15803d;">✅ Claim Approved</h2>
        <p>Hi ${esc(guardianName)},</p>
        <p>Your request to be linked as a guardian of <strong>${esc(playerName)}</strong> has been <strong>approved</strong>.</p>
        <p>You can now sign in to LeagueHaven to view and manage ${esc(playerName)}'s profile.</p>
        <p style="margin-top:16px;"><a href="${APP_URL}" style="display:inline-block;padding:10px 24px;background:#1e3a5f;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Open LeagueHaven</a></p>
      </div>
    `,
  });
}

function sendGuardianClaimDeniedEmail(to, guardianName, playerName, adminNotes) {
  return sendEmail({
    to,
    subject: 'LeagueHaven — Update on your player claim',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;">
        <h2 style="color:#b91c1c;">Player Claim Not Approved</h2>
        <p>Hi ${esc(guardianName)},</p>
        <p>Your request to be linked as a guardian of <strong>${esc(playerName)}</strong> was not approved at this time.</p>
        ${adminNotes ? `<div style="background:#fef2f2;border-left:4px solid #b91c1c;padding:10px 14px;border-radius:4px;margin:12px 0;"><p style="margin:0;font-size:14px;color:#7f1d1d;"><strong>Reason:</strong> ${esc(adminNotes)}</p></div>` : ''}
        <p style="font-size:13px;color:#888;">If you believe this is an error, please contact your league administrator.</p>
        <p style="margin-top:12px;"><a href="${APP_URL}" style="color:#1d4ed8;">Visit LeagueHaven</a></p>
      </div>
    `,
  });
}

module.exports = {
  sendWelcomeEmail,
  sendInviteEmail,
  sendCoachInviteEmail,
  sendConfirmationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendGameChangeEmail,
  sendApprovalRequestEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendGuardianClaimApprovedEmail,
  sendGuardianClaimDeniedEmail,
};
