/* ═══════════════════════════════════════════════════════
   GameChanger Box Score PDF Parser
   ═══════════════════════════════════════════════════════
   Extracts game data from a GameChanger PDF box score.
   
   GameChanger box score PDFs typically contain:
   - Game header: Teams, date, location, final score
   - Linescore: Runs per inning
   - Batting stats per team (AB, R, H, RBI, BB, SO, etc.)
   - Pitching stats per team (IP, H, R, ER, BB, K, etc.)
   - Sometimes pitch counts per pitcher
   
   pdf-parse gives us raw text; we use regex-based section
   detection to split and parse each section.
   ═══════════════════════════════════════════════════════ */

const pdfParse = require('pdf-parse');

/**
 * Parse a GameChanger box score PDF buffer.
 * @param {Buffer} buffer — PDF file contents
 * @returns {Promise<Object>} Parsed box score data
 */
async function parseBoxScorePDF(buffer) {
  const data = await pdfParse(buffer);
  const text = data.text;
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  const result = {
    gameInfo: extractGameInfo(lines),
    linescore: extractLinescore(lines),
    batting: { away: [], home: [] },
    pitching: { away: [], home: [] },
    raw: text,
  };

  // Detect team names from game info or linescore
  const teams = detectTeams(lines, result.linescore);
  result.gameInfo.awayTeam = teams.away;
  result.gameInfo.homeTeam = teams.home;

  // Extract batting and pitching sections
  const sections = splitSections(lines, teams);
  result.batting.away = parseBattingSection(sections.awayBatting);
  result.batting.home = parseBattingSection(sections.homeBatting);
  result.pitching.away = parsePitchingSection(sections.awayPitching);
  result.pitching.home = parsePitchingSection(sections.homePitching);

  return result;
}

/* ── Game Info ── */
function extractGameInfo(lines) {
  const info = { date: null, time: null, location: null, finalScore: null };

  for (const line of lines) {
    // Date patterns: "April 5, 2026", "4/5/2026", "2026-04-05"
    if (!info.date) {
      const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      if (dateMatch) {
        info.date = normalizeDate(dateMatch[1]);
      } else {
        const longDate = line.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4})/i);
        if (longDate) {
          const d = new Date(longDate[1]);
          if (!isNaN(d)) info.date = d.toISOString().slice(0, 10);
        }
      }
    }

    // Time: "6:30 PM", "18:30"
    if (!info.time) {
      const timeMatch = line.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
      if (timeMatch) info.time = normalizeTime(timeMatch[1]);
    }

    // Location
    if (!info.location) {
      const locMatch = line.match(/(?:at|@|location|field|venue)[:\s]+(.+)/i);
      if (locMatch) info.location = locMatch[1].trim();
    }

    // Final score: "Final: 8-3", "Final 8 - 3"
    if (!info.finalScore) {
      const finalMatch = line.match(/final[:\s]*(\d+)\s*[-–]\s*(\d+)/i);
      if (finalMatch) {
        info.finalScore = { away: parseInt(finalMatch[1]), home: parseInt(finalMatch[2]) };
      }
    }
  }

  return info;
}

/* ── Detect Team Names ── */
function detectTeams(lines, linescore) {
  const teams = { away: null, home: null };

  // Linescore often has team names as first column
  if (linescore.length >= 2) {
    teams.away = linescore[0].team;
    teams.home = linescore[1].team;
  }

  if (!teams.away || !teams.home) {
    // Look for "Team vs Team", "Team at Team"  
    for (const line of lines.slice(0, 10)) {
      const vsMatch = line.match(/^(.+?)\s+(?:vs\.?|at|@)\s+(.+?)$/i);
      if (vsMatch) {
        teams.away = teams.away || vsMatch[1].trim();
        teams.home = teams.home || vsMatch[2].trim();
        break;
      }
    }
  }

  return teams;
}

/* ── Linescore ── */
function extractLinescore(lines) {
  const results = [];

  // Look for a line that has inning numbers: "1 2 3 4 5 6 7 R H E" or similar
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Header row with inning numbers
    if (/^\s*(team)?\s*1\s+2\s+3/i.test(line) || /inning/i.test(line)) {
      // Next 2 lines should be team linescore rows
      for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
        const row = parseLinescoreRow(lines[j]);
        if (row) results.push(row);
      }
      break;
    }

    // Sometimes the linescore is formatted as "TeamName  0 1 2 0 0 1 0  4 7 1"
    const scoreRow = parseLinescoreRow(line);
    if (scoreRow && scoreRow.innings.length >= 3) {
      // Check if next line is also a linescore row
      if (i + 1 < lines.length) {
        const nextRow = parseLinescoreRow(lines[i + 1]);
        if (nextRow && nextRow.innings.length >= 3) {
          results.push(scoreRow, nextRow);
          break;
        }
      }
    }
  }

  return results;
}

