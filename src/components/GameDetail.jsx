import { useState, useEffect, useCallback } from 'react';
import {
  fetchGame, updateGame,
  fetchPitchCounts, createPitchCount, updatePitchCount, deletePitchCount,
  fetchPlayersByTeam, createPlayer, fetchPitchEligibility,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import TeamLogo from './TeamLogo.jsx';

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600";
const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";
const btnPrimary = "px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 transition-colors disabled:opacity-60";
const btnSecondary = "px-4 py-2 bg-gray-200 text-gray-800 text-sm font-semibold rounded-lg hover:bg-gray-300 transition-colors";
const btnDanger = "px-2 py-1 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 disabled:opacity-60";

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
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function GameDetail({ gameId, onBack, onNavigateToTeam }) {
  const { isAdmin, canEditTeam } = useAuth();
  const [game, setGame] = useState(null);
  const [pitchCounts, setPitchCounts] = useState([]);
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Score form
  const [scoreForm, setScoreForm] = useState({ home_score: '', away_score: '', innings_played: '' });
  const [editingScore, setEditingScore] = useState(false);

  // Pitch count add form
  const [addingFor, setAddingFor] = useState(null); // 'home' | 'away'
  const [pcForm, setPcForm] = useState({ player_id: '', pitch_count: '', innings_pitched: '' });
  const [editingPc, setEditingPc] = useState(null);

  // Quick-add new player
  const [addingNewPlayerFor, setAddingNewPlayerFor] = useState(null); // 'home' | 'away'
  const [newPlayerForm, setNewPlayerForm] = useState({ first_name: '', last_name: '', jersey_number: '' });
  const [savingNewPlayer, setSavingNewPlayer] = useState(false);

  // Pitch eligibility
  const [homeEligibility, setHomeEligibility] = useState(null);
  const [awayEligibility, setAwayEligibility] = useState(null);

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
        innings_pitched: pcForm.innings_pitched || null,
      });
      setPitchCounts(await fetchPitchCounts(gameId));
      setPcForm({ player_id: '', pitch_count: '', innings_pitched: '' });
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
        innings_pitched: pcForm.innings_pitched || null,
      });
      setPitchCounts(await fetchPitchCounts(gameId));
      setEditingPc(null);
      setPcForm({ player_id: '', pitch_count: '', innings_pitched: '' });
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
    setPcForm({ player_id: String(pc.player_id), pitch_count: String(pc.pitch_count), innings_pitched: pc.innings_pitched || '' });
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

  if (loading) return <div className="py-8 text-center text-gray-500">Loading game…</div>;
  if (!game) return <div className="py-8 text-center text-red-600">Game not found</div>;

  const userCanEdit = canEdit(game);
  const homePC = pitchCounts.filter(pc => pc.team_id === game.home_team_id);
  const awayPC = pitchCounts.filter(pc => pc.team_id === game.away_team_id);

  // Players not yet added as pitchers
  const homePitcherIds = new Set(homePC.map(pc => pc.player_id));
  const awayPitcherIds = new Set(awayPC.map(pc => pc.player_id));
  const availableHome = homePlayers.filter(p => !homePitcherIds.has(p.id));
  const availableAway = awayPlayers.filter(p => !awayPitcherIds.has(p.id));

  return (
    <div>
      {/* Back button */}
      <button onClick={onBack} className={`${btnSecondary} mb-4`}>← Back to Schedule</button>

      {/* Game header */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-gray-500">{formatDate(game.game_date)}{game.game_time ? ` · ${formatTime(game.game_time)}` : ''}</div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[game.status] || 'bg-gray-100'}`}>
            {game.status_label}
          </span>
        </div>

        {/* Matchup */}
        <div className="flex items-center justify-center gap-3 sm:gap-6 mb-3">
          <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <TeamLogo src={game.home_logo} name={game.home_team_name} ageGroup={game.home_age_group} level={game.home_level} cityAbbr={game.home_city_abbr} primaryColor={game.home_primary_color} secondaryColor={game.home_secondary_color} size="w-12 h-12" />
            <button onClick={() => onNavigateToTeam?.(game.home_team_id, game.home_org_id)} className="font-bold text-sm text-center truncate w-full text-blue-700 hover:text-blue-900 hover:underline">{game.home_team_name}</button>
            <div className="w-12 h-1 rounded-full" style={{ background: game.home_primary_color || '#ccc' }} />
            <span className="text-xs text-gray-400 uppercase">Home</span>
          </div>
          <div className="text-center shrink-0 px-2">
            <div className="text-3xl font-bold tabular-nums">
              {game.home_score ?? '—'} <span className="text-gray-300 mx-1">–</span> {game.away_score ?? '—'}
            </div>
            {game.innings_played && (
              <div className="text-xs text-gray-500 mt-1">{game.innings_played} innings</div>
            )}
          </div>
          <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <TeamLogo src={game.away_logo} name={game.away_team_name} ageGroup={game.away_age_group} level={game.away_level} cityAbbr={game.away_city_abbr} primaryColor={game.away_primary_color} secondaryColor={game.away_secondary_color} size="w-12 h-12" />
            <button onClick={() => onNavigateToTeam?.(game.away_team_id, game.away_org_id)} className="font-bold text-sm text-center truncate w-full text-blue-700 hover:text-blue-900 hover:underline">{game.away_team_name}</button>
            <div className="w-12 h-1 rounded-full" style={{ background: game.away_primary_color || '#ccc' }} />
            <span className="text-xs text-gray-400 uppercase">Away</span>
          </div>
        </div>

        {game.location_name && (
          <div className="text-xs text-gray-500 text-center">📍 {game.location_name}{game.location_city ? `, ${game.location_city}` : ''}</div>
        )}
        {game.notes && <div className="text-xs text-gray-400 italic text-center mt-1">{game.notes}</div>}
      </div>

      {/* Score reporting */}
      {userCanEdit && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-600">Report Score</h3>
            {!editingScore && (
              <button onClick={() => setEditingScore(true)} className="text-xs text-blue-700 font-semibold hover:underline">Edit</button>
            )}
          </div>

          {editingScore ? (
            <form onSubmit={handleSaveScore} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Home Score</label>
                  <input type="number" min="0" value={scoreForm.home_score}
                    onChange={(e) => setScoreForm(prev => ({ ...prev, home_score: e.target.value }))}
                    className={inputCls} placeholder="—" />
                </div>
                <div>
                  <label className={labelCls}>Away Score</label>
                  <input type="number" min="0" value={scoreForm.away_score}
                    onChange={(e) => setScoreForm(prev => ({ ...prev, away_score: e.target.value }))}
                    className={inputCls} placeholder="—" />
                </div>
                <div>
                  <label className={labelCls}>Innings</label>
                  <input type="number" min="1" max="99" value={scoreForm.innings_played}
                    onChange={(e) => setScoreForm(prev => ({ ...prev, innings_played: e.target.value }))}
                    className={inputCls} placeholder="6" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save Score'}</button>
                <button type="button" onClick={() => {
                  setEditingScore(false);
                  setScoreForm({ home_score: game.home_score ?? '', away_score: game.away_score ?? '', innings_played: game.innings_played ?? '' });
                }} className={btnSecondary}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="text-sm text-gray-600">
              {game.home_score != null && game.away_score != null
                ? `${game.home_team_name} ${game.home_score} — ${game.away_team_name} ${game.away_score}${game.innings_played ? ` (${game.innings_played} innings)` : ''}`
                : 'No score reported yet. Click Edit to report the score.'}
            </div>
          )}
        </div>
      )}

      {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}

      {/* Pitch Counts — Home */}
      <PitchCountSection
        label={`${game.home_team_name} — Pitch Counts`}
        logo={game.home_logo}
        teamName={game.home_team_name}
        entries={homePC}
        availablePlayers={availableHome}
        canEdit={userCanEdit}
        isAdding={addingFor === 'home'}
        onStartAdd={() => { setAddingFor('home'); setEditingPc(null); setPcForm({ player_id: '', pitch_count: '', innings_pitched: '' }); setAddingNewPlayerFor(null); }}
        onCancelAdd={() => { setAddingFor(null); setAddingNewPlayerFor(null); }}
        onAdd={handleAddPitchCount}
        pcForm={pcForm}
        setPcForm={setPcForm}
        saving={saving}
        editingPc={editingPc}
        onStartEdit={startEditPc}
        onSaveEdit={handleUpdatePitchCount}
        onCancelEdit={() => { setEditingPc(null); setPcForm({ player_id: '', pitch_count: '', innings_pitched: '' }); }}
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
        canEdit={userCanEdit}
        isAdding={addingFor === 'away'}
        onStartAdd={() => { setAddingFor('away'); setEditingPc(null); setPcForm({ player_id: '', pitch_count: '', innings_pitched: '' }); setAddingNewPlayerFor(null); }}
        onCancelAdd={() => { setAddingFor(null); setAddingNewPlayerFor(null); }}
        onAdd={handleAddPitchCount}
        pcForm={pcForm}
        setPcForm={setPcForm}
        saving={saving}
        editingPc={editingPc}
        onStartEdit={startEditPc}
        onSaveEdit={handleUpdatePitchCount}
        onCancelEdit={() => { setEditingPc(null); setPcForm({ player_id: '', pitch_count: '', innings_pitched: '' }); }}
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

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-600">{label}</h3>
          {dailyLimit && <span className="text-xs text-gray-400">Limit: {dailyLimit}/day</span>}
        </div>
        {canEdit && !isAdding && !editingPc && (
          <button onClick={onStartAdd} className="text-xs text-blue-700 font-semibold hover:underline">+ Add Pitcher</button>
        )}
      </div>

      {entries.length === 0 && !isAdding ? (
        <div className="text-sm text-gray-400">No pitch counts recorded.</div>
      ) : (
        <div className="space-y-2">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide px-2">
            <div className="col-span-1">#</div>
            <div className="col-span-3">Player</div>
            <div className="col-span-2 text-right">Pitches</div>
            <div className="col-span-2 text-right">IP</div>
            <div className="col-span-2 text-right">Rest</div>
            <div className="col-span-2"></div>
          </div>

          {entries.map(pc => {
            // Calculate rest days for this entry (pitch count in this game + other games today)
            const otherToday = eligMap[pc.player_id]?.today_pitches || 0;
            const totalToday = (pc.pitch_count || 0) + otherToday;
            const restDays = calcRestDays(totalToday);
            const overLimit = dailyLimit && totalToday > dailyLimit;

            return editingPc?.id === pc.id ? (
              <form key={pc.id} onSubmit={onSaveEdit} className="bg-gray-50 rounded-lg p-3 space-y-2">
                <div className="text-sm font-semibold">{pc.first_name} {pc.last_name} {pc.jersey_number ? `#${pc.jersey_number}` : ''}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Pitch Count *</label>
                    <input type="number" min="0" required value={pcForm.pitch_count}
                      onChange={(e) => setPcForm(prev => ({ ...prev, pitch_count: e.target.value }))}
                      className={inputCls} />
                    {pcForm.pitch_count && dailyLimit && (Number(pcForm.pitch_count) + otherToday) > dailyLimit && (
                      <div className="mt-1 text-xs text-red-600 font-semibold">Exceeds daily limit of {dailyLimit}</div>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Innings Pitched</label>
                    <input type="text" value={pcForm.innings_pitched} placeholder="e.g. 3.1"
                      onChange={(e) => setPcForm(prev => ({ ...prev, innings_pitched: e.target.value }))}
                      className={inputCls} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
                  <button type="button" onClick={onCancelEdit} className={btnSecondary}>Cancel</button>
                </div>
              </form>
            ) : (
              <div key={pc.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 group">
                <div className="w-8 text-xs text-gray-400 font-mono">{pc.jersey_number || '—'}</div>
                <div className="flex-1 text-sm font-medium truncate">{pc.first_name} {pc.last_name}</div>
                <div className={`w-16 text-sm font-bold text-right tabular-nums ${overLimit ? 'text-red-600' : ''}`}>{pc.pitch_count}</div>
                <div className="w-12 text-sm text-gray-500 text-right tabular-nums">{pc.innings_pitched || '—'}</div>
                <div className="w-16 text-right">
                  {restDays != null && (() => {
                    const availDate = availableDate(restDays);
                    return (
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        restDays >= 3 ? 'bg-red-100 text-red-700' :
                        restDays >= 2 ? 'bg-orange-100 text-orange-700' :
                        restDays >= 1 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}
                        title={availDate ? `Available ${availDate}` : 'No rest required'}
                      >
                        {restDays > 0 ? `${restDays}d → ${availDate}` : '0d'}
                      </span>
                    );
                  })()}
                </div>
                {canEdit && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                    <button onClick={() => onStartEdit(pc)} className="px-2 py-0.5 text-xs bg-gray-200 rounded hover:bg-gray-300">Edit</button>
                    <button onClick={() => onDelete(pc)} className={btnDanger}>×</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {entries.length > 0 && (
        <div className="mt-3 pt-2 border-t border-gray-100 flex justify-end text-xs text-gray-500 font-semibold">
          Total: {totalPitches} pitches from {entries.length} pitcher{entries.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Add form */}
      {isAdding && (
        <form onSubmit={onAdd} className="mt-3 bg-blue-50 rounded-lg p-3 space-y-2">
          <div>
            <label className={labelCls}>Player *</label>
            {availablePlayers.length > 0 ? (
              <select value={pcForm.player_id} onChange={(e) => setPcForm(prev => ({ ...prev, player_id: e.target.value }))}
                required className={inputCls}>
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
              <div className="text-sm text-gray-500 italic">All rostered players already added. Use "New Player" below to add one.</div>
            )}

            {/* Eligibility warning for selected player */}
            {selectedElig && !selectedElig.eligible && (
              <div className="mt-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
                <strong>⚠ Ineligible to pitch:</strong>
                <ul className="mt-1 list-disc list-inside">
                  {selectedElig.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}

            {/* Eligibility info for eligible player */}
            {selectedElig && selectedElig.eligible && selectedElig.today_pitches > 0 && (
              <div className="mt-2 bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded-lg px-3 py-2">
                Already threw {selectedElig.today_pitches} pitches today in another game. Remaining: {selectedElig.remaining_today}
              </div>
            )}

            {!addingNewPlayer && (
              <button type="button" onClick={onStartAddNewPlayer}
                className="mt-1 text-xs text-green-700 font-semibold hover:underline">+ New Player</button>
            )}
          </div>

          {/* Inline new player form */}
          {addingNewPlayer && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wide text-green-700 mb-1">Quick Add Player</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>First Name *</label>
                  <input type="text" required value={newPlayerForm.first_name}
                    onChange={(e) => setNewPlayerForm(prev => ({ ...prev, first_name: e.target.value }))}
                    className={inputCls} placeholder="First" />
                </div>
                <div>
                  <label className={labelCls}>Last Name *</label>
                  <input type="text" required value={newPlayerForm.last_name}
                    onChange={(e) => setNewPlayerForm(prev => ({ ...prev, last_name: e.target.value }))}
                    className={inputCls} placeholder="Last" />
                </div>
                <div>
                  <label className={labelCls}>Jersey #</label>
                  <input type="text" value={newPlayerForm.jersey_number}
                    onChange={(e) => setNewPlayerForm(prev => ({ ...prev, jersey_number: e.target.value }))}
                    className={inputCls} placeholder="#" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={savingNewPlayer} onClick={(e) => { e.preventDefault(); onSaveNewPlayer(); }}
                  className="px-3 py-1.5 bg-green-700 text-white text-xs font-semibold rounded-lg hover:bg-green-800 disabled:opacity-60">
                  {savingNewPlayer ? 'Adding…' : 'Add Player'}
                </button>
                <button type="button" onClick={onCancelAddNewPlayer}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-300">Cancel</button>
              </div>
            </div>
          )}

          {availablePlayers.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Pitch Count *</label>
                  <input type="number" min="0" required value={pcForm.pitch_count}
                    onChange={(e) => setPcForm(prev => ({ ...prev, pitch_count: e.target.value }))}
                    className={inputCls} />
                  {/* Real-time pitch count feedback */}
                  {pcForm.pitch_count && dailyLimit && (() => {
                    const entered = Number(pcForm.pitch_count);
                    const otherToday = selectedElig?.today_pitches || 0;
                    const total = entered + otherToday;
                    const rest = calcRestDays(total);
                    return (
                      <div className="mt-1 space-y-0.5">
                        {total > dailyLimit && (
                          <div className="text-xs text-red-600 font-semibold">⚠ Exceeds daily limit of {dailyLimit}</div>
                        )}
                        {rest != null && rest > 0 && (
                          <div className="text-xs text-gray-500">→ Will require <strong>{rest} rest day{rest !== 1 ? 's' : ''}</strong></div>
                        )}
                        {otherToday > 0 && (
                          <div className="text-xs text-gray-400">({otherToday} from other games + {entered} = {total} total today)</div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <label className={labelCls}>Innings Pitched</label>
                  <input type="text" value={pcForm.innings_pitched} placeholder="e.g. 3.1"
                    onChange={(e) => setPcForm(prev => ({ ...prev, innings_pitched: e.target.value }))}
                    className={inputCls} />
                </div>
              </div>
            </>
          )}
          <div className="flex gap-2">
            {availablePlayers.length > 0 && (
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Adding…' : 'Add'}</button>
            )}
            <button type="button" onClick={onCancelAdd} className={btnSecondary}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
