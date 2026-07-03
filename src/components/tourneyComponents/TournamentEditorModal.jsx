// This allows an admin to edit the tourney.

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  updateTournament, updateTournamentRound,
  assignTournamentMatch, advanceTournamentMatch, undoCreateGame, resizeTournament,
  fetchTeams, addTournamentTeam, removeTournamentTeam, fetchLocations,
  fetchTournamentPools, createTournamentPool, updateTournamentPool, deleteTournamentPool,
  autoBalanceTournamentPools, assignTournamentPoolTeam, removeTournamentPoolTeam,
  generatePoolRoundRobin, fetchPoolStandings,
  previewBracketSeeds, generateBracketFromPools,
} from '../../api/index.js';
import { Button, Modal, Input, Select } from '../ui/index.js';
import TeamLogo from '../TeamLogo.jsx';
import { STALE } from '../../lib/queryConfig.js';
import { TrashIcon, MagnifyingGlassIcon, PlusIcon } from '../ui/icons.jsx';

const TAB_ITEMS = [
  { key: 'info', label: 'Info' },
  { key: 'teams', label: 'Teams' },
  { key: 'pools', label: 'Pools' },
  { key: 'seeding', label: 'Seeding' },
  { key: 'rounds', label: 'Rounds' },
  { key: 'matchups', label: 'Matchups' },
];

function formatPoolGameDate(dateStr) {
  if (!dateStr) return 'Date TBD';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatPoolGameTime(timeStr) {
  if (!timeStr) return 'TBD';
  const [h, m] = String(timeStr).split(':').map(Number);
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

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
      {tab === 'pools' && (
        <PoolsTab tournamentId={tournamentId} teams={teams} queryClient={queryClient} />
      )}
      {tab === 'seeding' && (
        <BracketSeedingTab tournamentId={tournamentId} teams={teams} queryClient={queryClient} />
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
    location_id: tournament.location_id || '',
    location_notes: tournament.location_notes || '',
    registration_open: tournament.registration_open ?? true,
    registration_deadline: tournament.registration_deadline || '',
    entry_fee: tournament.entry_fee != null ? String(tournament.entry_fee) : '',
    max_registrations: tournament.max_registrations != null ? String(tournament.max_registrations) : '',
    pitch_limit_mode: tournament.pitch_limit_mode || 'league_default',
    pitch_limit_per_day: tournament.pitch_limit_per_day != null ? String(tournament.pitch_limit_per_day) : '',
    pitch_limit_per_tournament: tournament.pitch_limit_per_tournament != null ? String(tournament.pitch_limit_per_tournament) : '',
  });
  const [teamCount, setTeamCount] = useState(tournament.team_count || 4);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', tournament.org_id],
    queryFn: () => fetchLocations(tournament.org_id),
    staleTime: STALE.THREE_MIN,
    enabled: !!tournament.org_id,
  });

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
        location_id: form.location_id ? Number(form.location_id) : null,
        location_notes: form.location_notes.trim() || null,
        registration_open: form.registration_open,
        registration_deadline: form.registration_deadline || null,
        entry_fee: form.entry_fee !== '' ? Number(form.entry_fee) : null,
        max_registrations: form.max_registrations !== '' ? Number(form.max_registrations) : null,
        pitch_limit_mode: form.pitch_limit_mode,
        pitch_limit_per_day: form.pitch_limit_per_day !== '' ? Number(form.pitch_limit_per_day) : null,
        pitch_limit_per_tournament: form.pitch_limit_per_tournament !== '' ? Number(form.pitch_limit_per_tournament) : null,
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

      {/* Location */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="lh-eyebrow block mb-1">Location</label>
          <select
            value={form.location_id}
            onChange={(e) => setForm({ ...form, location_id: e.target.value })}
            className="lh-select w-full"
          >
            <option value="">— None —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ''}</option>
            ))}
          </select>
        </div>
        <Input
          label="Location Notes"
          value={form.location_notes}
          onChange={(e) => setForm({ ...form, location_notes: e.target.value })}
          placeholder="Field complex, parking info…"
        />
      </div>

      {/* Registration settings */}
      <div className="pt-2 border-t border-slate-700 space-y-3">
        <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Registration</h4>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.registration_open}
              onChange={(e) => setForm({ ...form, registration_open: e.target.checked })}
              className="w-4 h-4 rounded accent-action-500"
            />
            <span className="text-sm text-slate-200">Registration Open</span>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Registration Deadline"
            type="date"
            value={form.registration_deadline}
            onChange={(e) => setForm({ ...form, registration_deadline: e.target.value })}
          />
          <Input
            label="Entry Fee ($)"
            type="number"
            min="0"
            step="0.01"
            value={form.entry_fee}
            onChange={(e) => setForm({ ...form, entry_fee: e.target.value })}
            placeholder="0.00"
          />
          <Input
            label="Max Registrations"
            type="number"
            min="1"
            value={form.max_registrations}
            onChange={(e) => setForm({ ...form, max_registrations: e.target.value })}
            placeholder="No limit"
          />
        </div>
      </div>

      <div className="pt-2 border-t border-slate-700 space-y-3">
        <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Tournament Pitch Limits</h4>
        <Select
          label="Pitch Rule Mode"
          value={form.pitch_limit_mode}
          onChange={(e) => setForm({ ...form, pitch_limit_mode: e.target.value })}
        >
          <option value="league_default">Use League Age Group Rules</option>
          <option value="tournament_custom">Use Tournament Custom Limits</option>
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Per-Day Pitch Limit"
            type="number"
            min="1"
            value={form.pitch_limit_per_day}
            onChange={(e) => setForm({ ...form, pitch_limit_per_day: e.target.value })}
            placeholder={form.pitch_limit_mode === 'tournament_custom' ? 'Required for custom mode' : 'Optional override'}
          />
          <Input
            label="Per-Tournament Pitch Limit"
            type="number"
            min="1"
            value={form.pitch_limit_per_tournament}
            onChange={(e) => setForm({ ...form, pitch_limit_per_tournament: e.target.value })}
            placeholder="Optional"
          />
        </div>
        <p className="text-xs text-slate-500">
          Tournament total limit applies across all games in this tournament for each player.
        </p>
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