function parseLinescoreRow(line) {
  // Match: "TeamName  0 1 2 0 0 1 0  4 7 1" or "TeamName 0 1 2 0 0 1 0 - 4 7 1"
  const match = line.match(/^([A-Za-z][\w\s.'-]*?)\s{2,}([\d\sXx-]+)$/);
  if (!match) {
    // Try: tokens where first is text, rest are numbers
    const tokens = line.split(/\s+/);
    if (tokens.length >= 5) {
      let textEnd = 0;
      for (let k = 0; k < tokens.length; k++) {
        if (/^\d+$/.test(tokens[k]) || tokens[k] === 'X' || tokens[k] === 'x') break;
        textEnd = k + 1;
      }
      if (textEnd > 0 && textEnd < tokens.length - 2) {
        const team = tokens.slice(0, textEnd).join(' ');
        const nums = tokens.slice(textEnd).filter(t => /^[\dXx]$/.test(t) || /^\d+$/.test(t));
        if (nums.length >= 3) {
          // Last 3 are R, H, E — rest are innings
          const innings = nums.slice(0, -3).map(n => n === 'X' || n === 'x' ? null : parseInt(n));
          const [runs, hits, errors] = nums.slice(-3).map(n => parseInt(n) || 0);
          return { team, innings, runs, hits, errors };
        }
      }
    }
    return null;
  }

  const team = match[1].trim();
  const nums = match[2].trim().split(/\s+/).filter(n => /^[\dXx]+$/.test(n));
  if (nums.length < 4) return null;

  const innings = nums.slice(0, -3).map(n => n === 'X' || n === 'x' ? null : parseInt(n));
  const [runs, hits, errors] = nums.slice(-3).map(n => parseInt(n) || 0);
  return { team, innings, runs, hits, errors };
}

/* ── Section Splitting ── */
function splitSections(lines, teams) {
  const sections = {
    awayBatting: [],
    homeBatting: [],
    awayPitching: [],
    homePitching: [],
  };

  let currentSection = null;
  const awayName = (teams.away || '').toLowerCase();
  const homeName = (teams.home || '').toLowerCase();

  // Keywords that indicate section boundaries
  const BATTING_KEYWORDS = ['ab', 'r', 'h', 'rbi', 'bb', 'so', 'avg'];
  const PITCHING_KEYWORDS = ['ip', 'h', 'r', 'er', 'bb', 'k', 'so', 'era', 'np'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Detect section headers
    if (isSectionHeader(lower, 'batting', awayName, homeName, BATTING_KEYWORDS)) {
      if (lower.includes(awayName) || (!currentSection && !sections.awayBatting.length)) {
        currentSection = 'awayBatting';
      } else {
        currentSection = 'homeBatting';
      }
      continue;
    }

    if (isSectionHeader(lower, 'pitching', awayName, homeName, PITCHING_KEYWORDS)) {
      if (lower.includes(awayName) || (!sections.awayPitching.length && sections.awayBatting.length)) {
        currentSection = 'awayPitching';
      } else {
        currentSection = 'homePitching';
      }
      continue;
    }

    // Detect inline team name header (e.g., "Tigers Batting" or just team name before stat rows)
    if (awayName && lower.includes(awayName) && (lower.includes('batting') || lower.includes('hitting'))) {
      currentSection = 'awayBatting';
      continue;
    }
    if (homeName && lower.includes(homeName) && (lower.includes('batting') || lower.includes('hitting'))) {
      currentSection = 'homeBatting';
      continue;
    }
    if (awayName && lower.includes(awayName) && lower.includes('pitching')) {
      currentSection = 'awayPitching';
      continue;
    }
    if (homeName && lower.includes(homeName) && lower.includes('pitching')) {
      currentSection = 'homePitching';
      continue;
    }

    // If we see a batting header row (AB R H ...), figure out which team
    if (!currentSection && /\bab\b/i.test(line) && /\b[rh]\b/i.test(line)) {
      currentSection = !sections.awayBatting.length ? 'awayBatting' : 'homeBatting';
      // This line is the header — include it
    }

    if (!currentSection && /\bip\b/i.test(line) && (/\ber\b/i.test(line) || /\bk\b/i.test(line))) {
      currentSection = !sections.awayPitching.length ? 'awayPitching' : 'homePitching';
    }

    if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  return sections;
}

function isSectionHeader(lower, type, awayName, homeName, keywords) {
  if (!lower.includes(type)) return false;
  // Must include a team name or appear after linescore
  if (awayName && lower.includes(awayName)) return true;
  if (homeName && lower.includes(homeName)) return true;
  // Check if this line has stat column headers
  const kCount = keywords.filter(k => lower.includes(k)).length;
  return kCount >= 3;
}

/* ── Batting Section Parser ── */
function parseBattingSection(sectionLines) {
  if (!sectionLines || sectionLines.length === 0) return [];

  // Find header row (contains AB, R, H)
  let headerIdx = -1;
  let headers = [];
  for (let i = 0; i < sectionLines.length; i++) {
    const tokens = sectionLines[i].split(/\s{2,}|\t/).map(t => t.trim()).filter(Boolean);
    const lower = tokens.map(t => t.toLowerCase());
    if (lower.includes('ab') && (lower.includes('r') || lower.includes('h'))) {
      headers = lower;
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    // Try more relaxed matching
    for (let i = 0; i < Math.min(sectionLines.length, 3); i++) {
      const tokens = sectionLines[i].split(/\s+/).map(t => t.trim().toLowerCase());
      if (tokens.filter(t => ['ab', 'r', 'h', 'rbi', 'bb', 'so'].includes(t)).length >= 3) {
        headers = tokens;
        headerIdx = i;
        break;
      }
    }
  }

  if (headerIdx === -1) return [];

  // Normalize common header variants
  headers = headers.map(h => {
    const map = { 'k': 'so', 'avg': 'avg', 'obp': 'obp', 'slg': 'slg', 'ops': 'ops' };
    return map[h] || h;
  });

  // Parse player rows
  const players = [];
  for (let i = headerIdx + 1; i < sectionLines.length; i++) {
    const line = sectionLines[i];
    // Stop at summary/total rows
    if (/^total/i.test(line) || /^team/i.test(line) || line === '') continue;
    // Stop at a new section
    if (/pitching/i.test(line)) break;

    const player = parseBattingRow(line, headers);
    if (player) players.push(player);
  }

  return players;
}

function parseBattingRow(line, headers) {
  // Split by 2+ spaces or tabs — first token(s) are player name, rest are stat values
  const parts = line.split(/\s{2,}|\t/).map(t => t.trim()).filter(Boolean);
  if (parts.length < 3) return null;

  // The name could be "John Smith" or "Smith, J" or "#12 Smith"
  // Find where the numbers start
  let nameEnd = 0;
  for (let i = 0; i < parts.length; i++) {
    if (/^\d+$/.test(parts[i]) || /^\.\d+$/.test(parts[i]) || parts[i] === '-') {
      nameEnd = i;
      break;
    }
  }

  if (nameEnd === 0) {
    // Try splitting the first token further
    const tokens = line.split(/\s+/);
    nameEnd = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (/^\d+$/.test(tokens[i]) && i > 0) {
        const name = tokens.slice(0, i).join(' ');
        const vals = tokens.slice(i);
        return buildBattingPlayer(name, vals, headers);
      }
    }
    return null;
  }

  const name = parts.slice(0, nameEnd).join(' ');
  const vals = parts.slice(nameEnd);
  return buildBattingPlayer(name, vals, headers);
}

function buildBattingPlayer(name, vals, headers) {
  // Strip jersey number prefix: "#12 Smith" → "Smith", jersey=12
  let jersey = null;
  let cleanName = name;
  const jerseyMatch = name.match(/^#?(\d{1,3})\s+(.+)/);
  if (jerseyMatch) {
    jersey = jerseyMatch[1];
    cleanName = jerseyMatch[2];
  }

  // Strip position suffix: "Smith SS" or "Smith, J - SS"
  const posMatch = cleanName.match(/(.+?)\s*[-–]\s*(P|C|1B|2B|3B|SS|LF|CF|RF|DH|PH|PR)\s*$/i);
  let position = null;
  if (posMatch) {
    cleanName = posMatch[1].trim();
    position = posMatch[2].toUpperCase();
  }

  // Find which headers we're mapping to — skip the name column
  const statHeaders = headers.filter(h => !['player', 'name', 'batters', 'batting', '#', 'pos'].includes(h));

  const stats = {};
  for (let i = 0; i < statHeaders.length && i < vals.length; i++) {
    const v = vals[i];
    stats[statHeaders[i]] = v === '-' ? null : (isNaN(v) ? v : parseFloat(v));
  }

  return {
    name: cleanName.trim(),
    jersey,
    position,
    ...stats,
  };
}

/* ── Pitching Section Parser ── */
function parsePitchingSection(sectionLines) {
  if (!sectionLines || sectionLines.length === 0) return [];

  // Find header row (contains IP)
  let headerIdx = -1;
  let headers = [];
  for (let i = 0; i < sectionLines.length; i++) {
    const tokens = sectionLines[i].split(/\s{2,}|\t/).map(t => t.trim()).filter(Boolean);
    const lower = tokens.map(t => t.toLowerCase());
    if (lower.includes('ip') && (lower.includes('er') || lower.includes('k') || lower.includes('so') || lower.includes('h'))) {
      headers = lower;
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    for (let i = 0; i < Math.min(sectionLines.length, 3); i++) {
      const tokens = sectionLines[i].split(/\s+/).map(t => t.trim().toLowerCase());
      if (tokens.filter(t => ['ip', 'h', 'r', 'er', 'bb', 'k', 'so', 'np'].includes(t)).length >= 3) {
        headers = tokens;
        headerIdx = i;
        break;
      }
    }
  }

  if (headerIdx === -1) return [];

  // Normalize
  headers = headers.map(h => {
    const map = { 'so': 'k', 'strikeouts': 'k', 'walks': 'bb', 'np': 'pitches', 'pc': 'pitches', '#p': 'pitches' };
    return map[h] || h;
  });

  const pitchers = [];
  for (let i = headerIdx + 1; i < sectionLines.length; i++) {
    const line = sectionLines[i];
    if (/^total/i.test(line) || /^team/i.test(line) || line === '') continue;
    if (/batting|hitting|fielding/i.test(line)) break;

    const pitcher = parsePitchingRow(line, headers);
    if (pitcher) pitchers.push(pitcher);
  }

  return pitchers;
}

function parsePitchingRow(line, headers) {
  const parts = line.split(/\s{2,}|\t/).map(t => t.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  let nameEnd = 0;
  for (let i = 0; i < parts.length; i++) {
    if (/^\d/.test(parts[i]) && i > 0) {
      nameEnd = i;
      break;
    }
  }

  if (nameEnd === 0) {
    const tokens = line.split(/\s+/);
    for (let i = 1; i < tokens.length; i++) {
      if (/^\d/.test(tokens[i])) {
        const name = tokens.slice(0, i).join(' ');
        const vals = tokens.slice(i);
        return buildPitcher(name, vals, headers);
      }
    }
    return null;
  }

  const name = parts.slice(0, nameEnd).join(' ');
  const vals = parts.slice(nameEnd);
  return buildPitcher(name, vals, headers);
}

function buildPitcher(name, vals, headers) {
  let jersey = null;
  let cleanName = name;
  const jerseyMatch = name.match(/^#?(\d{1,3})\s+(.+)/);
  if (jerseyMatch) {
    jersey = jerseyMatch[1];
    cleanName = jerseyMatch[2];
  }

  // Win/Loss/Save indicator: "(W)", "(L)", "(S)"
  let decision = null;
  const decMatch = cleanName.match(/\s*\((W|L|S|SV)\)\s*$/i);
  if (decMatch) {
    decision = decMatch[1].toUpperCase();
    cleanName = cleanName.replace(decMatch[0], '').trim();
  }

  const statHeaders = headers.filter(h => !['pitcher', 'pitchers', 'name', '#', 'pitching'].includes(h));

  const stats = {};
  for (let i = 0; i < statHeaders.length && i < vals.length; i++) {
    const v = vals[i];
    stats[statHeaders[i]] = v === '-' ? null : (isNaN(v) ? v : parseFloat(v));
  }

  return {
    name: cleanName.trim(),
    jersey,
    decision,
    ...stats,
  };
}

/* ── Utility ── */
function normalizeDate(str) {
  // "4/5/2026" → "2026-04-05"
  const parts = str.split('/');
  if (parts.length === 3) {
    let [m, d, y] = parts;
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return str;
}

function normalizeTime(str) {
  // "6:30 PM" → "18:30"
  const match = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return str;
  let h = parseInt(match[1]);
  const m = match[2];
  const ampm = match[3];
  if (ampm) {
    if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
    if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
  }
  return `${String(h).padStart(2, '0')}:${m}`;
}

module.exports = { parseBoxScorePDF };
