/**
 * Normalize a date-of-birth string to YYYY-MM-DD format.
 * Accepts: YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, MM-DD-YYYY, ISO timestamps.
 * Returns null if the input is empty or unparseable.
 */
function normalizeDOB(value) {
  if (!value || typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;

  let y, m, d;

  // YYYY-MM-DD or ISO timestamp (2015-01-05T00:00:00...)
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    [, y, m, d] = match.map(Number);
  } else {
    // MM/DD/YYYY or M/D/YYYY
    match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) {
      // MM-DD-YYYY
      match = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    }
    if (match) {
      [, m, d, y] = match.map(Number);
    }
  }

  if (!y || !m || !d) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;

  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

module.exports = { normalizeDOB };
