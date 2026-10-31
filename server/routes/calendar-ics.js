// Pure iCalendar builder for the public games feed.
// Kept separate from the route so a bad row can be tested without a database.

// Twelve hours fresh on the CDN, then one background refresh while the
// previous body is still served. stale-if-error keeps that body up for a day
// when the refresh fails. See calendar.js for why a 500 cannot do this job.
const ICS_CACHE_CONTROL = 'public, max-age=3600, s-maxage=43200, stale-while-revalidate=43200, stale-if-error=86400';
const ICS_ERROR_CACHE_CONTROL = 'public, max-age=300';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Hours may exceed 23. End times are still computed as clock arithmetic that
// can roll past midnight without moving the date, matching the previous feed.
const CLOCK_RE = /^\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

function esc(str) {
  // Escape special iCalendar characters
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function foldLine(line) {
  // RFC 5545 §3.1: lines > 75 octets must be folded
  const octets = Buffer.from(line, 'utf8');
  if (octets.length <= 75) return line;
  const parts = [];
  let start = 0;
  while (start < octets.length) {
    const chunk = start === 0 ? 75 : 74; // continuation lines start with space
    const end = Math.min(start + chunk, octets.length);
    const slice = octets.slice(start, end).toString('utf8');
    parts.push(start === 0 ? slice : ' ' + slice);
    start = end;
  }
  return parts.join('\r\n');
}

function coerceICSDate(value) {
  if (value == null || value === '') return null;
  let day;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // DATE columns arrive as local midnight. On Vercel that is UTC, so the
    // ISO calendar day matches the stored date.
    day = value.toISOString().slice(0, 10);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    day = trimmed.length > 10 ? trimmed.slice(0, 10) : trimmed;
  } else {
    return null;
  }
  if (!DATE_RE.test(day)) return null;
  const [y, m, d] = day.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return day;
}

function asClockString(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const h = String(value.getUTCHours()).padStart(2, '0');
    const m = String(value.getUTCMinutes()).padStart(2, '0');
    const s = String(value.getUTCSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!CLOCK_RE.test(raw)) return null;
  return raw;
}

function formatICSDate(dateStr, timeStr) {
  const day = coerceICSDate(dateStr);
  if (!day) return null;
  const d = day.replace(/-/g, '');
  const clock = asClockString(timeStr);
  if (!clock) return d;
  const compact = clock.replace(/:/g, '').replace(/\..*$/, '');
  if (!/^\d+$/.test(compact)) return d;
  return d + 'T' + compact.padEnd(6, '0').slice(0, 6);
}

function nextDayValue(isoDay) {
  const [y, m, d] = isoDay.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10).replace(/-/g, '');
}

