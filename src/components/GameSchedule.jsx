import { useState, useEffect, useCallback } from 'react';
import {
  fetchGames, createGame, updateGame, deleteGame,
  fetchTeams, fetchSeasons, fetchLocations,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import GameDetail from './GameDetail.jsx';

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600";
const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";
const btnPrimary = "px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 transition-colors disabled:opacity-60";
const btnSecondary = "px-4 py-2 bg-gray-200 text-gray-800 text-sm font-semibold rounded-lg hover:bg-gray-300 transition-colors";
const btnDanger = "px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 disabled:opacity-60";

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Final' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'postponed', label: 'Postponed' },
];

const STATUS_COLORS = {
  scheduled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
  postponed: 'bg-gray-200 text-gray-700',
};

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

function TeamLogo({ src, name, size = 'w-8 h-8' }) {
  if (!src) return <div className={`${size} bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-500 shrink-0`}>{(name || '?')[0]}</div>;
  return <img src={src} alt="" className={`${size} object-contain rounded shrink-0`} />;
}

export default function GameSchedule({ onBack }) {
  const { isAdmin } = useAuth();
  const [games, setGames] = useState([]);
  const [teams, setTeams] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [selectedGameId, setSelectedGameId] = useState(null);

  // Filters
  const [filterTeam, setFilterTeam] = useState('');
  const [filterSeason, setFilterSeason] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

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
  }, [filterTeam, filterSeason, filterStatus]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (!loading) loadGames(); }, [loadGames, loading]);

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

  // Group games by date
  const grouped = {};
  for (const g of games) {
    const key = g.game_date;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(g);
  }
  const dateKeys = Object.keys(grouped).sort();

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

  if (loading) return <div className="py-8 text-center text-gray-500">Loading schedule…</div>;
  if (error) return <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">Error: {error}</div>;

  if (selectedGameId) {
    return <GameDetail gameId={selectedGameId} onBack={() => { setSelectedGameId(null); loadGames(); }} />;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold">Game Schedule ({games.length})</h2>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={() => { setEditing(null); setShowForm(true); }} className={btnPrimary}>+ Add Game</button>
          )}
          {onBack && <button onClick={onBack} className={btnSecondary}>← Rosters</button>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <select value={filterSeason} onChange={(e) => setFilterSeason(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-w-[160px]">
          <option value="">All Seasons</option>
          {seasons.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
          ))}
        </select>
        <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-w-[180px]">
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
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-w-[140px]">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {games.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          No games found.
          {isAdmin && (
            <>
              <br />
              <button onClick={() => setShowForm(true)} className="text-blue-700 underline mt-1 inline-block">Schedule the first game</button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {dateKeys.map(dateKey => (
            <div key={dateKey}>
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-2 border-b border-gray-200 pb-1">
                {formatDate(dateKey)}
              </h3>

              {/* Desktop */}
              <div className="hidden md:block">
                <div className="space-y-2">
                  {grouped[dateKey].map(game => (
                    <div key={game.id} onClick={() => setSelectedGameId(game.id)}
                      className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
                      {/* Time */}
                      <div className="w-16 text-center shrink-0">
                        <span className="text-sm font-semibold text-gray-700">{formatTime(game.game_time) || 'TBD'}</span>
                      </div>

                      {/* Matchup */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                          <span className="font-semibold text-sm truncate">{game.home_team_name}</span>
                          <TeamLogo src={game.home_logo} name={game.home_team_name} />
                        </div>
                        <div className="px-2 shrink-0">
                          {game.status === 'completed' ? (
                            <span className="font-bold text-sm">{game.home_score ?? '—'} – {game.away_score ?? '—'}</span>
                          ) : (
                            <span className="text-xs font-semibold text-gray-400">vs</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <TeamLogo src={game.away_logo} name={game.away_team_name} />
                          <span className="font-semibold text-sm truncate">{game.away_team_name}</span>
                        </div>
                      </div>

                      {/* Location + Status */}
                      <div className="flex items-center gap-3 shrink-0">
                        {game.location_name && (
                          <span className="text-xs text-gray-500 hidden lg:inline truncate max-w-[180px]">
                            📍 {game.location_name}
                          </span>
                        )}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[game.status] || 'bg-gray-100'}`}>
                          {game.status_label}
                        </span>
                        {isAdmin && (
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => { setEditing(game); setShowForm(true); }}
                              className="px-2 py-1 text-xs font-semibold bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Edit</button>
                            <button onClick={() => handleDelete(game)} disabled={deleting === game.id}
                              className={btnDanger}>{deleting === game.id ? '…' : 'Del'}</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {grouped[dateKey].map(game => (
                  <div key={game.id} onClick={() => setSelectedGameId(game.id)}
                    className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500">{formatTime(game.game_time) || 'TBD'}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[game.status] || 'bg-gray-100'}`}>
                        {game.status_label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <TeamLogo src={game.home_logo} name={game.home_team_name} size="w-6 h-6" />
                      <span className="font-semibold text-sm flex-1 truncate">{game.home_team_name}</span>
                      {game.status === 'completed' && <span className="font-bold text-sm">{game.home_score ?? '—'}</span>}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <TeamLogo src={game.away_logo} name={game.away_team_name} size="w-6 h-6" />
                      <span className="font-semibold text-sm flex-1 truncate">{game.away_team_name}</span>
                      {game.status === 'completed' && <span className="font-bold text-sm">{game.away_score ?? '—'}</span>}
                    </div>
                    {game.location_name && (
                      <div className="text-xs text-gray-500 mb-1">📍 {game.location_name}{game.location_city ? `, ${game.location_city}` : ''}</div>
                    )}
                    {game.notes && <div className="text-xs text-gray-400 italic">{game.notes}</div>}
                    {isAdmin && (
                      <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setEditing(game); setShowForm(true); }}
                          className="px-2.5 py-1 text-xs font-semibold bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Edit</button>
                        <button onClick={() => handleDelete(game)} disabled={deleting === game.id}
                          className={btnDanger}>{deleting === game.id ? '…' : 'Delete'}</button>
                      </div>
                    )}
                  </div>
                ))}
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
    </div>
  );
}

function GameForm({ game, teams, seasons, defaultSeasonId, onDone, onCancel }) {
  const isEditing = !!game;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({
    season_id: game?.season_id || defaultSeasonId || '',
    home_team_id: game?.home_team_id || '',
    away_team_id: game?.away_team_id || '',
    location_id: game?.location_id || '',
    game_date: game?.game_date || '',
    game_time: game?.game_time?.slice(0, 5) || '',
    status: game?.status || 'scheduled',
    home_score: game?.home_score ?? '',
    away_score: game?.away_score ?? '',
    innings_played: game?.innings_played ?? '',
    notes: game?.notes || '',
  });

  useEffect(() => {
    fetchLocations().then(setLocations).catch(() => {});
  }, []);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
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
      notes: form.notes.trim() || null,
    };
    try {
      if (isEditing) await updateGame(game.id, data);
      else await createGame(data);
      onDone();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
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

  // Group locations by org
  const locsByOrg = {};
  const ungroupedLocs = [];
  for (const l of locations) {
    if (l.org_name) {
      if (!locsByOrg[l.org_name]) locsByOrg[l.org_name] = [];
      locsByOrg[l.org_name].push(l);
    } else {
      ungroupedLocs.push(l);
    }
  }
  const locOrgNames = Object.keys(locsByOrg).sort();

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 sm:p-6 my-4">
        <h2 className="text-xl font-bold mb-4">{isEditing ? 'Edit Game' : 'Schedule Game'}</h2>
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
              <input id="game-time" name="game_time" type="time" value={form.game_time} onChange={handleChange} className={inputCls} />
            </div>
          </div>

          {/* Location */}
          <div>
            <label htmlFor="game-location" className={labelCls}>Location</label>
            <select id="game-location" name="location_id" value={form.location_id} onChange={handleChange} className={inputCls}>
              <option value="">— None —</option>
              {locOrgNames.map(orgName => (
                <optgroup key={orgName} label={orgName}>
                  {locsByOrg[orgName].map(l => (
                    <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ''}</option>
                  ))}
                </optgroup>
              ))}
              {ungroupedLocs.map(l => (
                <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ''}</option>
              ))}
            </select>
          </div>

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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600" />
          </div>

          {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Schedule Game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
