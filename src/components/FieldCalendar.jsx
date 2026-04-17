import { useState, useEffect, useCallback } from 'react';
import {
  fetchReservations, createReservation, updateReservation, deleteReservation,
  fetchTeams, fetchSeasons, createGame,
  fetchScheduleSettings, fetchAssignableOfficials, fetchOrganizations,
  checkGameConflicts,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';

const inputCls = "w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-control text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-action-500/30 focus:border-action-600";
const labelCls = "block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1";
const btnPrimary = "btn btn-primary btn-md disabled:opacity-60";

const EVENT_COLORS = {
  game_hold: { bg: 'bg-red-900/40', border: 'border-red-500', text: 'text-red-300', dot: 'bg-red-500' },
  practice: { bg: 'bg-blue-900/40', border: 'border-blue-500', text: 'text-blue-300', dot: 'bg-blue-500' },
  event: { bg: 'bg-purple-900/40', border: 'border-purple-500', text: 'text-purple-300', dot: 'bg-purple-500' },
  maintenance: { bg: 'bg-amber-900/40', border: 'border-amber-500', text: 'text-amber-300', dot: 'bg-amber-500' },
};

const EVENT_LABELS = {
  game_hold: 'Game',
  practice: 'Practice',
  event: 'Event',
  maintenance: 'Maintenance',
};

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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export default function FieldCalendar({ field, onClose, onViewGame }) {
  const { canEditOrg } = useAuth();
  const editable = canEditOrg(field.org_id);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [teams, setTeams] = useState([]);
  const [view, setView] = useState('month'); // 'month' | 'list'

  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const toDate = new Date(year, month + 1, 0);
  const to = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, teamList] = await Promise.all([
        fetchReservations(field.id, from, to),
        teams.length ? Promise.resolve(teams) : fetchTeams(),
      ]);
      setEvents(res);
      if (!teams.length) setTeams(teamList);
    } catch (err) { console.error('Failed to load reservations', err); }
    finally { setLoading(false); }
  }, [field.id, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Group events by date
  const eventsByDate = {};
  events.forEach(ev => {
    const d = typeof ev.event_date === 'string' ? ev.event_date.slice(0, 10) : ev.event_date;
    if (!eventsByDate[d]) eventsByDate[d] = [];
    eventsByDate[d].push(ev);
  });

  // Sort events within each date by start_time
  Object.values(eventsByDate).forEach(arr => arr.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')));

  const monthDays = getMonthDays(year, month);
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  // All upcoming events sorted for list view
  const upcomingEvents = [...events]
    .sort((a, b) => (a.event_date + a.start_time).localeCompare(b.event_date + b.start_time));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-3xl my-4 text-gray-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-xl font-heading font-bold text-white">{field.name}</h2>
            <p className="text-xs text-gray-400">{[field.address, field.city, field.state].filter(Boolean).join(', ')}</p>
          </div>
          <div className="flex items-center gap-2">
            {editable && (
              <button onClick={() => { setEditing(null); setShowForm(true); }} className={btnPrimary}>
                + Schedule
              </button>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* View toggle + month nav */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-1">
            <button onClick={() => setView('month')}
              className={`px-3 py-1.5 text-xs font-semibold rounded ${view === 'month' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              Calendar
            </button>
            <button onClick={() => setView('list')}
              className={`px-3 py-1.5 text-xs font-semibold rounded ${view === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              List
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={goToday} className="px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 rounded">Today</button>
            <span className="text-sm font-semibold text-white min-w-[140px] text-center">{MONTH_NAMES[month]} {year}</span>
            <button onClick={nextMonth} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading…</div>
          ) : view === 'month' ? (
            /* Month calendar grid */
            <div>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-px mb-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="text-center text-[10px] font-bold uppercase text-gray-500 py-1">{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7 gap-px">
                {monthDays.map((day, i) => {
                  if (day === null) return <div key={`pad-${i}`} className="min-h-[70px]" />;
                  const dk = dateKey(year, month, day);
                  const dayEvents = eventsByDate[dk] || [];
                  const isToday = dk === todayKey;
                  const isSelected = selectedDate === dk;
                  return (
                    <button key={dk} type="button"
                      onClick={() => setSelectedDate(isSelected ? null : dk)}
                      className={`min-h-[70px] p-1 text-left rounded transition-colors
                        ${isToday ? 'ring-1 ring-blue-500' : ''}
                        ${isSelected ? 'bg-gray-700' : 'hover:bg-gray-700/50'}
                      `}>
                      <div className={`text-xs font-semibold mb-0.5 ${isToday ? 'text-blue-400' : 'text-gray-300'}`}>{day}</div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((ev, j) => {
                          const c = EVENT_COLORS[ev.event_type] || EVENT_COLORS.practice;
                          return (
                            <div key={ev.id || j} className={`text-[9px] leading-tight truncate rounded px-1 py-0.5 ${c.bg} ${c.text}`}>
                              {formatTime(ev.start_time)} {ev.title}
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <div className="text-[9px] text-gray-400">+{dayEvents.length - 3} more</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected date detail */}
              {selectedDate && (
                <div className="mt-4 border-t border-gray-700 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white">
                      {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </h3>
                    {editable && (
                      <button onClick={() => { setEditing(null); setShowForm(true); }}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700">
                        + Schedule
                      </button>
                    )}
                  </div>
                  {(eventsByDate[selectedDate] || []).length === 0 ? (
                    <p className="text-sm text-gray-400">No events scheduled.</p>
                  ) : (
                    <div className="space-y-2">
                      {(eventsByDate[selectedDate] || []).map(ev => (
                        <EventCard key={ev.id} ev={ev} editable={editable && !ev.is_game}
                          onEdit={() => { setEditing(ev); setShowForm(true); }}
                          onDelete={() => handleDelete(ev)}
                          onViewGame={onViewGame}
                          deleting={deleting} />
                      ))}
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
                <div className="space-y-2">
                  {upcomingEvents.map(ev => (
                    <EventCard key={ev.id} ev={ev} editable={editable && !ev.is_game} showDate
                      onEdit={() => { setEditing(ev); setShowForm(true); }}
                      onDelete={() => handleDelete(ev)}
                      onViewGame={onViewGame}
                      deleting={deleting} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-gray-700">
            {Object.entries(EVENT_LABELS).map(([type, label]) => {
              const c = EVENT_COLORS[type];
              return (
                <div key={type} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                  {label}
                </div>
              );
            })}
          </div>
        </div>

        {showForm && (
          <ReservationForm
            field={field}
            reservation={editing}
            teams={teams}
            defaultDate={selectedDate}
            onDone={() => { setShowForm(false); setEditing(null); load(); }}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        )}
      </div>
    </div>
  );
}

function EventCard({ ev, editable, showDate, onEdit, onDelete, onViewGame, deleting }) {
  const c = EVENT_COLORS[ev.event_type] || EVENT_COLORS.practice;
  const label = EVENT_LABELS[ev.event_type] || ev.event_type;
  const gameClickable = ev.is_game && ev.game_id && onViewGame;
  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} px-4 py-3 ${gameClickable ? 'cursor-pointer hover:brightness-125 transition-all' : ''}`}
      onClick={gameClickable ? () => onViewGame(ev.game_id) : undefined}
      role={gameClickable ? 'button' : undefined}
      tabIndex={gameClickable ? 0 : undefined}
      onKeyDown={gameClickable ? (e) => { if (e.key === 'Enter') onViewGame(ev.game_id); } : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[10px] font-bold uppercase tracking-wide ${c.text}`}>{label}</span>
            {showDate && (
              <span className="text-[10px] text-gray-400">
                {new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
                <> — <a href={`mailto:${ev.created_by_email}`} className="text-blue-400 underline hover:text-blue-300">{ev.created_by_email}</a></>
              )}
              {ev.created_at && (
                <span className="ml-1">on {new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(ev.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
              )}
            </div>
          )}
          {ev.notes && <div className="text-xs text-gray-400 mt-1">{ev.notes}</div>}
        </div>
        {editable && (
          <div className="flex gap-1 shrink-0">
            <button onClick={onEdit} className="px-2 py-1 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600">Edit</button>
            <button onClick={onDelete} disabled={deleting === ev.id}
              className="px-2 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60">
              {deleting === ev.id ? '…' : 'Del'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReservationForm({ field, reservation, teams, defaultDate, onDone, onCancel }) {
  const isEditing = !!reservation;
  const { canScheduleGames } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [conflictDetails, setConflictDetails] = useState(null);

  const todayStr = new Date().toISOString().slice(0, 10);
  const [eventType, setEventType] = useState(reservation?.event_type || 'practice');
  const isGame = eventType === 'game';

  const [form, setForm] = useState({
    title: reservation?.title || '',
    event_type: reservation?.event_type || 'practice',
    event_date: reservation?.event_date?.slice?.(0, 10) || defaultDate || todayStr,
    start_time: reservation?.start_time?.slice?.(0, 5) || '17:00',
    end_time: reservation?.end_time?.slice?.(0, 5) || '19:00',
    team_id: reservation?.team_id || '',
    notes: reservation?.notes || '',
  });

  // Game-specific state
  const [gameForm, setGameForm] = useState({
    season_id: '',
    home_team_id: '',
    away_team_id: '',
    game_time: '',
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
        location_id: field.id,
        game_date: form.event_date,
        game_time: gameForm.game_time || null,
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
          const result = await checkGameConflicts(field.id, data.game_date, data.game_time);
          if (result.has_conflicts) {
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
    if (!form.start_time || !form.end_time) { setSaving(false); setError('Start and end times are required.'); return; }
    if (form.start_time >= form.end_time) { setSaving(false); setError('End time must be after start time.'); return; }

    const data = {
      location_id: field.id,
      team_id: form.team_id ? Number(form.team_id) : null,
      title: form.title.trim(),
      event_type: form.event_type,
      event_date: form.event_date,
      start_time: form.start_time,
      end_time: form.end_time,
      notes: form.notes.trim() || null,
    };

    try {
      if (isEditing) await updateReservation(reservation.id, data);
      else await createReservation(data);
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
  const orgTeams = teams.filter(t => t.org_id === field.org_id).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Available event types (game only if user canScheduleGames)
  const eventTypeOptions = [
    ...(canScheduleGames && !isEditing ? [{ value: 'game', label: 'Game' }] : []),
    { value: 'practice', label: 'Practice' },
    { value: 'event', label: 'Event' },
    { value: 'maintenance', label: 'Maintenance' },
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-5 sm:p-6 my-4 text-gray-200">
        <h2 className="text-xl font-heading font-bold text-white mb-4">
          {isEditing ? 'Edit Reservation' : isGame ? 'Schedule Game' : 'Book Field Time'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Event type toggle — only on create */}
          {!isEditing && eventTypeOptions.length > 1 && (
            <div>
              <label className={labelCls}>Type</label>
              <div className="flex gap-1 p-1 bg-gray-900 rounded-lg">
                {eventTypeOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setEventType(opt.value);
                      if (opt.value !== 'game') setForm(prev => ({ ...prev, event_type: opt.value }));
                    }}
                    className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      eventType === opt.value
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
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
              <div>
                <label htmlFor="fc-season" className={labelCls}>Season</label>
                <select id="fc-season" name="season_id" value={gameForm.season_id} onChange={handleGameChange} className={inputCls}>
                  <option value="">— None —</option>
                  {seasons.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="fc-home" className={labelCls}>Home Team *</label>
                  <select id="fc-home" name="home_team_id" value={gameForm.home_team_id} onChange={handleGameChange} required className={inputCls}>
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
                  <label htmlFor="fc-away" className={labelCls}>Away Team *</label>
                  <select id="fc-away" name="away_team_id" value={gameForm.away_team_id} onChange={handleGameChange} required className={inputCls}>
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
                <div>
                  <label htmlFor="fc-date" className={labelCls}>Date *</label>
                  <input id="fc-date" name="event_date" type="date" value={form.event_date} onChange={handleChange} required className={inputCls} />
                </div>
                <div>
                  <label htmlFor="fc-time" className={labelCls}>Time</label>
                  <select id="fc-time" name="game_time" value={gameForm.game_time} onChange={handleGameChange} className={inputCls}>
                    <option value="">— Select —</option>
                    {gameTimeSlots.map(slot => (
                      <option key={slot} value={slot}>{formatTime(slot)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-400">
                📍 Location: <span className="text-white font-semibold">{field.name}</span>
              </div>
            </>
          ) : (
            <>
              {/* Reservation fields */}
              <div>
                <label htmlFor="res-title" className={labelCls}>Title *</label>
                <input id="res-title" name="title" type="text" value={form.title} onChange={handleChange} required
                  placeholder="e.g. 10U Practice" className={inputCls} />
              </div>

              {isEditing && (
                <div>
                  <label htmlFor="res-type" className={labelCls}>Type</label>
                  <select id="res-type" name="event_type" value={form.event_type} onChange={handleChange} className={inputCls}>
                    <option value="practice">Practice</option>
                    <option value="event">Event</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="res-team" className={labelCls}>Team</label>
                  <select id="res-team" name="team_id" value={form.team_id} onChange={handleChange} className={inputCls}>
                    <option value="">— None —</option>
                    {orgTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="res-date" className={labelCls}>Date *</label>
                  <input id="res-date" name="event_date" type="date" value={form.event_date} onChange={handleChange}
                    required className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="res-start" className={labelCls}>Start Time *</label>
                  <select id="res-start" name="start_time" value={form.start_time} onChange={handleChange}
                    required className={inputCls}>
                    <option value="">— Select —</option>
                    {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="res-end" className={labelCls}>End Time *</label>
                  <select id="res-end" name="end_time" value={form.end_time} onChange={handleChange}
                    required className={inputCls}>
                    <option value="">— Select —</option>
                    {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          <div>
            <label htmlFor="res-notes" className={labelCls}>Notes</label>
            <textarea id="res-notes" name="notes" value={form.notes} onChange={handleChange} rows={2}
              placeholder="Optional notes…"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>

          {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}

          {conflictDetails && (
            <div className="bg-amber-900/30 border border-amber-600 rounded-lg px-3 py-2 space-y-2">
              {(conflictDetails.conflicts || []).map((c, i) => (
                <div key={i} className="text-xs text-amber-200 space-y-0.5">
                  <div className="font-semibold text-white">{c.title} <span className="text-amber-400 font-normal">({c.event_type})</span></div>
                  <div>{formatTime(c.start_time)} – {formatTime(c.end_time)}{c.team_name ? ` • ${c.team_name}` : ''}</div>
                  {c.created_by_name && (
                    <div>Booked by: <span className="font-semibold text-white">{c.created_by_name}</span>
                      {c.created_by_email && (
                        <> — <a href={`mailto:${c.created_by_email}`} className="text-blue-400 underline hover:text-blue-300">{c.created_by_email}</a></>
                      )}
                      {c.created_at && (
                        <span className="ml-1 text-amber-400">on {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(c.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {(conflictDetails.game_conflicts || []).length > 0 && (
                <div className="text-xs text-red-300 font-semibold">A scheduled game (including 3-hr prep) blocks this time. Games always have priority.</div>
              )}
            </div>
          )}

          {fieldConflicts && (
            <div className="bg-amber-900/30 border border-amber-600 text-amber-200 text-sm px-4 py-3 rounded-lg space-y-2">
              <div className="font-bold text-amber-100">Field Conflict Detected</div>
              <p className="text-xs text-amber-300">
                This game will reserve the field from {formatTime(fieldConflicts.hold_start)} to {formatTime(fieldConflicts.hold_end)} (includes 3-hr prep). The following existing reservations conflict:
              </p>
              {fieldConflicts.conflicts.map((c, i) => (
                <div key={i} className="bg-amber-950/40 rounded px-3 py-2 text-xs space-y-1">
                  <div className="font-semibold text-white">{c.title} <span className="text-amber-400 font-normal">({c.event_type})</span></div>
                  <div className="text-amber-300">{formatTime(c.start_time)} – {formatTime(c.end_time)}{c.team_name ? ` • ${c.team_name}` : ''}</div>
                </div>
              ))}
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
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600">Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving…' : isEditing ? 'Update' : isGame ? 'Schedule Game' : 'Book'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
