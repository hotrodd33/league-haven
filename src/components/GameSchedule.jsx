import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  fetchGames, createGame, updateGame, deleteGame,
  fetchTeams, fetchSeasons, fetchLocations, fetchScheduleSettings, createLocation,
  fetchOrganizations, fetchAssignableOfficials,
  fetchGameInterests, expressGameInterest, removeGameInterest,
  previewScheduleImport, importSchedule,
  checkGameConflicts,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import GameDetail from './GameDetail.jsx';
import PitchTracker from './PitchTracker.jsx';
import TeamLogo from './TeamLogo.jsx';
import { DARK_STATUS_COLORS, DARK_BADGES, DARK_TRACK_BUTTON_TONE } from '../constants/statusClasses.js';

const inputCls = "w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1";
const btnPrimary = "px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60";
const btnSecondary = "px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600 transition-colors";
const btnDanger = "px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 disabled:opacity-60";

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Final' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'postponed', label: 'Postponed' },
];

const STATUS_COLORS = DARK_STATUS_COLORS;
const GC_BADGE_CLASS = 'inline-flex items-center rounded-sm bg-black px-1 py-0.5 text-[9px] font-bold leading-none tracking-tight text-[#00f092]';

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

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h * 60) + m;
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
            ? 'bg-green-900/50 text-green-300'
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

