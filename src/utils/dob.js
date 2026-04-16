/**
 * Format a DOB string (YYYY-MM-DD) for display as MM/DD/YYYY.
 * Returns '—' if the input is empty or unparseable.
 */
export function formatDOB(dob) {
  if (!dob || typeof dob !== 'string') return '—';
  const match = dob.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return dob; // fallback to raw value
  const [, y, m, d] = match;
  return `${Number(m)}/${Number(d)}/${y}`;
}

/**
 * Calculate age from a DOB string (YYYY-MM-DD).
 * Returns null if unparseable.
 */
export function calculateAge(dob) {
  if (!dob || typeof dob !== 'string') return null;
  const match = dob.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  const mDiff = (today.getMonth() + 1) - m;
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < d)) age--;
  return age >= 0 ? age : null;
}
