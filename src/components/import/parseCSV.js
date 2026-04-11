/* ═══════════════════════════════════════════════════════
   CSV Parser — Client-side preview parsing
   Handles quoted fields, commas in values, newlines.
   ═══════════════════════════════════════════════════════ */

export function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row = [];
    while (i < len) {
      let value = '';
      if (text[i] === '"') {
        // Quoted field
        i++;
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            value += text[i];
            i++;
          }
        }
      } else {
        while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          value += text[i];
          i++;
        }
      }
      row.push(value.trim());
      if (i < len && text[i] === ',') {
        i++;
      } else {
        break;
      }
    }
    // Skip line endings
    if (i < len && text[i] === '\r') i++;
    if (i < len && text[i] === '\n') i++;

    if (row.length > 0 && !(row.length === 1 && row[0] === '')) {
      rows.push(row);
    }
  }

  if (rows.length < 2) return { headers: rows[0] || [], rows: [] };

  const headers = rows[0];
  const dataRows = rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = r[idx] || ''; });
    return obj;
  });

  return { headers, rows: dataRows };
}

/* ── Auto-detect GameChanger import type from headers ── */
const STAT_HEADERS = ['AB', 'H', 'R', 'HR', 'RBI', 'AVG', 'OBP', 'SLG', 'IP', 'ERA', 'K', 'BB', 'W', 'L', 'SV'];
const SCHEDULE_HEADERS = ['Date', 'Time', 'Opponent', 'Home/Away', 'Location', 'Result'];
const ROSTER_HEADERS = ['First', 'Last', 'Jersey', '#', 'Number', 'Position', 'Pos'];
const BOX_HEADERS = ['Inning', 'Score', 'Batter', 'Pitcher', 'Play', 'Result'];

export function detectImportType(headers) {
  const h = headers.map(s => s.toLowerCase());
  const has = (terms) => terms.some(t => h.some(col => col.includes(t.toLowerCase())));

  if (has(STAT_HEADERS.slice(0, 6))) return 'stats';
  if (has(BOX_HEADERS.slice(0, 3))) return 'boxscore';
  if (has(SCHEDULE_HEADERS.slice(0, 3))) return 'schedule';
  if (has(ROSTER_HEADERS)) return 'roster';
  return null;
}

/* ── Detect from filename ── */
export function detectFromFilename(name) {
  const n = name.toLowerCase();
  if (n.includes('stat') || n.includes('batting') || n.includes('pitching') || n.includes('fielding')) return 'stats';
  if (n.includes('box') || n.includes('score')) return 'boxscore';
  if (n.includes('schedule') || n.includes('calendar') || n.includes('.ics')) return 'schedule';
  if (n.includes('roster') || n.includes('player') || n.includes('lineup')) return 'roster';
  return null;
}

/* ── Match players from import to existing roster ── */
export function matchPlayers(importRows, existingPlayers) {
  return importRows.map(row => {
    const jersey = row['#'] || row['Jersey'] || row['Number'] || '';
    const firstName = row['First'] || row['First Name'] || '';
    const lastName = row['Last'] || row['Last Name'] || '';
    const fullName = row['Player'] || row['Name'] || `${firstName} ${lastName}`.trim();

    // Try jersey match first
    let match = null;
    let confidence = 'new';

    if (jersey) {
      match = existingPlayers.find(p => String(p.jersey_number) === String(jersey));
      if (match) {
        // Verify name also matches
        const pName = `${match.first_name} ${match.last_name}`.toLowerCase();
        if (pName.includes(fullName.toLowerCase()) || fullName.toLowerCase().includes(pName)) {
          confidence = 'exact';
        } else {
          confidence = 'possible';
        }
      }
    }

    // Try name match if no jersey match
    if (!match && fullName) {
      match = existingPlayers.find(p => {
        const pName = `${p.first_name} ${p.last_name}`.toLowerCase();
        return pName === fullName.toLowerCase();
      });
      if (match) confidence = 'exact';

      // Fuzzy: last name match
      if (!match && lastName) {
        match = existingPlayers.find(p =>
          p.last_name?.toLowerCase() === lastName.toLowerCase()
        );
        if (match) confidence = 'possible';
      }
    }

    return {
      ...row,
      _importName: fullName,
      _importJersey: jersey,
      _match: match,
      _confidence: confidence,
      _accepted: confidence === 'exact',
    };
  });
}
