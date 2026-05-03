/* ═══════════════════════════════════════════════════════
   Fuzzy String Matching
   ═══════════════════════════════════════════════════════
   Lightweight Levenshtein-based similarity for matching
   external names (e.g. GameChanger team/player names) to
   our database records.
   ═══════════════════════════════════════════════════════ */

/**
 * Compute Levenshtein edit distance between two strings.
 * Uses a single-row DP table for O(min(m,n)) memory.
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  // Ensure a is the shorter string for memory efficiency
  if (a.length > b.length) { const t = a; a = b; b = t; }

  const prev = new Array(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;

  for (let j = 1; j <= b.length; j++) {
    let prevDiag = prev[0];
    prev[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = prev[i];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[i] = Math.min(
        prev[i] + 1,        // deletion
        prev[i - 1] + 1,    // insertion
        prevDiag + cost     // substitution
      );
      prevDiag = tmp;
    }
  }
  return prev[a.length];
}

/**
 * Normalize a string for comparison: lowercase, collapse whitespace,
 * strip punctuation and common noise tokens.
 */
function normalize(s) {
  if (s == null) return '';
  return String(s)
    .toLowerCase()
    .replace(/[._'’`]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Similarity score between two strings, normalized to [0, 1].
 * 1.0 = identical (after normalization), 0 = completely different.
 *
 * Uses normalized Levenshtein distance: 1 - (distance / maxLen).
 * Returns 0 when both inputs normalize to empty string.
 */
function similarity(a, b) {
  const aN = normalize(a);
  const bN = normalize(b);
  if (!aN && !bN) return 0;
  if (aN === bN) return 1;
  const maxLen = Math.max(aN.length, bN.length);
  if (maxLen === 0) return 0;
  const dist = levenshtein(aN, bN);
  return 1 - dist / maxLen;
}

/**
 * Find the best fuzzy matches for `query` against an array of `candidates`.
 *
 * @param {string} query - The string to match.
 * @param {Array<any>} candidates - Items to match against.
 * @param {object} opts
 * @param {(c: any) => string | string[]} opts.keyFn -
 *   Returns the comparable string (or array of comparable strings) for a candidate.
 *   When an array is returned, the highest score across keys is used.
 * @param {number} [opts.threshold=0.6] - Minimum score to include in results.
 * @param {number} [opts.limit=5] - Maximum number of matches to return.
 * @returns {Array<{candidate: any, score: number, matchedKey: string}>}
 *          Sorted descending by score.
 */
function findBestMatches(query, candidates, opts = {}) {
  const { keyFn, threshold = 0.6, limit = 5 } = opts;
  if (!query || !candidates?.length || typeof keyFn !== 'function') return [];

  const scored = [];
  for (const c of candidates) {
    const keys = keyFn(c);
    const keyArr = Array.isArray(keys) ? keys : [keys];
    let bestScore = 0;
    let bestKey = '';
    for (const k of keyArr) {
      if (!k) continue;
      const s = similarity(query, k);
      if (s > bestScore) { bestScore = s; bestKey = k; }
    }
    if (bestScore >= threshold) {
      scored.push({ candidate: c, score: bestScore, matchedKey: bestKey });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

module.exports = { levenshtein, normalize, similarity, findBestMatches };
