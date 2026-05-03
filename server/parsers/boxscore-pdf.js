/* ═══════════════════════════════════════════════════════
   GameChanger Box Score Parser
   ═══════════════════════════════════════════════════════
   Parses box score data from GameChanger PDFs or pasted
   text. Tuned for the actual GC output format:

   Line 1:  "Team1 Full Name Team2 Full NameScore1 - Score2"
   Line 2:  "Away Friday July 18, 2025"
   Linescore header:  "1 2 3 4 5 6 R H E"
   Linescore rows:    "ABBR 0 1 2 ... R H E"
   "BATTING"
   "Team1 Full Name AB R H RBI BB SO"
   Player rows:  "F Last #NN (POS) 0 0 0 0 0 0"
   "Totals ..."
   "Team2 Full Name AB R H RBI BB SO"
   Player rows...
   Extra lines (TB, SB, LOB, 2B, 3B...)
   "Scorekeeping. Stats. Live Game Updates."
   "PITCHING"
   "Team1 Full… IP H R ER BB SO HR"   (may be truncated with …)
   Pitcher rows:  "F Last #NN 2.0 4 10 8 5 4 0"
   "Totals ..."
   "Team2 Full… IP H R ER BB SO HR"
   Pitcher rows...
   "P-S: F Last 68-31, F Last2 52-26, ..."   ← pitch counts!
   "P-S: ..."   (second team)
   ═══════════════════════════════════════════════════════ */

