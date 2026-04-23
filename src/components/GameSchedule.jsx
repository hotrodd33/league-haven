import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { STALE } from '../lib/queryConfig.js';
import { formatPhone } from '../utils/formatPhone.js';
import {
  fetchGames, createGame, updateGame, deleteGame,
  fetchTeams, fetchSeasons, fetchLocations, fetchScheduleSettings, createLocation,
  fetchOrganizations, fetchAssignableOfficials,
  fetchGameInterests, expressGameInterest, removeGameInterest,
  checkGameConflicts, createTeam, fetchAgeGroups, fetchLevels,
  fetchWeather, fetchWeatherForecast,
  createReservation, fetchAllPractices, updateReservation, deleteReservation,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import GameDetail from './GameDetail.jsx';
import PitchTracker from './PitchTracker.jsx';
import TeamLogo from './TeamLogo.jsx';
import { PracticeCard, PracticeEditModal } from './TeamSchedule.jsx';
import { FieldForm } from './FieldsPage.jsx';
import { DARK_STATUS_COLORS, DARK_BADGES, DARK_TRACK_BUTTON_TONE } from '../constants/statusClasses.js';
import { Button, Input, Modal } from './ui/index.js';

const STATUS_OPTIONS = [
  { value: 'unscheduled', label: 'Unscheduled' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Final' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'postponed', label: 'Postponed' },
];

const STATUS_COLORS = DARK_STATUS_COLORS;
const GC_BADGE_CLASS = 'inline-flex items-center rounded-sm bg-black px-1 py-0.5 text-[9px] font-bold leading-none tracking-tight text-[#00f092]';

function formatDate(dateStr) {
  if (!dateStr || dateStr === '__unknown__') return 'TBD';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h * 60) + m;
}

function CoachContact({ name, email, phone, label }) {
  if (!name && !email && !phone) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      {label && <span className="text-gray-500">{label}:</span>}
      <span className="text-gray-300">{name || '—'}</span>
      {email && <a href={`mailto:${email}`} onClick={e => e.stopPropagation()} className="hover:text-action-300 cursor-pointer" title={email}>✉️</a>}
      {phone && <a href={`tel:${phone.replace(/\D/g, '')}`} onClick={e => e.stopPropagation()} className="hover:text-action-300 cursor-pointer" title={formatPhone(phone)}>📞 {formatPhone(phone)}</a>}
    </div>
  );
}

const SCHED_ROLE_LABELS = { scheduling_contact: 'Scheduler', org_scheduler: 'Org Scheduler', head_coach: 'Head Coach', org_admin: 'Org Admin' };

function AddFieldModal({ homeOrgId, onDone, onCancel }) {
  const [orgs, setOrgs] = useState([]);
  const [ageGroups, setAgeGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([fetchOrganizations(), fetchAgeGroups()])
      .then(([o, ag]) => { setOrgs(o); setAgeGroups(ag); })
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <Modal open onClose={onCancel} title="Add Field Location" size="lg"><div className="p-6 text-center text-gray-400">Loading...</div></Modal>;
  const editableOrgIds = new Set(orgs.map(o => o.id));
  return (
    <Modal open onClose={onCancel} title="Add Field Location" size="lg">
      <FieldForm orgId={homeOrgId} editableOrgIds={editableOrgIds} orgs={orgs} ageGroups={ageGroups} onDone={onDone} onCancel={onCancel} />
    </Modal>
  );
}

function toHHMM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function UmpireStatusList({ officials, interestedUmpires }) {
  const assignedIds = new Set((officials || []).map(o => Number(o.id)));
  const items = [];
  for (const o of (officials || [])) {
    items.push({ name: o.name, status: 'assigned' });
  }
  for (const u of (interestedUmpires || [])) {
    if (!assignedIds.has(Number(u.official_id))) {
      items.push({ name: u.name, status: 'interested' });
    }
  }
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span key={i} className={`text-xs px-1.5 py-0.5 rounded font-medium ${
          item.status === 'assigned'
            ? 'bg-action-900/50 text-action-300'
            : DARK_BADGES.warning
        }`}>
          {item.name}
        </span>
      ))}
    </div>
  );
}

function buildTimeSlots(startTime, endTime, increment) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return [];
  const step = Number(increment) || 30;
  const slots = [];
  for (let cur = start; cur <= end; cur += step) {
    slots.push(toHHMM(cur));
  }
  return slots;
}

