// This holds a list of the active tournaments.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTournaments, createTournament, deleteTournament, fetchOrganizations } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { STALE } from '../../lib/queryConfig.js';
import { Button, Badge, Modal, Input, Select } from '../ui/index.js';
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
  const { isAdmin, isOrgAdmin } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', format: 'single_elimination', team_count: 8, description: '', start_date: '', end_date: '', org_id: '' });
  const [createError, setCreateError] = useState('');

  const canCreate = isAdmin || isOrgAdmin;

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
    <div className="space-y-6">
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

      {/* Tournament List */}
      {isLoading ? (
        <div className="text-slate-400 text-center py-16">Loading tournaments…</div>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-20 bg-slate-800/50 rounded-xl border border-slate-700">
          <TrophyIcon className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-300 mb-2">No Tournaments Yet</h3>
          <p className="text-slate-500 text-sm mb-4">Create your first tournament to get started.</p>
          {canCreate && (
            <Button onClick={() => setShowCreate(true)} className="mx-auto">
              <PlusIcon className="w-4 h-4 mr-2 inline" /> Create Tournament
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTournament(t.id)}
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

              {/* Delete button — only for admins, stop propagation */}
              {canCreate && (
                <div className="mt-3 pt-3 border-t border-slate-700 flex justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete tournament "${t.name}"?`)) deleteMut.mutate(t.id);
                    }}
                    className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <TrashIcon className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              )}
            </button>
          ))}
        </div>
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
