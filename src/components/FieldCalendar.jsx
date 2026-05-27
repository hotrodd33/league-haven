import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchReservations, createReservation, updateReservation, deleteReservation,
  fetchTeams, fetchSeasons, createGame,
  fetchScheduleSettings, fetchAssignableOfficials, fetchOrganizations,
  checkGameConflicts,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input, Select, Modal } from './ui';
import './FieldCalendar.print.css';

const EVENT_COLORS = {
  game_hold: { bg: 'bg-signal-900/40', border: 'border-signal-500', text: 'text-signal-300', dot: 'bg-signal-500' },
  practice: { bg: 'bg-chrome-900/40', border: 'border-chrome-500', text: 'text-chrome-300', dot: 'bg-chrome-500' },
  event: { bg: 'bg-purple-900/40', border: 'border-purple-500', text: 'text-purple-300', dot: 'bg-purple-500' },
  maintenance: { bg: 'bg-amber-900/40', border: 'border-amber-500', text: 'text-amber-300', dot: 'bg-amber-500' },
};

const EVENT_LABELS = {
  game_hold: 'Game',
  practice: 'Practice',
  event: 'Event',
  maintenance: 'Maintenance',
};

// Color palette assigned per field in combined view (Outlook-style)
const FIELD_COLORS = [
  { bg: 'bg-blue-900/40', border: 'border-blue-500', text: 'text-blue-300', dot: 'bg-blue-500' },
  { bg: 'bg-emerald-900/40', border: 'border-emerald-500', text: 'text-emerald-300', dot: 'bg-emerald-500' },
  { bg: 'bg-rose-900/40', border: 'border-rose-500', text: 'text-rose-300', dot: 'bg-rose-500' },
  { bg: 'bg-amber-900/40', border: 'border-amber-500', text: 'text-amber-300', dot: 'bg-amber-500' },
  { bg: 'bg-purple-900/40', border: 'border-purple-500', text: 'text-purple-300', dot: 'bg-purple-500' },
  { bg: 'bg-cyan-900/40', border: 'border-cyan-500', text: 'text-cyan-300', dot: 'bg-cyan-500' },
  { bg: 'bg-pink-900/40', border: 'border-pink-500', text: 'text-pink-300', dot: 'bg-pink-500' },
  { bg: 'bg-indigo-900/40', border: 'border-indigo-500', text: 'text-indigo-300', dot: 'bg-indigo-500' },
  { bg: 'bg-teal-900/40', border: 'border-teal-500', text: 'text-teal-300', dot: 'bg-teal-500' },
  { bg: 'bg-orange-900/40', border: 'border-orange-500', text: 'text-orange-300', dot: 'bg-orange-500' },
];

const DURATION_OPTIONS = (() => {
  const opts = [];
  for (let m = 60; m <= 720; m += 15) {
    const h = Math.floor(m / 60), min = m % 60;
    const label = min === 0 ? `${h} hr${h > 1 ? 's' : ''}` : `${h}:${String(min).padStart(2, '0')}`;
    opts.push({ value: m, label });
  }
  return opts;
})();

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h * 60) + m;
}