export default function GameSchedule({ onBack, onNavigateToTeam, initialGameId, onGameIdConsumed, onOpenImport }) {
  const { isAdmin, canScoreGame, canScheduleGames, canDeleteGame, role, isUmpire, permissions } = useAuth();
  const queryClient = useQueryClient();

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: fetchTeams,
    staleTime: STALE.THREE_MIN,
  });

  const { data: seasons = [], isLoading: seasonsLoading } = useQuery({
    queryKey: ['seasons'],
    queryFn: fetchSeasons,
    staleTime: STALE.HOUR,
  });

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [selectedGameId, setSelectedGameId] = useState(initialGameId || null);
  const [trackingGameId, setTrackingGameId] = useState(null);
  const [managingInterest, setManagingInterest] = useState(null);
  const dateSectionRefs = useRef({});
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar'
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [showSubscribe, setShowSubscribe] = useState(false);

  // Consume initialGameId so it doesn't re-trigger on re-renders
  useEffect(() => {
    if (initialGameId && onGameIdConsumed) onGameIdConsumed();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filters
  const [filterTeam, setFilterTeam] = useState('');
  const [filterSeason, setFilterSeason] = useState(() => {
    // Pre-populate from React Query cache so repeat navigation never fires the
    // "all seasons" games query — the season filter is ready on the first render.
    const cached = queryClient.getQueryData(['seasons']);
    if (Array.isArray(cached) && cached.length) {
      const active = cached.find(s => s.is_active);
      return active ? String(active.id) : '';
    }
    return '';
  });
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDivision, setFilterDivision] = useState('');
  const [filterEventType, setFilterEventType] = useState('games');
  const [sortOrder, setSortOrder] = useState('asc');

  // My teams (for coaches/org admins)
  const myTeamIds = useMemo(() => {
    const ids = new Set(permissions?.team_ids || []);
    // Also include teams belonging to user's orgs
    if (permissions?.org_ids?.length) {
      for (const t of teams) {
        if (permissions.org_ids.includes(Number(t.org_id))) ids.add(Number(t.id));
      }
    }
    return Array.from(ids);
  }, [permissions, teams]);

  // Practices/events — edit state only (data comes from React Query below)
  const [editingPractice, setEditingPractice] = useState(null);
  const [deletingPractice, setDeletingPractice] = useState(null);

  // Auto-select active season when seasons load
  useEffect(() => {
    if (seasons.length && !filterSeason) {
      const active = seasons.find(s => s.is_active);
      if (active) setFilterSeason(String(active.id));
    }
  }, [seasons, filterSeason]);

  // ── React Query: filter-driven data ────────────────────────────────────────
  const isMyTeams = filterTeam === '__my_teams__';
  const gamesFilters = {
    ...(filterTeam && !isMyTeams ? { team_id: filterTeam } : {}),
    ...(filterSeason ? { season_id: filterSeason } : {}),
    ...(filterStatus ? { status: filterStatus } : {}),
    slim: 'true',
  };

  const { data: rawGames = [], isLoading: gamesLoading, error: gamesError } = useQuery({
    queryKey: ['games', gamesFilters],
    queryFn: () => fetchGames(gamesFilters),
    staleTime: STALE.ONE_MIN,
    placeholderData: keepPreviousData,
    // Don't fetch until we know which season to filter on.  The lazy initializer
    // above covers repeat visits; the useEffect below covers first visit.
    // Exception: if seasons are loaded but none is active, allow the all-seasons fetch.
    enabled: !!filterSeason || (!seasonsLoading && !seasons.some(s => s.is_active)),
  });

  const practicesFilters = filterTeam && !isMyTeams ? { team_id: filterTeam } : {};
  const { data: rawPractices = [] } = useQuery({
    queryKey: ['practices', practicesFilters],
    queryFn: () => fetchAllPractices(practicesFilters),
    staleTime: STALE.FIVE_MIN,
    placeholderData: keepPreviousData,
  });

  const { data: interestRows = [] } = useQuery({
    queryKey: ['game-interests'],
    queryFn: fetchGameInterests,
    enabled: isUmpire,
    staleTime: STALE.ONE_MIN,
  });
  const interestGameIds = (interestRows || []).map((g) => Number(g.id)).filter(Number.isFinite);

  const mySet = useMemo(() => isMyTeams ? new Set(myTeamIds.map(Number)) : null, [isMyTeams, myTeamIds]);

  const games = useMemo(() => {
    if (!isMyTeams || !mySet) return rawGames;
    return rawGames.filter(g => mySet.has(Number(g.home_team_id)) || mySet.has(Number(g.away_team_id)));
  }, [rawGames, isMyTeams, mySet]);

  const practices = useMemo(() => {
    if (!isMyTeams || !mySet) return rawPractices;
    return rawPractices.filter(p => mySet.has(Number(p.team_id)));
  }, [rawPractices, isMyTeams, mySet]);

  const loading = seasonsLoading || gamesLoading;
  const error = gamesError?.message || null;

  // ── Weather: fetch only new game IDs, never re-fetch on filter/sort ─────────
  const [gameWeather, setGameWeather] = useState({});
  const weatherFetchedRef = useRef(new Set());

  useEffect(() => {
    if (!games.length) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 16);
    const maxDateStr = maxDate.toISOString().slice(0, 10);

    const weatherableGames = games.filter(g =>
      g.location_lat && g.location_lon &&
      g.game_date >= todayStr && g.game_date <= maxDateStr &&
      g.status !== 'cancelled' &&
      !weatherFetchedRef.current.has(String(g.id))
    ).slice(0, 20);

    if (!weatherableGames.length) return;

    for (const g of weatherableGames) weatherFetchedRef.current.add(String(g.id));

    const promises = weatherableGames.map(g => {
      const fetcher = (g.game_date === todayStr && !g.game_time)
        ? fetchWeather(g.location_lat, g.location_lon)
        : fetchWeatherForecast(g.location_lat, g.location_lon, g.game_date, g.game_time || null);
      return fetcher
        .then(w => (w && !w.unavailable) ? { key: String(g.id), weather: w } : null)
        .catch(() => null);
    });

    Promise.all(promises).then(results => {
      const map = {};
      for (const r of results) if (r) map[r.key] = r.weather;
      setGameWeather(prev => ({ ...prev, ...map }));
    });
  }, [games]);

  async function handleToggleInterest(gameId, currentlyInterested) {
    setManagingInterest(gameId);
    try {
      if (currentlyInterested) await removeGameInterest(gameId);
      else await expressGameInterest(gameId);
      queryClient.invalidateQueries({ queryKey: ['game-interests'] });
      queryClient.invalidateQueries({ queryKey: ['games'] });
    } catch (err) {
      alert(`Failed to update interest: ${err.message}`);
    } finally {
      setManagingInterest(null);
    }
  }

  async function handleDelete(game) {
    const label = `${game.home_team_name} vs ${game.away_team_name} on ${formatDate(game.game_date)}`;
    if (!window.confirm(`Delete game: ${label}?`)) return;
    setDeleting(game.id);
    try {
      await deleteGame(game.id);
      queryClient.invalidateQueries({ queryKey: ['games'] });
    } catch (err) { alert(`Failed to delete: ${err.message}`); }
    finally { setDeleting(null); }
  }

  function handleScheduleIt(game) {
    setEditing(game);
    setShowForm(true);
  }

  function handleFormDone() {
    setShowForm(false);
    setEditing(null);
    queryClient.invalidateQueries({ queryKey: ['games'] });
    queryClient.invalidateQueries({ queryKey: ['practices'] });
  }

  // Extract unique divisions from games
  const divisions = new Set();
  for (const g of games) {
    const divLabel = g.division_name || ([g.home_age_group, g.home_level].filter(Boolean).join(' ')) || null;
    if (divLabel) divisions.add(divLabel);
  }
  const sortedDivisions = Array.from(divisions).sort();

  // Filter games by division if selected
  const filteredGames = filterDivision
    ? games.filter(g => {
        const divLabel = g.division_name || ([g.home_age_group, g.home_level].filter(Boolean).join(' ')) || null;
        return divLabel === filterDivision;
      })
    : games;

  // Build merged items list based on event type filter
  const mergedItems = useMemo(() => {
    const items = [];
    if (filterEventType === 'games' || filterEventType === 'all') {
      items.push(...filteredGames.map(g => ({ ...g, _type: 'game' })));
    }
    if (filterEventType !== 'games') {
      const filteredPractices = filterEventType === 'all'
        ? practices
        : practices.filter(p => p.event_type === filterEventType);
      items.push(...filteredPractices.map(p => ({ ...p, _type: 'practice' })));
    }
    return items;
  }, [filteredGames, practices, filterEventType]);

  // Group items by date
  const gamesByDate = {};
  for (const item of mergedItems) {
    const dateKey = item._type === 'game' ? (item.game_date || '__unknown__') : (item.event_date || '__unknown__');
    if (!gamesByDate[dateKey]) gamesByDate[dateKey] = [];
    gamesByDate[dateKey].push(item);
  }
  const sortedDateKeys = Object.keys(gamesByDate).sort((a, b) => {
    // Always put TBD (no date) at the bottom regardless of sort direction
    if (a === '__unknown__') return 1;
    if (b === '__unknown__') return -1;
    return sortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
  });

  const anchorDateKey = useMemo(() => {
    if (!sortedDateKeys.length) return null;
    const todayKey = new Date().toISOString().slice(0, 10);
    if (sortedDateKeys.includes(todayKey)) return todayKey;

    // If no exact today section, anchor to the nearest upcoming date first.
    const upcoming = sortedDateKeys
      .filter((k) => k !== '__unknown__' && k >= todayKey)
      .sort((a, b) => a.localeCompare(b));
    if (upcoming.length) return upcoming[0];

    // Otherwise anchor to the most recent available past date.
    const known = sortedDateKeys.filter((k) => k !== '__unknown__');
    return known.length ? known[0] : sortedDateKeys[0];
  }, [sortedDateKeys]);

  useEffect(() => {
    if (!anchorDateKey || loading) return;
    const el = dateSectionRefs.current[anchorDateKey];
    if (!el) return;

    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
  }, [anchorDateKey, loading, filterSeason, filterTeam, filterStatus, filterDivision]);

  function gameDivisionLevelLabel(game) {
    if (game.division_name) return game.division_name;
    const fallback = [game.home_age_group, game.home_level].filter(Boolean).join(' ');
    return fallback || null;
  }

  // Build team optgroups
  const teamsByOrg = {};
  const ungroupedTeams = [];
  for (const t of teams) {
    if (t.org_name) {
      if (!teamsByOrg[t.org_name]) teamsByOrg[t.org_name] = [];
      teamsByOrg[t.org_name].push(t);
    } else {
      ungroupedTeams.push(t);
    }
  }
  const orgNames = Object.keys(teamsByOrg).sort();

  if (loading) return <div className="py-8 text-center text-gray-400">Loading schedule…</div>;
  if (error) return <div className="lh-alert lh-alert-error">Error: {error}</div>;

  if (trackingGameId) {
    return <PitchTracker gameId={trackingGameId} onBack={() => { setTrackingGameId(null); queryClient.invalidateQueries({ queryKey: ['games'] }); }} />;
  }

  if (selectedGameId) {
    return <GameDetail gameId={selectedGameId} onBack={() => { setSelectedGameId(null); queryClient.invalidateQueries({ queryKey: ['games'] }); }} onNavigateToTeam={onNavigateToTeam} onOpenImport={onOpenImport} />;
  }

  return (
    <div>
      <div className="sticky top-16 z-20 -mx-4 lg:-mx-6 px-4 lg:px-6 pt-2 pb-3 mb-4 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <h2 className="text-xl font-display font-bold text-white">Schedule ({mergedItems.length})</h2>
          <div className="flex gap-2">
            <div className="flex items-center gap-1 mr-2">
              <button onClick={() => setViewMode('list')}
                className={`lh-tab ${viewMode === 'list' ? 'lh-tab-active' : 'lh-tab-inactive'}`}>
                List
              </button>
              <button onClick={() => setViewMode('calendar')}
                className={`lh-tab ${viewMode === 'calendar' ? 'lh-tab-active' : 'lh-tab-inactive'}`}>
                Calendar
              </button>
              <Button size="xs" variant="secondary" onClick={() => setShowSubscribe(true)} title="Subscribe to calendar feed">
                📅
              </Button>
            </div>
            <Button size="xs" variant="secondary" onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')} title={sortOrder === 'asc' ? 'Oldest first' : 'Newest first'}>
              {sortOrder === 'asc' ? '↑ ASC' : '↓ DESC'}
            </Button>
            {canScheduleGames && (
              <>
                <Button onClick={() => { setEditing(null); setShowForm(true); }}>+ Schedule</Button>
              </>
            )}
            {onBack && <Button variant="secondary" onClick={onBack}>← Teams</Button>}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={filterSeason} onChange={(e) => setFilterSeason(e.target.value)}
            className="lh-select min-w-[160px]">
            <option value="">All Seasons</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
            ))}
          </select>
          <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}
            className="lh-select min-w-[180px]">
            <option value="">All Teams</option>
            {myTeamIds.length > 0 && <option value="__my_teams__">⭐ My Teams</option>}
            {orgNames.map(orgName => (
              <optgroup key={orgName} label={orgName}>
                {teamsByOrg[orgName].map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            ))}
            {ungroupedTeams.length > 0 && (
              <optgroup label="Unassigned">
                {ungroupedTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            )}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="lh-select min-w-[140px]">
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filterDivision} onChange={(e) => setFilterDivision(e.target.value)}
            className="lh-select min-w-[140px]">
            <option value="">All Divisions</option>
            {sortedDivisions.map(div => (
              <option key={div} value={div}>{div}</option>
            ))}
          </select>
          <select value={filterEventType} onChange={(e) => setFilterEventType(e.target.value)}
            className="lh-select min-w-[140px]">
            <option value="all">All Events</option>
            <option value="games">Games Only</option>
            <option value="practice">Practices</option>
            <option value="event">Events</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
      </div>

      {viewMode === 'list' ? (
        <>
          {mergedItems.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              No events found.
              {canScheduleGames && (
                <>
                  <br />
                  <button onClick={() => setShowForm(true)} className="text-action-300 underline mt-1 inline-block">Schedule the first event</button>
                </>
              )}
            </div>
      ) : (
        <div className="space-y-6">
          {sortedDateKeys.map(dateKey => (
            <div key={dateKey} ref={(el) => { dateSectionRefs.current[dateKey] = el; }}>
              <h3 className="text-base font-display font-bold text-white uppercase tracking-wide mb-2 border-b border-gray-700 pb-1">
                {formatDate(dateKey)}
              </h3>

              {/* Desktop */}
              <div className="hidden md:block">
                <div className="space-y-2">
                  {gamesByDate[dateKey].map(item => {
                    if (item._type === 'practice') {
                      return <PracticeCard key={`p-${item.id}`} practice={item} editable={canScheduleGames}
                        onEdit={() => setEditingPractice(item)}
                        onDelete={async () => { setDeletingPractice(item.id); await deleteReservation(item.id); queryClient.invalidateQueries({ queryKey: ['practices'] }); setDeletingPractice(null); }}
                        deleting={deletingPractice === item.id} />;
                    }
                    const game = item;
                    const divisionLabel = gameDivisionLevelLabel(game);
                    const isInterested = interestGameIds.includes(Number(game.id));
                    const canEditThisGame = canScoreGame(game.home_team_id, game.away_team_id, game.home_org_id, game.away_org_id);
                    return (
                      <div key={game.id} onClick={() => setSelectedGameId(game.id)}
                        className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-chrome-300 hover:shadow-sm transition-all">
                        {/* Time + Division */}
                        <div className="w-28 text-center shrink-0">
                          <span className="text-sm font-semibold text-gray-300 block">{formatTime(game.game_time) || 'TBD'}</span>
                          {divisionLabel && <span className="text-[11px] text-gray-400 truncate block">{divisionLabel}</span>}
                        </div>

                        {/* Matchup */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                            <div className="text-right min-w-0">
                              <button onClick={(e) => { e.stopPropagation(); onNavigateToTeam?.(game.home_team_id, game.home_org_id); }} className="font-semibold text-sm truncate text-action-300 hover:text-action-100 hover:underline block">{game.home_team_name}</button>
                              {game.status === 'unscheduled' && canEditThisGame && game.home_sched_name && (
                                <CoachContact name={game.home_sched_name} email={game.home_sched_email} phone={game.home_sched_phone} label={SCHED_ROLE_LABELS[game.home_sched_role]} />
                              )}
                            </div>
                            <TeamLogo src={game.home_logo} name={game.home_team_name} ageGroup={game.home_age_group} level={game.home_level} cityAbbr={game.home_city_abbr} primaryColor={game.home_primary_color} secondaryColor={game.home_secondary_color} />
                          </div>
                          <div className="px-2 shrink-0">
                            {game.status === 'completed' ? (
                              <span className="font-extrabold text-lg text-white tabular-nums tracking-tight">{game.home_score ?? '—'} – {game.away_score ?? '—'}</span>
                            ) : (
                              <span className="text-xs font-semibold text-gray-400">vs</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <TeamLogo src={game.away_logo} name={game.away_team_name} ageGroup={game.away_age_group} level={game.away_level} cityAbbr={game.away_city_abbr} primaryColor={game.away_primary_color} secondaryColor={game.away_secondary_color} />
                            <div className="min-w-0">
                              <button onClick={(e) => { e.stopPropagation(); onNavigateToTeam?.(game.away_team_id, game.away_org_id); }} className="font-semibold text-sm truncate text-action-300 hover:text-action-100 hover:underline block">{game.away_team_name}</button>
                              {game.status === 'unscheduled' && canEditThisGame && game.away_sched_name && (
                                <CoachContact name={game.away_sched_name} email={game.away_sched_email} phone={game.away_sched_phone} label={SCHED_ROLE_LABELS[game.away_sched_role]} />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Location + Weather + Status */}
                        <div className="flex items-center gap-3 shrink-0">
                          {game.location_name && (
                            <span className="text-xs text-gray-400 hidden lg:inline truncate max-w-[180px]">
                              📍 {game.location_name}
                            </span>
                          )}
                          {gameWeather[String(game.id)] && (() => {
                            const w = gameWeather[String(game.id)];
                            return (
                              <span className="hidden lg:inline-flex items-center gap-1 text-xs text-gray-400 shrink-0" title={`${w.description}${w.isForecast ? ' (forecast)' : ''}`}>
                                <span>{w.icon}</span>
                                <span>{w.temp}°</span>
                                {w.precipitationProbability > 0 && (
                                  <span className={w.precipitationProbability >= 50 ? 'text-orange-400' : 'text-gray-500'}>🌧️{w.precipitationProbability}%</span>
                                )}
                                {w.playability && w.playability.rating !== 'good' && (
                                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                    w.playability.rating === 'unplayable' ? 'bg-signal-900/40 text-signal-300' :
                                    w.playability.rating === 'poor' ? 'bg-orange-900/40 text-orange-300' :
                                    'bg-yellow-900/40 text-yellow-300'
                                  }`}>{w.playability.rating}</span>
                                )}
                              </span>
                            );
                          })()}
                          {!!game.officials?.length && (
                            <div className="hidden lg:flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                              {game.officials.map((o, i) => (
                                <span key={i} className="text-xs px-1.5 py-0.5 rounded font-medium bg-action-900/50 text-action-300">{o.name}</span>
                              ))}
                            </div>
                          )}
                          <span className={`lh-badge ${STATUS_COLORS[game.status] || 'bg-gray-800'}`}>
                            {game.status_label}
                          </span>
                          {game.is_gamechanger_imported && (
                            <span className={GC_BADGE_CLASS} title="Imported from GameChanger" aria-label="Imported from GameChanger">
                              GC
                            </span>
                          )}
                          {(game.status === 'scheduled' || game.status === 'in_progress') && canScoreGame(game.home_team_id, game.away_team_id, game.home_org_id, game.away_org_id) && (
                            <Button size="xs" variant={game.status === 'in_progress' ? 'primary' : 'warn'} onClick={(e) => { e.stopPropagation(); setTrackingGameId(game.id); }}>{game.status === 'in_progress' ? '⚾ Live' : '⚾ Track'}</Button>
                          )}
                          {canEditThisGame && (
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              {game.status === 'unscheduled' && (
                                <Button size="xs" variant="danger" onClick={() => handleScheduleIt(game)}>Schedule It!</Button>
                              )}
                              {game.status !== 'unscheduled' && (
                                <Button size="xs" variant="secondary" onClick={() => { setEditing(game); setShowForm(true); }}>Edit</Button>
                              )}
                              {canDeleteGame(game.home_team_id, game.away_team_id, game.home_org_id, game.away_org_id) && (
                                <Button size="xs" variant="danger" onClick={() => handleDelete(game)} disabled={deleting === game.id}>{deleting === game.id ? '…' : 'Del'}</Button>
                              )}
                            </div>
                          )}
                          {isUmpire && game.status === 'scheduled' && (
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="xs"
                                variant={isInterested ? 'primary' : 'chrome'}
                                onClick={() => handleToggleInterest(game.id, isInterested)}
                                disabled={managingInterest === game.id}
                              >
                                {managingInterest === game.id ? '…' : (isInterested ? 'Interested' : 'I\'m Interested')}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {gamesByDate[dateKey].map(item => {
                  if (item._type === 'practice') {
                    return <PracticeCard key={`p-${item.id}`} practice={item} editable={canScheduleGames}
                      onEdit={() => setEditingPractice(item)}
                      onDelete={async () => { setDeletingPractice(item.id); await deleteReservation(item.id); queryClient.invalidateQueries({ queryKey: ['practices'] }); setDeletingPractice(null); }}
                      deleting={deletingPractice === item.id} />;
                  }
                  const game = item;
                  const divisionLabel = gameDivisionLevelLabel(game);
                  const isInterested = interestGameIds.includes(Number(game.id));
                  const canEditThisGame = canScoreGame(game.home_team_id, game.away_team_id, game.home_org_id, game.away_org_id);
                  return (
                    <div key={game.id} onClick={() => setSelectedGameId(game.id)}
                      className="bg-gray-800 border border-gray-700 rounded-lg p-3 cursor-pointer hover:border-chrome-300 hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-xs font-semibold text-gray-400 block">{formatTime(game.game_time) || 'TBD'}</span>
                          {divisionLabel && <span className="text-[11px] text-gray-400 block">{divisionLabel}</span>}
                        </div>
                        <span className={`lh-badge ${STATUS_COLORS[game.status] || 'bg-gray-800'}`}>
                          {game.status_label}
                        </span>
                        {game.is_gamechanger_imported && (
                          <span className={GC_BADGE_CLASS} title="Imported from GameChanger" aria-label="Imported from GameChanger">
                            GC
                          </span>
                        )}
                      </div>
                      <div className="mb-1">
                        <div className="flex items-center gap-2">
                          <TeamLogo src={game.home_logo} name={game.home_team_name} ageGroup={game.home_age_group} level={game.home_level} cityAbbr={game.home_city_abbr} primaryColor={game.home_primary_color} secondaryColor={game.home_secondary_color} size="w-6 h-6" />
                          <button onClick={(e) => { e.stopPropagation(); onNavigateToTeam?.(game.home_team_id, game.home_org_id); }} className="font-semibold text-sm flex-1 truncate text-action-300 hover:text-action-100 hover:underline text-left">{game.home_team_name}</button>
                          {game.status === 'completed' && <span className="font-extrabold text-lg text-white tabular-nums">{game.home_score ?? '—'}</span>}
                        </div>
                        {game.status === 'unscheduled' && canEditThisGame && game.home_sched_name && (
                          <div className="ml-8"><CoachContact name={game.home_sched_name} email={game.home_sched_email} phone={game.home_sched_phone} label={SCHED_ROLE_LABELS[game.home_sched_role]} /></div>
                        )}
                      </div>
                      <div className="mb-2">
                        <div className="flex items-center gap-2">
                          <TeamLogo src={game.away_logo} name={game.away_team_name} ageGroup={game.away_age_group} level={game.away_level} cityAbbr={game.away_city_abbr} primaryColor={game.away_primary_color} secondaryColor={game.away_secondary_color} size="w-6 h-6" />
                          <button onClick={(e) => { e.stopPropagation(); onNavigateToTeam?.(game.away_team_id, game.away_org_id); }} className="font-semibold text-sm flex-1 truncate text-action-300 hover:text-action-100 hover:underline text-left">{game.away_team_name}</button>
                          {game.status === 'completed' && <span className="font-extrabold text-lg text-white tabular-nums">{game.away_score ?? '—'}</span>}
                        </div>
                        {game.status === 'unscheduled' && canEditThisGame && game.away_sched_name && (
                          <div className="ml-8"><CoachContact name={game.away_sched_name} email={game.away_sched_email} phone={game.away_sched_phone} label={SCHED_ROLE_LABELS[game.away_sched_role]} /></div>
                        )}
                      </div>
                      {game.location_name && (
                        <div className="text-xs text-gray-400 mb-1">📍 {game.location_name}{game.location_city ? `, ${game.location_city}` : ''}</div>
                      )}
                      {gameWeather[String(game.id)] && (() => {
                        const w = gameWeather[String(game.id)];
                        return (
                          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1 flex-wrap">
                            <span title={w.description}>{w.icon} {w.temp}°F</span>
                            {w.feelsLike != null && w.feelsLike !== w.temp && (
                              <span className="text-gray-500">(feels {w.feelsLike}°)</span>
                            )}
                            {w.windSpeed > 0 && (
                              <span className="text-gray-500">💨 {w.windSpeed}mph{w.windDirection ? ` ${w.windDirection}` : ''}</span>
                            )}
                            {w.precipitationProbability > 0 && (
                              <span className={w.precipitationProbability >= 50 ? 'text-orange-400' : 'text-gray-500'}>🌧️ {w.precipitationProbability}%</span>
                            )}
                            {w.playability && w.playability.rating !== 'good' && (
                              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                w.playability.rating === 'unplayable' ? 'bg-signal-900/40 text-signal-300' :
                                w.playability.rating === 'poor' ? 'bg-orange-900/40 text-orange-300' :
                                'bg-yellow-900/40 text-yellow-300'
                              }`}>{w.playability.rating}</span>
                            )}
                            {w.isForecast && <span className="text-gray-600 text-[10px] italic">forecast</span>}
                          </div>
                        );
                      })()}
                      {!!game.officials?.length && (
                        <div className="flex flex-wrap gap-1 mb-1" onClick={(e) => e.stopPropagation()}>
                          {game.officials.map((o, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 rounded font-medium bg-action-900/50 text-action-300">{o.name}</span>
                          ))}
                        </div>
                      )}
                      {game.notes && <div className="text-xs text-gray-400 italic">{game.notes}</div>}
                      <div className="flex gap-2 mt-2 pt-2 border-t border-gray-700" onClick={(e) => e.stopPropagation()}>
                        {(game.status === 'scheduled' || game.status === 'in_progress') && canScoreGame(game.home_team_id, game.away_team_id, game.home_org_id, game.away_org_id) && (
                          <Button size="xs" variant={game.status === 'in_progress' ? 'primary' : 'warn'} onClick={() => setTrackingGameId(game.id)}>{game.status === 'in_progress' ? '⚾ Live' : '⚾ Track'}</Button>
                        )}
                        {canEditThisGame && (
                          <>
                            {game.status === 'unscheduled' && (
                              <Button size="xs" variant="danger" onClick={() => handleScheduleIt(game)}>Schedule It!</Button>
                            )}
                            {game.status !== 'unscheduled' && (
                              <Button size="xs" variant="secondary" onClick={() => { setEditing(game); setShowForm(true); }}>Edit</Button>
                            )}
                            {canDeleteGame(game.home_team_id, game.away_team_id, game.home_org_id, game.away_org_id) && (
                              <Button size="xs" variant="danger" onClick={() => handleDelete(game)} disabled={deleting === game.id}>{deleting === game.id ? '…' : 'Delete'}</Button>
                            )}
                          </>
                        )}
                        {isUmpire && game.status === 'scheduled' && (
                          <Button
                            size="xs"
                            variant={isInterested ? 'primary' : 'chrome'}
                            onClick={() => handleToggleInterest(game.id, isInterested)}
                            disabled={managingInterest === game.id}
                          >
                            {managingInterest === game.id ? '…' : (isInterested ? 'Interested' : 'I\'m Interested')}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      ) : (
        <ScheduleCalendar
          games={mergedItems.filter(i => i._type === 'game')}
          year={calYear}
          month={calMonth}
          onPrevMonth={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
          onNextMonth={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
          onToday={() => { setCalYear(new Date().getFullYear()); setCalMonth(new Date().getMonth()); }}
          onSelectGame={setSelectedGameId}
          onNavigateToTeam={onNavigateToTeam}
          gameWeather={gameWeather}
        />
      )}

      {showForm && (
        <GameForm
          game={editing}
          teams={teams}
          seasons={seasons}
          defaultSeasonId={filterSeason}
          onDone={handleFormDone}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onTeamsChanged={() => queryClient.invalidateQueries({ queryKey: ['teams'] })}
        />
      )}

      {showSubscribe && (
        <SubscribeModal
          filterTeam={filterTeam}
          filterSeason={filterSeason}
          onClose={() => setShowSubscribe(false)}
        />
      )}

      {editingPractice && (
        <PracticeEditModal
          practice={editingPractice}
          onDone={() => { setEditingPractice(null); queryClient.invalidateQueries({ queryKey: ['practices'] }); }}
          onCancel={() => setEditingPractice(null)}
        />
      )}
    </div>
  );
}

/* ── Subscribe Modal ── */

function SubscribeModal({ filterTeam, filterSeason, onClose }) {
  const [copied, setCopied] = useState(false);

  // Build .ics URL with current filters
  const icsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (filterTeam) params.set('team_id', filterTeam);
    if (filterSeason) params.set('season_id', filterSeason);
    const qs = params.toString();
    const origin = window.location.origin;
    return `${origin}/api/calendar/games.ics${qs ? '?' + qs : ''}`;
  }, [filterTeam, filterSeason]);

  const webcalUrl = icsUrl.replace(/^https?:/, 'webcal:');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(icsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback: select text */ }
  };

  return (
    <Modal open onClose={onClose} title="Subscribe to Calendar" size="md">
        <p className="text-sm text-gray-400 mb-4">
          Subscribe to this game schedule in your calendar app. Games will sync automatically as they're added or updated.
          {(filterTeam || filterSeason) && (
            <span className="block mt-1 text-chrome-400">Your current filters are included in this feed.</span>
          )}
        </p>

        {/* Quick subscribe button */}
        <a href={webcalUrl}
          className="btn btn-md btn-primary w-full flex items-center justify-center gap-2 mb-4">
          📅 Open in Calendar App
        </a>

        {/* Manual URL copy */}
        <div className="mb-4">
          <label className="lh-eyebrow block mb-1">
            Or copy the feed URL
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={icsUrl}
              className="lh-input flex-1 font-mono text-xs"
              onClick={e => e.target.select()}
            />
            <Button size="sm" variant="secondary" onClick={handleCopy}>
              {copied ? '✓ Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Google Calendar:</strong> Settings → Add calendar → From URL → paste the link</p>
          <p><strong>Apple Calendar:</strong> Click "Open in Calendar App" above, or File → New Subscription</p>
          <p><strong>Outlook:</strong> Add calendar → Subscribe from web → paste the link</p>
        </div>
    </Modal>
  );
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function ScheduleCalendar({ games, year, month, onPrevMonth, onNextMonth, onToday, onSelectGame, onNavigateToTeam, gameWeather = {} }) {
  const [selectedDate, setSelectedDate] = useState(null);

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const dk = (d) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const todayKey = new Date().toISOString().slice(0, 10);

  // Group games by date
  const gamesByDate = {};
  for (const g of games) {
    const d = g.game_date;
    if (!d) continue;
    if (!gamesByDate[d]) gamesByDate[d] = [];
    gamesByDate[d].push(g);
  }
  // Sort games within each date by time
  Object.values(gamesByDate).forEach(arr => arr.sort((a, b) => (a.game_time || '').localeCompare(b.game_time || '')));

  const selectedGames = selectedDate ? (gamesByDate[selectedDate] || []) : [];

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={onPrevMonth} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <Button size="xs" variant="ghost" onClick={onToday}>Today</Button>
          <span className="text-sm font-semibold text-white min-w-[140px] text-center">{MONTH_NAMES[month]} {year}</span>
          <button onClick={onNextMonth} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div className="text-xs text-gray-400">
          {Object.values(gamesByDate).reduce((sum, arr) => sum + arr.length, 0)} games this period
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold uppercase text-gray-500 py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px">
        {days.map((day, i) => {
          if (day === null) return <div key={`pad-${i}`} className="min-h-[80px]" />;
          const dateStr = dk(day);
          const dayGames = gamesByDate[dateStr] || [];
          const isToday = dateStr === todayKey;
          const isSelected = selectedDate === dateStr;
          return (
            <button key={dateStr} type="button"
              onClick={() => setSelectedDate(isSelected ? null : dateStr)}
              className={`min-h-[80px] p-1 text-left rounded transition-colors
                ${isToday ? 'ring-1 ring-chrome-500' : ''}
                ${isSelected ? 'bg-gray-700' : 'hover:bg-gray-700/50'}
              `}>
              <div className={`text-xs font-semibold mb-0.5 ${isToday ? 'text-chrome-400' : 'text-gray-300'}`}>{day}</div>
              <div className="space-y-0.5">
                {dayGames.slice(0, 3).map((g, j) => {
                  const statusColor =
                    g.status === 'completed' ? 'bg-action-900/40 text-action-300' :
                    g.status === 'cancelled' ? 'bg-signal-900/40 text-signal-300 line-through' :
                    g.status === 'postponed' ? 'bg-amber-900/40 text-amber-300' :
                    'bg-chrome-900/40 text-chrome-300';
                  return (
                    <div key={g.id || j} className={`text-[9px] leading-tight truncate rounded px-1 py-0.5 ${statusColor}`}>
                      {formatTime(g.game_time)} {g.home_team_abbr || g.home_city_abbr} vs {g.away_team_abbr || g.away_city_abbr}
                    </div>
                  );
                })}
                {dayGames.length > 3 && (
                  <div className="text-[9px] text-gray-400">+{dayGames.length - 3} more</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected date detail */}
      {selectedDate && (
        <div className="mt-4 border-t border-gray-700 pt-4">
          <h3 className="text-sm font-bold text-white mb-3">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            <span className="ml-2 text-gray-400 font-normal">({selectedGames.length} game{selectedGames.length !== 1 ? 's' : ''})</span>
          </h3>
          {selectedGames.length === 0 ? (
            <p className="text-sm text-gray-400">No games scheduled.</p>
          ) : (
            <div className="space-y-2">
              {selectedGames.map(game => {
                const statusColor = STATUS_COLORS[game.status] || 'bg-gray-800';
                return (
                  <div key={game.id}
                    onClick={() => onSelectGame(game.id)}
                    className="bg-gray-800 border border-gray-700 rounded-lg p-3 cursor-pointer hover:border-chrome-300 hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-300 w-20 shrink-0 text-center">
                          {formatTime(game.game_time) || 'TBD'}
                        </div>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <TeamLogo src={game.home_logo} name={game.home_team_name} ageGroup={game.home_age_group} level={game.home_level} cityAbbr={game.home_city_abbr} primaryColor={game.home_primary_color} secondaryColor={game.home_secondary_color} />
                            <button onClick={(e) => { e.stopPropagation(); onNavigateToTeam?.(game.home_team_id, game.home_org_id); }}
                              className="font-semibold text-sm truncate text-action-300 hover:text-action-100 hover:underline">{game.home_team_name}</button>
                          </div>
                          <span className="text-xs text-gray-500 shrink-0">
                            {game.status === 'completed'
                              ? <span className="font-extrabold text-white">{game.home_score ?? '—'} – {game.away_score ?? '—'}</span>
                              : 'vs'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <TeamLogo src={game.away_logo} name={game.away_team_name} ageGroup={game.away_age_group} level={game.away_level} cityAbbr={game.away_city_abbr} primaryColor={game.away_primary_color} secondaryColor={game.away_secondary_color} />
                            <button onClick={(e) => { e.stopPropagation(); onNavigateToTeam?.(game.away_team_id, game.away_org_id); }}
                              className="font-semibold text-sm truncate text-action-300 hover:text-action-100 hover:underline">{game.away_team_name}</button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {game.location_name && (
                          <span className="text-xs text-gray-400 hidden sm:inline">📍 {game.location_name}</span>
                        )}
                        {gameWeather[String(game.id)] && (() => {
                          const w = gameWeather[String(game.id)];
                          return (
                            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-gray-400" title={w.description}>
                              {w.icon} {w.temp}°
                              {w.precipitationProbability > 0 && (
                                <span className={w.precipitationProbability >= 50 ? 'text-orange-400' : 'text-gray-500'}>🌧️{w.precipitationProbability}%</span>
                              )}
                              {w.playability && w.playability.rating !== 'good' && (
                                <span className={`text-[9px] font-bold uppercase px-1 py-0.5 rounded-full ${
                                  w.playability.rating === 'unplayable' ? 'bg-signal-900/40 text-signal-300' :
                                  w.playability.rating === 'poor' ? 'bg-orange-900/40 text-orange-300' :
                                  'bg-yellow-900/40 text-yellow-300'
                                }`}>{w.playability.rating}</span>
                              )}
                            </span>
                          );
                        })()}
                        <span className={`lh-badge ${statusColor}`}>
                          {game.status_label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function GameForm({ game, teams, seasons, defaultSeasonId, defaultHomeTeamId, onDone, onCancel, onTeamsChanged }) {
  const isEditing = !!game;
  const { isSuperAdmin, isOrgAdmin, permissions, role, canEditOrg } = useAuth();
  const [saving, setSaving] = useState(false);
  const [addingLocation, setAddingLocation] = useState(false);
  const [showAddLocationForm, setShowAddLocationForm] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(null); // 'home' | 'away' | null
  const [error, setError] = useState(null);
  const [locations, setLocations] = useState([]);
  const [orgSettings, setOrgSettings] = useState({});
  const [officials, setOfficials] = useState([]);
  const [eventType, setEventType] = useState('game'); // 'game' | 'practice' | 'event' | 'maintenance'
  const [scheduleSettings, setScheduleSettings] = useState({
    game_start_time: '08:00',
    game_end_time: '20:00',
    game_time_increment_minutes: 30,
  });
  const initialStatus = game?.status || 'unscheduled';
  const initialGameDate = game?.game_date || new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    season_id: game?.season_id || defaultSeasonId || '',
    home_team_id: game?.home_team_id || defaultHomeTeamId || '',
    away_team_id: game?.away_team_id || '',
    location_id: game?.location_id || '',
    game_date: initialGameDate,
    game_time: game?.game_time?.slice(0, 5) || '',
    status: initialStatus,
    home_score: game?.home_score ?? '',
    away_score: game?.away_score ?? '',
    innings_played: game?.innings_played ?? '',
    official_ids: game?.official_ids || [],
    notes: game?.notes || '',
  });

  // Reservation-specific fields (for practice/event/maintenance)
  const [resForm, setResForm] = useState({
    title: '',
    team_id: '',
    start_time: '17:00',
    end_time: '19:00',
  });

  const isGame = eventType === 'game';

  const [newLocation, setNewLocation] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    comments: '',
  });

  const [fieldConflicts, setFieldConflicts] = useState(null);
  const [confirmSave, setConfirmSave] = useState(false);

  const selectedHomeTeam = teams.find((t) => String(t.id) === String(form.home_team_id));
  const interestedOfficialIds = (game?.interested_official_ids || []).map((id) => Number(id));
  const interestedOfficialSet = new Set(interestedOfficialIds);
  const homeOrgId = selectedHomeTeam?.org_id || null;
  const orgOfficialsEnabled = homeOrgId ? !!orgSettings[homeOrgId]?.officials_enabled : false;
  const officialsEnabled = orgOfficialsEnabled || officials.length > 0;

  useEffect(() => {
    fetchOrganizations().then((orgs) => {
      const map = {};
      for (const org of orgs || []) map[org.id] = org;
      setOrgSettings(map);
    }).catch(() => {
      setOrgSettings({});
    });
  }, []);

  useEffect(() => {
    fetchScheduleSettings().then((data) => {
      setScheduleSettings({
        game_start_time: data?.game_start_time || '08:00',
        game_end_time: data?.game_end_time || '20:00',
        game_time_increment_minutes: Number(data?.game_time_increment_minutes) || 30,
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!homeOrgId) {
      setLocations([]);
      setOfficials([]);
      if (form.location_id) {
        setForm((prev) => ({ ...prev, location_id: '' }));
      }
      return;
    }
    fetchLocations(homeOrgId).then((locs) => {
      setLocations(locs);
      if (form.location_id && !locs.some((loc) => String(loc.id) === String(form.location_id))) {
        setForm((prev) => ({ ...prev, location_id: '' }));
      }
    }).catch(() => {
      setLocations([]);
    });

    fetchAssignableOfficials(homeOrgId).then((rows) => {
      const list = rows || [];
      setOfficials(list);
      const validIds = new Set(list.map((o) => String(o.id)));
      setForm((prev) => ({
        ...prev,
        official_ids: (prev.official_ids || []).filter((id) => validIds.has(String(id))),
      }));
    }).catch(() => {
      setOfficials([]);
      setForm((prev) => ({ ...prev, official_ids: [] }));
    });
  }, [homeOrgId]);

  // For non-game types, load locations from user's org(s)
  useEffect(() => {
    if (isGame) return;
    // Load locations for the user's org(s)
    const orgIds = isSuperAdmin ? null : (permissions?.org_ids || []);
    if (isSuperAdmin) {
      // Load all orgs to get all locations
      fetchOrganizations().then(orgs => {
        const promises = orgs.map(o => fetchLocations(o.id).catch(() => []));
        return Promise.all(promises);
      }).then(results => {
        setLocations(results.flat());
      }).catch(() => setLocations([]));
    } else if (orgIds?.length) {
      Promise.all(orgIds.map(oid => fetchLocations(oid).catch(() => [])))
        .then(results => setLocations(results.flat()))
        .catch(() => setLocations([]));
    }
  }, [isGame, isSuperAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // 15-minute time options for reservation types
  const resTimeOptions = useMemo(() => {
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
  }, []);

  const timeSlots = buildTimeSlots(
    scheduleSettings.game_start_time,
    scheduleSettings.game_end_time,
    scheduleSettings.game_time_increment_minutes,
  );
  const currentTimeIncluded = form.game_time && !timeSlots.includes(form.game_time);

  function handleChange(e) {
    const { name, value } = e.target;
    if (name === 'home_team_id') {
      const nextTeam = teams.find((t) => String(t.id) === String(value));
      const nextOrgId = nextTeam?.org_id || null;
      const prevOrgId = selectedHomeTeam?.org_id || null;
      setForm((prev) => ({
        ...prev,
        home_team_id: value,
        location_id: nextOrgId !== prevOrgId ? '' : prev.location_id,
      }));
      return;
    }
    setForm(prev => {
      const next = { ...prev, [name]: value };
      // Clear location if age group changed and current location is no longer compatible
      if (name === 'age_group' && prev.location_id) {
        const loc = locations.find(l => String(l.id) === String(prev.location_id));
        if (loc?.age_groups?.length && !loc.age_groups.some(ag => ag.name === value)) {
          next.location_id = '';
        }
      }
      return next;
    });
  }

  function handleNewLocationChange(e) {
    const { name, value } = e.target;
    setNewLocation((prev) => ({ ...prev, [name]: value }));
  }

  function toggleOfficial(officialId) {
    setForm((prev) => {
      const has = (prev.official_ids || []).some((id) => String(id) === String(officialId));
      return {
        ...prev,
        official_ids: has
          ? prev.official_ids.filter((id) => String(id) !== String(officialId))
          : [...(prev.official_ids || []), Number(officialId)],
      };
    });
  }

  async function handleAddLocation(e) {
    e.preventDefault();
    if (!homeOrgId) {
      setError('Select a home team with an organization before adding a field.');
      return;
    }
    if (!newLocation.name.trim()) {
      setError('Field name is required.');
      return;
    }
    setAddingLocation(true);
    setError(null);
    try {
      const payload = {
        org_id: homeOrgId,
        name: newLocation.name.trim(),
        address: newLocation.address.trim() || null,
        city: newLocation.city.trim() || null,
        state: newLocation.state.trim() || null,
        zip: newLocation.zip.trim() || null,
        comments: newLocation.comments.trim() || null,
      };
      const created = await createLocation(payload);
      const updated = await fetchLocations(homeOrgId);
      setLocations(updated);
      setForm((prev) => ({ ...prev, location_id: String(created.id) }));
      setNewLocation({ name: '', address: '', city: '', state: '', zip: '', comments: '' });
      setShowAddLocationForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingLocation(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError(null);

    // Handle reservation (practice/event/maintenance)
    if (!isGame) {
      if (!resForm.title.trim()) { setSaving(false); setError('Title is required.'); return; }
      if (!form.game_date) { setSaving(false); setError('Date is required.'); return; }
      if (!resForm.start_time || !resForm.end_time) { setSaving(false); setError('Start and end times are required.'); return; }
      if (resForm.start_time >= resForm.end_time) { setSaving(false); setError('End time must be after start time.'); return; }
      if (!form.location_id) { setSaving(false); setError('Location is required for reservations.'); return; }

      const data = {
        location_id: Number(form.location_id),
        team_id: resForm.team_id ? Number(resForm.team_id) : null,
        title: resForm.title.trim(),
        event_type: eventType,
        event_date: form.game_date,
        start_time: resForm.start_time,
        end_time: resForm.end_time,
        notes: form.notes.trim() || null,
      };

      try {
        await createReservation(data);
        onDone();
      } catch (err) { setError(err.message); }
      finally { setSaving(false); }
      return;
    }

    const data = {
      season_id: form.season_id ? Number(form.season_id) : null,
      home_team_id: Number(form.home_team_id),
      away_team_id: Number(form.away_team_id),
      location_id: form.location_id ? Number(form.location_id) : null,
      game_date: form.game_date || null,
      game_time: form.game_time || null,
      status: form.status,
      home_score: form.home_score !== '' ? Number(form.home_score) : null,
      away_score: form.away_score !== '' ? Number(form.away_score) : null,
      innings_played: form.innings_played !== '' ? Number(form.innings_played) : null,
      official_ids: form.official_ids || [],
      notes: form.notes.trim() || null,
    };

    // Check for field reservation conflicts when scheduling a game with location + time
    if (data.location_id && data.game_time && !confirmSave) {
      try {
        const result = await checkGameConflicts(data.location_id, data.game_date, data.game_time);
        if (result.has_conflicts) {
          setFieldConflicts(result);
          setSaving(false);
          return;
        }
      } catch { /* proceed if check fails */ }
    }

    try {
      if (isEditing) await updateGame(game.id, data);
      else await createGame(data);
      setConfirmSave(false);
      setFieldConflicts(null);
      onDone();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  function handleConfirmSave() {
    setConfirmSave(true);
    setFieldConflicts(null);
    // Re-trigger submit
    const fakeEvent = { preventDefault: () => {} };
    handleSubmit(fakeEvent);
  }

  // Build team optgroups — all teams visible for scheduling (coaches need to pick opponents)
  const visibleTeams = teams;
  const teamsByOrg = {};
  const ungroupedTeams = [];
  for (const t of visibleTeams) {
    if (t.org_name) {
      if (!teamsByOrg[t.org_name]) teamsByOrg[t.org_name] = [];
      teamsByOrg[t.org_name].push(t);
    } else {
      ungroupedTeams.push(t);
    }
  }
  const orgNames = Object.keys(teamsByOrg).sort();

  function TeamSelect({ id, name, value }) {
    return (
      <div>
        <select id={id} name={name} value={value} onChange={(e) => {
          if (e.target.value === '__create__') {
            e.target.value = value; // revert selection
            setShowCreateTeam(name === 'home_team_id' ? 'home' : 'away');
            return;
          }
          handleChange(e);
        }} required className="lh-select">
          <option value="">— Select Team —</option>
          {orgNames.map(orgName => (
            <optgroup key={orgName} label={orgName}>
              {teamsByOrg[orgName].map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </optgroup>
          ))}
          {ungroupedTeams.length > 0 && (
            <optgroup label="Unassigned">
              {ungroupedTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </optgroup>
          )}
          <option value="__create__">＋ Create New Team…</option>
        </select>
      </div>
    );
  }

  // Determine if user can create reservations (needs canEditOrg for at least one org)
  const canCreateReservation = isSuperAdmin || isOrgAdmin;

  // Available event types based on permissions
  const eventTypeOptions = [
    { value: 'game', label: 'Game' },
    ...(canCreateReservation ? [
      { value: 'practice', label: 'Practice' },
      { value: 'event', label: 'Event' },
      { value: 'maintenance', label: 'Maintenance' },
    ] : []),
  ];

  return (
    <Modal open onClose={onCancel} title={isEditing ? 'Edit Game' : isGame ? 'Schedule Game' : `Schedule ${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Event Type Toggle — only on create, not edit */}
          {!isEditing && eventTypeOptions.length > 1 && (
            <div>
              <label className="lh-eyebrow block mb-1">Type</label>
              <div className="flex gap-1 p-1 bg-gray-900 rounded-lg">
                {eventTypeOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEventType(opt.value)}
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
              {/* Season */}
              <div>
                <label htmlFor="game-season" className="lh-eyebrow block mb-1">Season</label>
                <select id="game-season" name="season_id" value={form.season_id} onChange={handleChange} className="lh-select">
                  <option value="">— None —</option>
                  {seasons.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
                  ))}
                </select>
              </div>

              {/* Teams */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="game-home" className="lh-eyebrow block mb-1">Home Team *</label>
                  <TeamSelect id="game-home" name="home_team_id" value={form.home_team_id} />
                  {game?.home_sched_name && (
                    <div className="mt-1">
                      <CoachContact label={SCHED_ROLE_LABELS[game.home_sched_role] || 'Contact'} name={game.home_sched_name} email={game.home_sched_email} phone={game.home_sched_phone} />
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor="game-away" className="lh-eyebrow block mb-1">Away Team *</label>
                  <TeamSelect id="game-away" name="away_team_id" value={form.away_team_id} />
                  {game?.away_sched_name && (
                    <div className="mt-1">
                      <CoachContact label={SCHED_ROLE_LABELS[game.away_sched_role] || 'Contact'} name={game.away_sched_name} email={game.away_sched_email} phone={game.away_sched_phone} />
                    </div>
                  )}
                </div>
              </div>

              {/* Date/Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="game-date" className="lh-eyebrow block mb-1">Date</label>
                  <input id="game-date" name="game_date" type="date" value={form.game_date} onChange={handleChange} onTouchEnd={(e) => e.stopPropagation()} className="lh-input" />
                </div>
                <div>
                  <label htmlFor="game-time" className="lh-eyebrow block mb-1">Time</label>
                  <select id="game-time" name="game_time" value={form.game_time} onChange={handleChange} className="lh-select">
                    <option value="">— Select Time —</option>
                    {timeSlots.map((slot) => (
                      <option key={slot} value={slot}>{formatTime(slot)}</option>
                    ))}
                    {currentTimeIncluded && (
                      <option value={form.game_time}>{formatTime(form.game_time)} (custom)</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Location */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label htmlFor="game-location" className="lh-eyebrow mb-0">Location</label>
                  <button
                    type="button"
                    onClick={() => setShowAddLocationForm(true)}
                    disabled={!homeOrgId}
                    className="text-xs font-semibold text-action-300 hover:text-action-100 underline disabled:opacity-50 disabled:no-underline"
                  >
                    + Add new field
                  </button>
                </div>
                <select id="game-location" name="location_id" value={form.location_id} onChange={handleChange} className="lh-select" disabled={!homeOrgId}>
                  <option value="">— None —</option>
                  {locations
                    .filter(l => !form.age_group || !l.age_groups?.length || l.age_groups.some(ag => ag.name === form.age_group))
                    .map(l => (
                    <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ''}</option>
                  ))}
                </select>
                {!homeOrgId ? (
                  <p className="text-xs text-gray-400 mt-1">Select a home team first to see that organization&apos;s fields.</p>
                ) : locations.length === 0 ? (
                  <p className="text-xs text-gray-400 mt-1">No fields found for {selectedHomeTeam?.org_name || 'this organization'}.</p>
                ) : null}
              </div>

              {officialsEnabled && (
                <div>
                  <label className="lh-eyebrow block mb-1">Umpire Assignment</label>
                  {officials.length === 0 ? (
                    <p className="text-xs text-gray-400">No officials available for this organization. Add officials in the Officials module.</p>
                  ) : (
                    <div className="space-y-1 bg-gray-900 border border-gray-700 rounded-lg p-3 max-h-52 overflow-y-auto">
                      {officials.map((official) => {
                        const checked = (form.official_ids || []).some((id) => String(id) === String(official.id));
                        const interested = interestedOfficialSet.has(Number(official.id));
                        const rowCls = checked
                          ? 'border border-action-500/40 bg-action-900/20'
                          : interested
                            ? 'border border-amber-400/50 bg-amber-500/10'
                            : 'border border-signal-500/20 bg-signal-900/10';
                        const dotCls = checked ? 'bg-action-400' : interested ? 'bg-amber-300' : 'bg-signal-500';
                        return (
                          <label key={official.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${rowCls}`}>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
                            <span className="flex-1 text-sm text-gray-200 truncate">
                              {official.name}
                              <span className="text-xs text-gray-400 ml-1">({official.org_ids?.length ? 'Org' : 'League'})</span>
                            </span>
                            <input type="checkbox" checked={checked} onChange={() => toggleOfficial(official.id)} className="accent-green-500" />
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-action-400 inline-block" /> Assigned</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-300 inline-block" /> Interested</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-signal-500 inline-block" /> No status</span>
                  </div>
                </div>
              )}

              {/* Status + Score + Innings */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="game-status" className="lh-eyebrow block mb-1">Status</label>
                  <select id="game-status" name="status" value={form.status} onChange={handleChange} className="lh-select">
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="game-home-score" className="lh-eyebrow block mb-1">Home Score</label>
                  <input id="game-home-score" name="home_score" type="number" min="0" value={form.home_score} onChange={handleChange} className="lh-input" placeholder="—" />
                </div>
                <div>
                  <label htmlFor="game-away-score" className="lh-eyebrow block mb-1">Away Score</label>
                  <input id="game-away-score" name="away_score" type="number" min="0" value={form.away_score} onChange={handleChange} className="lh-input" placeholder="—" />
                </div>
                <div>
                  <label htmlFor="game-innings" className="lh-eyebrow block mb-1">Innings</label>
                  <input id="game-innings" name="innings_played" type="number" min="1" max="99" value={form.innings_played} onChange={handleChange} className="lh-input" placeholder="6" />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Reservation fields — Practice / Event / Maintenance */}
              <Input label="Title *" id="res-title" value={resForm.title}
                  onChange={e => setResForm(prev => ({ ...prev, title: e.target.value }))}
                  required placeholder="e.g. 10U Practice" />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="res-team" className="lh-eyebrow block mb-1">Team</label>
                  <select id="res-team" value={resForm.team_id}
                    onChange={e => setResForm(prev => ({ ...prev, team_id: e.target.value }))}
                    className="lh-select">
                    <option value="">— None —</option>
                    {visibleTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="res-date" className="lh-eyebrow block mb-1">Date *</label>
                  <input id="res-date" name="game_date" type="date" value={form.game_date} onChange={handleChange} onTouchEnd={(e) => e.stopPropagation()} required className="lh-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="res-start" className="lh-eyebrow block mb-1">Start Time *</label>
                  <select id="res-start" value={resForm.start_time}
                    onChange={e => setResForm(prev => ({ ...prev, start_time: e.target.value }))}
                    required className="lh-select">
                    <option value="">— Select —</option>
                    {resTimeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="res-end" className="lh-eyebrow block mb-1">End Time *</label>
                  <select id="res-end" value={resForm.end_time}
                    onChange={e => setResForm(prev => ({ ...prev, end_time: e.target.value }))}
                    required className="lh-select">
                    <option value="">— Select —</option>
                    {resTimeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Location — required for reservations */}
              <div>
                <label htmlFor="res-location" className="lh-eyebrow block mb-1">Location *</label>
                <select id="res-location" name="location_id" value={form.location_id} onChange={handleChange} required className="lh-select">
                  <option value="">— Select Field —</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ''}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <label htmlFor="game-notes" className="lh-eyebrow block mb-1">Notes</label>
            <textarea id="game-notes" name="notes" value={form.notes} onChange={handleChange} rows={2} placeholder="Any additional info…"
              className="lh-input" />
          </div>

          {error && <div className="lh-alert lh-alert-error">{error}</div>}

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
                  {c.created_by_name && (
                    <div className="text-amber-200">
                      Booked by: <span className="font-semibold text-white">{c.created_by_name}</span>
                      {c.created_by_email && (
                        <> — <a href={`mailto:${c.created_by_email}?subject=Field%20Reservation%20Conflict&body=Hi%20${encodeURIComponent(c.created_by_name)}%2C%0A%0AYour%20reservation%20%22${encodeURIComponent(c.title)}%22%20on%20${encodeURIComponent(form.game_date)}%20conflicts%20with%20a%20scheduled%20game.%20Games%20have%20priority%20so%20your%20reservation%20will%20need%20to%20be%20moved.%0A%0AThank%20you.`}
                          className="text-chrome-400 underline hover:text-chrome-300">
                          {c.created_by_email}
                        </a></>
                      )}
                      {c.created_at && (
                        <span className="ml-1 text-amber-400">on {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(c.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <p className="text-xs text-amber-400">Games always have priority. Please contact the person(s) above to notify them their reservation needs to move.</p>
              <div className="flex gap-2 pt-1">
                <Button size="xs" variant="warn" onClick={handleConfirmSave}>
                  Schedule Anyway
                </Button>
                <Button size="xs" variant="secondary" onClick={() => { setFieldConflicts(null); setConfirmSave(false); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving} loading={saving}>
              {saving ? 'Saving…' : isEditing ? 'Update' : isGame ? 'Schedule Game' : `Book ${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`}
            </Button>
          </div>
        </form>

        {showAddLocationForm && (
          <AddFieldModal
            homeOrgId={homeOrgId}
            onDone={async () => {
              const updated = await fetchLocations(homeOrgId);
              setLocations(updated);
              if (updated.length) {
                const newest = updated.reduce((a, b) => (a.id > b.id ? a : b));
                setForm(prev => ({ ...prev, location_id: String(newest.id) }));
              }
              setShowAddLocationForm(false);
            }}
            onCancel={() => setShowAddLocationForm(false)}
          />
        )}

        {showCreateTeam && (
          <QuickCreateTeamForm
            onCreated={(newTeam) => {
              const field = showCreateTeam === 'home' ? 'home_team_id' : 'away_team_id';
              setForm(prev => ({ ...prev, [field]: String(newTeam.id) }));
              setShowCreateTeam(null);
              if (onTeamsChanged) onTeamsChanged();
            }}
            onCancel={() => setShowCreateTeam(null)}
          />
        )}
      </Modal>
  );
}

function QuickCreateTeamForm({ onCreated, onCancel }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [ageGroups, setAgeGroups] = useState([]);
  const [levels, setLevels] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [form, setForm] = useState({
    team_city: '',
    team_mascot: '',
    team_color: '',
    age_group: '',
    level: '',
    org_id: '',
    primary_color: '#003366',
    secondary_color: '#CC0000',
  });

  useEffect(() => {
    Promise.all([fetchAgeGroups(), fetchLevels(), fetchOrganizations()])
      .then(([ag, lv, og]) => { setAgeGroups(ag); setLevels(lv); setOrgs(og); })
      .catch(() => {});
  }, []);

  const shortName = [form.team_city, form.team_color, form.age_group, form.level].filter(Boolean).join(' ');

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const data = {
        team_city: form.team_city.trim(),
        team_color: form.team_color.trim(),
        team_mascot: form.team_mascot.trim(),
        age_group: form.age_group || null,
        level: form.level || null,
        primary_color: form.primary_color || null,
        secondary_color: form.secondary_color || null,
        org_id: form.org_id ? Number(form.org_id) : null,
      };
      const newTeam = await createTeam(data);
      onCreated(newTeam);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onCancel} title="Create Opponent Team" size="md">
        <p className="text-xs text-gray-400 mb-4">Quickly add a team that doesn&apos;t exist yet. Organization is optional for opponent teams.</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Input label="Team City *" id="qt-city" name="team_city" type="text" value={form.team_city} onChange={handleChange} required placeholder="e.g. Austin" />
            <Input label="Team Mascot" id="qt-mascot" name="team_mascot" type="text" value={form.team_mascot} onChange={handleChange} placeholder="e.g. Thunder" />
            <Input label="Team Color" id="qt-color" name="team_color" type="text" value={form.team_color} onChange={handleChange} placeholder="e.g. Red" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="qt-primary" className="lh-eyebrow block mb-1">Primary Color</label>
              <div className="flex items-center gap-2">
                <input id="qt-primary" type="color" value={form.primary_color} onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))} className="w-10 h-8 rounded border border-gray-600 cursor-pointer p-0.5" />
                <input type="text" value={form.primary_color} onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))} className="lh-input flex-1 font-mono text-xs" maxLength={7} />
              </div>
            </div>
            <div>
              <label htmlFor="qt-secondary" className="lh-eyebrow block mb-1">Secondary Color</label>
              <div className="flex items-center gap-2">
                <input id="qt-secondary" type="color" value={form.secondary_color} onChange={e => setForm(prev => ({ ...prev, secondary_color: e.target.value }))} className="w-10 h-8 rounded border border-gray-600 cursor-pointer p-0.5" />
                <input type="text" value={form.secondary_color} onChange={e => setForm(prev => ({ ...prev, secondary_color: e.target.value }))} className="lh-input flex-1 font-mono text-xs" maxLength={7} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="qt-age" className="lh-eyebrow block mb-1">Age Group</label>
              {ageGroups.length > 0 ? (
                <select id="qt-age" name="age_group" value={form.age_group} onChange={handleChange} className="lh-select">
                  <option value="">— Select —</option>
                  {ageGroups.map(ag => <option key={ag.id} value={ag.name}>{ag.name}</option>)}
                </select>
              ) : (
                <input id="qt-age" name="age_group" type="text" value={form.age_group} onChange={handleChange} placeholder="e.g. 12U" className="lh-input" />
              )}
            </div>
            <div>
              <label htmlFor="qt-level" className="lh-eyebrow block mb-1">Level</label>
              {levels.length > 0 ? (
                <select id="qt-level" name="level" value={form.level} onChange={handleChange} className="lh-select">
                  <option value="">— Select —</option>
                  {levels.map(lv => <option key={lv.id} value={lv.name}>{lv.name}</option>)}
                </select>
              ) : (
                <input id="qt-level" name="level" type="text" value={form.level} onChange={handleChange} placeholder="e.g. Competitive" className="lh-input" />
              )}
            </div>
          </div>

          <div>
            <label htmlFor="qt-org" className="lh-eyebrow block mb-1">Organization</label>
            <select id="qt-org" name="org_id" value={form.org_id} onChange={handleChange} className="lh-select">
              <option value="">— None (opponent) —</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <p className="text-xs text-gray-500 mt-1">Leave blank for external opponent teams.</p>
          </div>

          {shortName && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm">
              <span className="text-xs font-semibold text-gray-400 uppercase">Team Name: </span>
              <span className="font-semibold text-gray-200">{shortName}</span>
            </div>
          )}

          {error && <div className="lh-alert lh-alert-error">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving} loading={saving}>{saving ? 'Creating…' : 'Create Team'}</Button>
          </div>
        </form>
    </Modal>
  );
}
