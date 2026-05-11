import React from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { STALE } from '../lib/queryConfig.js';
import { formatPhone } from '../utils/formatPhone.js';
import {
  fetchGames, deleteGame,
  fetchTeams, fetchSeasons,
  fetchGameInterests, expressGameInterest, removeGameInterest,
  fetchWeather, fetchWeatherForecast, fetchAllPractices, deleteReservation,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useBranding } from '../hooks/useBranding.js';
import GameDetail from './GameDetail.jsx';
import PitchTracker from './PitchTracker.jsx';
import TeamLogo from './TeamLogo.jsx';
import { PracticeCard, PracticeEditModal } from './TeamSchedule.jsx';

import { DARK_STATUS_COLORS } from '../constants/statusClasses.js';
import { Button, Modal } from './ui/index.js';
import { GameForm } from './GameForm.jsx';

export const STATUS_OPTIONS = [
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
  // Accept full ISO strings (e.g. "2026-04-23T00:00:00.000Z") by using only the date part
  const datePart = String(dateStr).slice(0, 10);
  const d = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}



export function CoachContact({ name, email, phone, label }) {
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

export const SCHED_ROLE_LABELS = { scheduling_contact: 'Scheduler', org_scheduler: 'Org Scheduler', head_coach: 'Head Coach', org_admin: 'Org Admin' };

export default function GameSchedule({ onBack, onNavigateToTeam, initialGameId, onGameIdConsumed, onOpenImport, onViewPlayer }) {
  const { isAdmin, isSuperAdmin, isAuthenticated, canScoreGame, canScheduleGames, canDeleteGame, isUmpire, permissions } = useAuth();
  const { features } = useBranding(isAuthenticated);
  const queryClient = useQueryClient();
  const gameDeleteEnabled = features.feature_game_delete === true;
  const canShowDelete = (game) =>
    canDeleteGame(game.home_team_id, game.away_team_id, game.home_org_id, game.away_org_id)
    && (isSuperAdmin || gameDeleteEnabled);

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
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
  }, []);

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
  // For non-admins: block the games query until we know which teams to filter on.
  // Lazy-initialize to true for admins so they get zero extra render cycles.
  const [filterTeamReady, setFilterTeamReady] = useState(() => isAdmin);

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

  // One-time: set the default team filter for non-admins once teams data is ready.
  // Single-team users get a real team_id (server-side filter); multi-team users
  // get '__my_teams__' (client-side filter, same payload as today's ⭐ option).
  useEffect(() => {
    if (filterTeamReady || isAdmin) { if (!filterTeamReady) setFilterTeamReady(true); return; }
    if (teamsLoading) return;
    if (myTeamIds.length === 1) {
      setFilterTeam(String(myTeamIds[0]));
    } else if (myTeamIds.length > 1) {
      setFilterTeam('__my_teams__');
    }
    setFilterTeamReady(true);
  }, [teamsLoading, isAdmin, myTeamIds, filterTeamReady]);

  // ── React Query: filter-driven data ────────────────────────────────────────
  const isMyTeams = filterTeam === '__my_teams__';
  // True when a non-admin is scoped to their own teams (via __my_teams__ or a single real team_id)
  const isInMyTeamsMode = !isAdmin && myTeamIds.length > 0 &&
    (filterTeam === '__my_teams__' || myTeamIds.some(id => String(id) === filterTeam));
  const gamesFilters = {
    // For multi-team mode pass the full id list so the server filters in SQL (avoids fetching all games)
    ...(isMyTeams && myTeamIds.length > 0 ? { team_ids: myTeamIds.join(',') } : {}),
    ...(!isMyTeams && filterTeam ? { team_id: filterTeam } : {}),
    ...(filterSeason ? { season_id: filterSeason } : {}),
    ...(filterStatus ? { status: filterStatus } : {}),
    slim: 'true',
  };

  const { data: rawGames = [], isLoading: gamesLoading, error: gamesError } = useQuery({
    queryKey: ['games', gamesFilters],
    queryFn: () => fetchGames(gamesFilters),
    staleTime: STALE.ONE_MIN,
    placeholderData: keepPreviousData,
    // Hold until both the season filter and the team filter are initialized.
    // filterTeamReady is true immediately for admins; non-admins wait for teams to load.
    // Exception: if seasons loaded with no active season, allow the unfiltered fetch.
    enabled: filterTeamReady && (!!filterSeason || (!seasonsLoading && !seasons.some(s => s.is_active))),
  });

  const practicesFilters = isMyTeams && myTeamIds.length > 0
    ? { team_ids: myTeamIds.join(',') }
    : filterTeam && !isMyTeams ? { team_id: filterTeam } : {};
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

  // Server now filters by team_ids directly — no client-side re-filtering needed
  const games = rawGames;
  const practices = rawPractices;

  const loading = seasonsLoading || gamesLoading || !filterTeamReady;
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
    // Optimistic removal — strip the game from every cached games query immediately
    queryClient.setQueriesData({ queryKey: ['games'] }, (old) =>
      Array.isArray(old) ? old.filter(g => g.id !== game.id) : old
    );
    try {
      await deleteGame(game.id);
      // Mark stale so next navigation/focus refetches, but don't trigger an immediate
      // background refetch here — that would cause keepPreviousData to flash the old list.
      queryClient.invalidateQueries({ queryKey: ['games'], refetchType: 'none' });
    } catch (err) {
      // Server rejected — pull fresh data back to restore the game
      queryClient.invalidateQueries({ queryKey: ['games'] });
      alert(`Failed to delete: ${err.message}`);
    } finally { setDeleting(null); }
  }

  function handleScheduleIt(game) {
    setEditing(game);
    setShowForm(true);
  }

  function handleFormDone(savedGame) {
    setShowForm(false);
    setEditing(null);
    // Optimistically patch the saved/new game in every cached games query so the
    // list updates immediately, then do a background refetch to confirm.
    if (savedGame?.id) {
      queryClient.setQueriesData({ queryKey: ['games'] }, (old) => {
        if (!Array.isArray(old)) return old;
        const idx = old.findIndex(g => g.id === savedGame.id);
        if (idx >= 0) {
          const next = [...old];
          next[idx] = { ...old[idx], ...savedGame };
          return next;
        }
        return [...old, savedGame]; // new game — append
      });
    }
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
    return <GameDetail gameId={selectedGameId} onBack={() => { setSelectedGameId(null); queryClient.invalidateQueries({ queryKey: ['games'] }); }} onNavigateToTeam={onNavigateToTeam} onOpenImport={onOpenImport} onViewPlayer={onViewPlayer} />;
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
          <select value={filterSeason} onChange={(e) => {
            setFilterSeason(e.target.value);
            // Reset team filter to user's default when season changes
            if (!isAdmin && myTeamIds.length === 1) setFilterTeam(String(myTeamIds[0]));
            else if (!isAdmin && myTeamIds.length > 1) setFilterTeam('__my_teams__');
          }}
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

      {/* Non-admin scoped-to-my-teams info bar */}
      {isInMyTeamsMode && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-chrome-900 border border-chrome-700 rounded-lg text-sm text-gray-300">
          <span>Showing your team{myTeamIds.length !== 1 ? 's' : ''} only</span>
          <button onClick={() => setFilterTeam('')} className="text-action-300 hover:underline ml-auto">
            View all teams
          </button>
        </div>
      )}

      {viewMode === 'list' ? (
        <>
          {mergedItems.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              {isInMyTeamsMode ? (
                <>
                  No games for your team{myTeamIds.length !== 1 ? 's' : ''} this season.
                  <br />
                  <button onClick={() => setFilterTeam('')} className="text-action-300 underline mt-1 inline-block">View all teams</button>
                </>
              ) : (
                <>
                  No events found.
                  {canScheduleGames && (
                    <>
                      <br />
                      <button onClick={() => setShowForm(true)} className="text-action-300 underline mt-1 inline-block">Schedule the first event</button>
                    </>
                  )}
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
                                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${w.playability.rating === 'unplayable' ? 'bg-signal-900/40 text-signal-300' :
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
                                  {canShowDelete(game) && (
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
                                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${w.playability.rating === 'unplayable' ? 'bg-signal-900/40 text-signal-300' :
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
                                {canShowDelete(game) && (
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
                      {formatTime(g.game_time)} {[g.home_age_group, g.home_level].filter(Boolean).join(' ')} {g.home_city_abbr} vs {g.away_city_abbr}
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
                                <span className={`text-[9px] font-bold uppercase px-1 py-0.5 rounded-full ${w.playability.rating === 'unplayable' ? 'bg-signal-900/40 text-signal-300' :
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