/* ── Player name/jersey/position parser ──
   Handles: "H Finley #7 (CF)", "Evan A #3", "Jaxon M", "F Larson #32"
   Returns: { name, firstName, lastName, jersey, position }
*/
function parsePlayerToken(raw) {
  let s = raw.trim();
  // Extract position in parens: (CF), (1B), etc.
  let position = null;
  const posMatch = s.match(/\(([A-Z0-9]{1,3})\)\s*$/i);
  if (posMatch) {
    position = posMatch[1].toUpperCase();
    s = s.slice(0, posMatch.index).trim();
  }
  // Extract jersey: #NN
  let jersey = null;
  const jerseyMatch = s.match(/#(\d{1,3})/);
  if (jerseyMatch) {
    jersey = jerseyMatch[1];
    s = s.replace(/#\d{1,3}/, '').replace(/\s+/g, ' ').trim();
  }
  // What remains is the name — e.g. "H Finley", "Evan A"
  const name = s;
  const parts = name.split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || '';
  return { name, firstName, lastName, jersey, position };
}

/* ── Main entry: parse from text ── */
function parseBoxScoreText(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  // ── 1. Find major section boundaries ──
  const battingIdx = lines.findIndex(l => /^BATTING$/i.test(l));
  const pitchingIdx = lines.findIndex(l => /^PITCHING$/i.test(l));

  // ── 2. Extract game info from header lines (before BATTING) ──
  const headerLines = lines.slice(0, battingIdx > 0 ? battingIdx : 10);
  const gameInfo = extractGameInfo(headerLines);

  // ── 3. Extract linescore from header ──
  const linescore = extractLinescore(headerLines);

  // ── 4. Split batting section into two teams ──
  //   Batting section = lines between BATTING and PITCHING
  const battingLines = battingIdx >= 0
    ? lines.slice(battingIdx + 1, pitchingIdx > battingIdx ? pitchingIdx : undefined)
    : [];

  // Each team sub-section starts with a line containing "AB R H RBI BB SO"
  const battingSubs = splitByTeamHeaders(battingLines, /\bAB\b.*\bR\b.*\bH\b/i);
  const awayBatting = parseBattingSection(battingSubs[0] || []);
  const homeBatting = parseBattingSection(battingSubs[1] || []);

  // Get full team names from batting header lines
  const awayTeam = battingSubs[0]?._teamName || linescore[0]?.team || null;
  const homeTeam = battingSubs[1]?._teamName || linescore[1]?.team || null;
  gameInfo.awayTeam = awayTeam;
  gameInfo.homeTeam = homeTeam;

  // ── 5. Split pitching section into two teams + P-S lines ──
  const pitchingLines = pitchingIdx >= 0 ? lines.slice(pitchingIdx + 1) : [];
  const pitchingSubs = splitByTeamHeaders(pitchingLines, /\bIP\b.*\bH\b.*\bR\b/i);
  const awayPitching = parsePitchingSection(pitchingSubs[0] || []);
  const homePitching = parsePitchingSection(pitchingSubs[1] || []);

  // ── 6. Extract P-S (pitch-strike) counts ──
  //   These appear after the pitching tables. They may be:
  //   - Prefixed: "L: M Vette, P-S: F Larson 68-31, P Hein 52-26, WP: ..."
  //   - Wrapped across multiple lines if the PDF re-flowed the text.
  //   Strategy: concatenate all post-pitching text, isolate the P-S region
  //   (between any "P-S:" markers and the next end-marker like BF/WP/HBP/E),
  //   then extract every "Name N-N" pair and match to whichever pitcher it is
  //   on either team. This avoids assumptions about line splitting or team order.
  mergePitchCountsGlobal(
    [...awayPitching, ...homePitching],
    pitchingIdx >= 0 ? lines.slice(pitchingIdx) : lines
  );

  // ── 7. If no final score from header, derive from linescore ──
  if (!gameInfo.finalScore && linescore.length >= 2) {
    gameInfo.finalScore = {
      away: linescore[0].runs,
      home: linescore[1].runs,
    };
  }

  const result = {
    gameInfo,
    linescore,
    batting: { away: awayBatting, home: homeBatting },
    pitching: { away: awayPitching, home: homePitching },
    raw: text,
  };

  // Debug info
  result._debug = {
    lineCount: lines.length,
    teamsDetected: { away: awayTeam, home: homeTeam },
    battingSubs: battingSubs.map(s => ({
      teamName: s?._teamName,
      lines: (s || []).length,
      sample: (s || []).slice(0, 3),
    })),
    pitchingSubs: pitchingSubs.map(s => ({
      teamName: s?._teamName,
      lines: (s || []).length,
      sample: (s || []).slice(0, 3),
    })),
    psLines: findPSLines(pitchingIdx >= 0 ? lines.slice(pitchingIdx) : lines),
    awayPitchersFound: awayPitching.map(p => p.name + ' #' + p.jersey + ' ' + (p.pitches ?? '?') + 'P'),
    homePitchersFound: homePitching.map(p => p.name + ' #' + p.jersey + ' ' + (p.pitches ?? '?') + 'P'),
    first15Lines: lines.slice(0, 15),
  };

  return result;
}

/* ── PDF entry ── */
async function parseBoxScorePDF(buffer) {
  let text;
  try {
    const { extractText } = await import('unpdf');
    const result = await extractText(new Uint8Array(buffer));
    text = Array.isArray(result.text) ? result.text.join('\n') : String(result.text || '');
  } catch (err) {
    throw new Error(
      'Could not extract text from this PDF. Try pasting the box score text instead. ' +
      '(' + err.message + ')'
    );
  }
  if (!text || text.trim().length < 20) {
    throw new Error(
      'The PDF appears empty or its text is encoded. Try pasting the box score text instead.'
    );
  }
  return parseBoxScoreText(text);
}

/* ══════════════════════════════════════════════════════════
   Game Info
   ══════════════════════════════════════════════════════════ */
function extractGameInfo(lines) {
  const info = { date: null, time: null, location: null, finalScore: null };

  for (const line of lines) {
    // Date: "Friday July 18, 2025", "4/5/2026", "2026-04-05"
    if (!info.date) {
      const longDate = line.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4})/i);
      if (longDate) {
        const d = new Date(longDate[1]);
        if (!isNaN(d)) info.date = d.toISOString().slice(0, 10);
      } else {
        const shortDate = line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        if (shortDate) info.date = normalizeDate(shortDate[1]);
      }
    }

    // Time: "6:30 PM"
    if (!info.time) {
      const tm = line.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
      if (tm) info.time = normalizeTime(tm[1]);
    }

    // Score on first line: "Team1 Team2Score - Score" (GC concatenates weirdly)
    if (!info.finalScore) {
      const scoreMatch = line.match(/(\d{1,3})\s*[-\u2013]\s*(\d{1,3})\s*$/);
      if (scoreMatch) {
        info.finalScore = {
          away: parseInt(scoreMatch[1]),
          home: parseInt(scoreMatch[2]),
        };
      }
    }
  }

  return info;
}

