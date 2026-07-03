// This is supposed to be the logic for the tournament page. When someone cicks on a tournament, this is the 
// view that they will see. All data comes into this component, passed into children for rendering updates.
// 
// It has three top level components currently:
//
// 1. The TournamentBracket Component, which renders the bracket.
// ***Review*** 2. The TournamentGameDetail Component which is the main view for the game details. I don't know if this needs to be rendered
// from here. Could likely be something that the router could handle. 

// 3. The TournamentEditorModal Component which is the main view for the tournament editor. 

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTournament, fetchTeams, fetchLocations,
  fetchTournamentPools,
  assignTournamentMatch, scheduleTournamentMatch,
  updateTournament, createTournamentGame, resetTournamentMatch, resetTournamentRound,
} from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { STALE } from '../../lib/queryConfig.js';
import { Button, Modal, Input, Select } from '../ui/index.js';
import { ChevronLeftIcon, CalendarIcon } from '../ui/icons.jsx';
import TournamentBracket from './TournamentBracket.jsx';
import TeamLogo from '../TeamLogo.jsx';
import GameDetail from '../GameDetail.jsx';
import TournamentEditorModal from './TournamentEditorModal.jsx';

const FORMAT_LABELS = { single_elimination: 'Single Elimination', double_elimination: 'Double Elimination' };
const STATUS_COLORS = {
  draft: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  completed: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function TournamentSchedule({ tournamentId, onBack, onNavigateToTeam, onNavigateToFields }) {
  const queryClient = useQueryClient();
  const { isAdmin, isOrgAdmin } = useAuth();
  const canManage = isAdmin || isOrgAdmin;

  // ── UI state ─────────────────────────────────────────────
  const [selectedGameId, setSelectedGameId] = useState(null); // When a match is clicked
  const [showEditor, setShowEditor] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // ── Data fetching ──────────────────────────────────────────
  const { data, isLoading, error } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => fetchTournament(tournamentId),
    staleTime: STALE.THIRTY_SEC,
    refetchInterval: 15000,
    refetchOnMount: 'always',
    enabled: !!tournamentId,
  });

  const tournament = data?.tournament;
  const teams = data?.teams || [];
  const rounds = data?.rounds || [];

  const { data: tournamentPools = [] } = useQuery({
    queryKey: ['tournament-pools', tournamentId],
    queryFn: () => fetchTournamentPools(tournamentId),
    staleTime: STALE.THIRTY_SEC,
    refetchInterval: 15000,
    enabled: !!tournamentId,
  });

  // ── Transform API data → bracketData for TournamentBracket ──
  const bracketData = useMemo(() => {
    if (!rounds.length) return [];
    return rounds.map((round) => ({
      title: round.title,
      matches: round.matches.map((m) => ({
        id: m.id,
        match_number: m.match_number,
        title: m.is_bye ? 'BYE' : (m.game?.status === 'pending' && !m.game?.game_date ? 'TBD' : null),
        teams: m.teams,
        winnerId: m.winnerId,
        game: m.game,
        linked_game_id: m.game?.id,
        _matchData: m, // pass through for admin actions
      })),
    }));
  }, [rounds]);

  const [slottingMatch, setSlottingMatch] = useState(null);

  function handleSlotClick(match, slot) {
    if (!canManage) return;
    setSlottingMatch({ match, slot });
  }

  function handleMatchClick(match) {
    if (match.game?.id) {
      setSelectedGameId(match.game.id);
    }
  }

  // ── Finalize matchup → create game ────────────────────
  async function handleCreateGame(match) {
    try {
      await createTournamentGame(tournamentId, match.id);
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    } catch (err) {
      alert(err.message || 'Cannot create game for this matchup');
    }
  }

  if (!tournamentId) return <div className="text-slate-400 p-8">No tournament selected.</div>;
  if (isLoading) return <div className="text-slate-400 p-8 text-center">Loading tournament…</div>;
  if (error) return <div className="text-red-400 p-8">Error loading tournament: {error.message}</div>;
  if (!tournament) return <div className="text-slate-400 p-8">Tournament not found.</div>;

  // Render game detail inline if selected
  if (selectedGameId) {
    return (
      <GameDetail
        gameId={selectedGameId}
        canManage={canManage}
        onBack={() => setSelectedGameId(null)}
        onNavigateToTeam={onNavigateToTeam}
        onNavigateToFields={onNavigateToFields}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors p-1">
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-display font-bold text-white truncate">{tournament.name}</h1>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${STATUS_COLORS[tournament.status] || ''}`}>
              {tournament.status}
            </span>
            <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded-md">
              {FORMAT_LABELS[tournament.format]}
            </span>
            <span className="text-xs text-slate-500">{teams.length}/{tournament.team_count} teams</span>
          </div>
          {tournament.description && <p className="text-slate-500 text-sm mt-1 truncate">{tournament.description}</p>}
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-xs whitespace-nowrap bg-slate-800/50 hover:bg-slate-700">
              {isSidebarOpen ? 'Hide Scheduler' : 'Show Scheduler'}
            </Button>
            <Button variant="ghost" onClick={() => setShowEditor(true)} className="text-xs whitespace-nowrap">
              ✏️ Edit
            </Button>
            <StatusToggle tournament={tournament} tournamentId={tournamentId} queryClient={queryClient} />
          </div>
        )}
      </div>

      {/* Main content: bracket + admin sidebar */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Bracket */}
        <div className="flex-1 min-w-0">
          <TournamentBracket
            bracketName={tournament.name}
            bracketData={bracketData}
            onMatchClick={handleMatchClick}
            onNavigateToTeam={onNavigateToTeam}
            onNavigateToFields={onNavigateToFields}
            onSlotClick={canManage ? handleSlotClick : undefined}
          />
        </div>

        {/* Admin sidebar */}
        {canManage && isSidebarOpen && (
          <aside className="w-full lg:w-80 shrink-0 space-y-4">
            <MatchScheduler
              tournamentId={tournamentId}
              rounds={rounds}
              teams={teams}
              pools={tournamentPools}
              queryClient={queryClient}
              onCreateGame={handleCreateGame}
              onOpenGame={(gameId) => setSelectedGameId(gameId)}
            />
          </aside>
        )}
      </div>

      {slottingMatch && (
        <SlotTeamModal
          tournamentId={tournamentId}
          match={slottingMatch.match}
          slot={slottingMatch.slot}
          teams={teams}
          queryClient={queryClient}
          onClose={() => setSlottingMatch(null)}
        />
      )}



      {/* Tournament Editor Modal */}
      {showEditor && (
        <TournamentEditorModal
          tournament={tournament}
          tournamentId={tournamentId}
          teams={teams}
          rounds={rounds}
          onClose={() => setShowEditor(false)}
          onCreateGame={handleCreateGame}
        />
      )}
    </div>
  );
}

