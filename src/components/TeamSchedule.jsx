import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { STALE } from '../lib/queryConfig.js';
import { formatPhone } from '../utils/formatPhone.js';
import { needsScoreEntry, isGameToday } from '../utils/games.js';
import { fetchGames, fetchTeams, fetchSeasons, fetchTeamPractices, updateReservation, deleteReservation, fetchLocations, fetchWeather, fetchWeatherForecast } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import GameDetail from './GameDetail.jsx';
import PitchTracker from './PitchTracker.jsx';
import TeamLogo from './TeamLogo.jsx';
import { GameForm } from './GameSchedule.jsx';
import { Button, Input, Select, Modal } from './ui/index.js';
import { BaseballIcon, MapPinIcon, PhoneIcon, EnvelopeIcon, CalendarIcon, UserIcon } from './ui/icons.jsx';
import { DARK_STATUS_COLORS, DARK_TRACK_BUTTON_TONE } from '../constants/statusClasses.js';

const STATUS_COLORS = DARK_STATUS_COLORS;
const GC_BADGE_CLASS = 'inline-flex items-center rounded-sm bg-black px-1 py-0.5 text-[9px] font-bold leading-none tracking-tight text-[#00f092]';

const DURATION_OPTIONS = (() => {
  const opts = [];
  for (let m = 60; m <= 720; m += 15) {
    const h = Math.floor(m / 60), min = m % 60;
    const label = min === 0 ? `${h} hr${h > 1 ? 's' : ''}` : `${h}:${String(min).padStart(2, '0')}`;
    opts.push({ value: m, label });
  }
  return opts;
})();

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function formatDate(dateStr) {
  if (!dateStr || dateStr === 'unscheduled') return 'Unscheduled';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function toSortStamp(item) {
  const datePart = item?.game_date || item?.event_date || '1900-01-01';
  const timePart = (item?.game_time || item?.start_time || '00:00').slice(0, 5);
  const stamp = new Date(`${String(datePart).slice(0, 10)}T${timePart}:00`).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

const PRACTICE_COLORS = {
  practice: { bg: 'bg-chrome-900/40', border: 'border-chrome-500', text: 'text-chrome-300', dot: 'bg-chrome-500', badge: 'bg-chrome-900/60 text-chrome-300' },
  event: { bg: 'bg-purple-900/40', border: 'border-purple-500', text: 'text-purple-300', dot: 'bg-purple-500', badge: 'bg-purple-900/60 text-purple-300' },
  maintenance: { bg: 'bg-amber-900/40', border: 'border-amber-500', text: 'text-amber-300', dot: 'bg-amber-500', badge: 'bg-amber-900/60 text-amber-300' },
};

export default function TeamSchedule({ teamId, onNavigateToTeam, onViewPlayer }) {
  const { isAdmin, canScoreGame, canScheduleGames } = useAuth();
  const canManageGames = isAdmin || canScheduleGames;
  const queryClient = useQueryClient();
  const [teams, setTeams] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [trackingGameId, setTrackingGameId] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [sortOrder, setSortOrder] = useState('asc');
  const [editingPractice, setEditingPractice] = useState(null);
  const [editingGame, setEditingGame] = useState(null);
  const [deletingPractice, setDeletingPractice] = useState(null);
  const [gameWeather, setGameWeather] = useState({});
  const weatherFetchedRef = useRef(new Set());

  // Games + practices use react-query so cache invalidation from other pages
  // (e.g. a delete in GameSchedule) propagates here automatically.
  const gamesFilters = useMemo(() => ({ team_id: teamId }), [teamId]);
  const { data: games = [], isLoading: gamesLoading } = useQuery({
    queryKey: ['games', gamesFilters],
    queryFn: () => fetchGames(gamesFilters),
    enabled: !!teamId,
    staleTime: STALE.ONE_MIN,
    placeholderData: keepPreviousData,
  });
  const { data: practicesRaw = [], isLoading: practicesLoading } = useQuery({
    queryKey: ['practices', gamesFilters],
    queryFn: () => fetchTeamPractices(teamId),
    enabled: !!teamId,
    staleTime: STALE.FIVE_MIN,
    placeholderData: keepPreviousData,
  });
  const practices = useMemo(
    () => (practicesRaw || []).filter(p => p.event_type !== 'game_hold'),
    [practicesRaw]
  );
  const loading = gamesLoading || practicesLoading;

  const loadGames = useCallback((savedGame) => {
    // Optimistically patch the updated game immediately, then background-refetch
    if (savedGame?.id) {
      queryClient.setQueriesData({ queryKey: ['games'] }, (old) => {
        if (!Array.isArray(old)) return old;
        const idx = old.findIndex(g => g.id === savedGame.id);
        if (idx >= 0) {
          const next = [...old];
          next[idx] = { ...old[idx], ...savedGame };
          return next;
        }
        return [...old, savedGame];
      });
    }
    queryClient.invalidateQueries({ queryKey: ['games'] });
    queryClient.invalidateQueries({ queryKey: ['practices'] });
  }, [queryClient]);

  // Fetch weather for scheduled upcoming games with known location
  useEffect(() => {
    if (!games.length) return;
    const now = new Date();
    const weatherableGames = games.filter(g =>
      g.location_lat && g.location_lon &&
      g.status !== 'completed' && g.status !== 'cancelled' &&
      g.game_date &&
      !weatherFetchedRef.current.has(String(g.id))
    );
    if (!weatherableGames.length) return;
    for (const g of weatherableGames) weatherFetchedRef.current.add(String(g.id));
    const isToday = (dateStr) => {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toDateString() === now.toDateString();
    };
    const promises = weatherableGames.map(g =>
      (isToday(g.game_date)
        ? fetchWeather(g.location_lat, g.location_lon)
        : fetchWeatherForecast(g.location_lat, g.location_lon, g.game_date, g.game_time || null))
        .then(w => (w && !w.unavailable) ? { key: String(g.id), weather: w } : null)
        .catch(() => null)
    );
    Promise.all(promises).then(results => {
      const map = {};
      for (const r of results) if (r) map[r.key] = r.weather;
      setGameWeather(prev => ({ ...prev, ...map }));
    });
  }, [games]);

  useEffect(() => {
    if (!canManageGames) return;
    let cancelled = false;
    Promise.all([fetchTeams(), fetchSeasons()])
      .then(([teamsData, seasonsData]) => {
        if (cancelled) return;
        setTeams(teamsData || []);
        setSeasons(seasonsData || []);
      })
      .catch(() => {
        if (cancelled) return;
        setTeams([]);
        setSeasons([]);
      });
    return () => { cancelled = true; };
  }, [canManageGames]);

  // Merge games + practices into a unified sorted list
  const allItems = useMemo(() => {
    const items = [];
    for (const g of games) {
      let gameDate = g.game_date;
      if (gameDate instanceof Date) gameDate = gameDate.toISOString().slice(0, 10);
      else if (typeof gameDate === 'string' && gameDate.length > 10) gameDate = gameDate.slice(0, 10);
      items.push({ ...g, _type: 'game', _date: gameDate, _time: g.game_time || '' });
    }
    for (const p of practices) {
      let eventDate = p.event_date;
      if (eventDate instanceof Date) eventDate = eventDate.toISOString().slice(0, 10);
      else if (typeof eventDate === 'string' && eventDate.length > 10) eventDate = eventDate.slice(0, 10);
      items.push({ ...p, _type: 'practice', _date: eventDate, _time: p.start_time || '' });
    }
    return items;
  }, [games, practices]);

  const sortedItems = useMemo(() => [...allItems].sort((a, b) => toSortStamp(b) - toSortStamp(a)), [allItems]);

  // Group by date for list view
  const itemsByDate = useMemo(() => {
    const map = {};
    for (const item of sortedItems) {
      const d = item._date || 'unscheduled';
      if (!map[d]) map[d] = [];
      map[d].push(item);
    }
    // Sort within each date by time ascending
    Object.values(map).forEach(arr => arr.sort((a, b) => (a._time || '').localeCompare(b._time || '')));
    return map;
  }, [sortedItems]);

  const sortedDateKeys = useMemo(() =>
    Object.keys(itemsByDate).sort((a, b) => sortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a)),
    [itemsByDate, sortOrder]
  );

  async function handleDeletePractice(practice) {
    const label = `${practice.title} on ${formatDate(practice._date || practice.event_date)}`;
    if (!window.confirm(`Delete: ${label}?`)) return;
    setDeletingPractice(practice.id);
    try {
      await deleteReservation(practice.id);
      loadGames();
    } catch (err) { alert(`Failed to delete: ${err.message}`); }
    finally { setDeletingPractice(null); }
  }

  if (trackingGameId) {
    return (
      <div className="mt-6">
        <PitchTracker gameId={trackingGameId} onBack={() => { setTrackingGameId(null); loadGames(); }} />
      </div>
    );
  }

  if (selectedGameId) {
    return (
      <div className="mt-6">
        <GameDetail gameId={selectedGameId} onBack={() => { setSelectedGameId(null); loadGames(); }} onNavigateToTeam={onNavigateToTeam} onViewPlayer={onViewPlayer} />
      </div>
    );
  }

  if (!teamId) return null;
  if (loading) return <div className="py-4 text-center text-gray-400 text-sm">Loading schedule…</div>;

  const activeSeason = seasons.find((season) => season.is_active);
  const defaultSeasonId = activeSeason ? String(activeSeason.id) : '';

  const handlePrevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const handleNextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };
  const handleToday = () => { setCalYear(new Date().getFullYear()); setCalMonth(new Date().getMonth()); };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-base font-display font-bold text-white uppercase tracking-wide">
          Schedule ({games.length} game{games.length !== 1 ? 's' : ''}{practices.length > 0 ? `, ${practices.length} practice${practices.length !== 1 ? 's' : ''}` : ''})
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => setViewMode('list')}
              className={`lh-tab ${viewMode === 'list' ? 'lh-tab-active' : 'lh-tab-inactive'}`}>
              List
            </button>
            <button onClick={() => setViewMode('calendar')}
              className={`lh-tab ${viewMode === 'calendar' ? 'lh-tab-active' : 'lh-tab-inactive'}`}>
              Calendar
            </button>
            <Button size="xs" variant="secondary" onClick={() => setShowSubscribe(true)} title="Subscribe to calendar feed">
              <CalendarIcon className="w-4 h-4" />
            </Button>
          </div>
          <Button size="xs" variant="secondary" onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')} title={sortOrder === 'asc' ? 'Oldest first' : 'Newest first'}>
            {sortOrder === 'asc' ? '↑ ASC' : '↓ DESC'}
          </Button>
          {canManageGames && (
            <Button size="xs" onClick={() => setShowForm((prev) => !prev)}>
              {showForm ? 'Cancel' : '+ Add Game / Practice'}
            </Button>
          )}
        </div>
      </div>

      {showForm && canManageGames && (
        <div className="mb-3 bg-gray-800 border border-gray-700 rounded-lg p-3">
          <GameForm
            game={editingGame}
            teams={teams}
            seasons={seasons}
            defaultSeasonId={defaultSeasonId}
            defaultHomeTeamId={editingGame ? undefined : teamId}
            onDone={(saved) => { setShowForm(false); setEditingGame(null); loadGames(saved); }}
            onCancel={() => { setShowForm(false); setEditingGame(null); }}
          />
        </div>
      )}

      {viewMode === 'list' ? (
        /* ── List View ── */
        !allItems.length ? (
          <div className="text-sm text-gray-400">No games or practices scheduled.</div>
        ) : (
          <div className="space-y-4">
            {sortedDateKeys.map(dateKey => (
              <div key={dateKey}>
                <h4 className="text-xs font-display font-bold text-gray-400 uppercase tracking-wide mb-1 border-b border-gray-700 pb-1">
                  {formatDate(dateKey)}
                </h4>
                <div className="space-y-2">
                  {itemsByDate[dateKey].map(item => (
                    item._type === 'game'
                      ? <GameCard key={`game-${item.id}`} game={item} teamId={teamId}
                          weather={gameWeather[String(item.id)]}
                          onSelect={() => setSelectedGameId(item.id)}
                          onTrack={() => setTrackingGameId(item.id)}
                          onSchedule={canScoreGame(item.home_team_id, item.away_team_id, item.home_org_id, item.away_org_id) ? () => { setEditingGame(item); setShowForm(true); } : undefined}
                          canScore={canScoreGame(item.home_team_id, item.away_team_id, item.home_org_id, item.away_org_id)} />
                      : <PracticeCard key={`practice-${item.id}`} practice={item}
                          editable={canManageGames}
                          onEdit={() => setEditingPractice(item)}
                          onClone={() => { setEditingGame(null); setShowForm(true); }}
                          onDelete={() => handleDeletePractice(item)}
                          deleting={deletingPractice} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* ── Calendar View ── */
        <TeamCalendar
          items={allItems}
          teamId={teamId}
          year={calYear}
          month={calMonth}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onToday={handleToday}
          onSelectGame={setSelectedGameId}
          onTrackGame={setTrackingGameId}
          canScoreGame={canScoreGame}
          onNavigateToTeam={onNavigateToTeam}
        />
      )}

      {showSubscribe && (
        <TeamSubscribeModal teamId={teamId} onClose={() => setShowSubscribe(false)} />
      )}

      {editingPractice && (
        <PracticeEditModal
          practice={editingPractice}
          onDone={() => { setEditingPractice(null); loadGames(); }}
          onCancel={() => setEditingPractice(null)}
        />
      )}
    </div>
  );
}

/* ── Game Card (list view) ── */

function GameCard({ game, teamId, weather, onSelect, onTrack, onSchedule, canScore }) {
  const isHome = game.home_team_id === teamId;
  const opponent = isHome ? game.away_team_name : game.home_team_name;
  const opponentLogo = isHome ? game.away_logo : game.home_logo;
  const oppCityAbbr = isHome ? game.away_city_abbr : game.home_city_abbr;
  const oppAgeGroup = isHome ? game.away_age_group : game.home_age_group;
  const oppLevel = isHome ? game.away_level : game.home_level;
  const oppPrimary = isHome ? game.away_primary_color : game.home_primary_color;
  const oppSecondary = isHome ? game.away_secondary_color : game.home_secondary_color;
  const prefix = isHome ? 'vs' : '@';
  const teamScore = isHome ? game.home_score : game.away_score;
  const oppScore = isHome ? game.away_score : game.home_score;
  const isCompleted = game.status === 'completed';
  let result = '';
  if (isCompleted && teamScore != null && oppScore != null) {
    if (teamScore > oppScore) result = 'W';
    else if (teamScore < oppScore) result = 'L';
    else result = 'T';
  }
  const resultColor = result === 'W' ? 'text-action-400' : result === 'L' ? 'text-signal-400' : result === 'T' ? 'text-gray-400' : '';
  const isUnplayed = game.status !== 'completed';
  const cardTone = isHome
    ? (isUnplayed ? 'bg-slate-800/85 border-green-600/70' : 'bg-gray-800 border-green-700/60')
    : (isUnplayed ? 'bg-slate-800/85 border-slate-600/80' : 'bg-gray-800 border-gray-700');
  const highlightTone = isGameToday(game)
    ? '!border-action-500 ring-1 ring-action-500/40'
    : needsScoreEntry(game)
      ? '!border-signal-500 ring-1 ring-signal-500/40'
      : '';

  return (
    <div onClick={onSelect}
      className={`${cardTone} ${highlightTone} border rounded-lg px-3 py-2 text-sm cursor-pointer hover:border-chrome-300 hover:shadow-sm transition-all`}>
      <div className="flex items-center gap-3">
        <div className="w-16 shrink-0 text-center">
          <div className="text-xs text-gray-400">{formatTime(game.game_time) || 'TBD'}</div>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs text-gray-400 font-semibold w-5 shrink-0">{prefix}</span>
          <TeamLogo src={opponentLogo} name={opponent} ageGroup={oppAgeGroup} level={oppLevel} cityAbbr={oppCityAbbr} primaryColor={oppPrimary} secondaryColor={oppSecondary} size="w-6 h-6" />
          <span className="font-semibold text-gray-200 truncate">{opponent}</span>
        </div>
        <div className="shrink-0 text-right flex items-center gap-2">
        {game.is_gamechanger_imported && (
          <span className={GC_BADGE_CLASS} title="Imported from GameChanger">GC</span>
        )}
        {isCompleted ? (
          <div className="flex items-center gap-2">
            <span className={`font-bold text-xs px-1.5 py-0.5 rounded ${resultColor}`}>{result}</span>
            <span className="font-extrabold text-lg text-white tabular-nums tracking-tight">{teamScore}–{oppScore}</span>
          </div>
        ) : (
          <>
            {game.status === 'unscheduled' && onSchedule && (
              <button onClick={(e) => { e.stopPropagation(); onSchedule(); }}
                className="text-xs font-semibold px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white transition-colors">
                Schedule It!
              </button>
            )}
            {(game.status === 'scheduled' || game.status === 'in_progress') && canScore && (
              <button onClick={(e) => { e.stopPropagation(); onTrack(); }}
                className={`text-xs font-semibold px-2 py-1 rounded transition-colors flex items-center gap-1 ${DARK_TRACK_BUTTON_TONE}`}
                title="Live pitch tracker">
                <BaseballIcon className="w-3.5 h-3.5" />{game.status === 'in_progress' ? 'Live' : 'Track'}
              </button>
            )}
            <span className={`lh-badge ${STATUS_COLORS[game.status] || 'bg-gray-800'}`}>
              {game.status_label}
            </span>
          </>
        )}
      </div>
      {!!game.official_names?.length && (
        <div className="hidden lg:flex items-center gap-1 text-xs text-gray-400 truncate max-w-[220px]">
          <UserIcon className="w-3.5 h-3.5 shrink-0" />{game.official_names.join(', ')}
        </div>
      )}
      </div>
      {/* Location + Weather row */}
      {(game.location_name || weather) && game.status !== 'unscheduled' && (
        <div className="flex items-center gap-3 mt-1 ml-[76px] text-xs text-gray-400">
          {game.location_name && (
            <span className="truncate max-w-[200px] flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5 shrink-0" />{game.location_name}</span>
          )}
          {weather && (
            <span className="inline-flex items-center gap-1 shrink-0" title={`${weather.description}${weather.isForecast ? ' (forecast)' : ''}`}>
              <span>{weather.icon}</span>
              <span>{weather.temp}°</span>
              {weather.precipitationProbability > 0 && (
                <span className={weather.precipitationProbability >= 50 ? 'text-orange-400' : 'text-gray-500'}>🌧️{weather.precipitationProbability}%</span>
              )}
              {weather.playability && weather.playability.rating !== 'good' && (
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                  weather.playability.rating === 'unplayable' ? 'bg-signal-900/40 text-signal-300' :
                  weather.playability.rating === 'poor' ? 'bg-orange-900/40 text-orange-300' :
                  'bg-yellow-900/40 text-yellow-300'
                }`}>{weather.playability.rating}</span>
              )}
            </span>
          )}
        </div>
      )}
      {game.status === 'unscheduled' && canScore && (game.home_sched_name || game.away_sched_name) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 ml-[76px] text-xs text-gray-400">
          {game.home_sched_name && (
            <span className="flex items-center gap-1">
              <span className="text-gray-500">Home:</span> {game.home_sched_name}
              {game.home_sched_email && <a href={`mailto:${game.home_sched_email}`} onClick={e => e.stopPropagation()} className="hover:text-action-300 cursor-pointer" title={game.home_sched_email}><EnvelopeIcon className="w-3.5 h-3.5" /></a>}
              {game.home_sched_phone && <a href={`tel:${game.home_sched_phone.replace(/\D/g, '')}`} onClick={e => e.stopPropagation()} className="hover:text-action-300 cursor-pointer flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" />{formatPhone(game.home_sched_phone)}</a>}
            </span>
          )}
          {game.away_sched_name && (
            <span className="flex items-center gap-1">
              <span className="text-gray-500">Away:</span> {game.away_sched_name}
              {game.away_sched_email && <a href={`mailto:${game.away_sched_email}`} onClick={e => e.stopPropagation()} className="hover:text-action-300 cursor-pointer" title={game.away_sched_email}><EnvelopeIcon className="w-3.5 h-3.5" /></a>}
              {game.away_sched_phone && <a href={`tel:${game.away_sched_phone.replace(/\D/g, '')}`} onClick={e => e.stopPropagation()} className="hover:text-action-300 cursor-pointer flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" />{formatPhone(game.away_sched_phone)}</a>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Practice Card (list view) ── */

export function PracticeCard({ practice, editable, onEdit, onDelete, onClone, deleting }) {
  const colors = PRACTICE_COLORS[practice.event_type] || PRACTICE_COLORS.practice;
  const typeLabel = practice.event_type === 'practice' ? 'Practice'
    : practice.event_type === 'event' ? 'Event' : practice.event_type || 'Practice';
  return (
    <div className={`${colors.bg} border ${colors.border} rounded-lg px-3 py-2 flex items-center gap-3 text-sm`}>
      <div className="w-16 shrink-0 text-center">
        <div className={`text-xs ${colors.text}`}>
          {formatTime(practice.start_time)}{practice.end_time ? `–${formatTime(practice.end_time)}` : ''}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
        <span className={`font-semibold ${colors.text} truncate`}>{practice.title}</span>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {practice.location_name && (
          <span className="text-xs text-gray-400 hidden sm:inline-flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5 shrink-0" />{practice.location_name}</span>
        )}
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
          {typeLabel}
        </span>
        {editable && (
          <>
            <Button size="xs" variant="secondary" onClick={(e) => { e.stopPropagation(); onEdit(); }}>Edit</Button>
            {onClone && <Button size="xs" variant="secondary" onClick={(e) => { e.stopPropagation(); onClone(); }} title="Clone this event">Clone</Button>}
            <Button size="xs" variant="danger" onClick={(e) => { e.stopPropagation(); onDelete(); }} disabled={deleting === practice.id}>
              {deleting === practice.id ? '…' : 'Del'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Team Calendar View ── */

function TeamCalendar({ items, teamId, year, month, onPrevMonth, onNextMonth, onToday, onSelectGame, onTrackGame, canScoreGame, onNavigateToTeam }) {
  const [selectedDate, setSelectedDate] = useState(null);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const dk = (d) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const todayKey = new Date().toISOString().slice(0, 10);

  // Group items by date
  const itemsByDate = useMemo(() => {
    const map = {};
    for (const item of items) {
      const d = item._date;
      if (!d) continue;
      if (!map[d]) map[d] = [];
      map[d].push(item);
    }
    Object.values(map).forEach(arr => arr.sort((a, b) => (a._time || '').localeCompare(b._time || '')));
    return map;
  }, [items]);

  const selectedItems = selectedDate ? (itemsByDate[selectedDate] || []) : [];

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
          const dayItems = itemsByDate[dateStr] || [];
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
                {dayItems.slice(0, 3).map((item, j) => {
                  if (item._type === 'game') {
                    const statusColor =
                      item.status === 'completed' ? 'bg-action-900/40 text-action-300' :
                      item.status === 'cancelled' ? 'bg-signal-900/40 text-signal-300 line-through' :
                      item.status === 'postponed' ? 'bg-amber-900/40 text-amber-300' :
                      'bg-slate-800/80 text-gray-300';
                    return (
                      <div key={`g-${item.id}`} className={`text-[9px] leading-tight truncate rounded px-1 py-0.5 ${statusColor}`}>
                        {formatTime(item.game_time)} {[item.home_age_group, item.home_level].filter(Boolean).join(' ')} {item.home_city_abbr} vs {item.away_city_abbr}
                      </div>
                    );
                  } else {
                    const colors = PRACTICE_COLORS[item.event_type] || PRACTICE_COLORS.practice;
                    return (
                      <div key={`p-${item.id}`} className={`text-[9px] leading-tight truncate rounded px-1 py-0.5 ${colors.bg} ${colors.text}`}>
                        {formatTime(item.start_time)} {item.title}
                      </div>
                    );
                  }
                })}
                {dayItems.length > 3 && (
                  <div className="text-[9px] text-gray-400">+{dayItems.length - 3} more</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected date detail */}
      {selectedDate && (
        <div className="mt-4 border-t border-gray-700 pt-4">
          <h4 className="text-sm font-bold text-white mb-3">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            <span className="ml-2 text-gray-400 font-normal">({selectedItems.length} event{selectedItems.length !== 1 ? 's' : ''})</span>
          </h4>
          {selectedItems.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing scheduled.</p>
          ) : (
            <div className="space-y-2">
              {selectedItems.map(item => {
                if (item._type === 'game') {
                  const isHome = item.home_team_id === teamId;
                  const opponent = isHome ? item.away_team_name : item.home_team_name;
                  const oppLogo = isHome ? item.away_logo : item.home_logo;
                  const oppCityAbbr = isHome ? item.away_city_abbr : item.home_city_abbr;
                  const oppAgeGroup = isHome ? item.away_age_group : item.home_age_group;
                  const oppLevel = isHome ? item.away_level : item.home_level;
                  const oppPrimary = isHome ? item.away_primary_color : item.home_primary_color;
                  const oppSecondary = isHome ? item.away_secondary_color : item.home_secondary_color;
                  const prefix = isHome ? 'vs' : '@';
                  const isCompleted = item.status === 'completed';
                  const teamScore = isHome ? item.home_score : item.away_score;
                  const oppScore = isHome ? item.away_score : item.home_score;
                  return (
                    <div key={`g-${item.id}`} onClick={() => onSelectGame(item.id)}
                      className="bg-gray-800 border border-gray-700 rounded-lg p-3 cursor-pointer hover:border-chrome-300 hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-300 w-20 shrink-0 text-center">
                            {formatTime(item.game_time) || 'TBD'}
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-xs text-gray-400 font-semibold">{prefix}</span>
                            <TeamLogo src={oppLogo} name={opponent} ageGroup={oppAgeGroup} level={oppLevel} cityAbbr={oppCityAbbr} primaryColor={oppPrimary} secondaryColor={oppSecondary} />
                            <span className="font-semibold text-sm truncate text-gray-200">{opponent}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.location_name && (
                            <span className="text-xs text-gray-400 hidden sm:inline-flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5 shrink-0" />{item.location_name}</span>
                          )}
                          {isCompleted ? (
                            <span className="font-extrabold text-white">{teamScore ?? '—'} – {oppScore ?? '—'}</span>
                          ) : (
                            <span className={`lh-badge ${STATUS_COLORS[item.status] || 'bg-gray-800'}`}>
                              {item.status_label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  return <PracticeCard key={`p-${item.id}`} practice={item}
                    editable={canManageGames}
                    onEdit={() => setEditingPractice(item)}
                    onClone={() => { setEditingGame(null); setShowForm(true); }}
                    onDelete={() => handleDeletePractice(item)}
                    deleting={deletingPractice} />;
                }
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Subscribe Modal ── */

function TeamSubscribeModal({ teamId, onClose }) {
  const [copied, setCopied] = useState(false);

  const icsUrl = useMemo(() => {
    const params = new URLSearchParams({ team_id: teamId });
    return `${window.location.origin}/api/calendar/games.ics?${params}`;
  }, [teamId]);

  const webcalUrl = icsUrl.replace(/^https?:/, 'webcal:');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(icsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  };

  return (
    <Modal open onClose={onClose} title="Subscribe to Team Calendar" size="md">
        <p className="text-sm text-gray-400 mb-4">
          Subscribe to this team's schedule in your calendar app. Games and practices will sync automatically.
        </p>

          <a href={webcalUrl}
          className="btn btn-md btn-primary w-full flex items-center justify-center gap-2 mb-4">
          <CalendarIcon className="w-4 h-4" /> Open in Calendar App
        </a>

        <div className="mb-4">
          <label className="lh-eyebrow block mb-1">Or copy the feed URL</label>
          <div className="flex gap-2">
            <input type="text" readOnly value={icsUrl}
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-xs text-gray-300 font-mono select-all focus:outline-none focus:ring-2 focus:ring-action-500/30"
              onClick={e => e.target.select()} />
            <Button size="xs" variant="secondary" onClick={handleCopy}>
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

/* ── Practice Edit Modal ── */

export function PracticeEditModal({ practice, onDone, onCancel }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [locations, setLocations] = useState([]);

  const [form, setForm] = useState(() => {
    const startStr = (practice.start_time || '').slice(0, 5);
    const endStr = (practice.end_time || '').slice(0, 5);
    let duration_minutes = 120;
    if (startStr && endStr) {
      const [sh, sm] = startStr.split(':').map(Number);
      const [eh, em] = endStr.split(':').map(Number);
      const computed = (eh * 60 + em) - (sh * 60 + sm);
      if (computed > 0) duration_minutes = computed;
    }
    return {
      title: practice.title || '',
      event_type: practice.event_type || 'practice',
      event_date: (practice.event_date || practice._date || '').slice(0, 10),
      start_time: startStr,
      duration_minutes,
      location_id: practice.location_id || '',
      notes: practice.notes || '',
    };
  });

  useEffect(() => {
    fetchLocations().then(setLocations).catch(() => setLocations([]));
  }, []);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.start_time) { setError('Start time is required.'); return; }
    if (!form.duration_minutes) { setError('Duration is required.'); return; }
    setSaving(true); setError(null);

    const [sh, sm] = form.start_time.split(':').map(Number);
    const endMin = sh * 60 + sm + Number(form.duration_minutes);
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

    try {
      const result = await updateReservation(practice.id, {
        location_id: form.location_id ? Number(form.location_id) : (practice.location_id || null),
        team_id: practice.team_id || null,
        title: form.title.trim(),
        event_type: form.event_type,
        event_date: form.event_date,
        start_time: form.start_time,
        end_time: endTime,
        notes: form.notes.trim() || null,
      });
      if (result?.warning) { setWarning(result.warning); setSaving(false); return; }
      onDone();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  const eventTypeOptions = [
    { value: 'practice', label: 'Practice' },
    { value: 'event', label: 'Event' },
    { value: 'maintenance', label: 'Maintenance' },
  ];

  return (
    <Modal open onClose={onCancel} title="Edit Reservation" size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Event type */}
          <div>
            <label className="lh-eyebrow block mb-1">Type</label>
            <div className="flex gap-1 p-1 bg-gray-900 rounded-lg">
              {eventTypeOptions.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm(prev => ({ ...prev, event_type: opt.value }))}
                  className={`flex-1 lh-tab ${
                    form.event_type === opt.value
                      ? 'lh-tab-active'
                      : 'lh-tab-inactive'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Input label="Title *" id="pe-title" name="title" type="text" value={form.title} onChange={handleChange} required />
          <Input label="Date" id="pe-date" name="event_date" type="date" value={form.event_date} onChange={handleChange} />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Time *" id="pe-start" name="start_time" type="time" value={form.start_time} onChange={handleChange} required />
            <div>
              <label htmlFor="pe-duration" className="lh-eyebrow block mb-1">Duration *</label>
              <select id="pe-duration" name="duration_minutes" value={form.duration_minutes} onChange={handleChange} required className="lh-select">
                {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <Select label="Location" id="pe-location" name="location_id" value={form.location_id} onChange={handleChange}>
            <option value="">—</option>
            {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </Select>

          <div>
            <label htmlFor="pe-notes" className="lh-eyebrow block mb-1">Notes</label>
            <textarea id="pe-notes" name="notes" value={form.notes} onChange={handleChange} rows={2} className="lh-input" />
          </div>

          {error && <div className="lh-alert lh-alert-error">{error}</div>}

          {warning && (
            <div className="bg-yellow-900/30 border border-yellow-600 text-yellow-200 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
              <span className="text-yellow-400 font-bold mt-0.5">⚠</span>
              <div className="flex-1">
                <p>{warning}</p>
                <Button size="xs" variant="secondary" className="mt-2" onClick={() => { setWarning(null); onDone(); }}>
                  OK, got it
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            {!warning && (
              <Button type="submit" disabled={saving} loading={saving}>
                {saving ? 'Saving…' : 'Update'}
              </Button>
            )}
          </div>
        </form>
    </Modal>
  );
}