/* ══════════════════════════════════════════════════════════
   Linescore
   ══════════════════════════════════════════════════════════ */
function extractLinescore(lines) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*1\s+2\s+3/.test(lines[i])) {
      for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
        const row = parseLinescoreRow(lines[j]);
        if (row) results.push(row);
      }
      break;
    }
  }
  return results;
}

function parseLinescoreRow(line) {
  const tokens = line.split(/\s+/);
  if (tokens.length < 5) return null;
  let textEnd = 0;
  for (let k = 0; k < tokens.length; k++) {
    if (/^[\dXx]+$/.test(tokens[k])) { textEnd = k; break; }
    textEnd = k + 1;
  }
  if (textEnd === 0 || textEnd >= tokens.length - 2) return null;

  const team = tokens.slice(0, textEnd).join(' ');
  const nums = tokens.slice(textEnd);
  if (nums.length < 4) return null;

  const innings = nums.slice(0, -3).map(n => /^[Xx]$/.test(n) ? null : parseInt(n) || 0);
  const [runs, hits, errors] = nums.slice(-3).map(n => parseInt(n) || 0);
  return { team, innings, runs, hits, errors };
}

/* ══════════════════════════════════════════════════════════
   Section Splitting
   Splits an array of lines into sub-arrays, one per team.
   Each team sub-section starts with a header line matching
   the provided regex (e.g. "TeamName AB R H RBI BB SO").
   ══════════════════════════════════════════════════════════ */
function splitByTeamHeaders(lines, headerRegex) {
  const subs = [];
  let current = null;

  for (const line of lines) {
    // Skip GC branding lines
    if (/^Scorekeeping/i.test(line)) continue;

    if (headerRegex.test(line)) {
      // Start a new sub-section
      current = [];
      current._teamName = extractTeamNameFromHeader(line);
      subs.push(current);
      current.push(line); // include header
    } else if (current) {
      current.push(line);
    }
  }
  return subs;
}

/**
 * Extract the team name from a header line like:
 *   "MBL - Tigers 11AA AB R H RBI BB SO"
 *   "Red Wing 1\u2026 IP H R ER BB SO HR"
 * by stripping the stat column names from the end.
 */
function extractTeamNameFromHeader(line) {
  return line
    .replace(/\b(AB|R|H|RBI|BB|SO|HR|IP|ER|AVG|OBP|SLG|OPS|ERA|NP|PC|K)\b/gi, '')
    .replace(/[\u2026]+/g, '')  // GC truncation ellipsis
    .replace(/\s+/g, ' ')
    .trim();
}

/* ══════════════════════════════════════════════════════════
   Batting Parser
   ══════════════════════════════════════════════════════════ */
function parseBattingSection(sectionLines) {
  if (!sectionLines || sectionLines.length === 0) return [];

  const headerLine = sectionLines[0];
  const statCols = (headerLine.match(/\b(AB|R|H|RBI|BB|SO|HR|AVG|OBP|SLG|OPS)\b/gi) || [])
    .map(h => h.toLowerCase());

  if (statCols.length < 3) return [];

  const players = [];
  for (let i = 1; i < sectionLines.length; i++) {
    const line = sectionLines[i];
    if (/^Totals?\b/i.test(line)) break;
    if (/^(TB|SB|LOB|2B|3B|HBP|CS|SAC):/i.test(line)) break;

    const player = parsePlayerRow(line, statCols);
    if (player) players.push(player);
  }
  return players;
}

