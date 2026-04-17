import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchGames, fetchTeams, fetchSeasons, fetchTeamPractices } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import GameDetail from './GameDetail.jsx';
import PitchTracker from './PitchTracker.jsx';
import TeamLogo from './TeamLogo.jsx';
import { GameForm } from './GameSchedule.jsx';
import { DARK_STATUS_COLORS, DARK_TRACK_BUTTON_TONE } from '../constants/statusClasses.js';

const STATUS_COLORS = DARK_STATUS_COLORS;
const GC_BADGE_CLASS = 'inline-flex items-center rounded-sm bg-black px-1 py-0.5 text-[9px] font-bold leading-none tracking-tight text-[#00f092]';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function formatDate(dateStr) {
  if (!dateStr) return '—';
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
  practice: { bg: 'bg-blue-900/40', border: 'border-blue-500', text: 'text-blue-300', dot: 'bg-blue-500', badge: 'bg-blue-900/60 text-blue-300' },
  event: { bg: 'bg-purple-900/40', border: 'border-purple-500', text: 'text-purple-300', dot: 'bg-purple-500', badge: 'bg-purple-900/60 text-purple-300' },
  maintenance: { bg: 'bg-amber-900/40', border: 'border-amber-500', text: 'text-amber-300', dot: 'bg-amber-500', badge: 'bg-amber-900/60 text-amber-300' },
};