// ── Bracket Seeding Tab ──────────────────────────────────────────────────────
function nearestPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

function BracketSeedingTab({ tournamentId, teams, queryClient }) {
  const [seedingMode, setSeedingMode] = useState('global_rank');
  const [qualifiersPerPool, setQualifiersPerPool] = useState(2);
  const [overrides, setOverrides] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');

  const previewQuery = useQuery({
    queryKey: ['bracket-seeds-preview', tournamentId, seedingMode, qualifiersPerPool],
    queryFn: () => previewBracketSeeds(tournamentId, {
      seeding_mode: seedingMode,
      qualifiers_per_pool: seedingMode === 'fixed_qualifiers_per_pool' ? qualifiersPerPool : undefined,
    }),
    staleTime: STALE.THIRTY_SEC,
    retry: false,
  });

  const generateMut = useMutation({
    mutationFn: () => generateBracketFromPools(tournamentId, {
      seeding_mode: seedingMode,
      qualifiers_per_pool: seedingMode === 'fixed_qualifiers_per_pool' ? qualifiersPerPool : undefined,
      seed_overrides: Object.entries(overrides)
        .filter(([, ttId]) => ttId)
        .map(([seed, ttId]) => ({ bracket_seed: Number(seed), tournament_team_id: Number(ttId) })),
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['bracket-seeds-preview', tournamentId] });
      setConfirmed(false);
      setOverrides({});
      setDoneMsg(`✓ Bracket seeded — ${data.qualifiers_seeded} teams, ${data.bye_count} bye${data.bye_count !== 1 ? 's' : ''}.`);
      setTimeout(() => setDoneMsg(''), 5000);
    },
  });

  const preview = previewQuery.data;
  const baseSeedList = preview?.seeds || [];

  const effectiveSeeds = useMemo(() => {
    if (!baseSeedList.length) return [];
    const list = baseSeedList.map(s => ({ ...s }));
    const overrideEntries = Object.entries(overrides)
      .filter(([, ttId]) => ttId)
      .map(([seed, ttId]) => ({ seed: Number(seed), ttId: Number(ttId) }));
    for (const ov of overrideEntries) {
      const tgtIdx = ov.seed - 1;
      const srcIdx = list.findIndex(s => s.tournament_team_id === ov.ttId);
      if (tgtIdx < 0 || tgtIdx >= list.length || srcIdx < 0 || srcIdx === tgtIdx) continue;
      const tmp = list[tgtIdx]; list[tgtIdx] = list[srcIdx]; list[srcIdx] = tmp;
    }
    return list;
  }, [baseSeedList, overrides]);

  const poolsIncomplete = preview?.pools?.some(p => p.completed < p.total) ?? false;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Seeding Mode"
          value={seedingMode}
          onChange={(e) => { setSeedingMode(e.target.value); setOverrides({}); }}
        >
          <option value="global_rank">Global Rank (interleave all pools)</option>
          <option value="fixed_qualifiers_per_pool">Fixed Qualifiers Per Pool</option>
        </Select>
        {seedingMode === 'fixed_qualifiers_per_pool' && (
          <Input
            label="Qualifiers Per Pool"
            type="number" min={1}
            value={qualifiersPerPool}
            onChange={(e) => setQualifiersPerPool(Number(e.target.value) || 1)}
          />
        )}
      </div>

      {poolsIncomplete && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-300 text-xs">
          ⚠ Some pool games are still incomplete — standings may change before you lock seeding.
        </div>
      )}

      {previewQuery.isLoading && <p className="text-slate-400 text-sm">Computing seeds…</p>}
      {previewQuery.error && <p className="text-red-400 text-sm">{previewQuery.error.message}</p>}

      {effectiveSeeds.length > 0 && (
        <div className="border border-slate-700 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-slate-800/80 text-[11px] text-slate-400 font-semibold uppercase tracking-wider flex justify-between">
            <span>Proposed Seeds ({effectiveSeeds.length} teams)</span>
            <span className="text-slate-500">Bracket size: {nearestPow2(effectiveSeeds.length)}</span>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-900 text-slate-500 uppercase tracking-wider">
                  <th className="py-1.5 px-3 text-left w-8">#</th>
                  <th className="py-1.5 px-3 text-left">Team</th>
                  <th className="py-1.5 px-3 text-left">Pool</th>
                  <th className="py-1.5 px-3 text-left">Swap with</th>
                </tr>
              </thead>
              <tbody>
                {effectiveSeeds.map((row, idx) => {
                  const bracketSeed = idx + 1;
                  const ov = overrides[bracketSeed];
                  const changed = ov && Number(ov) !== row.tournament_team_id;
                  return (
                    <tr key={bracketSeed} className={`border-t border-slate-700/60 ${changed ? 'bg-action-900/20' : ''}`}>
                      <td className="py-1.5 px-3 text-slate-400 font-bold">{bracketSeed}</td>
                      <td className="py-1.5 px-3 text-slate-200 whitespace-nowrap">
                        {changed && <span className="text-amber-400 mr-1">⇄</span>}
                        {row.name}
                      </td>
                      <td className="py-1.5 px-3 text-slate-400">{row.from_pool || '—'}</td>
                      <td className="py-1.5 px-3">
                        <select
                          value={ov || ''}
                          onChange={(e) => setOverrides(prev => ({ ...prev, [bracketSeed]: e.target.value }))}
                          className="lh-select text-xs py-0.5 w-full"
                        >
                          <option value="">— keep —</option>
                          {baseSeedList.map(s => (
                            <option key={s.tournament_team_id} value={s.tournament_team_id}>{s.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {effectiveSeeds.length > 0 && (
        <div className="pt-2 border-t border-slate-700 space-y-2">
          {!confirmed ? (
            <Button onClick={() => setConfirmed(true)} disabled={generateMut.isPending} className="w-full">
              Review &amp; Confirm Seeding →
            </Button>
          ) : (
            <div className="bg-slate-900 border border-amber-500/40 rounded-lg p-4 space-y-3">
              <p className="text-amber-300 text-sm font-semibold">⚠ This will overwrite all round 1 bracket slot assignments. Continue?</p>
              <div className="flex gap-3">
                <Button onClick={() => generateMut.mutate()} disabled={generateMut.isPending} className="flex-1">
                  {generateMut.isPending ? 'Seeding…' : 'Lock & Seed Bracket'}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmed(false)} disabled={generateMut.isPending}>Cancel</Button>
              </div>
            </div>
          )}
          {generateMut.error && <p className="text-red-400 text-xs">{generateMut.error.message}</p>}
          {doneMsg && <p className="text-emerald-400 text-xs font-semibold">{doneMsg}</p>}
        </div>
      )}
    </div>
  );
}

// ── Pools Tab ────────────────────────────────────────────────────────────────
function PoolsTab({ tournamentId, teams, queryClient }) {
  const [newPoolName, setNewPoolName] = useState('');
  const [autoPoolCount, setAutoPoolCount] = useState(2);
  const [assignmentByPool, setAssignmentByPool] = useState({});
  const [gamesPerTeamByPool, setGamesPerTeamByPool] = useState({});
  const [editingPoolId, setEditingPoolId] = useState(null);
  const [editingPoolName, setEditingPoolName] = useState('');
  const [scheduleMsg, setScheduleMsg] = useState('');

  const { data: pools = [] } = useQuery({
    queryKey: ['tournament-pools', tournamentId],
    queryFn: () => fetchTournamentPools(tournamentId),
    staleTime: STALE.THIRTY_SEC,
  });

  function invalidatePoolData() {
    queryClient.invalidateQueries({ queryKey: ['tournament-pools', tournamentId] });
    queryClient.invalidateQueries({ queryKey: ['tournament-pool-standings', tournamentId] });
    queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    queryClient.invalidateQueries({ queryKey: ['tournaments'] });
  }

  const createPoolMut = useMutation({
    mutationFn: (data) => createTournamentPool(tournamentId, data),
    onSuccess: () => {
      setNewPoolName('');
      invalidatePoolData();
    },
  });

  const updatePoolMut = useMutation({
    mutationFn: ({ poolId, data }) => updateTournamentPool(tournamentId, poolId, data),
    onSuccess: () => {
      setEditingPoolId(null);
      setEditingPoolName('');
      invalidatePoolData();
    },
  });

  const deletePoolMut = useMutation({
    mutationFn: (poolId) => deleteTournamentPool(tournamentId, poolId),
    onSuccess: invalidatePoolData,
  });

  const autoBalanceMut = useMutation({
    mutationFn: (poolCount) => autoBalanceTournamentPools(tournamentId, poolCount),
    onSuccess: invalidatePoolData,
  });

  const assignMut = useMutation({
    mutationFn: ({ poolId, tournamentTeamId }) => assignTournamentPoolTeam(tournamentId, poolId, tournamentTeamId),
    onSuccess: (_data, vars) => {
      setAssignmentByPool(prev => ({ ...prev, [vars.poolId]: '' }));
      invalidatePoolData();
    },
  });

  const removeAssignMut = useMutation({
    mutationFn: ({ poolId, tournamentTeamId }) => removeTournamentPoolTeam(tournamentId, poolId, tournamentTeamId),
    onSuccess: invalidatePoolData,
  });

  const roundRobinMut = useMutation({
    mutationFn: ({ poolId, gamesPerTeam }) => generatePoolRoundRobin(tournamentId, poolId, { gamesPerTeam }),
    onSuccess: (data) => {
      setScheduleMsg(data?.note || 'Pool games generated.');
      invalidatePoolData();
    },
  });

  const assignedIds = new Set(
    pools.flatMap(p => (p.teams || []).map(t => Number(t.tournament_team_id || t.id)))
  );
  const unassignedTeams = (teams || []).filter(t => !assignedIds.has(Number(t.id)));

  const mutationError =
    createPoolMut.error ||
    updatePoolMut.error ||
    deletePoolMut.error ||
    autoBalanceMut.error ||
    assignMut.error ||
    removeAssignMut.error ||
    roundRobinMut.error;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Create Pool</h4>
          <div className="flex gap-2">
            <Input
              value={newPoolName}
              onChange={(e) => setNewPoolName(e.target.value)}
              placeholder="Pool name (e.g. Pool A)"
            />
            <Button
              onClick={() => {
                if (!newPoolName.trim()) return;
                createPoolMut.mutate({ name: newPoolName.trim() });
              }}
              disabled={createPoolMut.isPending}
            >
              {createPoolMut.isPending ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Auto Balance</h4>
          <div className="flex gap-2 items-end">
            <Input
              label="Pool Count"
              type="number"
              min={2}
              max={16}
              value={autoPoolCount}
              onChange={(e) => setAutoPoolCount(Number(e.target.value) || 2)}
            />
            <Button
              onClick={() => autoBalanceMut.mutate(autoPoolCount)}
              disabled={autoBalanceMut.isPending}
            >
              {autoBalanceMut.isPending ? 'Balancing…' : 'Auto Assign'}
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Unassigned Teams ({unassignedTeams.length})</h4>
        {unassignedTeams.length === 0 ? (
          <p className="text-xs text-slate-500">All tournament teams are currently assigned to a pool.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {unassignedTeams.map((t) => (
              <span key={t.id} className="text-xs text-slate-300 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">
                #{t.seed} {t.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
        {pools.length === 0 && (
          <div className="text-center py-6 border border-slate-700 rounded-lg bg-slate-900/50 text-slate-500 text-sm">
            No pools yet. Create at least one pool to start assignment.
          </div>
        )}
        {pools.map((pool) => {
          const poolTeams = pool.teams || [];
          const poolGames = pool.pool_matches || [];
          const selectedTtId = assignmentByPool[pool.id] || '';
          const gamesPerTeam = gamesPerTeamByPool[pool.id] || '';
          return (
            <div key={pool.id} className="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                {editingPoolId === pool.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editingPoolName}
                      onChange={(e) => setEditingPoolName(e.target.value)}
                      placeholder="Pool name"
                    />
                    <Button
                      onClick={() => {
                        if (!editingPoolName.trim()) return;
                        updatePoolMut.mutate({ poolId: pool.id, data: { name: editingPoolName.trim() } });
                      }}
                      disabled={updatePoolMut.isPending}
                    >
                      Save
                    </Button>
                    <Button variant="ghost" onClick={() => { setEditingPoolId(null); setEditingPoolName(''); }}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h5 className="font-semibold text-sm text-white">{pool.name}</h5>
                    <span className="text-xs text-slate-500">({poolTeams.length} teams)</span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <div className="w-28">
                    <Input
                      label="Games/Team"
                      type="number"
                      min={1}
                      value={gamesPerTeam}
                      onChange={(e) => setGamesPerTeamByPool((prev) => ({ ...prev, [pool.id]: e.target.value }))}
                      placeholder="Full RR"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    className="text-xs"
                    onClick={() => roundRobinMut.mutate({ poolId: pool.id, gamesPerTeam })}
                    disabled={roundRobinMut.isPending || poolTeams.length < 2}
                  >
                    {roundRobinMut.isPending ? 'Generating…' : 'Generate Round Robin'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-xs"
                    onClick={() => {
                      setEditingPoolId(pool.id);
                      setEditingPoolName(pool.name || '');
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-xs text-red-400 hover:text-red-300"
                    onClick={() => {
                      if (confirm(`Delete ${pool.name}? This removes its assignments and generated pool matches.`)) {
                        deletePoolMut.mutate(pool.id);
                      }
                    }}
                    disabled={deletePoolMut.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-1">Assign Team</label>
                  <select
                    value={selectedTtId}
                    onChange={(e) => setAssignmentByPool(prev => ({ ...prev, [pool.id]: e.target.value }))}
                    className="lh-select text-xs w-full"
                  >
                    <option value="">Select unassigned team…</option>
                    {unassignedTeams.map((t) => (
                      <option key={t.id} value={t.id}>#{t.seed} {t.name}</option>
                    ))}
                  </select>
                </div>
                <Button
                  onClick={() => {
                    if (!selectedTtId) return;
                    assignMut.mutate({ poolId: pool.id, tournamentTeamId: Number(selectedTtId) });
                  }}
                  disabled={assignMut.isPending || !selectedTtId}
                >
                  Assign
                </Button>
              </div>

              <div className="space-y-1">
                {poolTeams.length === 0 ? (
                  <p className="text-xs text-slate-500">No teams assigned yet.</p>
                ) : (
                  poolTeams.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-800/70 border border-slate-700 text-sm">
                      <span className="text-xs text-slate-500 w-5">#{t.seed}</span>
                      <TeamLogo src={t.logo} name={t.name} size="w-5 h-5" primaryColor={t.primary_color} secondaryColor={t.secondary_color} />
                      <span className="text-slate-200 truncate flex-1">{t.name}</span>
                      <button
                        className="text-red-400 hover:text-red-300"
                        onClick={() => removeAssignMut.mutate({ poolId: pool.id, tournamentTeamId: Number(t.tournament_team_id || t.id) })}
                        title="Remove from pool"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="border border-slate-700/70 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-slate-800/70 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                  Pool Games ({poolGames.length})
                </div>
                {poolGames.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-slate-500">No round-robin games generated yet.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-800">
                    {poolGames.map((pm) => {
                      const game = pm.game || {};
                      const hs = game.home_score;
                      const as_ = game.away_score;
                      const scored = hs != null && as_ != null;
                      return (
                        <div key={pm.id} className="px-3 py-2 text-xs space-y-1">
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Round {pm.round_number} · Match {pm.match_number}</span>
                            <span className="uppercase">{game.status || 'unscheduled'}</span>
                          </div>
                          <div className="text-slate-200">
                            {(pm.team_a?.name || 'TBD')}
                            {scored ? ` ${hs}` : ''}
                            <span className="text-slate-500 mx-1">vs</span>
                            {(pm.team_b?.name || 'TBD')}
                            {scored ? ` ${as_}` : ''}
                          </div>
                          <div className="text-slate-500">
                            {formatPoolGameDate(game.game_date)} · {formatPoolGameTime(game.game_time)}
                            {game.location_name ? ` · ${game.location_name}` : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {poolTeams.length > 1 && (
                <PoolStandingsTable tournamentId={tournamentId} poolId={pool.id} />
              )}
            </div>
          );
        })}
      </div>

      {mutationError && (
        <p className="text-red-400 text-xs">{mutationError.message}</p>
      )}
      {!!scheduleMsg && !mutationError && (
        <p className="text-amber-300 text-xs">{scheduleMsg}</p>
      )}
    </div>
  );
}

function PoolStandingsTable({ tournamentId, poolId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tournament-pool-standings', tournamentId, poolId],
    queryFn: () => fetchPoolStandings(tournamentId, poolId),
    staleTime: STALE.THIRTY_SEC,
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return <p className="text-xs text-slate-500">Loading standings…</p>;
  }

  const standings = data?.standings || [];
  const totals = data?.totals || { completed_games: 0, matches: 0 };
  if (standings.length === 0) return null;

  return (
    <div className="mt-2 border border-slate-700 rounded-lg overflow-hidden">
      <div className="px-2 py-1 bg-slate-800/80 text-[11px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-between">
        <span>Standings</span>
        <span>{totals.completed_games}/{totals.matches} games complete</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-slate-900 text-slate-500 uppercase tracking-wider">
              <th className="text-left py-1.5 px-2">#</th>
              <th className="text-left py-1.5 px-2">Team</th>
              <th className="text-right py-1.5 px-2">W</th>
              <th className="text-right py-1.5 px-2">L</th>
              <th className="text-right py-1.5 px-2">T</th>
              <th className="text-right py-1.5 px-2">RF</th>
              <th className="text-right py-1.5 px-2">RA</th>
              <th className="text-right py-1.5 px-2">RD</th>
              <th className="text-right py-1.5 px-2">Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr key={row.tournament_team_id} className="border-t border-slate-700/70 text-slate-200">
                <td className="py-1.5 px-2 text-slate-400">{row.rank}</td>
                <td className="py-1.5 px-2 whitespace-nowrap">{row.name}</td>
                <td className="py-1.5 px-2 text-right">{row.wins}</td>
                <td className="py-1.5 px-2 text-right">{row.losses}</td>
                <td className="py-1.5 px-2 text-right">{row.ties}</td>
                <td className="py-1.5 px-2 text-right">{row.runs_for}</td>
                <td className="py-1.5 px-2 text-right">{row.runs_against}</td>
                <td className="py-1.5 px-2 text-right">{row.run_diff}</td>
                <td className="py-1.5 px-2 text-right font-semibold">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
              const hasLinkedGame = !!match.game?.id;
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
                      disabled={hasWinner}
                      onChange={(ttId) => handleSlotChange(match, 'a', ttId)}
                    />
                    {/* Team B slot */}
                    <MatchSlot
                      label="Team B (Away)"
                      team={teamB}
                      allTeams={teams}
                      disabled={hasWinner}
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
