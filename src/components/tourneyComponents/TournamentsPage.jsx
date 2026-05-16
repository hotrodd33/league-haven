// This holds a list of the active tournaments.

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTournaments, createTournament, deleteTournament, fetchOrganizations,
  fetchTeams, fetchMyTournamentRegistrations, registerTeamForTournament, withdrawTournamentRegistration,
} from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { STALE } from '../../lib/queryConfig.js';
import { Button, Modal, Input, Select } from '../ui/index.js';
import { PlusIcon, TrophyIcon, CalendarIcon, TrashIcon } from '../ui/icons.jsx';

const FORMAT_LABELS = {
  single_elimination: 'Single Elim',
  double_elimination: 'Double Elim',
};

const STATUS_COLORS = {
  draft: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  completed: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function TournamentsPage({ onSelectTournament }) {
  const queryClient = useQueryClient();
  const { isAdmin, isOrgAdmin, isTeamManager, permissions } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', format: 'single_elimination', team_count: 8, description: '', start_date: '', end_date: '', org_id: '' });
  const [createError, setCreateError] = useState('');

  const canCreate = isAdmin || isOrgAdmin;
  const canRegister = isAdmin || isOrgAdmin || isTeamManager;

  const { data: tournaments = [], isLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => fetchTournaments(),
    staleTime: STALE.THIRTY_SEC,
    refetchOnMount: 'always',
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ['organizations'],
    queryFn: fetchOrganizations,
    staleTime: STALE.HOUR,
    enabled: canCreate,
  });

  const { data: allTeams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: fetchTeams,
    staleTime: STALE.THREE_MIN,
    enabled: canRegister,
  });

  const { data: myRegistrations = [] } = useQuery({
    queryKey: ['my-tournament-registrations'],
    queryFn: fetchMyTournamentRegistrations,
    staleTime: STALE.THIRTY_SEC,
    enabled: canRegister,
  });

  // The teams this user can manage
  const myTeams = useMemo(() => {
    if (isAdmin) return allTeams;
    return allTeams.filter(t =>
      permissions.team_ids.includes(t.id) ||
      permissions.org_ids.includes(t.org_id)
    );
  }, [allTeams, isAdmin, permissions]);

  // Build registration lookup: tournamentId → teamId → { status, ttId }
  const regLookup = useMemo(() => {
    const map = {};
    for (const r of myRegistrations) {
      if (!map[r.tournament_id]) map[r.tournament_id] = {};
      map[r.tournament_id][r.team_id] = { status: r.registration_status, ttId: r.id };
    }
    return map;
  }, [myRegistrations]);

  // Split tournaments: managed by this user vs open for registration
  const myOrgIds = new Set(permissions.org_ids.map(Number));
  const myTournaments = isAdmin ? tournaments : tournaments.filter(t => myOrgIds.has(Number(t.org_id)));
  const openTournaments = tournaments.filter(t =>
    t.registration_open && (isAdmin || !myOrgIds.has(Number(t.org_id)))
  );

  const createMut = useMutation({
    mutationFn: (data) => createTournament(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      setShowCreate(false);
      setForm({ name: '', format: 'single_elimination', team_count: 8, description: '', start_date: '', end_date: '', org_id: '' });
      setCreateError('');
      if (data?.id) onSelectTournament(data.id);
    },
    onError: (err) => setCreateError(err.message || 'Failed to create tournament'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => deleteTournament(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.removeQueries({ queryKey: ['tournament', deletedId] });
    },
  });

  function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return setCreateError('Name is required');
    if (!form.org_id && !isAdmin) return setCreateError('Organization is required');
    const count = Number(form.team_count);
    if (count < 2 || count > 128) return setCreateError('Team count must be 2–128');
    setCreateError('');
    createMut.mutate({
      ...form,
      team_count: count,
      org_id: form.org_id || (orgs.length === 1 ? orgs[0].id : null),
    });
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <TrophyIcon className="w-6 h-6 text-action-400" /> Tournaments
          </h1>
          <p className="text-slate-400 text-sm mt-1">Create and manage elimination brackets</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)} className="flex items-center gap-2">
            <PlusIcon className="w-4 h-4" /> New Tournament
          </Button>
        )}
      </div>

      {/* My / Managed Tournaments */}
      {(canCreate || isAdmin) && (
        <section>
          <h2 className="text-sm font-bold uppercase text-slate-400 tracking-wider mb-3">My Tournaments</h2>
          {isLoading ? (
            <div className="text-slate-400 text-center py-16">Loading tournaments…</div>
          ) : myTournaments.length === 0 ? (
            <div className="text-center py-12 bg-slate-800/50 rounded-xl border border-slate-700">
              <TrophyIcon className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-300 mb-2">No Tournaments Yet</h3>
              <p className="text-slate-500 text-sm mb-4">Create your first tournament to get started.</p>
              {canCreate && (
                <Button onClick={() => setShowCreate(true)} className="mx-auto">
                  <PlusIcon className="w-4 h-4 mr-2 inline" /> Create Tournament
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {myTournaments.map((t) => (
                <TournamentCard
                  key={t.id}
                  tournament={t}
                  canDelete={canCreate}
                  onClick={() => onSelectTournament(t.id)}
                  onDelete={() => { if (confirm(`Delete tournament "${t.name}"?`)) deleteMut.mutate(t.id); }}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Register a Team */}
      {canRegister && (
        <section>
          <h2 className="text-sm font-bold uppercase text-slate-400 tracking-wider mb-3">Register a Team</h2>
          {openTournaments.length === 0 ? (
            <div className="text-center py-10 bg-slate-800/50 rounded-xl border border-slate-700">
              <p className="text-slate-500 text-sm">No open tournaments available for registration.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {openTournaments.map((t) => (
                <RegistrationCard
                  key={t.id}
                  tournament={t}
                  myTeams={myTeams}
                  registrations={regLookup[t.id] || {}}
                  onView={() => onSelectTournament(t.id)}
                  onRefresh={() => {
                    queryClient.invalidateQueries({ queryKey: ['tournaments'] });
                    queryClient.invalidateQueries({ queryKey: ['my-tournament-registrations'] });
                  }}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* For non-admin/manager users: show all tournaments read-only */}
      {!canCreate && !canRegister && (
        <section>
          {isLoading ? (
            <div className="text-slate-400 text-center py-16">Loading tournaments…</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tournaments.map((t) => (
                <TournamentCard key={t.id} tournament={t} onClick={() => onSelectTournament(t.id)} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal open onClose={() => { setShowCreate(false); setCreateError(''); }} title="Create Tournament" size="md">
          <form onSubmit={handleCreate} className="space-y-4">
            <Input
              label="Tournament Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Spring Classic 2026"
              required
            />
            <Select
              label="Format"
              value={form.format}
              onChange={(e) => setForm({ ...form, format: e.target.value })}
            >
              <option value="single_elimination">Single Elimination</option>
              <option value="double_elimination">Double Elimination</option>
            </Select>
            <Input
              label="Team Count (bracket size)"
              type="number"
              min={2}
              max={128}
              value={form.team_count}
              onChange={(e) => setForm({ ...form, team_count: e.target.value })}
            />
            {orgs.length > 1 && (
              <Select
                label="Organization"
                value={form.org_id}
                onChange={(e) => setForm({ ...form, org_id: e.target.value })}
              >
                <option value="">Select organization…</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </Select>
            )}
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
            <Input
              label="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="A few words about this tournament…"
            />
            {createError && <p className="text-red-400 text-sm">{createError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => { setShowCreate(false); setCreateError(''); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create Tournament'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Shared tournament card (view/manage) ─────────────────────────────────────
function TournamentCard({ tournament: t, canDelete, onClick, onDelete }) {
  return (
    <button
      onClick={onClick}
      className="group text-left bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-action-500/50 hover:shadow-glow-action transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-heading font-semibold text-white text-lg group-hover:text-action-100 transition-colors truncate pr-2">
          {t.name}
        </h3>
        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_COLORS[t.status] || STATUS_COLORS.draft}`}>
          {t.status}
        </span>
      </div>

      {t.description && (
        <p className="text-slate-400 text-sm mb-3 line-clamp-2">{t.description}</p>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded-md">
          {FORMAT_LABELS[t.format] || t.format}
        </span>
        <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded-md">
          {t.enrolled_count}/{t.team_count} teams
        </span>
      </div>

      {(t.start_date || t.end_date) && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <CalendarIcon className="w-3.5 h-3.5" />
          {t.start_date && <span>{t.start_date}</span>}
          {t.start_date && t.end_date && <span>—</span>}
          {t.end_date && <span>{t.end_date}</span>}
        </div>
      )}

      {t.org_name && (
        <div className="mt-2 text-xs text-slate-500 truncate">{t.org_name}</div>
      )}

      {canDelete && onDelete && (
        <div className="mt-3 pt-3 border-t border-slate-700 flex justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <TrashIcon className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}
    </button>
  );
}

// ── Registration card (for open tournaments) ─────────────────────────────────
function RegistrationCard({ tournament: t, myTeams, registrations, onView, onRefresh }) {
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const spotsLabel = t.max_registrations
    ? `${t.registered_count ?? 0}/${t.max_registrations} registered`
    : `${t.registered_count ?? 0} registered`;

  const spotsLeft = t.max_registrations
    ? t.max_registrations - (t.registered_count ?? 0)
    : null;

  const registerMut = useMutation({
    mutationFn: ({ teamId, notes: n }) => registerTeamForTournament(t.id, { team_id: teamId, notes: n }),
    onSuccess: () => {
      setShowForm(false);
      setSelectedTeamId('');
      setNotes('');
      setError('');
      onRefresh();
    },
    onError: (err) => setError(err.message),
  });

  const withdrawMut = useMutation({
    mutationFn: (ttId) => withdrawTournamentRegistration(t.id, ttId),
    onSuccess: () => onRefresh(),
    onError: (err) => setError(err.message),
  });

  // Filter to teams not already registered
  const eligibleTeams = myTeams.filter(team => !registrations[team.id]);
  const registeredMyTeams = myTeams.filter(team => registrations[team.id]);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between">
        <h3 className="font-heading font-semibold text-white text-base truncate pr-2">{t.name}</h3>
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-400 border-emerald-500/30 whitespace-nowrap">
          Open
        </span>
      </div>

      {t.org_name && <p className="text-xs text-slate-400">{t.org_name}</p>}

      <div className="flex flex-wrap gap-2">
        {(t.start_date || t.end_date) && (
          <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded-md flex items-center gap-1">
            <CalendarIcon className="w-3 h-3" />
            {t.start_date}{t.start_date && t.end_date ? ' — ' : ''}{t.end_date}
          </span>
        )}
        {t.entry_fee != null && Number(t.entry_fee) > 0 && (
          <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded-md">
            ${Number(t.entry_fee).toFixed(2)} entry
          </span>
        )}
        <span className={`text-xs px-2 py-1 rounded-md ${spotsLeft === 0 ? 'bg-red-500/20 text-red-400' : 'bg-slate-700/50 text-slate-300'}`}>
          {spotsLabel}
        </span>
      </div>

      {/* Already-registered teams */}
      {registeredMyTeams.length > 0 && (
        <div className="space-y-1">
          {registeredMyTeams.map(team => {
            const reg = registrations[team.id];
            return (
              <div key={team.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-300 truncate">{team.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-1.5 py-0.5 rounded-full font-semibold ${reg.status === 'registered' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {reg.status === 'registered' ? '✓ Registered' : 'Waitlisted'}
                  </span>
                  <button
                    onClick={() => { if (confirm(`Withdraw ${team.name} from this tournament?`)) withdrawMut.mutate(reg.ttId); }}
                    className="text-slate-500 hover:text-red-400 transition-colors"
                    disabled={withdrawMut.isPending}
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Register form */}
      {eligibleTeams.length > 0 && !showForm && (
        <Button
          variant="ghost"
          className="w-full text-sm border border-action-500/30 text-action-400 hover:border-action-500/60"
          onClick={() => setShowForm(true)}
          disabled={spotsLeft === 0}
        >
          {spotsLeft === 0 ? 'Tournament Full' : '+ Register a Team'}
        </Button>
      )}

      {showForm && (
        <div className="space-y-2 pt-1 border-t border-slate-700">
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="lh-select w-full text-sm"
          >
            <option value="">Select team…</option>
            {eligibleTeams.map(team => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="lh-input w-full text-sm"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2">
            <Button
              className="flex-1 text-sm"
              disabled={!selectedTeamId || registerMut.isPending}
              onClick={() => registerMut.mutate({ teamId: Number(selectedTeamId), notes })}
            >
              {registerMut.isPending ? 'Registering…' : 'Register'}
            </Button>
            <Button variant="ghost" className="text-sm" onClick={() => { setShowForm(false); setError(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <button
        onClick={onView}
        className="text-xs text-action-400 hover:text-action-300 transition-colors"
      >
        View bracket →
      </button>
    </div>
  );
}

