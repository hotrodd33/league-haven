import { useState, useEffect, useMemo } from 'react';
import { fetchAllCoaches, fetchTeams } from '../api/index.js';
import { MagnifyingGlassIcon } from './ui/icons.jsx';

function Spinner() {
  return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-action-500 border-t-transparent rounded-full animate-spin" /></div>;
}

const ROLE_OPTIONS = [
  { value: 'head_coach', label: 'Head Coach' },
  { value: 'assistant_coach', label: 'Assistant Coach' },
];

export default function CoachesPage() {
  const [coaches, setCoaches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterAgeGroup, setFilterAgeGroup] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [copied, setCopied] = useState('');
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    Promise.all([
      fetchAllCoaches(),
      fetchTeams().catch(() => []),
    ]).then(([c, t]) => {
      setCoaches(c);
      setTeams(t);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const ageGroups = useMemo(() => {
    const set = new Set();
    for (const c of coaches) {
      for (const a of c.assignments || []) {
        if (a.age_group) set.add(a.age_group);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [coaches]);

  const filtered = useMemo(() => {
    let list = coaches;
    if (filterTeam) {
      const tid = Number(filterTeam);
      list = list.filter(c => (c.assignments || []).some(a => a.team_id === tid));
    }
    if (filterAgeGroup) {
      list = list.filter(c => (c.assignments || []).some(a => a.age_group === filterAgeGroup));
    }
    if (filterRole) {
      list = list.filter(c => (c.assignments || []).some(a => a.role === filterRole));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
      );
    }
    return list;
  }, [coaches, filterTeam, filterAgeGroup, filterRole, search]);

  const sorted = useMemo(() => {
    const s = [...filtered].sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case 'name': va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); break;
        case 'email': va = (a.email || '').toLowerCase(); vb = (b.email || '').toLowerCase(); break;
        case 'phone': va = a.phone || ''; vb = b.phone || ''; break;
        case 'teams': va = (a.assignments || []).length; vb = (b.assignments || []).length; break;
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
        .map(c => (c[field] || '').trim())
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
    const header = ['Name', 'Email', 'Phone', 'Roles', 'Teams', 'Age Groups'];
    const rows = sorted.map(c => {
      const assigns = c.assignments || [];
      const roles = Array.from(new Set(assigns.map(a => a.role_label).filter(Boolean))).join('; ');
      const teams = Array.from(new Set(assigns.map(a => a.team_name).filter(Boolean))).join('; ');
      const ages = Array.from(new Set(assigns.map(a => a.age_group).filter(Boolean))).join('; ');
      return [c.name || '', c.email || '', c.phone || '', roles, teams, ages];
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
    a.download = `coaches-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const emailCount = useMemo(
    () => new Set(sorted.map(c => (c.email || '').trim()).filter(Boolean)).size,
    [sorted]
  );
  const phoneCount = useMemo(
    () => new Set(sorted.map(c => (c.phone || '').trim()).filter(Boolean)).size,
    [sorted]
  );

  if (loading) return <div className="py-12 text-center"><Spinner /></div>;

  return (
    <div>
      <h2 className="text-xl font-display font-bold text-white mb-4">Coaches</h2>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
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
          value={filterAgeGroup}
          onChange={e => setFilterAgeGroup(e.target.value)}
          className="lh-select w-full"
          disabled={ageGroups.length === 0}
        >
          <option value="">All Age Groups</option>
          {ageGroups.map(ag => (
            <option key={ag} value={ag}>{ag}</option>
          ))}
        </select>
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
        >
          <option value="">All Roles</option>
          {ROLE_OPTIONS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <p className="text-xs text-gray-500">{sorted.length} coach{sorted.length !== 1 ? 'es' : ''}</p>
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
              <SortHeader col="teams">Teams</SortHeader>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400">Roles</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-500">No coaches found</td>
              </tr>
            ) : sorted.map(c => {
              const assigns = c.assignments || [];
              const roleLabels = Array.from(new Set(assigns.map(a => a.role_label).filter(Boolean)));
              return (
                <tr key={c.id} className="border-t border-gray-700/50 hover:bg-gray-800/40 transition-colors">
                  <td className="px-3 py-2 font-medium text-white whitespace-nowrap">{c.name}</td>
                  <td className="px-3 py-2 text-gray-300 break-all">
                    {c.email ? <a href={`mailto:${c.email}`} className="text-chrome-400 hover:text-chrome-300 underline">{c.email}</a> : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-300">
                    {c.phone ? <a href={`tel:${c.phone}`} className="text-chrome-400 hover:text-chrome-300 underline">{c.phone}</a> : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {assigns.map((a, i) => (
                        <span
                          key={i}
                          className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full"
                          title={a.age_group ? `${a.age_group} · ${a.role_label}` : a.role_label}
                        >
                          {a.team_name}
                          {a.age_group && <span className="text-gray-500 ml-1">({a.age_group})</span>}
                        </span>
                      ))}
                      {assigns.length === 0 && <span className="text-gray-500">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {roleLabels.map(label => (
                        <span key={label} className="text-xs bg-action-500/20 text-action-300 px-2 py-0.5 rounded-full">
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-gray-500">No coaches found</p>
        ) : sorted.map(c => {
          const assigns = c.assignments || [];
          const roleLabels = Array.from(new Set(assigns.map(a => a.role_label).filter(Boolean)));
          return (
            <div key={c.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-3">
              <p className="font-medium text-white">{c.name}</p>
              {c.email && <p className="text-sm text-gray-400 truncate"><a href={`mailto:${c.email}`} className="text-chrome-400 hover:text-chrome-300 underline">{c.email}</a></p>}
              {c.phone && <p className="text-sm text-gray-400"><a href={`tel:${c.phone}`} className="text-chrome-400 hover:text-chrome-300 underline">{c.phone}</a></p>}
              {assigns.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {assigns.map((a, i) => (
                    <span key={i} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                      {a.team_name}
                      {a.age_group && <span className="text-gray-500 ml-1">({a.age_group})</span>}
                    </span>
                  ))}
                </div>
              )}
              {roleLabels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {roleLabels.map(label => (
                    <span key={label} className="text-xs bg-action-500/20 text-action-300 px-2 py-0.5 rounded-full">
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
