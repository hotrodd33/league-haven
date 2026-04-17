import { useState, useEffect, useCallback } from 'react';
import {
  fetchGame, updateGame,
  fetchPitchCounts, createPitchCount, updatePitchCount, deletePitchCount,
  fetchPlayersByTeam, createPlayer,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import TeamLogo from './TeamLogo.jsx';

const btnPrimary = 'btn btn-primary btn-md disabled:opacity-60';
const btnSecondary = 'btn btn-secondary btn-md';
const inputCls = 'w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-control text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-action-500/30 focus:border-action-600';

function teamAbbr(name, fallback = '') {
  if (fallback && String(fallback).trim()) return String(fallback).trim().slice(0, 4).toUpperCase();
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'TEAM';
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export default function PitchTracker({ gameId, onBack }) {
  const { isAdmin, canEditTeam } = useAuth();
  const [game, setGame] = useState(null);
  const [pitchCounts, setPitchCounts] = useState([]); // server-saved records
  const [localCounts, setLocalCounts] = useState({}); // { `${side}-${playerId}`: count }
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Score & inning tracking
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [inning, setInning] = useState(1);

  // Active pitchers being tracked (array of { side, playerId, playerName, jerseyNumber })
  const [activePitchers, setActivePitchers] = useState([]);

  // Add pitcher UI
  const [addingSide, setAddingSide] = useState(null); // 'home' | 'away'
  const [selectedPlayerId, setSelectedPlayerId] = useState('');

  // Quick-add new player
  const [addingNewPlayer, setAddingNewPlayer] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newJersey, setNewJersey] = useState('');
  const [savingPlayer, setSavingPlayer] = useState(false);

  // Finalized
  const [finalized, setFinalized] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [g, pcs] = await Promise.all([
        fetchGame(gameId),
        fetchPitchCounts(gameId),
      ]);
      setGame(g);
      setPitchCounts(pcs);
      setHomeScore(g.home_score ?? 0);
      setAwayScore(g.away_score ?? 0);
      setInning(g.innings_played ?? 1);

      const [hp, ap] = await Promise.all([
        g.home_team_id ? fetchPlayersByTeam(g.home_team_id) : [],
        g.away_team_id ? fetchPlayersByTeam(g.away_team_id) : [],
      ]);
      setHomePlayers(hp);
      setAwayPlayers(ap);

      // Rebuild active pitchers from existing pitch counts
      const existing = [];
      const counts = {};
      for (const pc of pcs) {
        const side = pc.team_id === g.home_team_id ? 'home' : 'away';
        const key = `${side}-${pc.player_id}`;
        existing.push({
          side,
          playerId: pc.player_id,
          playerName: `${pc.first_name} ${pc.last_name}`,
          jerseyNumber: pc.jersey_number,
          pcId: pc.id,
        });
        counts[key] = pc.pitch_count;
      }
      setActivePitchers(existing);
      setLocalCounts(counts);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [gameId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  function getCount(side, playerId) {
    return localCounts[`${side}-${playerId}`] || 0;
  }

  function adjustCount(side, playerId, delta) {
    const key = `${side}-${playerId}`;
    setLocalCounts(prev => ({
      ...prev,
      [key]: Math.max(0, (prev[key] || 0) + delta),
    }));
  }

  function handleAddPitcher() {
    if (!selectedPlayerId || !addingSide) return;
    const players = addingSide === 'home' ? homePlayers : awayPlayers;
    const player = players.find(p => p.id === Number(selectedPlayerId));
    if (!player) return;
    const key = `${addingSide}-${player.id}`;
    if (activePitchers.some(p => `${p.side}-${p.playerId}` === key)) return; // already added

    setActivePitchers(prev => [...prev, {
      side: addingSide,
      playerId: player.id,
      playerName: `${player.first_name} ${player.last_name}`,
      jerseyNumber: player.jersey_number,
      pcId: null,
    }]);
    setLocalCounts(prev => ({ ...prev, [key]: 0 }));
    setSelectedPlayerId('');
    setAddingSide(null);
  }

  async function handleAddNewPlayer() {
    if (!newFirst.trim() || !newLast.trim() || !addingSide) return;
    setSavingPlayer(true);
    try {
      const teamId = addingSide === 'home' ? game.home_team_id : game.away_team_id;
      const result = await createPlayer({
        team_id: teamId,
        first_name: newFirst.trim(),
        last_name: newLast.trim(),
        jersey_number: newJersey.trim() || undefined,
      });
      // Refresh player list
      const updated = await fetchPlayersByTeam(teamId);
      if (addingSide === 'home') setHomePlayers(updated);
      else setAwayPlayers(updated);

      // Auto-add as pitcher
      const newPlayer = updated.find(p => p.first_name === newFirst.trim() && p.last_name === newLast.trim()) || result;
      if (newPlayer) {
        const key = `${addingSide}-${newPlayer.id}`;
        setActivePitchers(prev => [...prev, {
          side: addingSide,
          playerId: newPlayer.id,
          playerName: `${newPlayer.first_name} ${newPlayer.last_name}`,
          jerseyNumber: newPlayer.jersey_number,
          pcId: null,
        }]);
        setLocalCounts(prev => ({ ...prev, [key]: 0 }));
      }
      setNewFirst(''); setNewLast(''); setNewJersey('');
      setAddingNewPlayer(false);
      setAddingSide(null);
    } catch (err) { setError(err.message); }
    finally { setSavingPlayer(false); }
  }

  function removePitcher(side, playerId) {
    setActivePitchers(prev => prev.filter(p => !(p.side === side && p.playerId === playerId)));
    setLocalCounts(prev => {
      const next = { ...prev };
      delete next[`${side}-${playerId}`];
      return next;
    });
  }

  async function handleFinalize() {
    if (!confirm('Finalize this game? This will save all pitch counts, score, and mark the game as completed.')) return;
    setSaving(true); setError(null);
    try {
      // 1. Save/update pitch counts
      for (const pitcher of activePitchers) {
        const count = getCount(pitcher.side, pitcher.playerId);
        const teamId = pitcher.side === 'home' ? game.home_team_id : game.away_team_id;
        if (pitcher.pcId) {
          await updatePitchCount(gameId, pitcher.pcId, { pitch_count: count });
        } else if (count > 0) {
          await createPitchCount(gameId, {
            player_id: pitcher.playerId,
            team_id: teamId,
            pitch_count: count,
          });
        }
      }
      // 2. Delete pitch counts for pitchers that were removed
      for (const pc of pitchCounts) {
        const side = pc.team_id === game.home_team_id ? 'home' : 'away';
        if (!activePitchers.some(p => p.pcId === pc.id || (p.side === side && p.playerId === pc.player_id))) {
          await deletePitchCount(gameId, pc.id);
        }
      }
      // 3. Update game score, innings, status
      await updateGame(gameId, {
        home_score: homeScore,
        away_score: awayScore,
        innings_played: inning,
        status: 'completed',
      });
      setFinalized(true);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleSaveProgress() {
    setSaving(true); setError(null);
    try {
      // Save pitch counts
      for (const pitcher of activePitchers) {
        const count = getCount(pitcher.side, pitcher.playerId);
        const teamId = pitcher.side === 'home' ? game.home_team_id : game.away_team_id;
        if (pitcher.pcId) {
          await updatePitchCount(gameId, pitcher.pcId, { pitch_count: count });
        } else if (count > 0) {
          const pcs = await createPitchCount(gameId, {
            player_id: pitcher.playerId,
            team_id: teamId,
            pitch_count: count,
          });
          // Update pcId so future saves do updates instead of creates
          pitcher.pcId = pcs.id;
        }
      }
      // Update game as in_progress with current score/innings
      await updateGame(gameId, {
        home_score: homeScore || null,
        away_score: awayScore || null,
        innings_played: inning,
        status: 'in_progress',
      });
      // Refresh pitch counts to get IDs
      const pcs = await fetchPitchCounts(gameId);
      setPitchCounts(pcs);
      // Update pcIds
      setActivePitchers(prev => prev.map(p => {
        const match = pcs.find(pc => pc.player_id === p.playerId && pc.team_id === (p.side === 'home' ? game.home_team_id : game.away_team_id));
        return match ? { ...p, pcId: match.id } : p;
      }));
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading game…</div>;
  if (!game) return <div className="py-8 text-center text-red-400">Game not found</div>;

  if (finalized) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center">
        <div className="bg-green-900/30 border border-green-200 rounded-xl p-6">
          <svg className="w-12 h-12 text-green-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <h2 className="text-xl font-heading font-bold text-green-300 mb-2">Game Finalized</h2>
          <p className="text-sm text-green-400 mb-1">
            {game.home_team_name} {homeScore} – {awayScore} {game.away_team_name}
          </p>
          <p className="text-xs text-green-600 mb-4">{inning} innings · {activePitchers.length} pitchers tracked</p>
          <button onClick={onBack} className={btnPrimary}>← Back</button>
        </div>
      </div>
    );
  }

  const homePitchers = activePitchers.filter(p => p.side === 'home');
  const awayPitchers = activePitchers.filter(p => p.side === 'away');
  const activePitcherIds = { home: new Set(homePitchers.map(p => p.playerId)), away: new Set(awayPitchers.map(p => p.playerId)) };
  const availableHome = homePlayers.filter(p => !activePitcherIds.home.has(p.id));
  const availableAway = awayPlayers.filter(p => !activePitcherIds.away.has(p.id));

  return (
    <div className="max-w-lg mx-auto">
      <button onClick={onBack} className={`${btnSecondary} mb-4 text-sm`}>← Back</button>

      {/* Mobile-first Scoreboard */}
      <div className="bg-gray-900 text-white rounded-xl p-3 sm:p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Live Tracker</span>
          <span className="text-xs text-gray-400">Tap + / - to update</span>
        </div>

        {/* Inn row */}
        <div className="grid grid-cols-[64px_1fr_auto_auto_auto] items-center gap-2 mb-2">
          <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Inn</div>
          <div className="text-sm font-semibold text-gray-300">Current Inning</div>
          <button
            onClick={() => setInning((i) => Math.max(1, i - 1))}
            className="h-11 w-11 rounded-lg bg-gray-700 text-white text-2xl font-bold leading-none active:scale-95 hover:bg-gray-600"
            aria-label="Decrease inning"
          >
            −
          </button>
          <div className="h-11 min-w-[44px] px-2 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-xl font-bold tabular-nums">
            {inning}
          </div>
          <button
            onClick={() => setInning((i) => i + 1)}
            className="h-11 w-11 rounded-lg bg-gray-700 text-white text-2xl font-bold leading-none active:scale-95 hover:bg-gray-600"
            aria-label="Increase inning"
          >
            +
          </button>
        </div>

        {/* Home row */}
        <div className="grid grid-cols-[64px_1fr_auto_auto_auto] items-center gap-2 mb-2">
          <div className="text-xs uppercase tracking-wide text-green-300 font-bold">Home</div>
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo
              src={game.home_logo}
              name={game.home_team_name}
              ageGroup={game.home_age_group}
              level={game.home_level}
              cityAbbr={game.home_city_abbr}
              primaryColor={game.home_primary_color}
              secondaryColor={game.home_secondary_color}
              size="w-8 h-8"
            />
            <span className="text-sm font-semibold truncate">
              {teamAbbr(game.home_team_name, game.home_city_abbr)}
            </span>
          </div>
          <button
            onClick={() => setHomeScore((s) => Math.max(0, s - 1))}
            className="h-11 w-11 rounded-lg bg-red-900/35 text-red-300 text-2xl font-bold leading-none active:scale-95 hover:bg-red-800/60"
            aria-label="Decrease home score"
          >
            −
          </button>
          <div className="h-11 min-w-[44px] px-2 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl font-bold tabular-nums">
            {homeScore}
          </div>
          <button
            onClick={() => setHomeScore((s) => s + 1)}
            className="h-11 w-11 rounded-lg bg-green-900/35 text-green-300 text-2xl font-bold leading-none active:scale-95 hover:bg-green-800/60"
            aria-label="Increase home score"
          >
            +
          </button>
        </div>

        {/* Away row */}
        <div className="grid grid-cols-[64px_1fr_auto_auto_auto] items-center gap-2">
          <div className="text-xs uppercase tracking-wide text-blue-300 font-bold">Away</div>
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo
              src={game.away_logo}
              name={game.away_team_name}
              ageGroup={game.away_age_group}
              level={game.away_level}
              cityAbbr={game.away_city_abbr}
              primaryColor={game.away_primary_color}
              secondaryColor={game.away_secondary_color}
              size="w-8 h-8"
            />
            <span className="text-sm font-semibold truncate">
              {teamAbbr(game.away_team_name, game.away_city_abbr)}
            </span>
          </div>
          <button
            onClick={() => setAwayScore((s) => Math.max(0, s - 1))}
            className="h-11 w-11 rounded-lg bg-red-900/35 text-red-300 text-2xl font-bold leading-none active:scale-95 hover:bg-red-800/60"
            aria-label="Decrease away score"
          >
            −
          </button>
          <div className="h-11 min-w-[44px] px-2 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl font-bold tabular-nums">
            {awayScore}
          </div>
          <button
            onClick={() => setAwayScore((s) => s + 1)}
            className="h-11 w-11 rounded-lg bg-green-900/35 text-green-300 text-2xl font-bold leading-none active:scale-95 hover:bg-green-800/60"
            aria-label="Increase away score"
          >
            +
          </button>
        </div>
      </div>

      {/* Pitch Tracking Sections */}
      <PitcherSection
        label="Home Pitchers"
        side="home"
        pitchers={homePitchers}
        getCount={getCount}
        adjustCount={adjustCount}
        removePitcher={removePitcher}
        onAddPitcher={() => { setAddingSide('home'); setSelectedPlayerId(''); setAddingNewPlayer(false); }}
        teamColor={game.home_primary_color}
      />

      <PitcherSection
        label="Away Pitchers"
        side="away"
        pitchers={awayPitchers}
        getCount={getCount}
        adjustCount={adjustCount}
        removePitcher={removePitcher}
        onAddPitcher={() => { setAddingSide('away'); setSelectedPlayerId(''); setAddingNewPlayer(false); }}
        teamColor={game.away_primary_color}
      />

      {/* Add pitcher modal */}
      {addingSide && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-gray-800 rounded-t-xl sm:rounded-xl shadow-xl w-full max-w-md p-5 sm:p-6">
            <h3 className="text-lg font-heading font-bold text-white mb-3">
              Add {addingSide === 'home' ? 'Home' : 'Away'} Pitcher
            </h3>

            {!addingNewPlayer ? (
              <>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Select Player</label>
                <select className={inputCls} value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>
                  <option value="">Choose a player…</option>
                  {(addingSide === 'home' ? availableHome : availableAway).map(p => (
                    <option key={p.id} value={p.id}>
                      #{p.jersey_number || '?'} {p.first_name} {p.last_name}
                    </option>
                  ))}
                </select>

                <div className="flex gap-3 mt-4">
                  <button onClick={handleAddPitcher} disabled={!selectedPlayerId} className={btnPrimary}>Add</button>
                  <button onClick={() => setAddingSide(null)} className={btnSecondary}>Cancel</button>
                </div>

                <div className="border-t border-gray-700 mt-4 pt-3">
                  <button onClick={() => setAddingNewPlayer(true)} className="text-sm text-blue-400 hover:text-blue-200 font-medium">
                    + Add new player to roster
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">First Name *</label>
                      <input className={inputCls} value={newFirst} onChange={e => setNewFirst(e.target.value)} placeholder="First" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Last Name *</label>
                      <input className={inputCls} value={newLast} onChange={e => setNewLast(e.target.value)} placeholder="Last" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Jersey #</label>
                    <input className={inputCls} value={newJersey} onChange={e => setNewJersey(e.target.value)} placeholder="Optional" />
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <button onClick={handleAddNewPlayer} disabled={!newFirst.trim() || !newLast.trim() || savingPlayer} className={btnPrimary}>
                    {savingPlayer ? 'Adding…' : 'Add & Track'}
                  </button>
                  <button onClick={() => setAddingNewPlayer(false)} className={btnSecondary}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}

      {/* Action buttons */}
      <div className="flex flex-col gap-2 mt-6 mb-8">
        <button onClick={handleSaveProgress} disabled={saving} className="w-full px-4 py-3 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-60 transition-colors">
          {saving ? 'Saving…' : 'Save Progress'}
        </button>
        <button onClick={handleFinalize} disabled={saving} className="w-full px-4 py-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 disabled:opacity-60 transition-colors">
          {saving ? 'Saving…' : '✓ Finalize Game'}
        </button>
      </div>
    </div>
  );
}

/* ── Pitcher Section ── */
function PitcherSection({ label, side, pitchers, getCount, adjustCount, removePitcher, onAddPitcher, teamColor }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-heading font-bold uppercase tracking-wide" style={{ color: teamColor || '#9ca3af' }}>{label}</h3>
        <button onClick={onAddPitcher} className="text-xs font-semibold text-blue-400 hover:text-blue-200">
          + Add Pitcher
        </button>
      </div>

      {pitchers.length === 0 ? (
        <div className="bg-gray-900 rounded-lg p-4 text-center text-sm text-gray-400">
          No pitchers tracked yet. Tap "+ Add Pitcher" to start.
        </div>
      ) : (
        <div className="space-y-2">
          {pitchers.map(p => {
            const count = getCount(p.side, p.playerId);
            return (
              <div key={`${p.side}-${p.playerId}`}
                className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center gap-3">
                {/* Player info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {p.jerseyNumber != null && <span className="text-gray-400 mr-1">#{p.jerseyNumber}</span>}
                    {p.playerName}
                  </div>
                </div>

                {/* Pitch counter */}
                <div className="flex items-center gap-0 shrink-0">
                  <button
                    onClick={() => adjustCount(p.side, p.playerId, -1)}
                    className="w-12 h-12 rounded-l-lg bg-red-900/35 text-red-300 text-2xl font-bold leading-none hover:bg-red-800/60 active:scale-95 transition-colors select-none"
                    aria-label="Decrease pitch count"
                  >
                    −
                  </button>
                  <div className="w-16 h-12 bg-gray-800 flex items-center justify-center text-xl font-bold tabular-nums">
                    {count}
                  </div>
                  <button
                    onClick={() => adjustCount(p.side, p.playerId, 1)}
                    className="w-12 h-12 rounded-r-lg bg-green-900/35 text-green-300 text-2xl font-bold leading-none hover:bg-green-800/60 active:scale-95 transition-colors select-none"
                    aria-label="Increase pitch count"
                  >
                    +
                  </button>
                </div>

                {/* Remove */}
                <button
                  onClick={() => removePitcher(p.side, p.playerId)}
                  className="p-2.5 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                  title="Remove pitcher"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
