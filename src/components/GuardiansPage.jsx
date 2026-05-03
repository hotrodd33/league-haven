import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAllGuardians, fetchVolunteerRoles, fetchTeams, fetchAllGuardianClaims, fetchPendingClaimCount, reviewGuardianClaim } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { MagnifyingGlassIcon } from './ui/icons.jsx';
import { Input, Select, Badge, Button } from './ui';

function Spinner() {
  return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-action-500 border-t-transparent rounded-full animate-spin" /></div>;
}

export default function GuardiansPage({ onViewPlayer }) {
  const { isAdmin, isOrgAdmin, permissions } = useAuth();
  const isCoachOnly = !isAdmin && !isOrgAdmin;
  const [activeTab, setActiveTab] = useState('directory'); // 'directory' | 'claims'

  // Pending claim count for badge
  const { data: claimCountData } = useQuery({
    queryKey: ['pending-claim-count'],
    queryFn: fetchPendingClaimCount,
    refetchInterval: 60_000,
    enabled: isAdmin || isOrgAdmin,
  });
  const pendingCount = claimCountData?.count || 0;

  return (
    <div>
      <h2 className="text-xl font-display font-bold text-white mb-4">Guardians</h2>

      {(isAdmin || isOrgAdmin) && (
        <div className="flex gap-1 border-b border-gray-700 mb-4">
          <TabButton active={activeTab === 'directory'} onClick={() => setActiveTab('directory')}>
            Directory
          </TabButton>
          <TabButton active={activeTab === 'claims'} onClick={() => setActiveTab('claims')}>
            Pending Claims {pendingCount > 0 && (
              <span className="ml-1.5 bg-yellow-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </TabButton>
        </div>
      )}

      {activeTab === 'directory' && <GuardianDirectory onViewPlayer={onViewPlayer} isCoachOnly={isCoachOnly} permissions={permissions} />}
      {activeTab === 'claims' && (isAdmin || isOrgAdmin) && <GuardianClaimsTab />}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
        active
          ? 'text-chrome-300 border-b-2 border-chrome-400 -mb-px'
          : 'text-gray-400 hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

// ── Pending Claims Tab ───────────────────────────────────────────

function GuardianClaimsTab() {
  const queryClient = useQueryClient();
  const [reviewNotes, setReviewNotes] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  const { data: claims = [], isLoading } = useQuery({
    queryKey: ['all-guardian-claims'],
    queryFn: () => fetchAllGuardianClaims(),
    staleTime: 15_000,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, action, notes }) => reviewGuardianClaim(id, action, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-guardian-claims'] });
      queryClient.invalidateQueries({ queryKey: ['pending-claim-count'] });
    },
  });

  const pending = claims.filter(c => c.status === 'pending');
  const reviewed = claims.filter(c => c.status !== 'pending');

  if (isLoading) return <div className="py-8 text-center text-gray-400 text-sm">Loading claims…</div>;

  return (
    <div className="space-y-6">
      {pending.length === 0 && (
        <div className="py-8 text-center text-gray-400 text-sm">No pending claims — all caught up!</div>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Pending ({pending.length})</h3>
          {pending.map(claim => (
            <ClaimRow
              key={claim.id}
              claim={claim}
              expanded={expandedId === claim.id}
              onToggle={() => setExpandedId(id => id === claim.id ? null : claim.id)}
              notes={reviewNotes[claim.id] || ''}
              onNotesChange={v => setReviewNotes(n => ({ ...n, [claim.id]: v }))}
              onApprove={() => reviewMutation.mutate({ id: claim.id, action: 'approve', notes: reviewNotes[claim.id] })}
              onDeny={() => reviewMutation.mutate({ id: claim.id, action: 'deny', notes: reviewNotes[claim.id] })}
              isPending={reviewMutation.isPending && reviewMutation.variables?.id === claim.id}
            />
          ))}
        </div>
      )}

      {reviewed.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300 select-none list-none flex items-center gap-1">
            <span className="group-open:hidden">▶</span>
            <span className="hidden group-open:inline">▼</span>
            Reviewed ({reviewed.length})
          </summary>
          <div className="mt-2 space-y-2 opacity-70">
            {reviewed.map(claim => (
              <div key={claim.id} className="flex items-center justify-between rounded border border-gray-700 bg-gray-800/40 px-4 py-2 text-sm">
                <span className="text-gray-300">
                  <strong>{claim.guardian_name}</strong> → {claim.player_first_name} {claim.player_last_name}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  claim.status === 'approved' ? 'bg-green-700/60 text-green-200' : 'bg-red-700/60 text-red-200'
                }`}>
                  {claim.status}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ClaimRow({ claim, expanded, onToggle, notes, onNotesChange, onApprove, onDeny, isPending }) {
  return (
    <div className="rounded border border-gray-700 bg-gray-800/50 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-700/40 transition-colors"
      >
        <div>
          <p className="font-medium text-gray-100">
            {claim.guardian_name}
            <span className="text-gray-400 font-normal"> claims </span>
            {claim.player_first_name} {claim.player_last_name}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {claim.guardian_email} · Submitted {new Date(claim.created_at).toLocaleDateString()}
            {claim.player_teams && ` · ${claim.player_teams}`}
          </p>
        </div>
        <span className="text-gray-500 text-sm ml-4">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="border-t border-gray-700 px-4 py-3 space-y-3">
          <textarea
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            placeholder="Optional notes (shown to guardian on denial)"
            className="lh-input w-full h-16 resize-none text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={isPending}
              onClick={onApprove}
              className="bg-green-700 hover:bg-green-600 text-white border-0"
            >
              ✓ Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={isPending}
              onClick={onDeny}
              className="text-red-300 border-red-700 hover:bg-red-800/40"
            >
              ✗ Deny
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Guardian Directory (existing code extracted to sub-component) ────────────

function GuardianDirectory({ onViewPlayer, isCoachOnly, permissions }) {
  const [guardians, setGuardians] = useState([]);
  const [volunteerRoles, setVolunteerRoles] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [copied, setCopied] = useState('');
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    Promise.all([
      fetchAllGuardians(),
      fetchVolunteerRoles().catch(() => []),
      fetchTeams().catch(() => []),
    ]).then(([g, vr, t]) => {
      setGuardians(g);
      setVolunteerRoles(vr);
      // Coaches (team_manager) only see their assigned teams in the filter dropdown
      const myTeamIds = permissions?.team_ids || [];
      const visibleTeams = isCoachOnly && myTeamIds.length > 0
        ? t.filter(team => myTeamIds.includes(Number(team.id)))
        : t;
      setTeams(visibleTeams);
      // Pre-select team if coach only has one
      if (isCoachOnly && visibleTeams.length === 1) {
        setFilterTeam(String(visibleTeams[0].id));
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const roleMap = useMemo(() => {
    const m = {};
    for (const r of volunteerRoles) m[r.id] = r.name;
    return m;
  }, [volunteerRoles]);

  const filtered = useMemo(() => {
    let list = guardians;
    if (filterRole) {
      const rid = Number(filterRole);
      list = list.filter(g => (g.volunteer_role_ids || []).includes(rid));
    }
    if (filterTeam) {
      const tid = Number(filterTeam);
      list = list.filter(g => (g.players || []).some(p => (p.team_ids || []).includes(tid)));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(g =>
        `${g.first_name} ${g.last_name}`.toLowerCase().includes(q) ||
        (g.email || '').toLowerCase().includes(q) ||
        (g.phone || '').includes(q)
      );
    }
    return list;
  }, [guardians, filterRole, filterTeam, search]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    const s = [...filtered].sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case 'name': va = `${a.last_name} ${a.first_name}`.toLowerCase(); vb = `${b.last_name} ${b.first_name}`.toLowerCase(); break;
        case 'email': va = (a.email || '').toLowerCase(); vb = (b.email || '').toLowerCase(); break;
        case 'phone': va = a.phone || ''; vb = b.phone || ''; break;
        case 'players': va = a.players?.length || 0; vb = b.players?.length || 0; break;
        default: return 0;
      }
      if (typeof va === 'number' && typeof vb === 'number') return va - vb;
      return String(va).localeCompare(String(vb), undefined, { numeric: true });
    });
    return sortDir === 'desc' ? s.reverse() : s;
  }, [filtered, sortCol, sortDir]);

  const SortHeader = ({ col, children }) => (
    <th
      className="px-3 py-2 text-left text-xs font-semibold text-gray-400 cursor-pointer select-none whitespace-nowrap hover:text-gray-200"
      onClick={() => toggleSort(col)}
    >
      {children} {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : ''}
    </th>
  );

  async function copyField(field) {
    const values = Array.from(new Set(
      (sorted || [])
        .map(g => (g[field] || '').trim())
        .filter(Boolean)
    ));
    if (values.length === 0) return;
    try {
      await navigator.clipboard.writeText(values.join(', '));
      setCopied(field);
      setTimeout(() => setCopied(c => (c === field ? '' : c)), 1500);
    } catch (e) {
      console.error('Clipboard write failed', e);
    }
  }

  function exportCsv() {
    const header = ['First Name', 'Last Name', 'Email', 'Phone', 'Players', 'Teams'];
    const rows = sorted.map(g => {
      const players = (g.players || []).map(p => p.player_name).filter(Boolean).join('; ');
      const teamNames = Array.from(new Set(
        (g.players || []).map(p => p.team_names).filter(Boolean).flatMap(s => s.split(', '))
      )).join('; ');
      return [g.first_name || '', g.last_name || '', g.email || '', g.phone || '', players, teamNames];
    });
    const csv = [header, ...rows]
      .map(r => r.map(cell => {
        const s = String(cell ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `guardians-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const emailCount = useMemo(
    () => new Set(sorted.map(g => (g.email || '').trim()).filter(Boolean)).size,
    [sorted]
  );
  const phoneCount = useMemo(
    () => new Set(sorted.map(g => (g.phone || '').trim()).filter(Boolean)).size,
    [sorted]
  );

  if (loading) return <div className="py-12 text-center"><Spinner /></div>;

  return (
    <div>
      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="lh-input pl-9 w-full"
          />
        </div>
        <select
          value={filterTeam}
          onChange={e => setFilterTeam(e.target.value)}
          className="lh-select w-full"
          disabled={teams.length === 0}
        >
          <option value="">All Teams</option>
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="lh-select w-full"
          disabled={volunteerRoles.length === 0}
        >
          <option value="">All Volunteer Interests</option>
          {volunteerRoles.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <p className="text-xs text-gray-500">{sorted.length} guardian{sorted.length !== 1 ? 's' : ''}</p>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => copyField('email')}
          disabled={emailCount === 0}
          className="text-xs px-3 py-1 rounded-full bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {copied === 'email' ? 'Copied!' : `Copy ${emailCount} email${emailCount !== 1 ? 's' : ''}`}
        </button>
        <button
          type="button"
          onClick={() => copyField('phone')}
          disabled={phoneCount === 0}
          className="text-xs px-3 py-1 rounded-full bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {copied === 'phone' ? 'Copied!' : `Copy ${phoneCount} phone${phoneCount !== 1 ? 's' : ''}`}
        </button>
        <button
          type="button"
          onClick={exportCsv}
          disabled={sorted.length === 0}
          className="text-xs px-3 py-1 rounded-full bg-action-600 text-white hover:bg-action-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800">
            <tr>
              <SortHeader col="name">Name</SortHeader>
              <SortHeader col="email">Email</SortHeader>
              <SortHeader col="phone">Phone</SortHeader>
              <SortHeader col="players">Players</SortHeader>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400">Volunteer Interests</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-500">No guardians found</td>
              </tr>
            ) : sorted.map(g => (
              <tr key={g.id} className="border-t border-gray-700/50 hover:bg-gray-800/40 transition-colors">
                <td className="px-3 py-2 font-medium text-white whitespace-nowrap">
                  {g.first_name} {g.last_name}
                </td>
                <td className="px-3 py-2 text-gray-300 break-all">
                  {g.email ? <a href={`mailto:${g.email}`} className="text-chrome-400 hover:text-chrome-300 underline">{g.email}</a> : '—'}
                </td>
                <td className="px-3 py-2 text-gray-300">
                  {g.phone ? <a href={`tel:${g.phone}`} className="text-chrome-400 hover:text-chrome-300 underline">{g.phone}</a> : '—'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(g.players || []).map((p, i) => (
                      <button
                        key={i}
                        onClick={() => onViewPlayer?.(p.player_id)}
                        className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full hover:bg-gray-600 transition-colors"
                        title={p.team_names || ''}
                      >
                        {p.player_name}
                        {p.relationship && p.relationship !== 'parent' && (
                          <span className="text-gray-500 ml-1">({p.relationship})</span>
                        )}
                      </button>
                    ))}
                    {(!g.players || g.players.length === 0) && <span className="text-gray-500">—</span>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(g.volunteer_role_ids || []).map(rid => (
                      <span key={rid} className="text-xs bg-action-500/20 text-action-300 px-2 py-0.5 rounded-full">
                        {roleMap[rid] || `#${rid}`}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-gray-500">No guardians found</p>
        ) : sorted.map(g => (
          <div key={g.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-3">
            <p className="font-medium text-white">{g.first_name} {g.last_name}</p>
            {g.email && <p className="text-sm text-gray-400 truncate"><a href={`mailto:${g.email}`} className="text-chrome-400 hover:text-chrome-300 underline">{g.email}</a></p>}
            {g.phone && <p className="text-sm text-gray-400"><a href={`tel:${g.phone}`} className="text-chrome-400 hover:text-chrome-300 underline">{g.phone}</a></p>}
            {g.players?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {g.players.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => onViewPlayer?.(p.player_id)}
                    className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full hover:bg-gray-600"
                  >
                    {p.player_name}
                  </button>
                ))}
              </div>
            )}
            {(g.volunteer_role_ids || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {g.volunteer_role_ids.map(rid => (
                  <span key={rid} className="text-xs bg-action-500/20 text-action-300 px-2 py-0.5 rounded-full">
                    {roleMap[rid] || `#${rid}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