/* ══════════════════════════════════════════════════════════
   Pitching Parser
   ══════════════════════════════════════════════════════════ */
function parsePitchingSection(sectionLines) {
  if (!sectionLines || sectionLines.length === 0) return [];

  const headerLine = sectionLines[0];
  const statCols = (headerLine.match(/\b(IP|H|R|ER|BB|SO|HR|K|ERA|NP|PC|WP|BF)\b/gi) || [])
    .map(h => {
      const l = h.toLowerCase();
      if (l === 'so') return 'k';
      return l;
    });

  if (statCols.length < 3) return [];

  const pitchers = [];
  for (let i = 1; i < sectionLines.length; i++) {
    const line = sectionLines[i];
    if (/^Totals?\b/i.test(line)) break;
    if (/^P-S:/i.test(line)) break;
    if (/^(WP|HBP|BF|E):/i.test(line)) break;

    const player = parsePlayerRow(line, statCols);
    if (player) pitchers.push(player);
  }
  return pitchers;
}

/* ── Shared player row parser ──
   Handles: "H Finley #7 (CF) 0 2 0 0 4 0"
   Strategy: take the LAST N tokens as stat values (where N = statCols.length),
   everything before that is the player name/jersey/position.
*/
function parsePlayerRow(line, statCols) {
  const tokens = line.split(/\s+/);
  const numStats = statCols.length;

  if (tokens.length < numStats + 1) return null;

  // The last numStats tokens should be numbers
  const valTokens = tokens.slice(-numStats);
  if (!valTokens.every(v => /^-?\d+(\.\d+)?$/.test(v))) return null;

  const nameTokens = tokens.slice(0, -numStats);
  const rawName = nameTokens.join(' ');
  const info = parsePlayerToken(rawName);

  const stats = {};
  for (let i = 0; i < statCols.length; i++) {
    stats[statCols[i]] = parseFloat(valTokens[i]);
  }

  return {
    name: info.name,
    firstName: info.firstName,
    lastName: info.lastName,
    jersey: info.jersey,
    position: info.position,
    ...stats,
  };
}

/* ══════════════════════════════════════════════════════════
   P-S (Pitches-Strikes) Extraction
   Lines like: "P-S: F Larson 68-31, P Hein 52-26, WP: ..."
   Each P-S line belongs to the corresponding team's pitchers.
   ══════════════════════════════════════════════════════════ */
function findPSLines(lines) {
  const results = [];
  for (const line of lines) {
    // Match either a line starting with "P-S:" OR a decision line
    // containing "P-S:" (e.g. "W: S Benedict, P-S: S Benedict 20-14, ...")
    const idx = line.search(/P-S:/i);
    if (idx >= 0) {
      results.push(line.slice(idx));
    }
  }
  return results;
}

/**
 * Parse a P-S line and merge pitch counts into the pitcher array.
 * Format: "P-S: F Larson 68-31, P Hein 52-26, WP: F Larson 2, ..."
 */
function mergePitchCounts(pitchers, psLine) {
  if (!psLine || !pitchers.length) return;

  // Get the part after "P-S:" and before any other stat key
  let payload = psLine.replace(/^P-S:\s*/i, '');
  payload = payload.replace(/,?\s*(WP|HBP|BF|E):.*$/i, '').trim();

  // Split by comma: "F Larson 68-31", "P Hein 52-26"
  const entries = payload.split(/,/).map(s => s.trim()).filter(Boolean);

  for (const entry of entries) {
    const m = entry.match(/^(.+?)\s+(\d+)-(\d+)$/);
    if (!m) continue;

    const name = m[1].trim();
    const pitches = parseInt(m[2]);
    const strikes = parseInt(m[3]);

    const nameLower = name.toLowerCase();
    const pitcher = pitchers.find(p => {
      return p.name.toLowerCase() === nameLower ||
        p.name.toLowerCase().includes(nameLower) ||
        nameLower.includes(p.name.toLowerCase());
    });

    if (pitcher) {
      pitcher.pitches = pitches;
      pitcher.strikes = strikes;
    }
  }
}