// ── Status Toggle ────────────────────────────────────────────────────────────
function StatusToggle({ tournament, tournamentId, queryClient }) {
  const nextStatus = {
    draft: 'active',
    active: 'completed',
    completed: 'active',
    cancelled: 'draft',
  };
  const nextLabel = {
    draft: 'Start',
    active: 'Complete',
    completed: 'Reopen',
    cancelled: 'Reactivate',
  };
  const next = nextStatus[tournament.status];

  const toggleMut = useMutation({
    mutationFn: (newStatus) => updateTournament(tournamentId, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });

  const handleToggle = () => {
    if (next === 'draft') {
      if (!confirm('This will revert the tournament to draft mode. Are you sure?')) return;
    }
    toggleMut.mutate(next);
  };

  return (
    <div className="flex items-center gap-2">
      {tournament.status === 'active' && (
        <Button variant="secondary" onClick={() => {
          if (confirm('Revert the tournament to draft mode?')) toggleMut.mutate('draft');
        }} disabled={toggleMut.isPending} className="text-xs whitespace-nowrap text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10">
          Revert to Draft
        </Button>
      )}
      <Button variant="ghost" onClick={handleToggle} disabled={toggleMut.isPending} className="text-xs whitespace-nowrap">
        {toggleMut.isPending ? 'Updating…' : (nextLabel[tournament.status] || 'Update')}
      </Button>
    </div>
  );
}



// ── Match Scheduler Panel ────────────────────────────────────────────────────
function MatchScheduler({ tournamentId, rounds, teams, pools, queryClient, onCreateGame, onOpenGame }) {
  const [selectedMatch, setSelectedMatch] = useState(null);

  // Flatten all matches for the list
  const allMatches = useMemo(() => {
    return rounds.flatMap((round) =>
      round.matches.map((m) => ({ ...m, roundTitle: round.title }))
    );
  }, [rounds]);

  // Only show unscheduled, non-bye matches that have at least one team
  const unscheduled = allMatches.filter(
    (m) => !m.is_bye && m.game?.status === 'pending' && !m.game?.game_date && (m.teams[0] || m.teams[1])
  );

  // Matches ready for finalization (both teams assigned, no linked game, no winner)
  const finalizeable = allMatches.filter((m) => m.can_create_game);

  const poolGames = useMemo(() => {
    const items = (pools || []).flatMap((pool) =>
      (pool.pool_matches || []).map((pm) => ({
        id: pm.id,
        poolName: pool.name,
        roundNumber: pm.round_number,
        matchNumber: pm.match_number,
        teamA: pm.team_a?.name || 'TBD',
        teamB: pm.team_b?.name || 'TBD',
        game: pm.game || null,
      }))
    );

    return items.sort((a, b) => {
      const ad = a.game?.game_date || '';
      const bd = b.game?.game_date || '';
      if (ad !== bd) return ad.localeCompare(bd);
      const at = a.game?.game_time || '';
      const bt = b.game?.game_time || '';
      if (at !== bt) return at.localeCompare(bt);
      if (a.poolName !== b.poolName) return a.poolName.localeCompare(b.poolName);
      if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber;
      return a.matchNumber - b.matchNumber;
    });
  }, [pools]);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <h3 className="font-heading font-semibold text-white text-sm mb-3 flex items-center gap-2">
        <CalendarIcon className="w-4 h-4 text-action-400" /> Schedule Matches
      </h3>

      {/* Finalize matchups section */}
      {finalizeable.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider mb-1.5">Ready to Create Game</p>
          <div className="space-y-1 max-h-36 overflow-y-auto scrollbar-thin">
            {finalizeable.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-2 py-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-xs">
                <span className="text-slate-300 truncate flex-1">
                  {m.teams[0]?.name} vs {m.teams[1]?.name}
                </span>
                <Button
                  variant="ghost"
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 px-2 py-0.5"
                  onClick={() => onCreateGame?.(m)}
                >
                  Create Game
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {unscheduled.length === 0 && finalizeable.length === 0 ? (
        <p className="text-slate-500 text-xs py-2">All eligible matches are scheduled.</p>
      ) : unscheduled.length > 0 ? (
        <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
          {unscheduled.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedMatch(m)}
              className="flex items-center justify-between w-full px-2 py-1.5 rounded-md hover:bg-slate-700/50 text-left text-xs"
            >
              <span className="text-slate-400">{m.roundTitle} #{m.match_number}</span>
              <span className="text-slate-200 truncate max-w-[60%] text-right">
                {m.teams[0]?.name || 'TBD'} vs {m.teams[1]?.name || 'TBD'}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Rounds with results (resettable) */}
      <div className="mt-4 pt-4 border-t border-slate-700">
        <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Results</h4>
        <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
          {rounds.map(r => {
            const hasResults = r.matches.some(m => m.winnerId);
            if (!hasResults) return null;
            return (
              <div key={r.id} className="bg-slate-900 rounded border border-slate-700 p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-300">{r.title}</span>
                  <Button variant="ghost" className="text-[10px] text-red-400 hover:text-red-300 px-1 py-0.5 h-auto" onClick={async () => {
                    if (confirm(`Reset all matches in ${r.title}? This will clear scores and reverse advancements.`)) {
                      try {
                        await resetTournamentRound(tournamentId, r.id);
                        queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
                        queryClient.invalidateQueries({ queryKey: ['tournaments'] });
                      } catch (err) { alert(err.message); }
                    }
                  }}>Reset Round</Button>
                </div>
                <div className="space-y-1">
                  {r.matches.filter(m => m.winnerId).map(m => (
                    <div key={m.id} className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-500 truncate">Match {m.match_number}</span>
                      <Button variant="ghost" className="text-red-400 hover:text-red-300 p-0 h-auto underline" onClick={async () => {
                        if (confirm(`Reset match #${m.match_number}?`)) {
                          try {
                            await resetTournamentMatch(tournamentId, m.id);
                            queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
                            queryClient.invalidateQueries({ queryKey: ['tournaments'] });
                          } catch (err) { alert(err.message); }
                        }
                      }}>Reset Match</Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pool play games */}
      <div className="mt-4 pt-4 border-t border-slate-700">
        <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Pool Play Games</h4>
        {poolGames.length === 0 ? (
          <p className="text-slate-500 text-xs py-1">No pool-play games found yet.</p>
        ) : (
          <div className="space-y-1 max-h-56 overflow-y-auto scrollbar-thin">
            {poolGames.map((pg) => (
              <button
                key={pg.id}
                className="w-full text-left rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 hover:bg-slate-800/70"
                onClick={() => pg.game?.id && onOpenGame?.(pg.game.id)}
                disabled={!pg.game?.id}
              >
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>{pg.poolName} · R{pg.roundNumber} M{pg.matchNumber}</span>
                  <span className="uppercase">{pg.game?.status || 'unscheduled'}</span>
                </div>
                <div className="text-xs text-slate-200 truncate">{pg.teamA} vs {pg.teamB}</div>
                <div className="text-[10px] text-slate-500">
                  {pg.game?.game_date || 'Date TBD'}{pg.game?.game_time ? ` ${pg.game.game_time}` : ''}
                  {pg.game?.location_name ? ` · ${pg.game.location_name}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedMatch && (
        <ScheduleModal
          tournamentId={tournamentId}
          tournamentOrgId={tournament?.org_id}
          match={selectedMatch}
          defaultLocationId={tournament?.location_id || ''}
          queryClient={queryClient}
          onClose={() => setSelectedMatch(null)}
        />
      )}
    </div>
  );
}

// ── Schedule Modal ───────────────────────────────────────────────────────────
function ScheduleModal({ tournamentId, tournamentOrgId, match, defaultLocationId, queryClient, onClose }) {
  const [form, setForm] = useState({ game_date: '', game_time: '', location_id: defaultLocationId || '' });
  const [error, setError] = useState('');

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', tournamentOrgId],
    queryFn: () => fetchLocations(tournamentOrgId),
    staleTime: STALE.HOUR,
    enabled: !!tournamentOrgId,
  });

  const scheduleMut = useMutation({
    mutationFn: (data) => scheduleTournamentMatch(tournamentId, match.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      onClose();
    },
    onError: (err) => setError(err.message || 'Failed to schedule'),
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.game_date) return setError('Date is required');
    setError('');
    scheduleMut.mutate(form);
  }

  return (
    <Modal onClose={onClose} title={`Schedule: ${match.roundTitle} #${match.match_number}`} size="sm">
      <div className="text-sm text-slate-300 mb-3">
        {match.teams[0]?.name || 'TBD'} vs {match.teams[1]?.name || 'TBD'}
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="Date"
          type="date"
          value={form.game_date}
          onChange={(e) => setForm({ ...form, game_date: e.target.value })}
          required
        />
        <Input
          label="Time"
          type="time"
          value={form.game_time}
          onChange={(e) => setForm({ ...form, game_time: e.target.value })}
        />
        <Select
          label="Field / Location"
          value={form.location_id}
          onChange={(e) => setForm({ ...form, location_id: e.target.value })}
        >
          <option value="">Select location…</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ''}</option>
          ))}
        </Select>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={scheduleMut.isPending}>
            {scheduleMut.isPending ? 'Saving…' : 'Schedule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Slot Team Modal ───────────────────────────────────────────────────────────
function SlotTeamModal({ tournamentId, match, slot, teams, queryClient, onClose }) {
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [error, setError] = useState('');

  const assignMut = useMutation({
    mutationFn: (data) => assignTournamentMatch(tournamentId, match.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      onClose();
    },
    onError: (err) => setError(err.message || 'Failed to assign team'),
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!selectedTeamId) return setError('Please select a team');
    setError('');
    assignMut.mutate({ tournament_team_id: selectedTeamId, slot });
  }

  return (
    <Modal open onClose={onClose} title={`Assign Team to Match`} size="sm">
      <div className="text-sm text-slate-300 mb-3">
        Select a team to fill this empty slot.
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Select
          label="Team"
          value={selectedTeamId}
          onChange={(e) => setSelectedTeamId(e.target.value)}
        >
          <option value="">Select team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={assignMut.isPending}>
            {assignMut.isPending ? 'Saving…' : 'Assign'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
