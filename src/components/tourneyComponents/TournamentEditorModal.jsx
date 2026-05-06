// This allows an admin to edit the tourney.

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  updateTournament, updateTournamentRound,
  assignTournamentMatch, advanceTournamentMatch, undoCreateGame, resizeTournament,
  fetchTeams, addTournamentTeam, removeTournamentTeam,
} from '../../api/index.js';
import { Button, Modal, Input, Select } from '../ui/index.js';
import TeamLogo from '../TeamLogo.jsx';
import { STALE } from '../../lib/queryConfig.js';
import { TrashIcon, MagnifyingGlassIcon, PlusIcon } from '../ui/icons.jsx';

const TAB_ITEMS = [
  { key: 'info', label: 'Info' },
  { key: 'teams', label: 'Teams' },
  { key: 'rounds', label: 'Rounds' },
  { key: 'matchups', label: 'Matchups' },
];

export default function TournamentEditorModal({ tournament, tournamentId, teams, rounds, onClose, onCreateGame }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('info');

  return (
    <Modal open onClose={onClose} title="Edit Tournament" size="lg">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-900 rounded-lg mb-4">
        {TAB_ITEMS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-sm font-semibold py-1.5 rounded-md transition-colors ${tab === t.key
              ? 'bg-slate-700 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <InfoTab tournament={tournament} tournamentId={tournamentId} queryClient={queryClient} />
      )}
      {tab === 'teams' && (
        <TeamsTab tournament={tournament} tournamentId={tournamentId} teams={teams} queryClient={queryClient} />
      )}
      {tab === 'rounds' && (
        <RoundsTab rounds={rounds} tournamentId={tournamentId} queryClient={queryClient} />
      )}
      {tab === 'matchups' && (
        <MatchupsTab
          rounds={rounds}
          teams={teams}
          tournamentId={tournamentId}
          queryClient={queryClient}
          onCreateGame={onCreateGame}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

// ── Info Tab ─────────────────────────────────────────────────────────────────
function InfoTab({ tournament, tournamentId, queryClient }) {
  const [form, setForm] = useState({
    name: tournament.name || '',
    description: tournament.description || '',
    start_date: tournament.start_date || '',
    end_date: tournament.end_date || '',
  });
  const [teamCount, setTeamCount] = useState(tournament.team_count || 4);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const updateMut = useMutation({
    mutationFn: (data) => updateTournament(tournamentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => setErrorMsg(err.message),
  });

  const resizeMut = useMutation({
    mutationFn: (count) => resizeTournament(tournamentId, { team_count: count }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    },
    onError: (err) => setErrorMsg(err.message),
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');
    try {
      if (tournament.status === 'draft' && Number(teamCount) !== tournament.team_count) {
        if (!confirm('Changing the tournament size will permanently reset the entire bracket and all matches. Are you sure?')) return;
        await resizeMut.mutateAsync(teamCount);
      }
      await updateMut.mutateAsync({
        name: form.name.trim(),
        description: form.description.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      });
    } catch (err) {
      // errors handled by mutation callbacks
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Tournament Name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
      />
      <div>
        <label className="lh-eyebrow block mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          className="lh-input w-full"
          placeholder="Optional tournament description…"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Start Date"
          type="date"
          value={form.start_date}
          onChange={(e) => setForm({ ...form, start_date: e.target.value })}
        />
        <Input
          label="End Date"
          type="date"
          value={form.end_date}
          onChange={(e) => setForm({ ...form, end_date: e.target.value })}
        />
      </div>

      {tournament.status === 'draft' && (
        <div className="pt-2 border-t border-slate-700">
          <Input
            label="Tournament Size (Teams)"
            type="number"
            min={2}
            max={128}
            value={teamCount}
            onChange={(e) => setTeamCount(Number(e.target.value))}
          />
          <p className="text-xs text-slate-500 mt-1">Warning: Changing size will reset the bracket.</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <div>
          {saved && (
            <span className="text-emerald-400 text-xs font-semibold animate-pulse">✓ Saved</span>
          )}
          {errorMsg && (
            <span className="text-red-400 text-xs">{errorMsg}</span>
          )}
        </div>
        <Button type="submit" disabled={updateMut.isPending || resizeMut.isPending}>
          {updateMut.isPending || resizeMut.isPending ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}

// ── Teams Tab ────────────────────────────────────────────────────────────────
function TeamsTab({ tournamentId, tournament, teams, queryClient }) {
  const [search, setSearch] = useState('');
  const [tempName, setTempName] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Fetch all league teams for the searchable dropdown
  const { data: allTeams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: fetchTeams,
    staleTime: STALE.THREE_MIN,
    enabled: showSearch,
  });

  const addMut = useMutation({
    mutationFn: (data) => addTournamentTeam(tournamentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      setSearch('');
    },
  });

  const removeMut = useMutation({
    mutationFn: (ttId) => removeTournamentTeam(tournamentId, ttId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });

  // Filter search results: exclude already-added teams
  const addedTeamIds = new Set(teams.filter((t) => t.team_id).map((t) => t.team_id));
  const filteredTeams = allTeams.filter(
    (t) => !addedTeamIds.has(t.id) && (
      !search || t.name?.toLowerCase().includes(search.toLowerCase())
      || t.team_city?.toLowerCase().includes(search.toLowerCase())
      || t.team_mascot?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const atCapacity = teams.length >= tournament.team_count;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-white text-sm">
          Teams ({teams.length}/{tournament.team_count})
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column: Add teams */}
        <div>
          {!atCapacity ? (
            <div className="space-y-4">
              {/* Add existing team */}
              <div className="relative">
                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">Add League Team</label>
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-600 rounded-md px-2">
                  <MagnifyingGlassIcon className="w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search teams to add…"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setShowSearch(true); }}
                    onFocus={() => setShowSearch(true)}
                    className="flex-1 bg-transparent text-sm text-white py-1.5 outline-none placeholder:text-slate-500"
                  />
                </div>
                {showSearch && search && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-600 rounded-md shadow-xl max-h-40 overflow-y-auto scrollbar-thin">
                    {filteredTeams.length === 0 ? (
                      <p className="text-slate-500 text-xs p-2">No matching teams</p>
                    ) : (
                      filteredTeams.slice(0, 20).map((t) => (
                        <button
                          key={t.id}
                          onClick={() => { addMut.mutate({ team_id: t.id }); setShowSearch(false); }}
                          className="flex items-center gap-2 w-full px-3 py-2 hover:bg-slate-700 text-left text-sm"
                        >
                          <TeamLogo src={t.logo_url} name={t.name} size="w-5 h-5" primaryColor={t.primary_color} secondaryColor={t.secondary_color} />
                          <span className="text-slate-200 truncate">{t.name}</span>
                          {t.age_group && <span className="text-[10px] text-slate-500 ml-auto">{t.age_group}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Add temp team */}
              <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">Add Temp Team</label>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!tempName.trim()) return;
                    addMut.mutate({ temp_name: tempName.trim() });
                    setTempName('');
                  }}
                  className="flex gap-1"
                >
                  <input
                    type="text"
                    placeholder="Temp team name…"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-600 rounded-md px-2 py-1.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-action-500"
                  />
                  <Button type="submit" variant="ghost" className="text-xs px-2">
                    <PlusIcon className="w-4 h-4" />
                  </Button>
                </form>
              </div>

              {addMut.error && <p className="text-red-400 text-xs">{addMut.error.message}</p>}
            </div>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-lg text-sm text-center">
              Tournament is at capacity.
            </div>
          )}
        </div>

        {/* Right column: Added teams */}
        <div>
          <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">Tournament Teams</label>
          <div className="space-y-1 max-h-[40vh] overflow-y-auto scrollbar-thin border border-slate-700 rounded-lg p-2 bg-slate-900">
            {teams.length === 0 && <p className="text-slate-500 text-xs py-2 text-center">No teams added yet.</p>}
            {teams.map((t) => (
              <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-800 group text-sm">
                <span className="text-slate-600 text-xs w-4 text-right shrink-0">{t.seed}</span>
                <TeamLogo src={t.logo} name={t.name} size="w-5 h-5" primaryColor={t.primary_color} secondaryColor={t.secondary_color} />
                <span className="text-slate-200 truncate flex-1">{t.name}</span>
                {t.is_temp && <span className="text-[10px] text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded">TEMP</span>}
                <button
                  onClick={() => removeMut.mutate(t.id)}
                  className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Rounds Tab ───────────────────────────────────────────────────────────────
function RoundsTab({ rounds, tournamentId, queryClient }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const renameMut = useMutation({
    mutationFn: ({ roundId, name }) => updateTournamentRound(tournamentId, roundId, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      setEditingId(null);
    },
  });

  function startEdit(round) {
    setEditingId(round.id);
    setEditName(round.title);
  }

  function saveEdit() {
    if (!editName.trim()) return;
    renameMut.mutate({ roundId: editingId, name: editName.trim() });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 mb-3">Click a round name to rename it.</p>
      {rounds.map((round) => (
        <div
          key={round.id}
          className="flex items-center gap-3 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
        >
          <span className="text-xs text-slate-500 w-6 text-right shrink-0">R{round.round_number}</span>
          {editingId === round.id ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                autoFocus
                className="flex-1 bg-slate-800 border border-action-500 rounded px-2 py-1 text-sm text-white outline-none"
              />
              <Button variant="ghost" className="text-xs px-2" onClick={saveEdit} disabled={renameMut.isPending}>
                {renameMut.isPending ? '…' : '✓'}
              </Button>
              <Button variant="ghost" className="text-xs px-2 text-slate-400" onClick={() => setEditingId(null)}>
                ✕
              </Button>
            </div>
          ) : (
            <button
              onClick={() => startEdit(round)}
              className="flex-1 text-left text-sm text-slate-200 hover:text-white transition-colors"
            >
              {round.title}
            </button>
          )}
          <span className="text-xs text-slate-600">{round.matches.length} matches</span>
        </div>
      ))}
      {renameMut.error && (
        <p className="text-red-400 text-xs mt-2">{renameMut.error.message}</p>
      )}
    </div>
  );
}

// ── Matchups Tab ─────────────────────────────────────────────────────────────
function MatchupsTab({ rounds, teams, tournamentId, queryClient, onCreateGame, onClose }) {
  const assignMut = useMutation({
    mutationFn: ({ matchId, data }) => assignTournamentMatch(tournamentId, matchId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });

  const advanceMut = useMutation({
    mutationFn: ({ matchId, teamId }) => advanceTournamentMatch(tournamentId, matchId, { tournament_team_id: teamId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });

  const undoMut = useMutation({
    mutationFn: (matchId) => undoCreateGame(tournamentId, matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });

  function handleSlotChange(match, slot, tournamentTeamId) {
    assignMut.mutate({
      matchId: match.id,
      data: { tournament_team_id: tournamentTeamId || null, slot },
    });
  }

  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
      {rounds.map((round) => (
        <div key={round.id}>
          <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">
            {round.title}
          </h4>
          <div className="space-y-2">
            {round.matches.map((match) => {
              if (match.is_bye) return null;
              const teamA = match.teams[0];
              const teamB = match.teams[1];
              const hasLinkedGame = !!match.linked_game_id;
              const hasWinner = !!match.winnerId;

              // Status indicator
              let statusBadge = null;
              if (hasWinner) {
                statusBadge = <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-semibold">Complete</span>;
              } else if (hasLinkedGame) {
                statusBadge = <span className="text-[10px] bg-action-500/20 text-action-400 border border-action-500/30 px-1.5 py-0.5 rounded-full font-semibold">Game Created</span>;
              } else if (match.can_create_game) {
                statusBadge = <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full font-semibold">Ready</span>;
              }

              return (
                <div
                  key={match.id}
                  className="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Match #{match.match_number}</span>
                    {statusBadge}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Team A slot */}
                    <MatchSlot
                      label="Team A (Home)"
                      team={teamA}
                      allTeams={teams}
                      disabled={hasWinner || hasLinkedGame}
                      onChange={(ttId) => handleSlotChange(match, 'a', ttId)}
                    />
                    {/* Team B slot */}
                    <MatchSlot
                      label="Team B (Away)"
                      team={teamB}
                      allTeams={teams}
                      disabled={hasWinner || hasLinkedGame}
                      onChange={(ttId) => handleSlotChange(match, 'b', ttId)}
                    />
                  </div>

                  {/* Finalize button */}
                  {match.can_create_game && (
                    <Button
                      variant="ghost"
                      className="w-full text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 hover:border-emerald-500/40"
                      onClick={() => {
                        onCreateGame?.(match);
                        onClose();
                      }}
                    >
                      ⚡ Finalize Matchup
                    </Button>
                  )}

                  {/* Undo Matchup / Delete Game button */}
                  {hasLinkedGame && !hasWinner && (
                    <Button
                      variant="ghost"
                      className="w-full text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40"
                      onClick={() => {
                        if (confirm('Undo this matchup? This will clear any scheduled dates and times.')) {
                          undoMut.mutate(match.id);
                        }
                      }}
                      disabled={undoMut.isPending}
                    >
                      {undoMut.isPending ? 'Undoing...' : '🗑️ Undo / Delete Matchup'}
                    </Button>
                  )}

                  {/* Bye button */}
                  {(!teamA || !teamB) && (teamA || teamB) && !hasWinner && !hasLinkedGame && (
                    <Button
                      variant="ghost"
                      className="w-full text-xs text-slate-400 hover:text-slate-300 border border-slate-700/50 hover:border-slate-600"
                      onClick={() => {
                        const teamId = teamA?.id || teamB?.id;
                        if (confirm('Mark this match as a Bye and automatically advance the team?')) {
                          advanceMut.mutate({ matchId: match.id, teamId });
                        }
                      }}
                      disabled={advanceMut.isPending}
                    >
                      {advanceMut.isPending ? 'Advancing...' : '⏩ Mark as Bye (Advance Team)'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {assignMut.error && (
        <p className="text-red-400 text-xs">{assignMut.error.message}</p>
      )}
    </div>
  );
}

// ── Match Slot (team selector for a single side) ─────────────────────────────
function MatchSlot({ label, team, allTeams, disabled, onChange }) {
  return (
    <div>
      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">{label}</label>
      <select
        value={team?.id || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`lh-select text-xs w-full ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <option value="">— TBD —</option>
        {allTeams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      {team && (
        <div className="flex items-center gap-1.5 mt-1">
          <TeamLogo
            src={team.logo}
            name={team.name}
            primaryColor={team.primary_color}
            secondaryColor={team.secondary_color}
            size="w-4 h-4"
          />
          <span className="text-xs text-slate-300 truncate">{team.name}</span>
          {team.is_temp && <span className="text-[9px] text-yellow-500 bg-yellow-500/10 px-1 rounded">TEMP</span>}
        </div>
      )}
    </div>
  );
}
