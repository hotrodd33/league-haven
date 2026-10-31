const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCalendarICS,
  formatICSDate,
  ICS_CACHE_CONTROL,
  ICS_ERROR_CACHE_CONTROL,
} = require('./calendar-ics');

const TZ = 'America/Chicago';

function game(overrides) {
  return {
    id: 42,
    game_date: '2026-06-15',
    game_time: '18:30:00',
    status: 'scheduled',
    notes: null,
    home_score: null,
    away_score: null,
    home_team_name: 'Home',
    home_team_city: null,
    away_team_name: 'Away',
    away_team_city: null,
    location_name: 'Field 1',
    location_address: null,
    location_city: 'Springfield',
    location_state: 'IL',
    season_name: 'Summer',
    season_year: 2026,
    updated_at: '2026-06-01T12:00:00.000Z',
    ...overrides,
  };
}

function practice(overrides) {
  return {
    id: 7,
    title: 'Team practice',
    event_type: 'practice',
    event_date: '2026-06-16',
    start_time: '17:00:00',
    end_time: '18:30:45',
    notes: null,
    created_at: '2026-06-01T12:00:00.000Z',
    location_name: 'Field 1',
    location_address: null,
    location_city: null,
    location_state: null,
    ...overrides,
  };
}

function feed(games, practices) {
  return buildCalendarICS({
    games,
    practices: practices || [],
    timezone: TZ,
    calName: 'LeagueHaven Games',
  });
}

test('formatICSDate ignores a null date instead of throwing', () => {
  assert.equal(formatICSDate(null, '18:00'), null);
  assert.equal(formatICSDate(undefined, null), null);
  assert.equal(formatICSDate('2026-06-15', null), '20260615');
  assert.equal(formatICSDate('2026-06-15', '18:30'), '20260615T183000');
  assert.equal(formatICSDate('2026-06-15', '18:30:00'), '20260615T183000');
  assert.equal(formatICSDate('not-a-date', '18:30'), null);
  assert.equal(formatICSDate('2026-02-31', '18:30'), null);
});

test('a null game date is skipped and the rest of the feed is still valid', () => {
  const { ical, skipped } = feed([
    game({ id: 1, game_date: null, game_time: '18:00:00' }),
    game({ id: 2 }),
  ]);

  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].kind, 'game');
  assert.equal(skipped[0].id, 1);
  assert.equal(ical.includes('UID:game-1@leaguehaven'), false);
  assert.equal(ical.includes('UID:game-2@leaguehaven'), true);
  assert.equal(ical.startsWith('BEGIN:VCALENDAR\r\n'), true);
  assert.equal(ical.endsWith('END:VCALENDAR\r\n'), true);
  assert.equal(ical.includes('DTSTART;TZID=America/Chicago:20260615T183000'), true);
  assert.equal(ical.includes('DTEND;TZID=America/Chicago:20260615T210000'), true);
});

test('a late game still ends 150 minutes later on the same date', () => {
  const { ical } = feed([game({ game_time: '23:00:00' })]);
  assert.equal(ical.includes('DTSTART;TZID=America/Chicago:20260615T230000'), true);
  assert.equal(ical.includes('DTEND;TZID=America/Chicago:20260615T253000'), true);
});

test('a game with no time is an all-day event', () => {
  const { ical, skipped } = feed([game({ game_time: null })]);
  assert.equal(skipped.length, 0);
  assert.equal(ical.includes('DTSTART;VALUE=DATE:20260615'), true);
  assert.equal(ical.includes('DTEND;VALUE=DATE:20260616'), true);
  assert.equal(ical.includes('DTSTART;TZID='), false);
});

test('null names, status, location, notes, scores, and stamps do not throw', () => {
  const { ical, skipped } = feed([
    game({
      home_team_name: null,
      away_team_name: null,
      home_team_city: null,
      away_team_city: null,
      location_name: null,
      location_address: null,
      location_city: null,
      location_state: null,
      season_name: null,
      season_year: null,
      status: null,
      notes: null,
      home_score: null,
      away_score: null,
      updated_at: null,
      game_time: { hours: 18 },
    }),
  ]);
  assert.equal(skipped.length, 0);
  assert.equal(ical.includes('SUMMARY:TBD @ TBD'), true);
  assert.equal(ical.includes('STATUS:TENTATIVE'), true);
  assert.equal(ical.includes('LOCATION:'), false);
  assert.equal(ical.includes('DTSTART;VALUE=DATE:20260615'), true);
});