export default function GameSchedule({ onBack, onNavigateToTeam, initialGameId, onGameIdConsumed }) {
  const { isAdmin, canScoreGame, role, isUmpire } = useAuth();
  const [games, setGames] = useState([]);
  const [teams, setTeams] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [selectedGameId, setSelectedGameId] = useState(initialGameId || null);
  const [trackingGameId, setTrackingGameId] = useState(null);
  const [interestGameIds, setInterestGameIds] = useState([]);
  const [managingInterest, setManagingInterest] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const dateSectionRefs = useRef({});

  // Consume initialGameId so it doesn't re-trigger on re-renders
  useEffect(() => {
    if (initialGameId && onGameIdConsumed) onGameIdConsumed();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filters
  const [filterTeam, setFilterTeam] = useState('');
  const [filterSeason, setFilterSeason] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDivision, setFilterDivision] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [teamsData, seasonsData] = await Promise.all([fetchTeams(), fetchSeasons()]);
      setTeams(teamsData);
      setSeasons(seasonsData);
      // Default to active season
      const active = seasonsData.find(s => s.is_active);
      if (active && !filterSeason) setFilterSeason(String(active.id));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  const loadGames = useCallback(async () => {
    try {
      const filters = {};
      if (filterTeam) filters.team_id = filterTeam;
      if (filterSeason) filters.season_id = filterSeason;
      if (filterStatus) filters.status = filterStatus;
      setGames(await fetchGames(filters));
    } catch (err) { setError(err.message); }
  }, [filterTeam, filterSeason, filterStatus, filterDivision]);

  const loadInterests = useCallback(async () => {
    if (!isUmpire) {
      setInterestGameIds([]);
      return;
    }
    try {
      const rows = await fetchGameInterests();
      setInterestGameIds((rows || []).map((g) => Number(g.id)).filter(Number.isFinite));
    } catch {
      setInterestGameIds([]);
    }
  }, [isUmpire]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (!loading) loadGames(); }, [loadGames, loading]);
  useEffect(() => { loadInterests(); }, [loadInterests]);

  async function handleToggleInterest(gameId, currentlyInterested) {
    setManagingInterest(gameId);
    try {
      if (currentlyInterested) await removeGameInterest(gameId);
      else await expressGameInterest(gameId);
      await Promise.all([loadGames(), loadInterests()]);
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
      setGames(prev => prev.filter(g => g.id !== game.id));
    } catch (err) { alert(`Failed to delete: ${err.message}`); }
    finally { setDeleting(null); }
  }

  function handleFormDone() {
    setShowForm(false); setEditing(null); loadGames();
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

  // Group games by date only (newest first)
  const gamesByDate = {};
  for (const g of filteredGames) {
    const dateKey = g.game_date || '__unknown__';
    if (!gamesByDate[dateKey]) gamesByDate[dateKey] = [];
    gamesByDate[dateKey].push(g);
  }
  const sortedDateKeys = Object.keys(gamesByDate).sort((a, b) => b.localeCompare(a));

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
  if (error) return <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">Error: {error}</div>;

  if (trackingGameId) {
    return <PitchTracker gameId={trackingGameId} onBack={() => { setTrackingGameId(null); loadGames(); }} />;
  }

  if (selectedGameId) {
    return <GameDetail gameId={selectedGameId} onBack={() => { setSelectedGameId(null); loadGames(); }} onNavigateToTeam={onNavigateToTeam} />;
  }

  return (
    <div>
      <div className="sticky top-16 z-20 -mx-4 lg:-mx-6 px-4 lg:px-6 pt-2 pb-3 mb-4 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <h2 className="text-xl font-heading font-bold text-white">Game Schedule ({filteredGames.length})</h2>
          <div className="flex gap-2">
            {isAdmin && (
              <>
                <button onClick={() => setShowImportModal(true)} className={btnSecondary}>⬆ Import</button>
                <button onClick={() => { setEditing(null); setShowForm(true); }} className={btnPrimary}>+ Add Game</button>
              </>
            )}
            {onBack && <button onClick={onBack} className={btnSecondary}>← Teams</button>}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={filterSeason} onChange={(e) => setFilterSeason(e.target.value)}
            className="px-3 py-2 border border-gray-600 rounded-lg text-sm text-gray-100 bg-gray-800 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
            <option value="">All Seasons</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
            ))}
          </select>
          <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}
            className="px-3 py-2 border border-gray-600 rounded-lg text-sm text-gray-100 bg-gray-800 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
            <option value="">All Teams</option>
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
            className="px-3 py-2 border border-gray-600 rounded-lg text-sm text-gray-100 bg-gray-800 min-w-[140px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filterDivision} onChange={(e) => setFilterDivision(e.target.value)}
            className="px-3 py-2 border border-gray-600 rounded-lg text-sm text-gray-100 bg-gray-800 min-w-[140px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
            <option value="">All Divisions</option>
            {sortedDivisions.map(div => (
              <option key={div} value={div}>{div}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredGames.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          No games found.
          {isAdmin && (
            <>
              <br />
              <button onClick={() => setShowForm(true)} className="text-field-300 underline mt-1 inline-block">Schedule the first game</button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDateKeys.map(dateKey => (
            <div key={dateKey} ref={(el) => { dateSectionRefs.current[dateKey] = el; }}>
              <h3 className="text-base font-heading font-bold text-white uppercase tracking-wide mb-2 border-b border-gray-700 pb-1">
                {formatDate(dateKey)}
              </h3>

              {/* Desktop */}
              <div className="hidden md:block">
                <div className="space-y-2">
                  {gamesByDate[dateKey].map(game => {
                    const divisionLabel = gameDivisionLevelLabel(game);
                    const isInterested = interestGameIds.includes(Number(game.id));
                    const canEditThisGame = canScoreGame(game.home_team_id, game.away_team_id, game.home_org_id, game.away_org_id);
                    return (
                      <div key={game.id} onClick={() => setSelectedGameId(game.id)}
                        className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
                        {/* Time + Division */}
                        <div className="w-28 text-center shrink-0">
                          <span className="text-sm font-semibold text-gray-300 block">{formatTime(game.game_time) || 'TBD'}</span>
                          {divisionLabel && <span className="text-[11px] text-gray-400 truncate block">{divisionLabel}</span>}
                        </div>

                        {/* Matchup */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                            <button onClick={(e) => { e.stopPropagation(); onNavigateToTeam?.(game.home_team_id, game.home_org_id); }} className="font-semibold text-sm truncate text-field-300 hover:text-field-100 hover:underline">{game.home_team_name}</button>
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
                            <button onClick={(e) => { e.stopPropagation(); onNavigateToTeam?.(game.away_team_id, game.away_org_id); }} className="font-semibold text-sm truncate text-field-300 hover:text-field-100 hover:underline">{game.away_team_name}</button>
                          </div>
                        </div>

                        {/* Location + Status */}
                        <div className="flex items-center gap-3 shrink-0">
                          {game.location_name && (
                            <span className="text-xs text-gray-400 hidden lg:inline truncate max-w-[180px]">
                              📍 {game.location_name}
                            </span>
                          )}
                          {!!game.officials?.length && (
                            <div className="hidden lg:flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                              {game.officials.map((o, i) => (
                                <span key={i} className="text-xs px-1.5 py-0.5 rounded font-medium bg-green-900/50 text-green-300">{o.name}</span>
                              ))}
                            </div>
                          )}
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[game.status] || 'bg-gray-800'}`}>
                            {game.status_label}
                          </span>
                          {game.is_gamechanger_imported && (
                            <span className={GC_BADGE_CLASS} title="Imported from GameChanger" aria-label="Imported from GameChanger">
                              GC
                            </span>
                          )}
                          {game.status !== 'completed' && canScoreGame(game.home_team_id, game.away_team_id, game.home_org_id, game.away_org_id) && (
                            <button onClick={(e) => { e.stopPropagation(); setTrackingGameId(game.id); }}
                              className={`px-2 py-1 text-xs font-semibold rounded ${DARK_TRACK_BUTTON_TONE}`}>⚾ Track</button>
                          )}
                          {canEditThisGame && (
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => { setEditing(game); setShowForm(true); }}
                                className="px-2 py-1 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600">Edit</button>
                              {isAdmin && (
                                <button onClick={() => handleDelete(game)} disabled={deleting === game.id}
                                  className={btnDanger}>{deleting === game.id ? '…' : 'Del'}</button>
                              )}
                            </div>
                          )}
                          {isUmpire && game.status === 'scheduled' && (
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleToggleInterest(game.id, isInterested)}
                                disabled={managingInterest === game.id}
                                className={`px-2 py-1 text-xs font-semibold rounded ${isInterested ? 'bg-green-700 text-white hover:bg-green-600' : 'bg-teal-700 text-white hover:bg-teal-600'} disabled:opacity-60`}
                              >
                                {managingInterest === game.id ? '…' : (isInterested ? 'Interested' : 'I\'m Interested')}
                              </button>
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
                {gamesByDate[dateKey].map(game => {
                  const divisionLabel = gameDivisionLevelLabel(game);
                  const isInterested = interestGameIds.includes(Number(game.id));
                  const canEditThisGame = canScoreGame(game.home_team_id, game.away_team_id, game.home_org_id, game.away_org_id);
                  return (
                    <div key={game.id} onClick={() => setSelectedGameId(game.id)}
                      className="bg-gray-800 border border-gray-700 rounded-lg p-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-xs font-semibold text-gray-400 block">{formatTime(game.game_time) || 'TBD'}</span>
                          {divisionLabel && <span className="text-[11px] text-gray-400 block">{divisionLabel}</span>}
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[game.status] || 'bg-gray-800'}`}>
                          {game.status_label}
                        </span>
                        {game.is_gamechanger_imported && (
                          <span className={GC_BADGE_CLASS} title="Imported from GameChanger" aria-label="Imported from GameChanger">
                            GC
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <TeamLogo src={game.home_logo} name={game.home_team_name} ageGroup={game.home_age_group} level={game.home_level} cityAbbr={game.home_city_abbr} primaryColor={game.home_primary_color} secondaryColor={game.home_secondary_color} size="w-6 h-6" />
                        <button onClick={(e) => { e.stopPropagation(); onNavigateToTeam?.(game.home_team_id, game.home_org_id); }} className="font-semibold text-sm flex-1 truncate text-field-300 hover:text-field-100 hover:underline text-left">{game.home_team_name}</button>
                        {game.status === 'completed' && <span className="font-extrabold text-lg text-white tabular-nums">{game.home_score ?? '—'}</span>}
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <TeamLogo src={game.away_logo} name={game.away_team_name} ageGroup={game.away_age_group} level={game.away_level} cityAbbr={game.away_city_abbr} primaryColor={game.away_primary_color} secondaryColor={game.away_secondary_color} size="w-6 h-6" />
                        <button onClick={(e) => { e.stopPropagation(); onNavigateToTeam?.(game.away_team_id, game.away_org_id); }} className="font-semibold text-sm flex-1 truncate text-field-300 hover:text-field-100 hover:underline text-left">{game.away_team_name}</button>
                        {game.status === 'completed' && <span className="font-extrabold text-lg text-white tabular-nums">{game.away_score ?? '—'}</span>}
                      </div>
                      {game.location_name && (
                        <div className="text-xs text-gray-400 mb-1">📍 {game.location_name}{game.location_city ? `, ${game.location_city}` : ''}</div>
                      )}
                      {!!game.officials?.length && (
                        <div className="flex flex-wrap gap-1 mb-1" onClick={(e) => e.stopPropagation()}>
                          {game.officials.map((o, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 rounded font-medium bg-green-900/50 text-green-300">{o.name}</span>
                          ))}
                        </div>
                      )}
                      {game.notes && <div className="text-xs text-gray-400 italic">{game.notes}</div>}
                      <div className="flex gap-2 mt-2 pt-2 border-t border-gray-700" onClick={(e) => e.stopPropagation()}>
                        {game.status !== 'completed' && canScoreGame(game.home_team_id, game.away_team_id, game.home_org_id, game.away_org_id) && (
                          <button onClick={() => setTrackingGameId(game.id)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded ${DARK_TRACK_BUTTON_TONE}`}>⚾ Track</button>
                        )}
                        {canEditThisGame && (
                          <>
                            <button onClick={() => { setEditing(game); setShowForm(true); }}
                              className="px-2.5 py-1 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600">Edit</button>
                            {isAdmin && (
                              <button onClick={() => handleDelete(game)} disabled={deleting === game.id}
                                className={btnDanger}>{deleting === game.id ? '…' : 'Delete'}</button>
                            )}
                          </>
                        )}
                        {isUmpire && game.status === 'scheduled' && (
                          <button
                            onClick={() => handleToggleInterest(game.id, isInterested)}
                            disabled={managingInterest === game.id}
                            className={`px-2.5 py-1 text-xs font-semibold rounded ${isInterested ? 'bg-green-700 text-white hover:bg-green-600' : 'bg-teal-700 text-white hover:bg-teal-600'} disabled:opacity-60`}
                          >
                            {managingInterest === game.id ? '…' : (isInterested ? 'Interested' : 'I\'m Interested')}
                          </button>
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

      {showForm && (
        <GameForm
          game={editing}
          teams={teams}
          seasons={seasons}
          defaultSeasonId={filterSeason}
          onDone={handleFormDone}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {showImportModal && (
        <ScheduleImportModal
          onClose={() => setShowImportModal(false)}
          onImported={() => { setShowImportModal(false); loadGames(); }}
        />
      )}
    </div>
  );
}

export function GameForm({ game, teams, seasons, defaultSeasonId, defaultHomeTeamId, onDone, onCancel }) {
  const isEditing = !!game;
  const [saving, setSaving] = useState(false);
  const [addingLocation, setAddingLocation] = useState(false);
  const [showAddLocationForm, setShowAddLocationForm] = useState(false);
  const [error, setError] = useState(null);
  const [locations, setLocations] = useState([]);
  const [orgSettings, setOrgSettings] = useState({});
  const [officials, setOfficials] = useState([]);
  const [scheduleSettings, setScheduleSettings] = useState({
    game_start_time: '08:00',
    game_end_time: '20:00',
    game_time_increment_minutes: 30,
  });
  const [form, setForm] = useState({
    season_id: game?.season_id || defaultSeasonId || '',
    home_team_id: game?.home_team_id || defaultHomeTeamId || '',
    away_team_id: game?.away_team_id || '',
    location_id: game?.location_id || '',
    game_date: game?.game_date || '',
    game_time: game?.game_time?.slice(0, 5) || '',
    status: game?.status || 'scheduled',
    home_score: game?.home_score ?? '',
    away_score: game?.away_score ?? '',
    innings_played: game?.innings_played ?? '',
    official_ids: game?.official_ids || [],
    notes: game?.notes || '',
  });

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
    setForm(prev => ({ ...prev, [name]: value }));
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
    const data = {
      season_id: form.season_id ? Number(form.season_id) : null,
      home_team_id: Number(form.home_team_id),
      away_team_id: Number(form.away_team_id),
      location_id: form.location_id ? Number(form.location_id) : null,
      game_date: form.game_date,
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

  function TeamSelect({ id, name, value }) {
    return (
      <select id={id} name={name} value={value} onChange={handleChange} required className={inputCls}>
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
      </select>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-5 sm:p-6 my-4">
        <h2 className="text-xl font-heading font-bold text-white mb-4">{isEditing ? 'Edit Game' : 'Schedule Game'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Season */}
          <div>
            <label htmlFor="game-season" className={labelCls}>Season</label>
            <select id="game-season" name="season_id" value={form.season_id} onChange={handleChange} className={inputCls}>
              <option value="">— None —</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
              ))}
            </select>
          </div>

          {/* Teams */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="game-home" className={labelCls}>Home Team *</label>
              <TeamSelect id="game-home" name="home_team_id" value={form.home_team_id} />
            </div>
            <div>
              <label htmlFor="game-away" className={labelCls}>Away Team *</label>
              <TeamSelect id="game-away" name="away_team_id" value={form.away_team_id} />
            </div>
          </div>

          {/* Date/Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="game-date" className={labelCls}>Date *</label>
              <input id="game-date" name="game_date" type="date" value={form.game_date} onChange={handleChange} required className={inputCls} />
            </div>
            <div>
              <label htmlFor="game-time" className={labelCls}>Time</label>
              <select id="game-time" name="game_time" value={form.game_time} onChange={handleChange} className={inputCls}>
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
              <label htmlFor="game-location" className={`${labelCls} mb-0`}>Location</label>
              <button
                type="button"
                onClick={() => setShowAddLocationForm(true)}
                disabled={!homeOrgId}
                className="text-xs font-semibold text-field-300 hover:text-field-100 underline disabled:opacity-50 disabled:no-underline"
              >
                + Add new field
              </button>
            </div>
            <select id="game-location" name="location_id" value={form.location_id} onChange={handleChange} className={inputCls} disabled={!homeOrgId}>
              <option value="">— None —</option>
              {locations.map(l => (
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
              <label className={labelCls}>Umpire Assignment</label>
              {officials.length === 0 ? (
                <p className="text-xs text-gray-400">No officials available for this organization. Add officials in the Officials module.</p>
              ) : (
                <div className="space-y-1 bg-gray-900 border border-gray-700 rounded-lg p-3 max-h-52 overflow-y-auto">
                  {officials.map((official) => {
                    const checked = (form.official_ids || []).some((id) => String(id) === String(official.id));
                    const interested = interestedOfficialSet.has(Number(official.id));
                    const rowCls = checked
                      ? 'border border-green-500/40 bg-green-900/20'
                      : interested
                        ? 'border border-amber-400/50 bg-amber-500/10'
                        : 'border border-red-500/20 bg-red-900/10';
                    const dotCls = checked ? 'bg-green-400' : interested ? 'bg-amber-300' : 'bg-red-500';
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
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Assigned</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-300 inline-block" /> Interested</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> No status</span>
              </div>
            </div>
          )}

          {/* Status + Score + Innings */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="game-status" className={labelCls}>Status</label>
              <select id="game-status" name="status" value={form.status} onChange={handleChange} className={inputCls}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="game-home-score" className={labelCls}>Home Score</label>
              <input id="game-home-score" name="home_score" type="number" min="0" value={form.home_score} onChange={handleChange} className={inputCls} placeholder="—" />
            </div>
            <div>
              <label htmlFor="game-away-score" className={labelCls}>Away Score</label>
              <input id="game-away-score" name="away_score" type="number" min="0" value={form.away_score} onChange={handleChange} className={inputCls} placeholder="—" />
            </div>
            <div>
              <label htmlFor="game-innings" className={labelCls}>Innings</label>
              <input id="game-innings" name="innings_played" type="number" min="1" max="99" value={form.innings_played} onChange={handleChange} className={inputCls} placeholder="6" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="game-notes" className={labelCls}>Notes</label>
            <textarea id="game-notes" name="notes" value={form.notes} onChange={handleChange} rows={2} placeholder="Any additional info…"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>

          {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}

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
                          className="text-blue-400 underline hover:text-blue-300">
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
                <button type="button" onClick={handleConfirmSave}
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
            <button type="button" onClick={onCancel} className={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Schedule Game'}
            </button>
          </div>
        </form>

        {showAddLocationForm && (
          <div className="fixed inset-0 z-[60] bg-black/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
            <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-5 sm:p-6 my-4 border border-gray-700">
              <h3 className="text-lg font-heading font-bold text-white mb-1">Add Field Location</h3>
              <p className="text-xs text-gray-400 mb-4">This will be added to {selectedHomeTeam?.org_name || 'the selected home team organization'}.</p>

              <form onSubmit={handleAddLocation} className="space-y-3">
                <div>
                  <label htmlFor="new-loc-name" className={labelCls}>Field Name *</label>
                  <input id="new-loc-name" name="name" value={newLocation.name} onChange={handleNewLocationChange} required className={inputCls} placeholder="e.g. Hok-Si-La Park Field 1" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_70px_90px] gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor="new-loc-address" className={labelCls}>Address</label>
                    <input id="new-loc-address" name="address" value={newLocation.address} onChange={handleNewLocationChange} className={inputCls} placeholder="123 Main St" />
                  </div>
                  <div>
                    <label htmlFor="new-loc-city" className={labelCls}>City</label>
                    <input id="new-loc-city" name="city" value={newLocation.city} onChange={handleNewLocationChange} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="new-loc-state" className={labelCls}>State</label>
                    <input id="new-loc-state" name="state" value={newLocation.state} onChange={handleNewLocationChange} maxLength={2} className={inputCls} placeholder="MN" />
                  </div>
                  <div>
                    <label htmlFor="new-loc-zip" className={labelCls}>ZIP</label>
                    <input id="new-loc-zip" name="zip" value={newLocation.zip} onChange={handleNewLocationChange} maxLength={10} className={inputCls} />
                  </div>
                </div>

                <div>
                  <label htmlFor="new-loc-comments" className={labelCls}>Comments</label>
                  <textarea id="new-loc-comments" name="comments" value={newLocation.comments} onChange={handleNewLocationChange} rows={2}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    placeholder="Optional notes"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowAddLocationForm(false)} className={btnSecondary}>Cancel</button>
                  <button type="submit" disabled={addingLocation} className={btnPrimary}>{addingLocation ? 'Adding…' : 'Add Field'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Schedule Import Modal
   ═══════════════════════════════════════════════════════ */
function ScheduleImportModal({ onClose, onImported }) {
  const [step, setStep] = useState('input'); // input | preview | result
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState(null);
  const [seasonId, setSeasonId] = useState('');
  const [teamMappings, setTeamMappings] = useState({});
  const [venueMappings, setVenueMappings] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function handlePreview() {
    if (!csvText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await previewScheduleImport(csvText);
      setPreview(data);
      if (data.suggestedSeasonId) setSeasonId(String(data.suggestedSeasonId));
      setStep('preview');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!seasonId) { setError('Please select a season'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await importSchedule(preview.games, Number(seasonId), teamMappings, venueMappings);
      setResult(res);
      setStep('result');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file);
  }

  const hasUnmapped = preview && (
    preview.unmatchedTeams.some(t => !teamMappings[t]) ||
    preview.unmatchedVenues.some(v => !venueMappings[v])
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-heading font-bold text-white">Import Schedule</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}

          {step === 'input' && (
            <>
              <p className="text-sm text-gray-400">
                Paste CSV or upload a file. Required columns: <span className="text-gray-200">Date, Home, Away</span>.
                Optional: <span className="text-gray-200">Time, Field, Notes, Season</span>.
              </p>

              <div className="flex items-center gap-3">
                <label className="cursor-pointer px-3 py-1.5 bg-gray-700 text-gray-200 text-sm rounded-lg hover:bg-gray-600">
                  Upload CSV
                  <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
                </label>
                {csvText && <span className="text-xs text-green-400">✓ Content loaded</span>}
              </div>

              <textarea
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={"Date,Time,Home,Away,Field,Notes\n2026-06-01,18:00,Team A,Team B,Field 1,Week 1"}
                className={`${inputCls} h-48 font-mono text-xs`}
              />

              <div className="flex justify-end gap-3">
                <button onClick={onClose} className={btnSecondary}>Cancel</button>
                <button onClick={handlePreview} disabled={loading || !csvText.trim()} className={btnPrimary}>
                  {loading ? 'Parsing…' : 'Preview'}
                </button>
              </div>
            </>
          )}

          {step === 'preview' && preview && (
            <>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="text-sm text-gray-300">
                  <span className="font-semibold text-white">{preview.totalRows}</span> games found
                </div>
                <div>
                  <label className={labelCls}>Season</label>
                  <select value={seasonId} onChange={e => setSeasonId(e.target.value)}
                    className="px-3 py-2 border border-gray-600 rounded-lg text-sm text-gray-100 bg-gray-900">
                    <option value="">Select season…</option>
                    {preview.seasonsList.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Unmatched teams */}
              {preview.unmatchedTeams.length > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-yellow-300">⚠ Unmatched Teams ({preview.unmatchedTeams.length})</h4>
                  <p className="text-xs text-gray-400">Map these to existing teams. Mappings will be saved for future imports.</p>
                  {preview.unmatchedTeams.map(name => (
                    <div key={name} className="flex items-center gap-3">
                      <span className="text-sm text-gray-200 min-w-[180px] truncate">{name}</span>
                      <span className="text-gray-500">→</span>
                      <select
                        value={teamMappings[name] || ''}
                        onChange={e => setTeamMappings(prev => ({ ...prev, [name]: e.target.value }))}
                        className="flex-1 px-2 py-1 border border-gray-600 rounded text-sm text-gray-100 bg-gray-900"
                      >
                        <option value="">Skip</option>
                        {preview.teamsList.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name}{t.age_group ? ` (${t.age_group})` : ''}{t.org_name ? ` — ${t.org_name}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {/* Unmatched fields */}
              {preview.unmatchedVenues.length > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-yellow-300">⚠ Unmatched Fields ({preview.unmatchedVenues.length})</h4>
                  {preview.unmatchedVenues.map(name => (
                    <div key={name} className="flex items-center gap-3">
                      <span className="text-sm text-gray-200 min-w-[180px] truncate">{name}</span>
                      <span className="text-gray-500">→</span>
                      <select
                        value={venueMappings[name] || ''}
                        onChange={e => setVenueMappings(prev => ({ ...prev, [name]: e.target.value }))}
                        className="flex-1 px-2 py-1 border border-gray-600 rounded text-sm text-gray-100 bg-gray-900"
                      >
                        <option value="">Skip</option>
                        {preview.locationsList.map(l => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {/* Preview table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b border-gray-700">
                      <th className="py-2 px-2">Date</th>
                      <th className="py-2 px-2">Time</th>
                      <th className="py-2 px-2">Home</th>
                      <th className="py-2 px-2">Away</th>
                      <th className="py-2 px-2">Field</th>
                      <th className="py-2 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.games.slice(0, 50).map((g, i) => (
                      <tr key={i} className="border-b border-gray-700/50">
                        <td className="py-1.5 px-2 text-gray-300">{g.date}</td>
                        <td className="py-1.5 px-2 text-gray-400">{g.time || '—'}</td>
                        <td className={`py-1.5 px-2 ${g.home_team_id ? 'text-green-400' : 'text-red-400'}`}>
                          {g.home_name}
                        </td>
                        <td className={`py-1.5 px-2 ${g.away_team_id ? 'text-green-400' : 'text-red-400'}`}>
                          {g.away_name}
                        </td>
                        <td className={`py-1.5 px-2 ${!g.venue_name ? 'text-gray-600' : g.location_id ? 'text-green-400' : 'text-yellow-400'}`}>
                          {g.venue_name || '—'}
                        </td>
                        <td className="py-1.5 px-2">
                          {g.home_team_id && g.away_team_id ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/50 text-green-300">Ready</span>
                          ) : (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-300">Missing</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.games.length > 50 && (
                  <p className="text-xs text-gray-500 mt-2">Showing first 50 of {preview.games.length} games</p>
                )}
              </div>

              <div className="flex justify-between items-center pt-2">
                <button onClick={() => setStep('input')} className={btnSecondary}>← Back</button>
                <div className="flex gap-3">
                  <button onClick={onClose} className={btnSecondary}>Cancel</button>
                  <button onClick={handleImport} disabled={loading || !seasonId} className={btnPrimary}>
                    {loading ? 'Importing…' : `Import ${preview.totalRows} Games`}
                  </button>
                </div>
              </div>

              {hasUnmapped && (
                <p className="text-xs text-yellow-400">Unmapped teams/fields will be skipped during import. Map them above to include those games.</p>
              )}
            </>
          )}

          {step === 'result' && result && (
            <>
              <div className="space-y-3">
                <div className="text-sm text-gray-300 space-y-1">
                  <p><span className="font-semibold text-green-400">{result.created}</span> games created</p>
                  {result.skipped > 0 && <p><span className="font-semibold text-yellow-400">{result.skipped}</span> skipped</p>}
                </div>
                {result.errors?.length > 0 && (
                  <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                    {result.errors.map((e, i) => <p key={i} className="text-xs text-yellow-300">{e}</p>)}
                  </div>
                )}
              </div>
              <div className="flex justify-end pt-2">
                <button onClick={onImported} className={btnPrimary}>Done</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