export default function TeamSchedule({ teamId, onNavigateToTeam }) {
  const { isAdmin, canScoreGame } = useAuth();
  const [games, setGames] = useState([]);
  const [practices, setPractices] = useState([]);
  const [teams, setTeams] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [trackingGameId, setTrackingGameId] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [sortOrder, setSortOrder] = useState('asc');

  const loadGames = useCallback(() => {
    if (!teamId) { setGames([]); setPractices([]); return; }
    setLoading(true);
    Promise.all([
      fetchGames({ team_id: teamId }),
      fetchTeamPractices(teamId),
    ])
      .then(([gamesData, practicesData]) => {
        setGames(gamesData || []);
        setPractices((practicesData || []).filter(p => p.event_type !== 'game_hold'));
      })
      .catch(() => { setGames([]); setPractices([]); })
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => { loadGames(); }, [loadGames]);

  useEffect(() => {
    if (!isAdmin) return;
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
  }, [isAdmin]);

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
      const d = item._date;
      if (!d) continue;
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
        <GameDetail gameId={selectedGameId} onBack={() => { setSelectedGameId(null); loadGames(); }} onNavigateToTeam={onNavigateToTeam} />
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
        <h3 className="text-base font-heading font-bold text-white uppercase tracking-wide">
          Schedule ({games.length} game{games.length !== 1 ? 's' : ''}{practices.length > 0 ? `, ${practices.length} practice${practices.length !== 1 ? 's' : ''}` : ''})
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-semibold rounded ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              List
            </button>
            <button onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-xs font-semibold rounded ${viewMode === 'calendar' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              Calendar
            </button>
            <button onClick={() => setShowSubscribe(true)}
              className="px-3 py-1.5 text-xs font-semibold rounded bg-gray-700 text-gray-300 hover:bg-gray-600" title="Subscribe to calendar feed">
              📅
            </button>
          </div>
          <button onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-1.5 text-xs font-semibold rounded bg-gray-700 text-gray-300 hover:bg-gray-600" title={sortOrder === 'asc' ? 'Oldest first' : 'Newest first'}>
            {sortOrder === 'asc' ? '↑ ASC' : '↓ DESC'}
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowForm((prev) => !prev)}
              className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              {showForm ? 'Cancel' : '+ Add Game'}
            </button>
          )}
        </div>
      </div>

      {showForm && isAdmin && (
        <div className="mb-3 bg-gray-800 border border-gray-700 rounded-lg p-3">
          <GameForm
            game={null}
            teams={teams}
            seasons={seasons}
            defaultSeasonId={defaultSeasonId}
            defaultHomeTeamId={teamId}
            onDone={() => { setShowForm(false); loadGames(); }}
            onCancel={() => setShowForm(false)}
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
                <h4 className="text-xs font-heading font-bold text-gray-400 uppercase tracking-wide mb-1 border-b border-gray-700 pb-1">
                  {formatDate(dateKey)}
                </h4>
                <div className="space-y-2">
                  {itemsByDate[dateKey].map(item => (
                    item._type === 'game'
                      ? <GameCard key={`game-${item.id}`} game={item} teamId={teamId}
                          onSelect={() => setSelectedGameId(item.id)}
                          onTrack={() => setTrackingGameId(item.id)}
                          canScore={canScoreGame(item.home_team_id, item.away_team_id, item.home_org_id, item.away_org_id)} />
                      : <PracticeCard key={`practice-${item.id}`} practice={item} />
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
    </div>
  );
}

/* ── Game Card (list view) ── */

function GameCard({ game, teamId, onSelect, onTrack, canScore }) {
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
  const resultColor = result === 'W' ? 'text-green-400' : result === 'L' ? 'text-red-400' : result === 'T' ? 'text-gray-400' : '';
  const isUnplayed = game.status !== 'completed';
  const cardTone = isUnplayed ? 'bg-slate-800/85 border-slate-600/80' : 'bg-gray-800 border-gray-700';

  return (
    <div onClick={onSelect}
      className={`${cardTone} border rounded-lg px-3 py-2 flex items-center gap-3 text-sm cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all`}>
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
            {canScore && (
              <button onClick={(e) => { e.stopPropagation(); onTrack(); }}
                className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${DARK_TRACK_BUTTON_TONE}`}
                title="Live pitch tracker">
                ⚾ Track
              </button>
            )}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[game.status] || 'bg-gray-800'}`}>
              {game.status_label}
            </span>
          </>
        )}
      </div>
      {!!game.official_names?.length && (
        <div className="hidden lg:block text-xs text-gray-400 truncate max-w-[220px]">
          👤 {game.official_names.join(', ')}
        </div>
      )}
    </div>
  );
}

/* ── Practice Card (list view) ── */

function PracticeCard({ practice }) {
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
          <span className="text-xs text-gray-400 hidden sm:inline">📍 {practice.location_name}</span>
        )}
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
          {typeLabel}
        </span>
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
          <button onClick={onToday} className="px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 rounded">Today</button>
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
                ${isToday ? 'ring-1 ring-blue-500' : ''}
                ${isSelected ? 'bg-gray-700' : 'hover:bg-gray-700/50'}
              `}>
              <div className={`text-xs font-semibold mb-0.5 ${isToday ? 'text-blue-400' : 'text-gray-300'}`}>{day}</div>
              <div className="space-y-0.5">
                {dayItems.slice(0, 3).map((item, j) => {
                  if (item._type === 'game') {
                    const statusColor =
                      item.status === 'completed' ? 'bg-green-900/40 text-green-300' :
                      item.status === 'cancelled' ? 'bg-red-900/40 text-red-300 line-through' :
                      item.status === 'postponed' ? 'bg-amber-900/40 text-amber-300' :
                      'bg-slate-800/80 text-gray-300';
                    const isHome = item.home_team_id === teamId;
                    const opp = isHome ? item.away_team_name : item.home_team_name;
                    const prefix = isHome ? 'vs' : '@';
                    return (
                      <div key={`g-${item.id}`} className={`text-[9px] leading-tight truncate rounded px-1 py-0.5 ${statusColor}`}>
                        {formatTime(item.game_time)} {prefix} {opp}
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
                      className="bg-gray-800 border border-gray-700 rounded-lg p-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
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
                            <span className="text-xs text-gray-400 hidden sm:inline">📍 {item.location_name}</span>
                          )}
                          {isCompleted ? (
                            <span className="font-extrabold text-white">{teamScore ?? '—'} – {oppScore ?? '—'}</span>
                          ) : (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] || 'bg-gray-800'}`}>
                              {item.status_label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  return <PracticeCard key={`p-${item.id}`} practice={item} />;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-heading font-bold text-white">Subscribe to Team Calendar</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          Subscribe to this team's schedule in your calendar app. Games and practices will sync automatically.
        </p>

        <a href={webcalUrl}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors mb-4">
          📅 Open in Calendar App
        </a>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Or copy the feed URL</label>
          <div className="flex gap-2">
            <input type="text" readOnly value={icsUrl}
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-xs text-gray-300 font-mono select-all focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              onClick={e => e.target.select()} />
            <button onClick={handleCopy}
              className="px-3 py-2 bg-gray-700 text-gray-300 text-xs font-semibold rounded-lg hover:bg-gray-600 transition-colors shrink-0">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Google Calendar:</strong> Settings → Add calendar → From URL → paste the link</p>
          <p><strong>Apple Calendar:</strong> Click "Open in Calendar App" above, or File → New Subscription</p>
          <p><strong>Outlook:</strong> Add calendar → Subscribe from web → paste the link</p>
        </div>
      </div>
    </div>
  );
}
