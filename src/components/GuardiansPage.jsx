import { useState, useEffect, useMemo } from 'react';
import { fetchAllGuardians, fetchVolunteerRoles } from '../api/index.js';
import { MagnifyingGlassIcon } from './ui/icons.jsx';
import { Input, Select, Badge } from './ui';

function Spinner() {
  return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-action-500 border-t-transparent rounded-full animate-spin" /></div>;
}

export default function GuardiansPage({ onViewPlayer }) {
  const [guardians, setGuardians] = useState([]);
  const [volunteerRoles, setVolunteerRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    Promise.all([
      fetchAllGuardians(),
      fetchVolunteerRoles().catch(() => []),
    ]).then(([g, vr]) => {
      setGuardians(g);
      setVolunteerRoles(vr);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

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
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(g =>
        `${g.first_name} ${g.last_name}`.toLowerCase().includes(q) ||
        (g.email || '').toLowerCase().includes(q) ||
        (g.phone || '').includes(q)
      );
    }
    return list;
  }, [guardians, filterRole, search]);

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

  if (loading) return <div className="py-12 text-center"><Spinner /></div>;

  return (
    <div>
      <h2 className="text-xl font-display font-bold text-white mb-4">Guardians</h2>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="lh-input pl-9 w-full"
          />
        </div>
        {volunteerRoles.length > 0 && (
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="lh-select min-w-[180px]"
          >
            <option value="">All Volunteer Interests</option>
            {volunteerRoles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        )}
      </div>

      <p className="text-xs text-gray-500 mb-2">{sorted.length} guardian{sorted.length !== 1 ? 's' : ''}</p>

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