// Generate time options in 15-minute increments (12-hour display, 24-hour value)
function generateTimeOptions() {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      const label = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

function getMonthDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  // Pad start
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  return days;
}

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildRecurDates(startDate, recurType, recurDays, recurEndDate, recurCount) {
  if (recurType === 'none') return [startDate];
  const dates = [];
  const limit = recurType === 'count' ? Number(recurCount) : 365;
  let cur = startDate;
  while (dates.length < limit) {
    const dow = new Date(cur + 'T00:00:00').getDay();
    if (recurDays.includes(dow)) dates.push(cur);
    cur = addDays(cur, 1);
    if (recurType === 'until' && cur > recurEndDate) break;
    if (cur > addDays(startDate, 365)) break;
  }
  return dates;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export default function FieldCalendar({ field, fields, onClose, onViewGame }) {
  const { canEditOrg } = useAuth();

  // Normalize to an array of fields. `field` (single) is the legacy/primary mode.
  const fieldsArr = useMemo(() => {
    if (fields && fields.length) return fields;
    if (field) return [field];
    return [];
  }, [fields, field]);
  const isMulti = fieldsArr.length > 1;
  const primaryField = fieldsArr[0] || null;
  const editable = primaryField ? canEditOrg(primaryField.org_id) : false;

  // Stable color per field
  const fieldColorMap = useMemo(() => {
    const m = {};
    fieldsArr.forEach((f, i) => { m[f.id] = FIELD_COLORS[i % FIELD_COLORS.length]; });
    return m;
  }, [fieldsArr]);
  const fieldsById = useMemo(() => {
    const m = {};
    fieldsArr.forEach(f => { m[f.id] = f; });
    return m;
  }, [fieldsArr]);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingField, setEditingField] = useState(null); // field context for the form
  const [deleting, setDeleting] = useState(null);
  const [teams, setTeams] = useState([]);
  const [view, setView] = useState('month'); // 'month' | 'list'

  // Filter state: which calendars/types/teams are visible
  const [visibleFieldIds, setVisibleFieldIds] = useState(() => new Set(fieldsArr.map(f => f.id)));
  const [visibleTypes, setVisibleTypes] = useState(() => new Set(Object.keys(EVENT_LABELS)));
  // null = "all teams (including no-team)". A Set means explicit selection.
  const [visibleTeamIds, setVisibleTeamIds] = useState(null);
  const [showFilters, setShowFilters] = useState(true);

  // Keep visibleFieldIds in sync when caller adds/removes fields
  useEffect(() => {
    setVisibleFieldIds(prev => {
      const next = new Set();
      fieldsArr.forEach(f => { next.add(f.id); });
      // Preserve any user-driven exclusions by intersecting with prev IF prev had fewer
      // (Simpler: if prev is non-empty and ⊆ current, keep prev; else default to all)
      if (prev.size && [...prev].every(id => next.has(id))) return prev;
      return next;
    });
  }, [fieldsArr]);

  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const toDate = new Date(year, month + 1, 0);
  const to = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`;

  const load = useCallback(async () => {
    if (!fieldsArr.length) { setEvents([]); setLoading(false); return; }
    setLoading(true);
    try {
      const promises = [
        teams.length ? Promise.resolve(teams) : fetchTeams(),
        ...fieldsArr.map(f => fetchReservations(f.id, from, to).catch(err => {
          console.error(`Failed to load reservations for field ${f.id}`, err);
          return [];
        })),
      ];
      const [teamList, ...resultsPerField] = await Promise.all(promises);
      const merged = resultsPerField.flat();
      setEvents(merged);
      if (!teams.length) setTeams(teamList);
    } catch (err) { console.error('Failed to load reservations', err); }
    finally { setLoading(false); }
  }, [fieldsArr, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth()); }

  async function handleDelete(ev) {
    if (!window.confirm(`Delete "${ev.title}"?`)) return;
    setDeleting(ev.id);
    try { await deleteReservation(ev.id); setEvents(prev => prev.filter(e => e.id !== ev.id)); }
    catch (err) { alert(`Failed to delete: ${err.message}`); }
    finally { setDeleting(null); }
  }

  // Fields the current user can schedule into (used for the create flow's field picker)
  const editableFields = useMemo(
    () => fieldsArr.filter(f => canEditOrg(f.org_id)),
    [fieldsArr, canEditOrg]
  );
  const canCreate = editableFields.length > 0;

  function openEdit(ev) {
    const f = fieldsById[ev.location_id] || primaryField;
    setEditingField(f);
    setEditing(ev);
    setShowForm(true);
  }
  function openCreate() {
    // Default to primary field if it's editable, else first editable field
    const def = (primaryField && canEditOrg(primaryField.org_id)) ? primaryField : editableFields[0];
    setEditingField(def || null);
    setEditing(null);
    setShowForm(true);
  }

  // ── Filter options & application ──────────────────────────────────────────
  const teamOptions = useMemo(() => {
    const m = new Map();
    let hasNone = false;
    events.forEach(ev => {
      if (ev.is_game) {
        if (ev.home_team_id && ev.home_team_name) m.set(ev.home_team_id, ev.home_team_name);
        if (ev.away_team_id && ev.away_team_name) m.set(ev.away_team_id, ev.away_team_name);
      } else if (ev.team_id && ev.team_name) {
        m.set(ev.team_id, ev.team_name);
      } else {
        hasNone = true;
      }
    });
    const arr = [...m.entries()].map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (hasNone) arr.push({ id: '__none__', name: '(No team)' });
    return arr;
  }, [events]);

  const effectiveTeamIds = visibleTeamIds ?? new Set(teamOptions.map(t => t.id));

  const filteredEvents = useMemo(() => events.filter(ev => {
    if (!visibleFieldIds.has(ev.location_id)) return false;
    if (!visibleTypes.has(ev.event_type)) return false;
    // Team filter: game holds match if either home or away team is visible;
    // other events match by their single team_id (or '__none__').
    if (ev.is_game) {
      const ids = ev.team_ids && ev.team_ids.length
        ? ev.team_ids
        : [ev.home_team_id, ev.away_team_id].filter(Boolean);
      if (ids.length === 0) {
        if (!effectiveTeamIds.has('__none__')) return false;
      } else if (!ids.some(id => effectiveTeamIds.has(id))) {
        return false;
      }
    } else {
      const tid = ev.team_id || '__none__';
      if (!effectiveTeamIds.has(tid)) return false;
    }
    return true;
  }), [events, visibleFieldIds, visibleTypes, effectiveTeamIds]);

  // Group events by date
  const eventsByDate = {};
  filteredEvents.forEach(ev => {
    const d = typeof ev.event_date === 'string' ? ev.event_date.slice(0, 10) : ev.event_date;
    if (!eventsByDate[d]) eventsByDate[d] = [];
    eventsByDate[d].push(ev);
  });
  Object.values(eventsByDate).forEach(arr => arr.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')));

  const monthDays = getMonthDays(year, month);
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const upcomingEvents = [...filteredEvents]
    .sort((a, b) => (a.event_date + a.start_time).localeCompare(b.event_date + b.start_time));

  // Color resolver: per-field color in multi mode, per-type color in single mode
  function colorFor(ev) {
    if (isMulti) {
      return fieldColorMap[ev.location_id] || EVENT_COLORS[ev.event_type] || EVENT_COLORS.practice;
    }
    return EVENT_COLORS[ev.event_type] || EVENT_COLORS.practice;
  }

  // Toggle helpers
  function toggleSetItem(setter, key) {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function toggleTeam(id) {
    setVisibleTeamIds(prev => {
      const base = prev ?? new Set(teamOptions.map(t => t.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const headerTitle = isMulti
    ? `Combined Calendar · ${fieldsArr.length} fields`
    : (primaryField?.name || 'Field Calendar');
  const headerSub = isMulti
    ? fieldsArr.map(f => f.name).join(', ')
    : (primaryField ? [primaryField.address, primaryField.city, primaryField.state].filter(Boolean).join(', ') : '');

  return (
    <div className="fc-print-root fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className={`fc-print-panel bg-gray-800 rounded-xl shadow-xl w-full ${isMulti ? 'max-w-6xl' : 'max-w-3xl'} my-4 text-gray-200 flex flex-col max-h-[90vh]`}>
        {/* Header */}
        <div className="fc-print-header flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div className="min-w-0">
            <h2 className="text-xl font-display font-bold text-white truncate">{headerTitle}</h2>
            <p className="text-xs text-gray-400 truncate">{headerSub}</p>
          </div>
          <div className="fc-print-hide flex items-center gap-2 shrink-0">
            {canCreate && (
              <Button onClick={openCreate}>
                + Schedule
              </Button>
            )}
            <Button variant="secondary" onClick={() => window.print()} title="Print this view">
              Print
            </Button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg" aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* View toggle + month nav */}
        <div className="fc-print-month-bar flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-gray-700 shrink-0">
          <div className="fc-print-hide flex items-center gap-1">
            <button onClick={() => setView('month')}
              className={`lh-tab ${view === 'month' ? 'lh-tab-active' : 'lh-tab-inactive'}`}>
              Calendar
            </button>
            <button onClick={() => setView('list')}
              className={`lh-tab ${view === 'list' ? 'lh-tab-active' : 'lh-tab-inactive'}`}>
              List
            </button>
            <button onClick={() => setShowFilters(s => !s)}
              className={`lh-tab ${showFilters ? 'lh-tab-active' : 'lh-tab-inactive'}`}
              title="Toggle filter panel">
              {showFilters ? 'Hide Filters' : 'Filters'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="fc-print-hide p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={goToday} className="fc-print-hide px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 rounded">Today</button>
            <span className="fc-print-month-label text-sm font-semibold text-white min-w-[140px] text-center">{MONTH_NAMES[month]} {year}</span>
            <button onClick={nextMonth} className="fc-print-hide p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        {/* Body: filter sidebar (when shown) + main content */}
        <div className="fc-print-body flex-1 overflow-y-auto flex flex-col lg:flex-row">
          {showFilters && (
            <FilterPanel
              fieldsArr={fieldsArr}
              fieldColorMap={fieldColorMap}
              visibleFieldIds={visibleFieldIds}
              onToggleField={(id) => toggleSetItem(setVisibleFieldIds, id)}
              onSetAllFields={(all) => setVisibleFieldIds(all ? new Set(fieldsArr.map(f => f.id)) : new Set())}
              visibleTypes={visibleTypes}
              onToggleType={(t) => toggleSetItem(setVisibleTypes, t)}
              onSetAllTypes={(all) => setVisibleTypes(all ? new Set(Object.keys(EVENT_LABELS)) : new Set())}
              teamOptions={teamOptions}
              effectiveTeamIds={effectiveTeamIds}
              onToggleTeam={toggleTeam}
              onSetAllTeams={(all) => setVisibleTeamIds(all ? new Set(teamOptions.map(t => t.id)) : new Set())}
            />
          )}

          <div className="fc-print-content flex-1 px-5 py-4 min-w-0">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading…</div>
          ) : view === 'month' ? (
            /* Month calendar grid */
            <div>
              {/* Day headers */}
              <div className="fc-print-grid-header grid grid-cols-7 gap-px mb-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="text-center text-[10px] font-bold uppercase text-gray-500 py-1">{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="fc-print-grid grid grid-cols-7 gap-px">
                {monthDays.map((day, i) => {
                  if (day === null) return <div key={`pad-${i}`} className="fc-print-day min-h-[70px]" />;
                  const dk = dateKey(year, month, day);
                  const dayEvents = eventsByDate[dk] || [];
                  const isToday = dk === todayKey;
                  const isSelected = selectedDate === dk;
                  return (
                    <button key={dk} type="button"
                      onClick={() => setSelectedDate(isSelected ? null : dk)}
                      className={`fc-print-day min-h-[70px] p-1 text-left rounded transition-colors
                        ${isToday ? 'ring-1 ring-chrome-500' : ''}
                        ${isSelected ? 'bg-gray-700' : 'hover:bg-gray-700/50'}
                      `}>
                      <div className={`fc-print-day-num text-xs font-semibold mb-0.5 ${isToday ? 'text-chrome-400' : 'text-gray-300'}`}>{day}</div>
                      <div className="space-y-0.5">
                        {dayEvents.map((ev, j) => {
                          const c = colorFor(ev);
                          const evField = fieldsById[ev.location_id];
                          const tooltip = [
                            `${formatTime(ev.start_time)}–${formatTime(ev.end_time)} — ${ev.title}`,
                            evField?.name && `Field: ${evField.name}`,
                            ev.team_name && `Team: ${ev.team_name}`,
                            ev.notes,
                          ].filter(Boolean).join('\n');
                          const isOverflow = j >= 3;
                          return (
                            <div key={ev.id || j} title={tooltip}
                              className={`fc-print-event-chip ${isOverflow ? 'fc-print-only' : ''} text-[9px] leading-tight truncate rounded px-1 py-0.5 ${c.bg} ${c.text}`}>
                              {formatTime(ev.start_time)} {ev.title}
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <div className="fc-print-event-chip-overflow fc-print-hide text-[9px] text-gray-400">+{dayEvents.length - 3} more</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected date detail */}
              {selectedDate && (
                <div className="fc-print-selected-day mt-4 border-t border-gray-700 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white">
                      {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </h3>
                    {canCreate && (
                      <button onClick={openCreate}
                        className="btn btn-xs btn-primary">
                        + Schedule
                      </button>
                    )}
                  </div>
                  {(eventsByDate[selectedDate] || []).length === 0 ? (
                    <p className="text-sm text-gray-400">No events scheduled.</p>
                  ) : (
                    <div className="space-y-2">
                      {(eventsByDate[selectedDate] || []).map(ev => {
                        const evField = fieldsById[ev.location_id];
                        const canEditEv = evField ? canEditOrg(evField.org_id) : editable;
                        return (
                          <EventCard key={ev.id} ev={ev} editable={canEditEv && !ev.is_game}
                            color={colorFor(ev)}
                            fieldName={isMulti ? (evField?.name) : null}
                            onEdit={() => openEdit(ev)}
                            onDelete={() => handleDelete(ev)}
                            onViewGame={onViewGame}
                            deleting={deleting} />
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* List view */
            <div>
              {upcomingEvents.length === 0 ? (
                <p className="py-8 text-center text-gray-400">No upcoming events.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {upcomingEvents.map(ev => {
                      const evField = fieldsById[ev.location_id];
                      const canEditEv = evField ? canEditOrg(evField.org_id) : editable;
                      return (
                        <EventCard key={ev.id} ev={ev} editable={canEditEv && !ev.is_game} showDate
                          color={colorFor(ev)}
                          fieldName={isMulti ? (evField?.name) : null}
                          onEdit={() => openEdit(ev)}
                          onDelete={() => handleDelete(ev)}
                          onViewGame={onViewGame}
                          deleting={deleting} />
                      );
                    })}
                  </div>
                  {/* Print-only compact spreadsheet table */}
                  <table className="fc-print-list-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Field</th>
                        <th className="fc-print-col-desc">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingEvents.map(ev => {
                        const evField = fieldsById[ev.location_id];
                        const dateStr = new Date(String(ev.event_date).slice(0, 10) + 'T12:00:00')
                          .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        const timeStr = `${formatTime(ev.start_time)} – ${formatTime(ev.end_time)}`;
                        const typeStr = EVENT_LABELS[ev.event_type] || ev.event_type;
                        const desc = [ev.title, ev.team_name, ev.notes].filter(Boolean).join(' — ');
                        return (
                          <tr key={ev.id}>
                            <td>{dateStr}</td>
                            <td>{timeStr}</td>
                            <td>{typeStr}</td>
                            <td>{evField?.name || ''}</td>
                            <td className="fc-print-col-desc">{desc}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="fc-print-legend flex flex-wrap gap-3 mt-4 pt-3 border-t border-gray-700">
            {isMulti ? (
              fieldsArr.filter(f => visibleFieldIds.has(f.id)).map(f => (
                <div key={f.id} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className={`w-2.5 h-2.5 rounded-full ${fieldColorMap[f.id].dot}`} />
                  {f.name}
                </div>
              ))
            ) : (
              Object.entries(EVENT_LABELS).map(([type, label]) => {
                const c = EVENT_COLORS[type];
                return (
                  <div key={type} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                    {label}
                  </div>
                );
              })
            )}
          </div>
          </div>
        </div>

        {showForm && editingField && (
          <ReservationForm
            field={editingField}
            fieldChoices={editing ? null : editableFields}
            reservation={editing}
            teams={teams}
            defaultDate={selectedDate}
            onDone={() => { setShowForm(false); setEditing(null); setEditingField(null); load(); }}
            onCancel={() => { setShowForm(false); setEditing(null); setEditingField(null); }}
          />
        )}
      </div>
    </div>
  );
}

// ── Filter sidebar ──────────────────────────────────────────────────────────
function FilterPanel({
  fieldsArr, fieldColorMap, visibleFieldIds, onToggleField, onSetAllFields,
  visibleTypes, onToggleType, onSetAllTypes,
  teamOptions, effectiveTeamIds, onToggleTeam, onSetAllTeams,
}) {
  return (
    <aside className="lg:w-56 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-700 bg-gray-900/40 px-4 py-3 space-y-4">
      {fieldsArr.length > 0 && (
        <FilterSection
          title="Calendars"
          allChecked={fieldsArr.every(f => visibleFieldIds.has(f.id))}
          onSetAll={onSetAllFields}
        >
          {fieldsArr.map(f => (
            <label key={f.id} className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer py-0.5 hover:text-white">
              <input
                type="checkbox"
                checked={visibleFieldIds.has(f.id)}
                onChange={() => onToggleField(f.id)}
                className="rounded border-gray-600 bg-gray-800 text-chrome-500 focus:ring-chrome-500"
              />
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${fieldColorMap[f.id].dot}`} />
              <span className="truncate">{f.name}</span>
            </label>
          ))}
        </FilterSection>
      )}

      <FilterSection
        title="Event Types"
        allChecked={Object.keys(EVENT_LABELS).every(t => visibleTypes.has(t))}
        onSetAll={onSetAllTypes}
      >
        {Object.entries(EVENT_LABELS).map(([type, label]) => (
          <label key={type} className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer py-0.5 hover:text-white">
            <input
              type="checkbox"
              checked={visibleTypes.has(type)}
              onChange={() => onToggleType(type)}
              className="rounded border-gray-600 bg-gray-800 text-chrome-500 focus:ring-chrome-500"
            />
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${EVENT_COLORS[type].dot}`} />
            <span>{label}</span>
          </label>
        ))}
      </FilterSection>

      {teamOptions.length > 0 && (
        <FilterSection
          title="Teams"
          allChecked={teamOptions.every(t => effectiveTeamIds.has(t.id))}
          onSetAll={onSetAllTeams}
        >
          <div className="max-h-48 overflow-y-auto pr-1">
            {teamOptions.map(t => (
              <label key={t.id} className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer py-0.5 hover:text-white">
                <input
                  type="checkbox"
                  checked={effectiveTeamIds.has(t.id)}
                  onChange={() => onToggleTeam(t.id)}
                  className="rounded border-gray-600 bg-gray-800 text-chrome-500 focus:ring-chrome-500"
                />
                <span className="truncate">{t.name}</span>
              </label>
            ))}
          </div>
        </FilterSection>
      )}
    </aside>
  );
}

function FilterSection({ title, allChecked, onSetAll, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{title}</h4>
        <button
          type="button"
          onClick={() => onSetAll(!allChecked)}
          className="text-[10px] text-chrome-400 hover:text-chrome-300"
        >
          {allChecked ? 'None' : 'All'}
        </button>
      </div>
      <div>{children}</div>
    </div>
  );
}

function EventCard({ ev, editable, showDate, color, fieldName, onEdit, onDelete, onViewGame, deleting }) {
  const c = color || EVENT_COLORS[ev.event_type] || EVENT_COLORS.practice;
  const label = EVENT_LABELS[ev.event_type] || ev.event_type;
  const gameClickable = ev.is_game && ev.game_id && onViewGame;
  return (
    <div className={`fc-print-list-card rounded-lg border ${c.border} ${c.bg} px-4 py-3 ${gameClickable ? 'cursor-pointer hover:brightness-125 transition-all' : ''}`}
      onClick={gameClickable ? () => onViewGame(ev.game_id) : undefined}
      role={gameClickable ? 'button' : undefined}
      tabIndex={gameClickable ? 0 : undefined}
      onKeyDown={gameClickable ? (e) => { if (e.key === 'Enter') onViewGame(ev.game_id); } : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wide ${c.text}`}>{label}</span>
            {fieldName && (
              <span className="text-[10px] text-gray-300 bg-gray-900/60 px-1.5 py-0.5 rounded">{fieldName}</span>
            )}
            {showDate && (
              <span className="text-[10px] text-gray-400">
                {new Date(String(ev.event_date).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
            {gameClickable && (
              <span className="text-[10px] text-gray-400 underline">View Game →</span>
            )}
          </div>
          <div className="font-semibold text-sm text-white truncate">{ev.title}</div>
          <div className="text-xs text-gray-300 mt-0.5">
            {formatTime(ev.start_time)} – {formatTime(ev.end_time)}
            {ev.team_name && <span className="text-gray-400 ml-2">• {ev.team_name}</span>}
          </div>
          {ev.created_by_name && !ev.is_game && (
            <div className="text-[10px] text-gray-500 mt-0.5">
              Booked by {ev.created_by_name}
              {ev.created_by_email && (
                <> — <a href={`mailto:${ev.created_by_email}`} className="text-chrome-400 underline hover:text-chrome-300">{ev.created_by_email}</a></>
              )}
              {ev.created_at && (
                <span className="ml-1">on {new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(ev.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
              )}
            </div>
          )}
          {ev.notes && <div className="text-xs text-gray-400 mt-1">{ev.notes}</div>}
        </div>
        {editable && (
          <div className="fc-print-hide flex gap-1 shrink-0">
            <button onClick={onEdit} className="px-2 py-1 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600">Edit</button>
            <button onClick={onDelete} disabled={deleting === ev.id}
              className="btn btn-xs btn-danger">
              {deleting === ev.id ? '…' : 'Del'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReservationForm({ field, fieldChoices, reservation, teams, defaultDate, onDone, onCancel }) {
  const isEditing = !!reservation;
  const { canScheduleGames, canEditOrg } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [conflictDetails, setConflictDetails] = useState(null);

  // When creating from combined view, allow the user to pick a field.
  // When editing, the field is fixed to the reservation's field.
  const selectableFields = useMemo(() => {
    if (isEditing) return [];
    const list = (fieldChoices && fieldChoices.length ? fieldChoices : [field])
      .filter(Boolean)
      .filter(f => canEditOrg(f.org_id));
    return list;
  }, [fieldChoices, field, isEditing, canEditOrg]);
  const [activeFieldId, setActiveFieldId] = useState(() => {
    if (field) return field.id;
    if (selectableFields.length) return selectableFields[0].id;
    return null;
  });
  const activeField = (selectableFields.find(f => f.id === activeFieldId)) || field;

  const todayStr = new Date().toISOString().slice(0, 10);
  const [eventType, setEventType] = useState(reservation?.event_type || 'practice');
  const isGame = eventType === 'game';

  const [form, setForm] = useState({
    title: reservation?.title || '',
    event_type: reservation?.event_type || 'practice',
    event_date: reservation?.event_date?.slice?.(0, 10) || defaultDate || todayStr,
    start_time: reservation?.start_time?.slice?.(0, 5) || '17:00',
    duration_minutes: (() => {
      if (!reservation?.start_time || !reservation?.end_time) return 120;
      const [sh, sm] = reservation.start_time.slice(0, 5).split(':').map(Number);
      const [eh, em] = reservation.end_time.slice(0, 5).split(':').map(Number);
      return (eh * 60 + em) - (sh * 60 + sm) || 120;
    })(),
    team_id: reservation?.team_id || '',
    notes: reservation?.notes || '',
  });

  // Recurrence (practice/event/maintenance only, create only)
  const [recurType, setRecurType] = useState('none'); // 'none' | 'until' | 'count'
  const [recurDays, setRecurDays] = useState(() => {
    const base = reservation?.event_date?.slice?.(0, 10) || defaultDate || todayStr;
    return [new Date(base + 'T00:00:00').getDay()];
  });
  const [recurEndDate, setRecurEndDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 42); return d.toISOString().slice(0, 10);
  });
  const [recurCount, setRecurCount] = useState(6);

  // Game-specific state
  const [gameForm, setGameForm] = useState({
    season_id: '',
    home_team_id: '',
    away_team_id: '',
    game_time: '',
    game_duration_minutes: 150,
    status: 'scheduled',
  });
  const [seasons, setSeasons] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [scheduleSettings, setScheduleSettings] = useState({
    game_start_time: '08:00',
    game_end_time: '20:00',
    game_time_increment_minutes: 30,
  });
  const [fieldConflicts, setFieldConflicts] = useState(null);
  const [confirmSave, setConfirmSave] = useState(false);

  // Load game-related data when game type selected
  useEffect(() => {
    if (!isGame) return;
    Promise.all([
      fetchSeasons(),
      teams.length ? Promise.resolve(teams) : fetchTeams(),
      fetchScheduleSettings(),
    ]).then(([seasonsData, teamsData, settings]) => {
      setSeasons(seasonsData);
      setAllTeams(teamsData);
      const active = seasonsData.find(s => s.is_active);
      if (active && !gameForm.season_id) setGameForm(prev => ({ ...prev, season_id: String(active.id) }));
      setScheduleSettings({
        game_start_time: settings?.game_start_time || '08:00',
        game_end_time: settings?.game_end_time || '20:00',
        game_time_increment_minutes: Number(settings?.game_time_increment_minutes) || 30,
      });
    }).catch(() => {});
  }, [isGame]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build game time slots
  const gameTimeSlots = (() => {
    const start = toMinutes(scheduleSettings.game_start_time);
    const end = toMinutes(scheduleSettings.game_end_time);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return [];
    const step = Number(scheduleSettings.game_time_increment_minutes) || 30;
    const slots = [];
    for (let cur = start; cur <= end; cur += step) {
      const h = Math.floor(cur / 60);
      const m = cur % 60;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
    return slots;
  })();

  // Build team optgroups
  const teamsByOrg = {};
  const ungrouped = [];
  for (const t of allTeams) {
    if (t.org_name) {
      if (!teamsByOrg[t.org_name]) teamsByOrg[t.org_name] = [];
      teamsByOrg[t.org_name].push(t);
    } else {
      ungrouped.push(t);
    }
  }
  const orgNames = Object.keys(teamsByOrg).sort();

  function handleChange(e) { setForm(prev => ({ ...prev, [e.target.name]: e.target.value })); }
  function handleGameChange(e) { setGameForm(prev => ({ ...prev, [e.target.name]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError(null); setConflictDetails(null);

    if (isGame) {
      // Validate game fields
      if (!gameForm.home_team_id || !gameForm.away_team_id) { setSaving(false); setError('Both home and away teams are required.'); return; }
      if (gameForm.home_team_id === gameForm.away_team_id) { setSaving(false); setError('Home and away teams must be different.'); return; }
      if (!form.event_date) { setSaving(false); setError('Date is required.'); return; }

      const data = {
        season_id: gameForm.season_id ? Number(gameForm.season_id) : null,
        home_team_id: Number(gameForm.home_team_id),
        away_team_id: Number(gameForm.away_team_id),
        location_id: activeField.id,
        game_date: form.event_date,
        game_time: gameForm.game_time || null,
        game_duration_minutes: Number(gameForm.game_duration_minutes) || 150,
        status: gameForm.status,
        home_score: null,
        away_score: null,
        innings_played: null,
        official_ids: [],
        notes: form.notes.trim() || null,
      };

      // Check for field conflicts
      if (data.game_time && !confirmSave) {
        try {
          const result = await checkGameConflicts(activeField.id, data.game_date, data.game_time, data.game_duration_minutes);
          if (result.has_conflicts || result.has_warnings) {
            setFieldConflicts(result);
            setSaving(false);
            return;
          }
        } catch { /* proceed */ }
      }

      try {
        await createGame(data);
        setConfirmSave(false);
        setFieldConflicts(null);
        onDone();
      } catch (err) { setError(err.message); }
      finally { setSaving(false); }
      return;
    }

    // Reservation flow
    if (!form.title.trim()) { setSaving(false); setError('Title is required.'); return; }
    if (!form.start_time) { setSaving(false); setError('Start time is required.'); return; }
    if (!form.duration_minutes) { setSaving(false); setError('Duration is required.'); return; }
    if (!isEditing && recurType !== 'none' && recurDays.length === 0) {
      setSaving(false); setError('Select at least one day of week for recurrence.'); return;
    }

    // Compute end_time from start + duration
    const [sh, sm] = form.start_time.split(':').map(Number);
    const endMin = sh * 60 + sm + Number(form.duration_minutes);
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

    const baseData = {
      location_id: activeField.id,
      team_id: form.team_id ? Number(form.team_id) : null,
      title: form.title.trim(),
      event_type: form.event_type,
      start_time: form.start_time,
      end_time: endTime,
      notes: form.notes.trim() || null,
    };

    try {
      if (isEditing) {
        await updateReservation(reservation.id, { ...baseData, event_date: form.event_date });
      } else {
        const recurDates = buildRecurDates(form.event_date, recurType, recurDays, recurEndDate, recurCount);
        if (!recurDates.length) { setSaving(false); setError('No dates match the recurrence pattern.'); return; }
        for (const date of recurDates) {
          await createReservation({ ...baseData, event_date: date });
        }
      }
      onDone();
    } catch (err) {
      setError(err.message);
      if (err.status === 409 && err.details) {
        setConflictDetails(err.details);
      }
    } finally { setSaving(false); }
  }

  function handleConfirmGameSave() {
    setConfirmSave(true);
    setFieldConflicts(null);
    const fakeEvent = { preventDefault: () => {} };
    handleSubmit(fakeEvent);
  }

  // Filter teams to those in the field's org
  const orgTeams = teams.filter(t => t.org_id === activeField?.org_id).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Available event types (game only if user canScheduleGames)
  const eventTypeOptions = [
    ...(canScheduleGames && !isEditing ? [{ value: 'game', label: 'Game' }] : []),
    { value: 'practice', label: 'Practice' },
    { value: 'event', label: 'Event' },
    { value: 'maintenance', label: 'Maintenance' },
  ];

  return (
    <Modal open onClose={onCancel} size="md" title={isEditing ? 'Edit Reservation' : isGame ? 'Schedule Game' : 'Book Field Time'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Field picker — only when creating from combined view */}
          {!isEditing && selectableFields.length > 1 && (
            <Select
              label="Field *"
              id="res-field"
              value={activeFieldId ?? ''}
              onChange={(e) => {
                const newId = Number(e.target.value);
                setActiveFieldId(newId);
                // Reset team selection since teams are scoped to the field's org
                setForm(prev => ({ ...prev, team_id: '' }));
                setGameForm(prev => ({ ...prev, home_team_id: '', away_team_id: '' }));
              }}
            >
              {selectableFields.map(f => (
                <option key={f.id} value={f.id}>{f.name}{f.org_name ? ` — ${f.org_name}` : ''}</option>
              ))}
            </Select>
          )}

          {/* Event type toggle — only on create */}
          {!isEditing && eventTypeOptions.length > 1 && (
            <div>
              <label className="lh-eyebrow">Type</label>
              <div className="flex gap-1 p-1 bg-gray-900 rounded-lg">
                {eventTypeOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setEventType(opt.value);
                      if (opt.value !== 'game') setForm(prev => ({ ...prev, event_type: opt.value }));
                    }}
                    className={`flex-1 lh-tab ${
                      eventType === opt.value
                        ? 'lh-tab-active'
                        : 'lh-tab-inactive'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isGame ? (
            <>
              {/* Game fields */}
              <Select label="Season" id="fc-season" name="season_id" value={gameForm.season_id} onChange={handleGameChange}>
                  <option value="">— None —</option>
                  {seasons.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
                  ))}
              </Select>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="fc-home" className="lh-eyebrow">Home Team *</label>
                  <select id="fc-home" name="home_team_id" value={gameForm.home_team_id} onChange={handleGameChange} required className="lh-select">
                    <option value="">— Select —</option>
                    {orgNames.map(orgName => (
                      <optgroup key={orgName} label={orgName}>
                        {teamsByOrg[orgName].map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </optgroup>
                    ))}
                    {ungrouped.length > 0 && (
                      <optgroup label="Unassigned">
                        {ungrouped.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
                <div>
                  <label htmlFor="fc-away" className="lh-eyebrow">Away Team *</label>
                  <select id="fc-away" name="away_team_id" value={gameForm.away_team_id} onChange={handleGameChange} required className="lh-select">
                    <option value="">— Select —</option>
                    {orgNames.map(orgName => (
                      <optgroup key={orgName} label={orgName}>
                        {teamsByOrg[orgName].map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </optgroup>
                    ))}
                    {ungrouped.length > 0 && (
                      <optgroup label="Unassigned">
                        {ungrouped.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Date *" id="fc-date" name="event_date" type="date" value={form.event_date} onChange={handleChange} required />
                <div>
                  <label htmlFor="fc-time" className="lh-eyebrow">Start Time</label>
                  <select id="fc-time" name="game_time" value={gameForm.game_time} onChange={handleGameChange} className="lh-select">
                    <option value="">— Select —</option>
                    {gameTimeSlots.map(slot => (
                      <option key={slot} value={slot}>{formatTime(slot)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="fc-duration" className="lh-eyebrow">Duration</label>
                  <select id="fc-duration" name="game_duration_minutes" value={gameForm.game_duration_minutes} onChange={handleGameChange} className="lh-select">
                    {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-400">
                📍 Location: <span className="text-white font-semibold">{activeField?.name}</span>
              </div>
            </>
          ) : (
            <>
              {/* Reservation fields */}
              <Input label="Title *" id="res-title" name="title" type="text" value={form.title} onChange={handleChange} required
                  placeholder="e.g. 10U Practice" />

              {isEditing && (
                <Select label="Type" id="res-type" name="event_type" value={form.event_type} onChange={handleChange}>
                    <option value="practice">Practice</option>
                    <option value="event">Event</option>
                    <option value="maintenance">Maintenance</option>
                </Select>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Select label="Team" id="res-team" name="team_id" value={form.team_id} onChange={handleChange}>
                    <option value="">— None —</option>
                    {orgTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
                <Input label="Date *" id="res-date" name="event_date" type="date" value={form.event_date} onChange={handleChange} required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Select label="Start Time *" id="res-start" name="start_time" value={form.start_time} onChange={handleChange} required>
                    <option value="">— Select —</option>
                    {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
                <div>
                  <label htmlFor="res-duration" className="lh-eyebrow block mb-1">Duration *</label>
                  <select id="res-duration" name="duration_minutes" value={form.duration_minutes} onChange={handleChange} required className="lh-select">
                    {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {!isEditing && (
                <div className="space-y-3 border border-white/10 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <span className="lh-eyebrow">Repeat</span>
                    <select value={recurType} onChange={e => setRecurType(e.target.value)} className="lh-select flex-1">
                      <option value="none">No repeat (single date)</option>
                      <option value="until">Repeat until date</option>
                      <option value="count">Repeat N times</option>
                    </select>
                  </div>
                  {recurType !== 'none' && (
                    <>
                      <div>
                        <label className="lh-eyebrow block mb-1">Days of Week</label>
                        <div className="flex flex-wrap gap-2">
                          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
                            <button key={i} type="button"
                              onClick={() => setRecurDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                              className={`px-2.5 py-1 rounded text-sm font-medium border transition-colors ${recurDays.includes(i) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/20 text-white/60 hover:border-white/40'}`}>
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                      {recurType === 'until' && (
                        <div>
                          <label className="lh-eyebrow block mb-1">End Date</label>
                          <input type="date" value={recurEndDate} onChange={e => setRecurEndDate(e.target.value)} className="lh-input" />
                        </div>
                      )}
                      {recurType === 'count' && (
                        <div>
                          <label className="lh-eyebrow block mb-1">Number of Occurrences</label>
                          <input type="number" min="1" max="60" value={recurCount} onChange={e => setRecurCount(Number(e.target.value))} className="lh-input w-24" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          <div>
            <label htmlFor="res-notes" className="lh-eyebrow">Notes</label>
            <textarea id="res-notes" name="notes" value={form.notes} onChange={handleChange} rows={2}
              placeholder="Optional notes…"
              className="lh-input mt-1" />
          </div>

          {error && <div className="lh-alert lh-alert-error">{error}</div>}

          {conflictDetails && (
            <div className="bg-amber-900/30 border border-amber-600 rounded-lg px-3 py-2 space-y-2">
              {(conflictDetails.conflicts || []).map((c, i) => (
                <div key={i} className="text-xs text-amber-200 space-y-0.5">
                  <div className="font-semibold text-white">{c.title} <span className="text-amber-400 font-normal">({c.event_type})</span></div>
                  <div>{formatTime(c.start_time)} – {formatTime(c.end_time)}{c.team_name ? ` • ${c.team_name}` : ''}</div>
                  {c.created_by_name && (
                    <div>Booked by: <span className="font-semibold text-white">{c.created_by_name}</span>
                      {c.created_by_email && (
                        <> — <a href={`mailto:${c.created_by_email}`} className="text-chrome-400 underline hover:text-chrome-300">{c.created_by_email}</a></>
                      )}
                      {c.created_at && (
                        <span className="ml-1 text-amber-400">on {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(c.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {(conflictDetails.game_conflicts || []).length > 0 && (
                <div className="text-xs text-signal-300 font-semibold">A scheduled game blocks this time. Games always have priority.</div>
              )}
            </div>
          )}

          {fieldConflicts && (
            <div className="bg-amber-900/30 border border-amber-600 text-amber-200 text-sm px-4 py-3 rounded-lg space-y-2">
              {fieldConflicts.has_conflicts ? (
                <>
                  <div className="font-bold text-amber-100">Field Conflict Detected</div>
                  <p className="text-xs text-amber-300">
                    This game runs from {formatTime(fieldConflicts.game_start)} to {formatTime(fieldConflicts.game_end)}. The following existing reservations overlap:
                  </p>
                  {fieldConflicts.conflicts.map((c, i) => (
                    <div key={i} className="bg-amber-950/40 rounded px-3 py-2 text-xs space-y-1">
                      <div className="font-semibold text-white">{c.title} <span className="text-amber-400 font-normal">({c.event_type})</span></div>
                      <div className="text-amber-300">{formatTime(c.start_time)} – {formatTime(c.end_time)}{c.team_name ? ` • ${c.team_name}` : ''}</div>
                    </div>
                  ))}
                  <p className="text-xs text-amber-400">Games always have priority.</p>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={handleConfirmGameSave}
                      className="px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded hover:bg-amber-700">
                      Schedule Anyway
                    </button>
                    <button type="button" onClick={() => { setFieldConflicts(null); setConfirmSave(false); }}
                      className="px-3 py-1.5 bg-gray-700 text-gray-200 text-xs font-semibold rounded hover:bg-gray-600">
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="font-bold text-amber-100">⚠ Nearby Reservations</div>
                  <p className="text-xs text-amber-300">
                    The following reservations are within 3 hours of this game ({formatTime(fieldConflicts.game_start)}). They don't overlap but may want a heads-up:
                  </p>
                  {(fieldConflicts.warnings || []).map((c, i) => (
                    <div key={i} className="bg-amber-950/40 rounded px-3 py-2 text-xs space-y-1">
                      <div className="font-semibold text-white">{c.title} <span className="text-amber-400 font-normal">({c.event_type})</span></div>
                      <div className="text-amber-300">{formatTime(c.start_time)} – {formatTime(c.end_time)}{c.team_name ? ` • ${c.team_name}` : ''}</div>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={handleConfirmGameSave}
                      className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded hover:bg-emerald-600">
                      Save Game
                    </button>
                    <button type="button" onClick={() => { setFieldConflicts(null); setConfirmSave(false); }}
                      className="px-3 py-1.5 bg-gray-700 text-gray-200 text-xs font-semibold rounded hover:bg-gray-600">
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="submit" loading={saving}>{isEditing ? 'Update' : isGame ? 'Schedule Game' : 'Book'}</Button>
          </div>
        </form>
    </Modal>
  );
}
