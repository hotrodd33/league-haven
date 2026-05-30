import { useEffect, useMemo, useState, useCallback } from 'react';
import { fetchOrganizations, fetchTeams, fetchGames, fetchSeasons } from '../api/index.js';
import './FieldCalendar.print.css';

// ── Constants ─────────────────────────────────────────────────────────────
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// One color per distinct field/location (Outlook style).
const FIELD_COLORS = [
  { bg: 'bg-blue-900/40',    text: 'text-blue-300',    dot: 'bg-blue-500' },
  { bg: 'bg-emerald-900/40', text: 'text-emerald-300', dot: 'bg-emerald-500' },
  { bg: 'bg-rose-900/40',    text: 'text-rose-300',    dot: 'bg-rose-500' },
  { bg: 'bg-amber-900/40',   text: 'text-amber-300',   dot: 'bg-amber-500' },
  { bg: 'bg-purple-900/40',  text: 'text-purple-300',  dot: 'bg-purple-500' },
  { bg: 'bg-cyan-900/40',    text: 'text-cyan-300',    dot: 'bg-cyan-500' },
  { bg: 'bg-pink-900/40',    text: 'text-pink-300',    dot: 'bg-pink-500' },
  { bg: 'bg-indigo-900/40',  text: 'text-indigo-300',  dot: 'bg-indigo-500' },
  { bg: 'bg-teal-900/40',    text: 'text-teal-300',    dot: 'bg-teal-500' },
  { bg: 'bg-orange-900/40',  text: 'text-orange-300',  dot: 'bg-orange-500' },
];
const UNASSIGNED_COLOR = { bg: 'bg-gray-700/40', text: 'text-gray-300', dot: 'bg-gray-500' };

