import { useState, useEffect, useMemo } from 'react';
import { fetchAllPlayers, fetchOrganizations, fetchTeams, fetchAllPitchRest } from '../api/index.js';
import { MagnifyingGlassIcon, UserIcon } from './ui/icons.jsx';

export default function PlayersPage({ onSelectPlayer }) {
  const [players, setPlayers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [teams, setTeams] = useState([]);
  const [pitchRest, setPitchRest] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterOrg, setFilterOrg] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  useEffect(() => {
    Promise.all([
      fetchAllPlayers(),
      fetchOrganizations(),
      fetchTeams(),
      fetchAllPitchRest().catch(() => ({})),
    ]).then(([p, o, t, pr]) => {
      setPlayers(p);
      setOrgs(o);
      setTeams(t);
      setPitchRest(pr);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Teams filtered by org
  const filteredTeamOptions = useMemo(() => {
    if (!filterOrg) return teams;
    return teams.filter(t => String(t.org_id) === filterOrg);
  }, [teams, filterOrg]);

  const filtered = useMemo(() => {
    let list = players;
    if (filterOrg) {
      list = list.filter(p => p.teams?.some(t => String(t.org_id) === filterOrg));
    }
    if (filterTeam) {
      list = list.filter(p => p.teams?.some(t => String(t.team_id) === filterTeam));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)
      );
    }
    return list;
  }, [players, filterOrg, filterTeam, search]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    const s = [...filtered].sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case 'name': va = `${a.first_name} ${a.last_name}`.toLowerCase(); vb = `${b.first_name} ${b.last_name}`.toLowerCase(); break;
        case 'age': va = calculateAge(a.date_of_birth); vb = calculateAge(b.date_of_birth); va = va === '' ? -1 : Number(va); vb = vb === '' ? -1 : Number(vb); break;
        case 'grade': va = a.grade ?? ''; vb = b.grade ?? ''; break;
        case 'bt': va = `${a.batting_hand || ''}/${a.throwing_hand || ''}`; vb = `${b.batting_hand || ''}/${b.throwing_hand || ''}`; break;
        case 'team': va = a.teams?.map(t => t.team_name).join(', ') || ''; vb = b.teams?.map(t => t.team_name).join(', ') || ''; break;
        case 'org': va = [...new Set((a.teams || []).map(t => t.org_name).filter(Boolean))].join(', '); vb = [...new Set((b.teams || []).map(t => t.org_name).filter(Boolean))].join(', '); break;
        default: return 0;
      }
      if (typeof va === 'number' && typeof vb === 'number') return va - vb;
      return String(va).localeCompare(String(vb), undefined, { numeric: true });
    });
    return sortDir === 'desc' ? s.reverse() : s;
  }, [filtered, sortCol, sortDir]);

  function calculateAge(dob) {
    if (!dob || typeof dob !== 'string') return '';
    const s = dob.trim();
    let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) { match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (match) match = [, match[3], match[1], match[2]]; }
    if (!match) return '';
    const [, y, m, d] = match.map(Number);
    const today = new Date();
    let age = today.getFullYear() - y;
    const mDiff = (today.getMonth() + 1) - m;
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < d)) age--;
    return age >= 0 ? age : '';
  }

  function PitchRestBadge({ playerId }) {
    const rest = pitchRest[playerId];
    if (!rest) return null;
    if (rest.eligible_today) {
      return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">Avail: Today</span>;
    }
    const avail = rest.available_date;
    const label = avail ? `Avail: ${new Date(avail + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Resting';
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">{label}</span>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={filterOrg}
          onChange={e => { setFilterOrg(e.target.value); setFilterTeam(''); }}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Organizations</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select
          value={filterTeam}
          onChange={e => setFilterTeam(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Teams</option>
          {filteredTeamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      <p className="text-sm text-gray-400">{sorted.length} player{sorted.length !== 1 ? 's' : ''}</p>

      {/* Desktop Table */}
      <div className="hidden md:block bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800 text-gray-400 text-left text-xs uppercase tracking-wider">
              <SortTh col="name" label="Name" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
              <th className="px-4 py-3">Pitching</th>
              <SortTh col="age" label="Age" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
              <SortTh col="grade" label="Grade" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
              <SortTh col="bt" label="B/T" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
              <SortTh col="team" label="Team(s)" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
              <SortTh col="org" label="Organization" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {sorted.map(p => (
              <tr
                key={p.id}
                className="hover:bg-gray-700/30 cursor-pointer transition-colors"
                onClick={() => onSelectPlayer(p.id)}
              >
                <td className="px-4 py-3 font-medium text-white">
                  {p.first_name} {p.last_name}
                </td>
                <td className="px-4 py-3"><PitchRestBadge playerId={p.id} /></td>
                <td className="px-4 py-3 text-gray-300">{calculateAge(p.date_of_birth) || '—'}</td>
                <td className="px-4 py-3 text-gray-300">{p.grade || '—'}</td>
                <td className="px-4 py-3 text-gray-300">{p.batting_hand || '—'}/{p.throwing_hand || '—'}</td>
                <td className="px-4 py-3 text-gray-300">
                  {p.teams?.length ? p.teams.map(t => t.team_name).join(', ') : '—'}
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {p.teams?.length ? [...new Set(p.teams.map(t => t.org_name).filter(Boolean))].join(', ') : '—'}
                </td>
              </tr>
            ))}
            {!sorted.length && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No players found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-2">
        {sorted.map(p => (
          <div
            key={p.id}
            className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 cursor-pointer hover:bg-gray-700/40 transition-colors"
            onClick={() => onSelectPlayer(p.id)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                <UserIcon className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-white truncate">{p.first_name} {p.last_name}</p>
                  <PitchRestBadge playerId={p.id} />
                </div>
                <p className="text-xs text-gray-400 truncate">
                  {p.teams?.length ? p.teams.map(t => t.team_name).join(', ') : 'Unassigned'}
                </p>
              </div>
              <div className="text-right text-xs text-gray-400">
                {calculateAge(p.date_of_birth) ? `${calculateAge(p.date_of_birth)}y` : ''}{' '}
                {p.grade ? `Gr ${p.grade}` : ''}
              </div>
            </div>
          </div>
        ))}
        {!sorted.length && (
          <p className="text-center text-gray-500 py-8">No players found</p>
        )}
      </div>
    </div>
  );
}

function SortTh({ col, label, sortCol, sortDir, onClick }) {
  const arrow = sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th className="px-4 py-3 cursor-pointer select-none hover:text-gray-200 transition-colors" onClick={() => onClick(col)}>
      {label}{arrow}
    </th>
  );
}