function icsStamp(value) {
  let dt;
  if (value instanceof Date) dt = value;
  else if (value) dt = new Date(value);
  else dt = new Date();
  if (Number.isNaN(dt.getTime())) dt = new Date();
  return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function uid(gameId) {
  return `game-${gameId}@leaguehaven`;
}

function practiceUid(reservationId) {
  return `practice-${reservationId}@leaguehaven`;
}

function teamDisplayName(city, mascot, color, ageGroup, level, fallbackName) {
  if (city) {
    return [city, mascot, color, ageGroup, level].filter(Boolean).join(' ');
  }
  return fallbackName || 'TBD';
}

function locationText(row) {
  return [row.location_name, row.location_address, row.location_city, row.location_state]
    .filter(Boolean)
    .join(', ');
}

function statusLabel(status) {
  if (typeof status !== 'string' || !status) return null;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function appendGame(lines, game, timezone) {
  const event = [];
  const gameDate = coerceICSDate(game && game.game_date);
  if (!gameDate) return false;

  const homeName = teamDisplayName(
    game.home_team_city,
    game.home_team_mascot,
    game.home_team_color,
    game.home_age_group,
    game.home_level,
    game.home_team_name
  );
  const awayName = teamDisplayName(
    game.away_team_city,
    game.away_team_mascot,
    game.away_team_color,
    game.away_age_group,
    game.away_level,
    game.away_team_name
  );

  let summary = `${awayName} @ ${homeName}`;
  if (game.status === 'completed' && game.home_score != null && game.away_score != null) {
    summary += ` (${game.away_score}-${game.home_score})`;
  } else if (game.status === 'cancelled') {
    summary = `[CANCELLED] ${summary}`;
  } else if (game.status === 'postponed') {
    summary = `[POSTPONED] ${summary}`;
  }

  const location = locationText(game);
  const descParts = [];
  if (game.season_name) descParts.push(`Season: ${game.season_name} ${game.season_year || ''}`);
  const label = statusLabel(game.status);
  if (label) descParts.push(`Status: ${label}`);
  if (game.status === 'completed' && game.home_score != null && game.away_score != null) {
    descParts.push(`Final: ${awayName} ${game.away_score} - ${homeName} ${game.home_score}`);
  }
  if (game.notes) descParts.push(`Notes: ${game.notes}`);
  const description = descParts.join('\\n');

  const clock = asClockString(game.game_time);
  const dtstart = formatICSDate(gameDate, clock);
  if (!dtstart) return false;

  event.push('BEGIN:VEVENT');
  event.push(foldLine(`UID:${uid(game.id)}`));
  event.push(foldLine(`DTSTAMP:${icsStamp(game.updated_at)}`));

  if (!clock) {
    event.push(foldLine(`DTSTART;VALUE=DATE:${dtstart}`));
    event.push(foldLine(`DTEND;VALUE=DATE:${nextDayValue(gameDate)}`));
  } else {
    event.push(foldLine(`DTSTART;TZID=${timezone}:${dtstart}`));
    // Default 2.5 hour game duration
    const [h, m] = clock.split(':').map(Number);
    const endMin = h * 60 + m + 150;
    const endH = String(Math.floor(endMin / 60)).padStart(2, '0');
    const endM = String(endMin % 60).padStart(2, '0');
    const dtend = formatICSDate(gameDate, `${endH}:${endM}`);
    if (dtend) event.push(foldLine(`DTEND;TZID=${timezone}:${dtend}`));
  }

  event.push(foldLine(`SUMMARY:${esc(summary)}`));
  if (location) event.push(foldLine(`LOCATION:${esc(location)}`));
  if (description) event.push(foldLine(`DESCRIPTION:${esc(description)}`));

  if (game.status === 'cancelled') event.push('STATUS:CANCELLED');
  else if (game.status === 'completed') event.push('STATUS:CONFIRMED');
  else event.push('STATUS:TENTATIVE');

  event.push('END:VEVENT');
  lines.push(...event);
  return true;
}

function practiceClock(value) {
  const clock = asClockString(value);
  if (!clock) return null;
  // Practices historically published HH:MM and dropped seconds.
  const match = clock.match(/^(\d{1,2}:\d{2})/);
  return match ? match[1] : null;
}

function appendPractice(lines, practice, timezone) {
  const event = [];
  const eventDate = coerceICSDate(practice && practice.event_date);
  if (!eventDate) return false;

  const typeLabel = practice.event_type === 'practice' ? 'Practice'
    : practice.event_type === 'event' ? 'Event' : practice.event_type || 'Practice';
  const summary = `[${typeLabel}] ${practice.title}`;
  const location = locationText(practice);
  const descParts = [`Type: ${typeLabel}`];
  if (practice.notes) descParts.push(`Notes: ${practice.notes}`);
  const description = descParts.join('\\n');

  const startTime = practiceClock(practice.start_time);
  const endTime = practiceClock(practice.end_time);
  const dtstart = formatICSDate(eventDate, startTime);
  if (!dtstart) return false;

  event.push('BEGIN:VEVENT');
  event.push(foldLine(`UID:${practiceUid(practice.id)}`));
  event.push(foldLine(`DTSTAMP:${icsStamp(practice.created_at)}`));

  if (!startTime) {
    event.push(foldLine(`DTSTART;VALUE=DATE:${dtstart}`));
    event.push(foldLine(`DTEND;VALUE=DATE:${nextDayValue(eventDate)}`));
  } else {
    event.push(foldLine(`DTSTART;TZID=${timezone}:${dtstart}`));
    if (endTime) {
      const dtend = formatICSDate(eventDate, endTime);
      event.push(foldLine(`DTEND;TZID=${timezone}:${dtend}`));
    }
  }

  event.push(foldLine(`SUMMARY:${esc(summary)}`));
  if (location) event.push(foldLine(`LOCATION:${esc(location)}`));
  if (description) event.push(foldLine(`DESCRIPTION:${esc(description)}`));
  event.push('STATUS:CONFIRMED');
  event.push('END:VEVENT');
  lines.push(...event);
  return true;
}

function buildCalendarICS({ games, practices, timezone, calName }) {
  const tz = timezone || 'America/Chicago';
  const skipped = [];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LeagueHaven//Game Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName || 'LeagueHaven Games')}`,
    `X-WR-TIMEZONE:${tz}`,
  ];

  for (const game of games || []) {
    try {
      if (!appendGame(lines, game, tz)) {
        skipped.push({ kind: 'game', id: game && game.id != null ? game.id : null });
      }
    } catch (err) {
      skipped.push({
        kind: 'game',
        id: game && game.id != null ? game.id : null,
        error: err.message,
      });
    }
  }

  for (const practice of practices || []) {
    try {
      if (!appendPractice(lines, practice, tz)) {
        skipped.push({ kind: 'practice', id: practice && practice.id != null ? practice.id : null });
      }
    } catch (err) {
      skipped.push({
        kind: 'practice',
        id: practice && practice.id != null ? practice.id : null,
        error: err.message,
      });
    }
  }

  lines.push('END:VCALENDAR');
  return { ical: lines.join('\r\n') + '\r\n', skipped };
}

module.exports = {
  ICS_CACHE_CONTROL,
  ICS_ERROR_CACHE_CONTROL,
  buildCalendarICS,
  formatICSDate,
  coerceICSDate,
};