test('invalid stamps and non-string status are omitted safely', () => {
  const { ical, skipped } = feed([
    game({ status: 1, updated_at: 'not-a-date', notes: 'Bring chairs' }),
  ]);
  assert.equal(skipped.length, 0);
  assert.equal(ical.includes('STATUS:TENTATIVE'), true);
  assert.equal(ical.includes('Status:'), false);
  assert.match(ical, /DTSTAMP:\d{8}T\d{6}Z/);
  assert.equal(ical.includes('Notes: Bring chairs'), true);
});

test('dated games keep score, cancel, and postpone labels', () => {
  const completed = feed([
    game({ status: 'completed', away_score: 3, home_score: 5, home_team_city: 'Cubs' }),
  ]).ical;
  assert.equal(completed.includes('SUMMARY:Away @ Cubs (3-5)'), true);
  assert.equal(completed.includes('STATUS:CONFIRMED'), true);

  const cancelled = feed([game({ status: 'cancelled' })]).ical;
  assert.equal(cancelled.includes('SUMMARY:[CANCELLED] Away @ Home'), true);
  assert.equal(cancelled.includes('STATUS:CANCELLED'), true);

  const postponed = feed([game({ status: 'postponed' })]).ical;
  assert.equal(postponed.includes('SUMMARY:[POSTPONED] Away @ Home'), true);
  assert.equal(postponed.includes('STATUS:TENTATIVE'), true);
});

test('a date object and a year-end all-day game stay on the right day', () => {
  const { ical } = feed([
    game({
      game_date: new Date('2026-12-31T00:00:00.000Z'),
      game_time: null,
    }),
  ]);
  assert.equal(ical.includes('DTSTART;VALUE=DATE:20261231'), true);
  assert.equal(ical.includes('DTEND;VALUE=DATE:20270101'), true);
});

test('only null-date games still produce a valid empty calendar', () => {
  const { ical, skipped } = feed([
    game({ id: 1, game_date: null }),
    game({ id: 2, game_date: '' }),
  ]);
  assert.equal(skipped.length, 2);
  assert.equal(ical.includes('BEGIN:VEVENT'), false);
  assert.equal(ical.includes('END:VCALENDAR'), true);
});

test('practices with a null date are skipped; timed ones keep the old shape', () => {
  const { ical, skipped } = feed([], [
    practice({ id: 1, event_date: null }),
    practice({ id: 2 }),
  ]);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].kind, 'practice');
  assert.equal(ical.includes('UID:practice-1@leaguehaven'), false);
  assert.equal(ical.includes('UID:practice-2@leaguehaven'), true);
  assert.equal(ical.includes('DTSTART;TZID=America/Chicago:20260616T170000'), true);
  // Seconds on practice times were dropped (HH:MM only).
  assert.equal(ical.includes('DTEND;TZID=America/Chicago:20260616T183000'), true);
  assert.equal(ical.includes('SUMMARY:[Practice] Team practice'), true);
  assert.equal(ical.includes('STATUS:CONFIRMED'), true);
});

test('a practice with no start time is all-day and a missing end has no DTEND', () => {
  const allDay = feed([], [practice({ start_time: null, end_time: null })]).ical;
  assert.equal(allDay.includes('DTSTART;VALUE=DATE:20260616'), true);
  assert.equal(allDay.includes('DTEND;VALUE=DATE:20260617'), true);

  const openEnded = feed([], [practice({ end_time: null })]).ical;
  assert.equal(openEnded.includes('DTSTART;TZID=America/Chicago:20260616T170000'), true);
  assert.equal(openEnded.includes('DTEND'), false);
});

test('the feed stays cacheable at the CDN long enough for hourly polls', () => {
  assert.match(ICS_CACHE_CONTROL, /(?:^|, )s-maxage=43200(?:[, ]|$)/);
  assert.match(ICS_CACHE_CONTROL, /stale-while-revalidate=43200/);
  assert.match(ICS_CACHE_CONTROL, /stale-if-error=86400/);
  assert.equal(ICS_CACHE_CONTROL.includes('private'), false);
  assert.equal(ICS_CACHE_CONTROL.includes('no-store'), false);
  assert.equal(ICS_ERROR_CACHE_CONTROL, 'public, max-age=300');
});

test('commas in names stay escaped', () => {
  const { ical } = feed([game({ away_team_name: 'Smith, Jr' })]);
  assert.equal(ical.includes('SUMMARY:Smith\\, Jr @ Home'), true);
});
