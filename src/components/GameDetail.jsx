import { useState, useEffect, useCallback } from 'react';
import {
  fetchGame, updateGame,
  fetchPitchCounts, createPitchCount, updatePitchCount, deletePitchCount,
  fetchPlayersByTeam, createPlayer, fetchPitchEligibility,
  fetchWeather, fetchWeatherForecast,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import TeamLogo from './TeamLogo.jsx';
import PitchTracker from './PitchTracker.jsx';
import { Button, Input, Select } from './ui/index.js';
import { DARK_STATUS_COLORS, DARK_BADGES } from '../constants/statusClasses.js';

const STATUS_COLORS = DARK_STATUS_COLORS;
const GC_BADGE_CLASS = 'inline-flex items-center rounded-sm bg-black px-1 py-0.5 text-[9px] font-bold leading-none tracking-tight text-[#00f092]';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function GameDetail({ gameId, onBack, onNavigateToTeam, onOpenImport }) {
  const { isAdmin, canEditTeam, canScoreGame } = useAuth();
  const [game, setGame] = useState(null);
  const [pitchCounts, setPitchCounts] = useState([]);
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Pitch tracker mode
  const [showTracker, setShowTracker] = useState(false);

  // Score form
  const [scoreForm, setScoreForm] = useState({ home_score: '', away_score: '', innings_played: '' });
  const [editingScore, setEditingScore] = useState(false);

  // Pitch count add form
  const [addingFor, setAddingFor] = useState(null); // 'home' | 'away'
  const [pcForm, setPcForm] = useState({ player_id: '', pitch_count: '' });
  const [editingPc, setEditingPc] = useState(null);

  // Quick-add new player
  const [addingNewPlayerFor, setAddingNewPlayerFor] = useState(null); // 'home' | 'away'
  const [newPlayerForm, setNewPlayerForm] = useState({ first_name: '', last_name: '', jersey_number: '' });
  const [savingNewPlayer, setSavingNewPlayer] = useState(false);

  // Pitch eligibility
  const [homeEligibility, setHomeEligibility] = useState(null);
  const [awayEligibility, setAwayEligibility] = useState(null);

  // Weather
  const [weather, setWeather] = useState(null);

  const canEdit = useCallback((g) => {
    if (!g) return false;
    if (isAdmin) return true;
    return canEditTeam(g.home_team_id, g.home_org_id) || canEditTeam(g.away_team_id, g.away_org_id);
  }, [isAdmin, canEditTeam]);

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [g, pcs] = await Promise.all([
        fetchGame(gameId),
        fetchPitchCounts(gameId),
      ]);
      setGame(g);
      setPitchCounts(pcs);
      setScoreForm({
        home_score: g.home_score ?? '',
        away_score: g.away_score ?? '',
        innings_played: g.innings_played ?? '',
      });
      const [hp, ap] = await Promise.all([
        g.home_team_id ? fetchPlayersByTeam(g.home_team_id) : [],
        g.away_team_id ? fetchPlayersByTeam(g.away_team_id) : [],
      ]);
      setHomePlayers(hp);
      setAwayPlayers(ap);
      // Fetch pitch eligibility
      const [he, ae] = await Promise.all([
        g.home_team_id ? fetchPitchEligibility(g.home_team_id, g.game_date, gameId).catch(() => null) : null,
        g.away_team_id ? fetchPitchEligibility(g.away_team_id, g.game_date, gameId).catch(() => null) : null,
      ]);
      setHomeEligibility(he);
      setAwayEligibility(ae);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [gameId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Fetch weather for the game location
  useEffect(() => {
    if (!game?.location_lat || !game?.location_lon) return;
    if (game.status === 'cancelled') return;

    const todayStr = new Date().toISOString().slice(0, 10);
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 16);
    const maxDateStr = maxDate.toISOString().slice(0, 10);

    // Past games or too far future — no weather
    if (game.game_date < todayStr || game.game_date > maxDateStr) return;

    const fetcher = game.game_date === todayStr
      ? fetchWeather(game.location_lat, game.location_lon)
      : fetchWeatherForecast(game.location_lat, game.location_lon, game.game_date, game.game_time || null);

    fetcher.then(w => {
      if (w && !w.unavailable) setWeather(w);
    }).catch(() => {});
  }, [game]);

  async function handleSaveScore(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const updated = await updateGame(gameId, {
        home_score: scoreForm.home_score !== '' ? Number(scoreForm.home_score) : null,
        away_score: scoreForm.away_score !== '' ? Number(scoreForm.away_score) : null,
        innings_played: scoreForm.innings_played !== '' ? Number(scoreForm.innings_played) : null,
        status: scoreForm.home_score !== '' && scoreForm.away_score !== '' ? 'completed' : undefined,
      });
      setGame(updated);
      setEditingScore(false);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleAddPitchCount(e) {
    e.preventDefault();
    if (!pcForm.player_id || pcForm.pitch_count === '') return;
    setSaving(true);
    try {
      const teamId = addingFor === 'home' ? game.home_team_id : game.away_team_id;
      await createPitchCount(gameId, {
        player_id: Number(pcForm.player_id),
        team_id: teamId,
        pitch_count: Number(pcForm.pitch_count),
      });
      setPitchCounts(await fetchPitchCounts(gameId));
      setPcForm({ player_id: '', pitch_count: '' });
      setAddingFor(null);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleUpdatePitchCount(e) {
    e.preventDefault();
    if (!editingPc) return;
    setSaving(true);
    try {
      await updatePitchCount(gameId, editingPc.id, {
        pitch_count: Number(pcForm.pitch_count),
      });
      setPitchCounts(await fetchPitchCounts(gameId));
      setEditingPc(null);
      setPcForm({ player_id: '', pitch_count: '' });
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleDeletePitchCount(pc) {
    if (!confirm(`Remove pitch count for ${pc.first_name} ${pc.last_name}?`)) return;
    try {
      await deletePitchCount(gameId, pc.id);
      setPitchCounts(prev => prev.filter(p => p.id !== pc.id));
    } catch (err) { setError(err.message); }
  }

  function startEditPc(pc) {
    setEditingPc(pc);
    setAddingFor(null);
    setPcForm({ player_id: String(pc.player_id), pitch_count: String(pc.pitch_count) });
  }

  async function handleQuickAddPlayer(side) {
    if (!newPlayerForm.first_name.trim() || !newPlayerForm.last_name.trim()) return;
    setSavingNewPlayer(true);
    try {
      const teamId = side === 'home' ? game.home_team_id : game.away_team_id;
      await createPlayer({
        team_id: teamId,
        first_name: newPlayerForm.first_name.trim(),
        last_name: newPlayerForm.last_name.trim(),
        jersey_number: newPlayerForm.jersey_number.trim() || undefined,
      });
      // Refresh player list and eligibility for the relevant team
      const [updated, elig] = await Promise.all([
        fetchPlayersByTeam(teamId),
        fetchPitchEligibility(teamId, game.game_date, gameId).catch(() => null),
      ]);
      if (side === 'home') { setHomePlayers(updated); setHomeEligibility(elig); }
      else { setAwayPlayers(updated); setAwayEligibility(elig); }
      setNewPlayerForm({ first_name: '', last_name: '', jersey_number: '' });
      setAddingNewPlayerFor(null);
    } catch (err) { setError(err.message); }
    finally { setSavingNewPlayer(false); }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading game…</div>;
  if (!game) return <div className="py-8 text-center text-signal-400">Game not found</div>;

  if (showTracker) {
    return <PitchTracker gameId={gameId} onBack={() => { setShowTracker(false); loadAll(); }} />;
  }

  const userCanEdit = canEdit(game);
  const userCanScore = canScoreGame(game.home_team_id, game.away_team_id, game.home_org_id, game.away_org_id);
  const homePC = pitchCounts.filter(pc => pc.team_id === game.home_team_id);
  const awayPC = pitchCounts.filter(pc => pc.team_id === game.away_team_id);

  // Players not yet added as pitchers
  const homePitcherIds = new Set(homePC.map(pc => pc.player_id));
  const awayPitcherIds = new Set(awayPC.map(pc => pc.player_id));
  const availableHome = homePlayers.filter(p => !homePitcherIds.has(p.id));
  const availableAway = awayPlayers.filter(p => !awayPitcherIds.has(p.id));

  return (
    <div>
      {/* Back button + tracker */}
      <div className="flex items-center gap-2 mb-4">
        <Button variant="secondary" onClick={onBack}>← Back to Schedule</Button>
        {onOpenImport && (userCanScore || userCanEdit) && (
          <Button variant="chrome" onClick={() => onOpenImport(game.id)}>
            Import from GC
          </Button>
        )}
        {userCanScore && game.status !== 'completed' && (
          <Button variant="warn" onClick={() => setShowTracker(true)}>
            ⚾ Pitch Tracker
          </Button>
        )}
      </div>

      {/* Game header */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-gray-400">{formatDate(game.game_date)}{game.game_time ? ` · ${formatTime(game.game_time)}` : ''}</div>
          <div className="flex items-center gap-2">
            {game.is_gamechanger_imported && (
              <span className={GC_BADGE_CLASS} title="Imported from GameChanger" aria-label="Imported from GameChanger">
                GC
              </span>
            )}
            <span className={`lh-badge ${STATUS_COLORS[game.status] || 'bg-gray-800'}`}>
              {game.status_label}
            </span>
          </div>
        </div>

        {/* Matchup */}
        <div className="flex items-center justify-center gap-3 sm:gap-6 mb-3">
          <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <TeamLogo src={game.home_logo} name={game.home_team_name} ageGroup={game.home_age_group} level={game.home_level} cityAbbr={game.home_city_abbr} primaryColor={game.home_primary_color} secondaryColor={game.home_secondary_color} size="w-12 h-12" />
            <button onClick={() => onNavigateToTeam?.(game.home_team_id, game.home_org_id)} className="font-bold text-sm text-center truncate w-full text-action-300 hover:text-action-100 hover:underline">{game.home_team_name}</button>
            <div className="w-12 h-1 rounded-full" style={{ background: game.home_primary_color || '#ccc' }} />
            <span className="text-xs text-gray-400 uppercase">Home</span>
          </div>
          <div className="text-center shrink-0 px-2">
            <div className="text-4xl sm:text-5xl font-extrabold tabular-nums text-white tracking-tight">
              {game.home_score ?? '—'} <span className="text-gray-500 mx-1">–</span> {game.away_score ?? '—'}
            </div>
            {game.innings_played && (
              <div className="text-xs text-gray-400 mt-1">{game.innings_played} innings</div>
            )}
          </div>
          <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <TeamLogo src={game.away_logo} name={game.away_team_name} ageGroup={game.away_age_group} level={game.away_level} cityAbbr={game.away_city_abbr} primaryColor={game.away_primary_color} secondaryColor={game.away_secondary_color} size="w-12 h-12" />
            <button onClick={() => onNavigateToTeam?.(game.away_team_id, game.away_org_id)} className="font-bold text-sm text-center truncate w-full text-action-300 hover:text-action-100 hover:underline">{game.away_team_name}</button>
            <div className="w-12 h-1 rounded-full" style={{ background: game.away_primary_color || '#ccc' }} />
            <span className="text-xs text-gray-400 uppercase">Away</span>
          </div>
        </div>

        {game.location_name && (
          <div className="text-xs text-gray-400 text-center">📍 {game.location_name}{game.location_city ? `, ${game.location_city}` : ''}</div>
        )}

        {!!game.official_names?.length && (
          <div className="text-xs text-gray-400 text-center mt-1">
            {game.official_names.length === 1 ? 'Umpire:' : 'Umpires:'} {game.official_names.join(', ')}
          </div>
        )}
        {game.notes && <div className="text-xs text-gray-400 italic text-center mt-1">{game.notes}</div>}
      </div>

      {/* Weather card */}
      {weather && (
        <div className={`border rounded-xl p-4 sm:p-5 mb-4 ${
          weather.playability?.rating === 'unplayable' ? 'bg-red-950/20 border-signal-500/30' :
          weather.playability?.rating === 'poor' ? 'bg-orange-950/15 border-orange-500/30' :
          'bg-gray-800 border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-display font-bold uppercase tracking-wide text-gray-100 flex items-center gap-2">
              {weather.icon} Game Day Weather
              {weather.isForecast && <span className="text-[10px] font-normal normal-case text-gray-500 italic">(forecast)</span>}
            </h3>
            {weather.playability && (
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                weather.playability.rating === 'good' ? 'bg-action-900/40 text-action-300' :
                weather.playability.rating === 'fair' ? 'bg-yellow-900/40 text-yellow-300' :
                weather.playability.rating === 'poor' ? 'bg-orange-900/40 text-orange-300' :
                'bg-signal-900/40 text-signal-300'
              }`}>{weather.playability.rating}</span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center p-2 bg-gray-900/50 rounded-lg">
              <div className="text-lg font-bold text-gray-100">{weather.temp}°F</div>
              {weather.feelsLike != null && weather.feelsLike !== weather.temp && (
                <div className="text-[10px] text-gray-400">Feels like {weather.feelsLike}°</div>
              )}
              <div className="text-[10px] text-gray-500 mt-0.5">{weather.description}</div>
            </div>
            <div className="text-center p-2 bg-gray-900/50 rounded-lg">
              <div className="text-lg font-bold text-gray-100">
                {weather.precipitationProbability != null ? `${weather.precipitationProbability}%` : '—'}
              </div>
              <div className="text-[10px] text-gray-500">🌧️ Rain Chance</div>
            </div>
            <div className="text-center p-2 bg-gray-900/50 rounded-lg">
              <div className="text-lg font-bold text-gray-100">{weather.windSpeed}<span className="text-xs text-gray-400">mph</span></div>
              {weather.windDirection && (
                <div className="text-[10px] text-gray-400">{weather.windDirection}</div>
              )}
              {weather.windGusts > weather.windSpeed && (
                <div className="text-[10px] text-gray-500">Gusts {weather.windGusts}mph</div>
              )}
              <div className="text-[10px] text-gray-500">💨 Wind</div>
            </div>
            <div className="text-center p-2 bg-gray-900/50 rounded-lg">
              {weather.uvIndex != null ? (
                <>
                  <div className={`text-lg font-bold ${weather.uvIndex >= 8 ? 'text-signal-400' : weather.uvIndex >= 6 ? 'text-orange-400' : 'text-gray-100'}`}>
                    {Math.round(weather.uvIndex)}
                  </div>
                  <div className="text-[10px] text-gray-500">☀️ UV Index</div>
                </>
              ) : weather.humidity != null ? (
                <>
                  <div className="text-lg font-bold text-gray-100">{weather.humidity}%</div>
                  <div className="text-[10px] text-gray-500">💧 Humidity</div>
                </>
              ) : (
                <>
                  <div className="text-lg font-bold text-gray-100">—</div>
                  <div className="text-[10px] text-gray-500">UV / Humidity</div>
                </>
              )}
            </div>
          </div>

          {weather.playability?.reasons?.length > 0 && (
            <div className="mt-3 text-xs text-gray-400">
              ⚠️ {weather.playability.reasons.join(' · ')}
            </div>
          )}

          {weather.isDailySummary && weather.tempHigh != null && (
            <div className="mt-2 text-[10px] text-gray-500 text-center">
              High {weather.tempHigh}° / Low {weather.tempLow}° — daily summary (no game time set)
            </div>
          )}
        </div>
      )}

      {/* Score reporting */}
      {userCanScore && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-display font-bold uppercase tracking-wide text-white">Report Score</h3>
            <div className="flex items-center gap-3">
              {!editingScore && (
                <button onClick={() => setEditingScore(true)} className="text-xs text-chrome-400 font-semibold hover:underline">Edit</button>
              )}
            </div>
          </div>

          {editingScore ? (
            <form onSubmit={handleSaveScore} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <Input label="Home Score" type="number" min="0" value={scoreForm.home_score}
                    onChange={(e) => setScoreForm(prev => ({ ...prev, home_score: e.target.value }))}
                    placeholder="—" />
                <Input label="Away Score" type="number" min="0" value={scoreForm.away_score}
                    onChange={(e) => setScoreForm(prev => ({ ...prev, away_score: e.target.value }))}
                    placeholder="—" />
                <Input label="Innings" type="number" min="1" max="99" value={scoreForm.innings_played}
                    onChange={(e) => setScoreForm(prev => ({ ...prev, innings_played: e.target.value }))}
                    placeholder="6" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving} loading={saving}>{saving ? 'Saving…' : 'Save Score'}</Button>
                <Button variant="secondary" onClick={() => {
                  setEditingScore(false);
                  setScoreForm({ home_score: game.home_score ?? '', away_score: game.away_score ?? '', innings_played: game.innings_played ?? '' });
                }}>Cancel</Button>
              </div>
            </form>
          ) : (
            <div className="text-sm text-gray-300">
              {game.home_score != null && game.away_score != null
                ? `${game.home_team_name} ${game.home_score} — ${game.away_team_name} ${game.away_score}${game.innings_played ? ` (${game.innings_played} innings)` : ''}`
                : 'No score reported yet. Click Edit to report the score.'}
            </div>
          )}
        </div>
      )}

      {error && <div className="lh-alert lh-alert-error mb-4">{error}</div>}

      {/* Pitch Counts — Home */}
      <PitchCountSection
        label={`${game.home_team_name} — Pitch Counts`}
        logo={game.home_logo}
        teamName={game.home_team_name}
        entries={homePC}
        availablePlayers={availableHome}
        canEdit={userCanScore}
        isAdding={addingFor === 'home'}
        onStartAdd={() => { setAddingFor('home'); setEditingPc(null); setPcForm({ player_id: '', pitch_count: '' }); setAddingNewPlayerFor(null); }}
        onCancelAdd={() => { setAddingFor(null); setAddingNewPlayerFor(null); }}
        onAdd={handleAddPitchCount}
        pcForm={pcForm}
        setPcForm={setPcForm}
        saving={saving}
        editingPc={editingPc}
        onStartEdit={startEditPc}
        onSaveEdit={handleUpdatePitchCount}
        onCancelEdit={() => { setEditingPc(null); setPcForm({ player_id: '', pitch_count: '' }); }}
        onDelete={handleDeletePitchCount}
        addingNewPlayer={addingNewPlayerFor === 'home'}
        onStartAddNewPlayer={() => setAddingNewPlayerFor('home')}
        onCancelAddNewPlayer={() => { setAddingNewPlayerFor(null); setNewPlayerForm({ first_name: '', last_name: '', jersey_number: '' }); }}
        newPlayerForm={newPlayerForm}
        setNewPlayerForm={setNewPlayerForm}
        onSaveNewPlayer={() => handleQuickAddPlayer('home')}
        savingNewPlayer={savingNewPlayer}
        eligibilityData={homeEligibility}
        gameDate={game.game_date}
      />

      {/* Pitch Counts — Away */}
      <PitchCountSection
        label={`${game.away_team_name} — Pitch Counts`}
        logo={game.away_logo}
        teamName={game.away_team_name}
        entries={awayPC}
        availablePlayers={availableAway}
        canEdit={userCanScore}
        isAdding={addingFor === 'away'}
        onStartAdd={() => { setAddingFor('away'); setEditingPc(null); setPcForm({ player_id: '', pitch_count: '' }); setAddingNewPlayerFor(null); }}
        onCancelAdd={() => { setAddingFor(null); setAddingNewPlayerFor(null); }}
        onAdd={handleAddPitchCount}
        pcForm={pcForm}
        setPcForm={setPcForm}
        saving={saving}
        editingPc={editingPc}
        onStartEdit={startEditPc}
        onSaveEdit={handleUpdatePitchCount}
        onCancelEdit={() => { setEditingPc(null); setPcForm({ player_id: '', pitch_count: '' }); }}
        onDelete={handleDeletePitchCount}
        addingNewPlayer={addingNewPlayerFor === 'away'}
        onStartAddNewPlayer={() => setAddingNewPlayerFor('away')}
        onCancelAddNewPlayer={() => { setAddingNewPlayerFor(null); setNewPlayerForm({ first_name: '', last_name: '', jersey_number: '' }); }}
        newPlayerForm={newPlayerForm}
        setNewPlayerForm={setNewPlayerForm}
        onSaveNewPlayer={() => handleQuickAddPlayer('away')}
        savingNewPlayer={savingNewPlayer}
        eligibilityData={awayEligibility}
        gameDate={game.game_date}
      />
    </div>
  );
}

function PitchCountSection({
  label, entries, availablePlayers, canEdit,
  isAdding, onStartAdd, onCancelAdd, onAdd,
  pcForm, setPcForm, saving,
  editingPc, onStartEdit, onSaveEdit, onCancelEdit, onDelete,
  addingNewPlayer, onStartAddNewPlayer, onCancelAddNewPlayer,
  newPlayerForm, setNewPlayerForm, onSaveNewPlayer, savingNewPlayer,
  eligibilityData, gameDate,
}) {
  const totalPitches = entries.reduce((sum, e) => sum + (e.pitch_count || 0), 0);

  // Build eligibility lookup map
  const eligMap = {};
  if (eligibilityData?.players) {
    for (const p of eligibilityData.players) eligMap[p.player_id] = p;
  }
  const dailyLimit = eligibilityData?.daily_limit;
  const rules = eligibilityData?.rules;

  // Calculate rest days from a pitch count total using the rules
  function calcRestDays(totalPitches) {
    if (!rules?.rest_thresholds) return null;
    for (const t of rules.rest_thresholds) {
      if (totalPitches >= t.min) return t.days;
    }
    return 0;
  }

  // Helper to compute available date from rest days
  function availableDate(restDays) {
    if (!gameDate || !restDays || restDays <= 0) return null;
    const d = new Date(gameDate + 'T00:00:00');
    d.setDate(d.getDate() + restDays + 1);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Selected player eligibility (for add form)
  const selectedElig = pcForm.player_id ? eligMap[Number(pcForm.player_id)] : null;

  const sectionTone = canEdit
    ? 'bg-gradient-to-b from-gray-800 to-gray-800/95 border-gray-700'
    : 'bg-gray-800/90 border-gray-700';

  return (
    <div className={`border rounded-xl p-4 sm:p-5 mb-4 shadow-sm ${sectionTone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-base font-display font-bold uppercase tracking-wide text-white truncate">{label}</h3>
          {dailyLimit && <span className="text-xs text-gray-400 shrink-0">Limit: {dailyLimit}/day</span>}
        </div>
        {canEdit && !isAdding && !editingPc && (
          <Button size="xs" variant="chrome" onClick={onStartAdd}>+ Add Pitcher</Button>
        )}
      </div>

      {entries.length === 0 && !isAdding ? (
        <div className="text-sm text-gray-400 bg-gray-900/40 border border-gray-700 rounded-lg px-3 py-2">No pitch counts recorded.</div>
      ) : (
        <div className="space-y-2 bg-gray-900/25 border border-gray-700/70 rounded-lg p-2 sm:p-3">
          {/* Header */}
          <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide px-2">
            <div className="col-span-1">#</div>
            <div className="col-span-5">Player</div>
            <div className="col-span-2 text-right">Pitches</div>
            <div className="col-span-2 text-right">Rest</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {entries.map(pc => {
            // Calculate rest days for this entry (pitch count in this game + other games today)
            const otherToday = eligMap[pc.player_id]?.today_pitches || 0;
            const totalToday = (pc.pitch_count || 0) + otherToday;
            const restDays = calcRestDays(totalToday);
            const overLimit = dailyLimit && totalToday > dailyLimit;

            return editingPc?.id === pc.id ? (
              <form key={pc.id} onSubmit={onSaveEdit} className="bg-gray-900/80 border border-gray-700 rounded-lg p-3 space-y-2">
                <div className="text-sm font-semibold text-gray-100">{pc.first_name} {pc.last_name} {pc.jersey_number ? `#${pc.jersey_number}` : ''}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="lh-eyebrow block mb-1">Pitch Count *</label>
                    <input type="number" min="0" required value={pcForm.pitch_count}
                      onChange={(e) => setPcForm(prev => ({ ...prev, pitch_count: e.target.value }))}
                      className="lh-input" />
                    {pcForm.pitch_count && dailyLimit && (Number(pcForm.pitch_count) + otherToday) > dailyLimit && (
                      <div className="mt-1 text-xs text-signal-400 font-semibold">Exceeds daily limit of {dailyLimit}</div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={saving} loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                  <Button variant="secondary" onClick={onCancelEdit}>Cancel</Button>
                </div>
              </form>
            ) : (
              <div key={pc.id} className="md:grid md:grid-cols-12 md:gap-2 px-2.5 py-2 rounded hover:bg-gray-900 group border border-transparent hover:border-gray-700/80 transition-colors">
                <div className="md:col-span-1 text-xs text-gray-400 font-mono mb-1 md:mb-0">#{pc.jersey_number || '—'}</div>
                <div className="md:col-span-5 text-sm font-medium text-gray-100 truncate mb-1 md:mb-0">{pc.first_name} {pc.last_name}</div>
                <div className={`md:col-span-2 text-sm font-bold md:text-right tabular-nums mb-1 md:mb-0 ${overLimit ? 'text-signal-400' : 'text-gray-200'}`}>{pc.pitch_count}</div>
                <div className="md:col-span-2 md:text-right mb-1 md:mb-0">
                  {restDays != null && (() => {
                    const availDate = availableDate(restDays);
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        restDays >= 3 ? 'bg-signal-900/35 text-signal-300' :
                        restDays >= 2 ? DARK_BADGES.warning :
                        restDays >= 1 ? DARK_BADGES.warning :
                        DARK_BADGES.success
                      }`}
                        title={availDate ? `Available ${availDate}` : 'No rest required'}
                      >
                        {restDays > 0 ? `${restDays}d` : '0d'}
                        {restDays > 0 && availDate ? <span className="opacity-80">→ {availDate}</span> : null}
                      </span>
                    );
                  })()}
                </div>
                {canEdit && (
                  <div className="md:col-span-2 flex gap-1 md:justify-end opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <Button size="xs" variant="secondary" onClick={() => onStartEdit(pc)}>Edit</Button>
                    <Button size="xs" variant="danger" onClick={() => onDelete(pc)}>×</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {entries.length > 0 && (
        <div className="mt-3 pt-2 border-t border-gray-700 flex justify-end text-xs text-gray-400 font-semibold">
          Total: {totalPitches} pitches from {entries.length} pitcher{entries.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Add form */}
      {isAdding && (
        <form onSubmit={onAdd} className="mt-3 bg-gray-900/65 border border-chrome-700/30 rounded-lg p-3 sm:p-4 space-y-3">
          <div>
            <label className="lh-eyebrow block mb-1">Player *</label>
            {availablePlayers.length > 0 ? (
              <select value={pcForm.player_id} onChange={(e) => setPcForm(prev => ({ ...prev, player_id: e.target.value }))}
                required className="lh-select">
                <option value="">— Select Player —</option>
                {availablePlayers.map(p => {
                  const elig = eligMap[p.id];
                  const isEligible = elig?.eligible !== false;
                  return (
                    <option key={p.id} value={p.id}>
                      {isEligible ? '✓ ' : '⛔ '}
                      {p.jersey_number ? `#${p.jersey_number} ` : ''}{p.first_name} {p.last_name}
                      {!isEligible ? ' — UNAVAILABLE' : ''}
                    </option>
                  );
                })}
              </select>
            ) : (
              <div className="text-sm text-gray-400 italic">All rostered players already added. Use "New Player" below to add one.</div>
            )}

            {/* Eligibility warning for selected player */}
            {selectedElig && !selectedElig.eligible && (
              <div className="mt-2 bg-signal-900/30 border border-signal-400/35 text-signal-300 text-xs rounded-lg px-3 py-2">
                <strong>⚠ Ineligible to pitch:</strong>
                <ul className="mt-1 list-disc list-inside">
                  {selectedElig.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}

            {/* Eligibility info for eligible player */}
            {selectedElig && selectedElig.eligible && selectedElig.today_pitches > 0 && (
              <div className="mt-2 bg-amber-500/15 border border-amber-400/35 text-amber-200 text-xs rounded-lg px-3 py-2">
                Already threw {selectedElig.today_pitches} pitches today in another game. Remaining: {selectedElig.remaining_today}
              </div>
            )}

            {!addingNewPlayer && (
              <button type="button" onClick={onStartAddNewPlayer}
                className="mt-1 text-xs text-action-300 font-semibold hover:underline">+ New Player</button>
            )}
          </div>

          {/* Inline new player form */}
          {addingNewPlayer && (
            <div className="bg-action-900/20 border border-action-400/30 rounded-lg p-3 space-y-2">
              <div className="eyebrow text-action-300 mb-1">Quick Add Player</div>
              <div className="grid grid-cols-3 gap-2">
                <Input label="First Name *" type="text" required value={newPlayerForm.first_name}
                    onChange={(e) => setNewPlayerForm(prev => ({ ...prev, first_name: e.target.value }))}
                    placeholder="First" />
                <Input label="Last Name *" type="text" required value={newPlayerForm.last_name}
                    onChange={(e) => setNewPlayerForm(prev => ({ ...prev, last_name: e.target.value }))}
                    placeholder="Last" />
                <Input label="Jersey #" type="text" value={newPlayerForm.jersey_number}
                    onChange={(e) => setNewPlayerForm(prev => ({ ...prev, jersey_number: e.target.value }))}
                    placeholder="#" />
              </div>
              <div className="flex gap-2">
                <Button size="xs" disabled={savingNewPlayer} onClick={(e) => { e.preventDefault(); onSaveNewPlayer(); }}>
                  {savingNewPlayer ? 'Adding…' : 'Add Player'}
                </Button>
                <Button size="xs" variant="secondary" onClick={onCancelAddNewPlayer}>Cancel</Button>
              </div>
            </div>
          )}

          {availablePlayers.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="lh-eyebrow block mb-1">Pitch Count *</label>
                  <input type="number" min="0" required value={pcForm.pitch_count}
                    onChange={(e) => setPcForm(prev => ({ ...prev, pitch_count: e.target.value }))}
                    className="lh-input" />
                  {/* Real-time pitch count feedback */}
                  {pcForm.pitch_count && dailyLimit && (() => {
                    const entered = Number(pcForm.pitch_count);
                    const otherToday = selectedElig?.today_pitches || 0;
                    const total = entered + otherToday;
                    const rest = calcRestDays(total);
                    return (
                      <div className="mt-1 space-y-0.5">
                        {total > dailyLimit && (
                          <div className="text-xs text-signal-400 font-semibold">⚠ Exceeds daily limit of {dailyLimit}</div>
                        )}
                        {rest != null && rest > 0 && (
                          <div className="text-xs text-gray-300">→ Will require <strong>{rest} rest day{rest !== 1 ? 's' : ''}</strong></div>
                        )}
                        {otherToday > 0 && (
                          <div className="text-xs text-gray-300">({otherToday} from other games + {entered} = {total} total today)</div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {availablePlayers.length > 0 && (
              <Button type="submit" disabled={saving} loading={saving}>{saving ? 'Adding…' : 'Add'}</Button>
            )}
            <Button variant="secondary" onClick={onCancelAdd}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}