/**
 * Scan all post-pitching text for "Name N-N" pairs and merge into whichever
 * pitcher (across both teams) the name matches. Tolerant to:
 *   - P-S lists wrapped across multiple lines after PDF re-flow
 *   - Decision prefixes like "L:" / "W:" before "P-S:"
 *   - Truncated table-row names (e.g. "S Benedic" matched to "S Benedict")
 */
function mergePitchCountsGlobal(allPitchers, postPitchingLines) {
  if (!allPitchers.length || !postPitchingLines.length) return;

  const joined = postPitchingLines.join(' ');
  // Split on every "P-S:" marker; each chunk = one team's P-S section
  // (possibly followed by BF:/E:/WP:/HBP: sub-sections we need to strip).
  const chunks = joined.split(/P-S:/i).slice(1);
  if (!chunks.length) return;

  const seen = new Set();
  for (const rawChunk of chunks) {
    // Strip from BF:/E: onward — those reference the same pitcher names with
    // a single number which would confuse the "Name N-N" regex.
    let chunk = rawChunk.replace(/\b(BF|E):[\s\S]*$/i, '');

    const re = /([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*)+)\s+(\d+)-(\d+)/g;
    let m;
    while ((m = re.exec(chunk)) !== null) {
      const rawName = m[1].trim();
      const pitches = parseInt(m[2]);
      const strikes = parseInt(m[3]);

      // Strip stray prefix words (decision indicators, WP/HBP, etc.)
      const cleanedName = rawName.replace(/^(WP|HBP|W|L|SV|HLD)\s+/i, '').trim();
      const nameLower = cleanedName.toLowerCase();
      if (seen.has(nameLower)) continue;
      seen.add(nameLower);

      const pitcher = allPitchers.find(p => {
        const pn = (p.name || '').toLowerCase();
        if (!pn) return false;
        // Strip ellipsis characters used by GC to indicate truncation,
        // e.g. "G Berkt…" should match "G Berktold".
        const pnTrim = pn.replace(/[…\.]+$/g, '').trim();
        const nameTrim = nameLower.replace(/[…\.]+$/g, '').trim();
        if (!pnTrim || !nameTrim) return false;
        return pnTrim === nameTrim ||
          pnTrim.includes(nameTrim) ||
          nameTrim.includes(pnTrim);
      });

      if (pitcher) {
        pitcher.pitches = pitches;
        pitcher.strikes = strikes;
        // Pitcher table names in the PDF are sometimes truncated (e.g.
        // "S Benedic", "G Berkto"). The P-S list usually has the full name —
        // prefer the longer form so downstream roster matching works.
        if (cleanedName.length > (pitcher.name || '').length) {
          pitcher.name = cleanedName;
          const parts = cleanedName.split(/\s+/);
          pitcher.firstName = parts[0] || pitcher.firstName;
          pitcher.lastName = parts.slice(1).join(' ') || pitcher.lastName;
        }
      }
    }
  }
}

/* ══════════════════════════════════════════════════════════
   Utilities
   ══════════════════════════════════════════════════════════ */
function normalizeDate(str) {
  const parts = str.split('/');
  if (parts.length === 3) {
    let [m, d, y] = parts;
    if (y.length === 2) y = '20' + y;
    return y + '-' + m.padStart(2, '0') + '-' + d.padStart(2, '0');
  }
  return str;
}

function normalizeTime(str) {
  const match = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return str;
  let h = parseInt(match[1]);
  const m = match[2];
  const ampm = match[3];
  if (ampm) {
    if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
    if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
  }
  return String(h).padStart(2, '0') + ':' + m;
}

module.exports = { parseBoxScorePDF, parseBoxScoreText };
