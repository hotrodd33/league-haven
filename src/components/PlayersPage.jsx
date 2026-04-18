import { useState, useEffect, useMemo } from 'react';
import { fetchAllPlayers, fetchOrganizations, fetchTeams, fetchAllPitchRest } from '../api/index.js';
import { MagnifyingGlassIcon, UserIcon } from './ui/icons.jsx';
import { calculateAge } from '../utils/dob.js';
import { Input, Select, Badge, Card, Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell, TableEmpty } from './ui';

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
        case 'age': va = calculateAge(a.date_of_birth); vb = calculateAge(b.date_of_birth); va = va == null ? -1 : Number(va); vb = vb == null ? -1 : Number(vb); break;
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

  function PitchRestBadge({ playerId }) {
    const rest = pitchRest[playerId];
    if (!rest) return null;
    if (rest.eligible_today) {
      return <Badge variant="success">Avail: Today</Badge>;
    }
    const avail = rest.available_date;
    const label = avail ? `Avail: ${new Date(avail + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Resting';
    return <Badge variant="danger">{label}</Badge>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-chrome-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          wrapperClassName="flex-1"
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          icon={<MagnifyingGlassIcon className="w-4 h-4" />}
        />
        <Select
          value={filterOrg}
          onChange={e => { setFilterOrg(e.target.value); setFilterTeam(''); }}
        >
          <option value="">All Organizations</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select
          value={filterTeam}
          onChange={e => setFilterTeam(e.target.value)}
        >
          <option value="">All Teams</option>
          {filteredTeamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </div>

      <p className="text-sm text-gray-400">{sorted.length} player{sorted.length !== 1 ? 's' : ''}</p>

      {/* Desktop Table */}
      <div className="hidden md:block">
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell sortable sorted={sortCol === 'name'} sortDir={sortDir} onClick={() => toggleSort('name')}>Name</TableHeaderCell>
              <TableHeaderCell>Pitching</TableHeaderCell>
              <TableHeaderCell sortable sorted={sortCol === 'age'} sortDir={sortDir} onClick={() => toggleSort('age')}>Age</TableHeaderCell>
              <TableHeaderCell sortable sorted={sortCol === 'grade'} sortDir={sortDir} onClick={() => toggleSort('grade')}>Grade</TableHeaderCell>
              <TableHeaderCell sortable sorted={sortCol === 'bt'} sortDir={sortDir} onClick={() => toggleSort('bt')}>B/T</TableHeaderCell>
              <TableHeaderCell sortable sorted={sortCol === 'team'} sortDir={sortDir} onClick={() => toggleSort('team')}>Team(s)</TableHeaderCell>
              <TableHeaderCell sortable sorted={sortCol === 'org'} sortDir={sortDir} onClick={() => toggleSort('org')}>Organization</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {sorted.map(p => (
              <TableRow
                key={p.id}
                className="cursor-pointer"
                onClick={() => onSelectPlayer(p.id)}
              >
                <TableCell className="font-medium text-white">
                  {p.first_name} {p.last_name}
                </TableCell>
                <TableCell><PitchRestBadge playerId={p.id} /></TableCell>
                <TableCell>{calculateAge(p.date_of_birth) ?? '—'}</TableCell>
                <TableCell>{p.grade || '—'}</TableCell>
                <TableCell>{p.batting_hand || '—'}/{p.throwing_hand || '—'}</TableCell>
                <TableCell>
                  {p.teams?.length ? p.teams.map(t => t.team_name).join(', ') : '—'}
                </TableCell>
                <TableCell>
                  {p.teams?.length ? [...new Set(p.teams.map(t => t.org_name).filter(Boolean))].join(', ') : '—'}
                </TableCell>
              </TableRow>
            ))}
            {!sorted.length && (
              <TableEmpty colSpan={7} message="No players found" />
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-2">
        {sorted.map(p => (
          <Card
            key={p.id}
            variant="bordered"
            hoverable
            className="cursor-pointer"
            onClick={() => onSelectPlayer(p.id)}
          >
            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-chrome-500/20 flex items-center justify-center shrink-0">
                  <UserIcon className="w-5 h-5 text-chrome-400" />
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
                  {calculateAge(p.date_of_birth) != null ? `${calculateAge(p.date_of_birth)}y` : ''}{' '}
                  {p.grade ? `Gr ${p.grade}` : ''}
                </div>
              </div>
            </div>
          </Card>
        ))}
        {!sorted.length && (
          <p className="text-center text-gray-500 py-8">No players found</p>
        )}
      </div>
    </div>
  );
}