// ── Helpers ───────────────────────────────────────────────────────────────
function formatTimeChip(t) {
  if (!t) return 'TBD';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'P' : 'A';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2, '0')}${ap}`;
}

function formatTime(t) {
  if (!t) return 'TBD';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fieldAbbrev(name) {
  if (!name) return '—';
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words.slice(0, 3).map(w => w[0].toUpperCase()).join('');
  }
  return String(name).slice(0, 3).toUpperCase();
}

function teamLevelLabel(ageGroup, level) {
  return [ageGroup, level].filter(Boolean).map(s => String(s).trim()).join(' ').trim();
}

function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function buildMonthDays(year, month) {
  const first = new Date(year, month, 1);
  const lastDate = new Date(year, month + 1, 0).getDate();
  const startWeekday = first.getDay();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= lastDate; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

// ── Component ─────────────────────────────────────────────────────────────
export default function FieldPrep({ onNavigateToGame }) {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [orgs, setOrgs]   = useState([]);
  const [orgId, setOrgId] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [visibleFieldIds, setVisibleFieldIds] = useState(null); // null = all
  const [selectedDate, setSelectedDate] = useState(null);

  // Load org and season metadata once
  useEffect(() => {
    Promise.all([fetchOrganizations().catch(() => []), fetchSeasons().catch(() => [])])
      .then(([orgList, seasonList]) => {
        setOrgs(orgList || []);
        if (orgList && orgList.length === 1) setOrgId(orgList[0].id);
        setSeasons(seasonList || []);
        const current = (seasonList || []).find(s => s.is_current) || (seasonList || [])[0];
        if (current) setSeasonId(current.id);
      });
  }, []);

  // Load games for the selected org+season
  const load = useCallback(async () => {
    if (!orgId) { setGames([]); return; }
    setLoading(true); setError(null);
    try {
      // 1) Get teams in this org so we can pull the games they play in
      const orgTeams = await fetchTeams(orgId);
      const teamIds = orgTeams.map(t => t.id);
      if (!teamIds.length) { setGames([]); return; }
      // 2) Pull games for those teams, filtered by season if set.
      //    We keep only games where the home_org is this org since field prep
      //    is about HOSTED games (away games happen at someone else's field).
      const allGames = await fetchGames({
        team_ids: teamIds.join(','),
        ...(seasonId ? { season_id: seasonId } : {}),
      });
      setGames(allGames.filter(g => g.home_org_id === orgId && g.status !== 'cancelled'));
    } catch (err) {
      console.error('FieldPrep load failed', err);
      setError(err.message || 'Failed to load games.');
    } finally {
      setLoading(false);
    }
  }, [orgId, seasonId]);

  useEffect(() => { load(); }, [load]);

  // Derive unique field list (id, name) from games
  const fields = useMemo(() => {
    const m = new Map();
    games.forEach(g => {
      const key = g.location_name || '__none__';
      if (!m.has(key)) m.set(key, { id: key, name: g.location_name || '(No field assigned)' });
    });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [games]);

  const fieldColorMap = useMemo(() => {
    const m = {};
    fields.forEach((f, i) => {
      m[f.id] = f.name === '(No field assigned)' ? UNASSIGNED_COLOR : FIELD_COLORS[i % FIELD_COLORS.length];
    });
    return m;
  }, [fields]);

  const effectiveFieldIds = visibleFieldIds ?? new Set(fields.map(f => f.id));

  // Filter games by visible fields, then group by date string
  const visibleGames = useMemo(
    () => games.filter(g => effectiveFieldIds.has(g.location_name || '__none__')),
    [games, effectiveFieldIds]
  );

  const gamesInMonth = useMemo(
    () => visibleGames.filter(g => {
      const d = String(g.game_date).slice(0, 10);
      return d.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`);
    }),
    [visibleGames, year, month]
  );

  const gamesByDate = useMemo(() => {
    const m = {};
    gamesInMonth.forEach(g => {
      const key = String(g.game_date).slice(0, 10);
      (m[key] ||= []).push(g);
    });
    Object.values(m).forEach(arr => arr.sort((a, b) => String(a.game_time || '').localeCompare(String(b.game_time || ''))));
    return m;
  }, [gamesInMonth]);

  const monthDays = useMemo(() => buildMonthDays(year, month), [year, month]);
  const todayKey  = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  function prevMonth() { setMonth(m => (m === 0 ? (setYear(y => y - 1), 11) : m - 1)); }
  function nextMonth() { setMonth(m => (m === 11 ? (setYear(y => y + 1), 0) : m + 1)); }
  function goToday()   { setYear(today.getFullYear()); setMonth(today.getMonth()); }

  function toggleField(id) {
    setVisibleFieldIds(prev => {
      const base = prev ?? new Set(fields.map(f => f.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const headerSub = useMemo(() => {
    const counts = {};
    gamesInMonth.forEach(g => {
      const k = g.location_name || '(No field)';
      counts[k] = (counts[k] || 0) + 1;
    });
    const parts = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`);
    return parts.length ? parts.join(' · ') : 'No games scheduled this month.';
  }, [gamesInMonth]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="fc-print-root space-y-4">
      <div className="fc-print-panel space-y-4">
      <div className="fc-print-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">Field Prep Schedule</h2>
          <p className="text-xs text-gray-400 mt-1">{headerSub}</p>
        </div>
        <div className="fc-print-hide flex flex-wrap gap-2 items-center">
          <select
            value={orgId || ''}
            onChange={(e) => setOrgId(Number(e.target.value) || null)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200">
            <option value="">Select organization…</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          {seasons.length > 0 && (
            <select
              value={seasonId || ''}
              onChange={(e) => setSeasonId(Number(e.target.value) || null)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200">
              <option value="">All seasons</option>
              {seasons.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (current)' : ''}</option>)}
            </select>
          )}
          <button onClick={() => window.print()} className="px-3 py-1 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 hover:bg-gray-700">Print</button>
        </div>
      </div>

      {/* Month nav */}
      <div className="fc-print-month-bar flex items-center justify-between border-y border-gray-800 py-2">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="fc-print-hide px-2 py-1 text-sm text-gray-300 hover:bg-gray-700 rounded">←</button>
          <button onClick={goToday} className="fc-print-hide px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 rounded">Today</button>
          <span className="fc-print-month-label text-base font-semibold text-white min-w-[160px] text-center">{MONTH_NAMES[month]} {year}</span>
          <button onClick={nextMonth} className="fc-print-hide px-2 py-1 text-sm text-gray-300 hover:bg-gray-700 rounded">→</button>
        </div>
        {loading && <span className="fc-print-hide text-xs text-gray-500">Loading…</span>}
      </div>

      {error && <div className="lh-alert-error">{error}</div>}
      {!orgId && <p className="py-8 text-center text-gray-400">Select an organization to view its field schedule.</p>}

      {orgId && (
        <div className="fc-print-body flex flex-col lg:flex-row gap-4">
          {/* Filter sidebar */}
          {fields.length > 0 && (
            <aside className="lg:w-56 shrink-0 border lg:border-r border-gray-700 bg-gray-900/40 rounded px-3 py-3 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Fields</h3>
                  <div className="flex gap-1 text-[10px]">
                    <button onClick={() => setVisibleFieldIds(new Set(fields.map(f => f.id)))} className="text-gray-400 hover:text-white">All</button>
                    <span className="text-gray-600">·</span>
                    <button onClick={() => setVisibleFieldIds(new Set())} className="text-gray-400 hover:text-white">None</button>
                  </div>
                </div>
                <div className="space-y-1">
                  {fields.map(f => (
                    <label key={f.id} className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer py-0.5 hover:text-white">
                      <input type="checkbox" checked={effectiveFieldIds.has(f.id)} onChange={() => toggleField(f.id)} className="accent-action-500" />
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${fieldColorMap[f.id].dot}`} />
                      <span className="font-bold text-gray-300 shrink-0">[{fieldAbbrev(f.name)}]</span>
                      <span className="truncate">{f.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </aside>
          )}

          {/* Calendar grid */}
          <div className="fc-print-content flex-1 min-w-0">
            <div className="fc-print-grid-header grid grid-cols-7 gap-px mb-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="text-center text-[10px] font-bold uppercase text-gray-500 py-1">{d}</div>
              ))}
            </div>
            <div className="fc-print-grid grid grid-cols-7 gap-px">
              {monthDays.map((day, i) => {
                if (day === null) return <div key={`pad-${i}`} className="fc-print-day min-h-[80px]" />;
                const dk = dateKey(year, month, day);
                const dayGames = gamesByDate[dk] || [];
                const isToday = dk === todayKey;
                const isSelected = selectedDate === dk;
                return (
                  <button key={dk} type="button"
                    onClick={() => setSelectedDate(isSelected ? null : dk)}
                    className={`fc-print-day min-h-[80px] p-1 text-left rounded transition-colors
                      ${isToday ? 'ring-1 ring-action-500' : ''}
                      ${isSelected ? 'bg-gray-700' : 'hover:bg-gray-700/50'}`}>
                    <div className={`fc-print-day-num text-xs font-semibold mb-0.5 ${isToday ? 'text-action-300' : 'text-gray-300'}`}>{day}</div>
                    <div className="space-y-0.5">
                      {dayGames.slice(0, 4).map(g => {
                        const fKey = g.location_name || '__none__';
                        const c = fieldColorMap[fKey] || UNASSIGNED_COLOR;
                        const level = teamLevelLabel(g.home_age_group, g.home_level)
                                   || teamLevelLabel(g.away_age_group, g.away_level);
                        const umps = (g.official_names || []).join(', ');
                        const tooltip = [
                          `${formatTime(g.game_time)} — ${g.home_team_name} vs ${g.away_team_name}`,
                          g.location_name && `Field: ${g.location_name}`,
                          level && `Level: ${level}`,
                          umps ? `Umpire(s): ${umps}` : 'Umpire: unassigned',
                          g.division_name && `Division: ${g.division_name}`,
                        ].filter(Boolean).join('\n');
                        return (
                          <div key={g.id} title={tooltip}
                            onClick={(e) => { e.stopPropagation(); onNavigateToGame?.(g.id); }}
                            className={`fc-print-event-chip text-[9px] leading-tight truncate rounded px-1 py-0.5 cursor-pointer ${c.bg} ${c.text}`}>
                            <span className="font-bold mr-0.5">[{fieldAbbrev(g.location_name)}]</span>
                            {formatTimeChip(g.game_time)}{level ? ` ${level}` : ''}{umps ? ` · ${umps.split(',')[0].trim()}` : ' · —'}
                          </div>
                        );
                      })}
                      {dayGames.length > 4 && (
                        <div className="fc-print-event-chip-overflow text-[9px] text-gray-400">+{dayGames.length - 4} more</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected day detail */}
            {selectedDate && (
              <div className="fc-print-selected-day mt-4 border-t border-gray-700 pt-4">
                <h3 className="text-sm font-bold text-white mb-2">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </h3>
                {(gamesByDate[selectedDate] || []).length === 0 ? (
                  <p className="text-sm text-gray-400">No games scheduled.</p>
                ) : (
                  <div className="space-y-2">
                    {(gamesByDate[selectedDate] || []).map(g => {
                      const fKey = g.location_name || '__none__';
                      const c = fieldColorMap[fKey] || UNASSIGNED_COLOR;
                      const level = teamLevelLabel(g.home_age_group, g.home_level)
                                 || teamLevelLabel(g.away_age_group, g.away_level);
                      const umps = (g.official_names || []);
                      return (
                        <div key={g.id}
                          onClick={() => onNavigateToGame?.(g.id)}
                          className={`rounded-lg border-l-4 px-3 py-2 cursor-pointer hover:brightness-125 ${c.bg}`}
                          style={{ borderColor: 'currentColor' }}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-bold ${c.text}`}>[{fieldAbbrev(g.location_name)}] {g.location_name || '(No field)'}</span>
                              {level && <span className="text-[10px] bg-gray-900/60 px-1.5 py-0.5 rounded text-gray-300">{level}</span>}
                            </div>
                            <span className="text-xs text-gray-300">{formatTime(g.game_time)}</span>
                          </div>
                          <div className="text-sm text-white font-semibold mt-1">{g.home_team_name} <span className="text-gray-400">vs</span> {g.away_team_name}</div>
                          <div className="text-xs mt-1">
                            <span className="text-gray-400">Umpire:</span>{' '}
                            {umps.length
                              ? <span className="text-gray-200">{umps.join(', ')}</span>
                              : <span className="text-amber-400 italic">unassigned</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            {fields.length > 0 && (
              <div className="fc-print-legend flex flex-wrap gap-3 mt-4 pt-3 border-t border-gray-700">
                {fields.map(f => (
                  <div key={f.id} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className={`w-2.5 h-2.5 rounded-full ${fieldColorMap[f.id].dot}`} />
                    <span className="font-bold text-gray-300">[{fieldAbbrev(f.name)}]</span>
                    {f.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
