import { useState, useEffect } from 'react';
import { fetchTeams, fetchOrganizations } from '../api/index.js';
import TeamLogo from './TeamLogo.jsx';

export default function Teams() {
  const [teams, setTeams] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [filterOrg, setFilterOrg] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([fetchTeams(), fetchOrganizations()])
      .then(([t, o]) => { setTeams(t); setOrgs(o); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filterOrg ? teams.filter(t => String(t.org_id) === filterOrg) : teams;
  const grouped = {};
  for (const t of filtered) {
    const key = t.org_name || 'Independent';
    if (!grouped[key]) grouped[key] = { org: { name: key, logo: t.org_logo || null }, teams: [] };
    grouped[key].teams.push(t);
  }
  const orgGroups = Object.values(grouped).sort((a, b) => a.org.name.localeCompare(b.org.name));

  if (loading) return <div className="py-12 text-center text-gray-400">Loading teams…</div>;
  if (error) return <div className="py-8 text-center text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h2 className="font-heading text-2xl font-bold tracking-wide text-blue-800">Teams</h2>
        <select
          value={filterOrg}
          onChange={e => setFilterOrg(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="">All Organizations</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      {orgGroups.map(group => (
        <div key={group.org.name} className="mb-8">
          <div className="flex items-center gap-3 mb-3 border-b-2 border-blue-200 pb-2">
            <TeamLogo src={group.org.logo} name={group.org.name} size="w-8 h-8" />
            <h3 className="font-heading text-lg font-semibold text-blue-900 tracking-wide">{group.org.name}</h3>
            <span className="text-xs text-gray-400 ml-auto">{group.teams.length} team{group.teams.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.teams.map(team => (
              <div key={team.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 hover:shadow-md transition-shadow" style={{ borderLeft: `4px solid ${team.primary_color || '#ccc'}` }}>
                <TeamLogo src={team.logo_url || group.org.logo} name={team.long_name || team.name} cityAbbr={team.city_abbr} primaryColor={team.primary_color} secondaryColor={team.secondary_color} size="w-12 h-12" />
                <div className="min-w-0">
                  <div className="font-semibold truncate">{team.long_name || team.name}</div>
                  <div className="text-xs text-gray-500">
                    {[team.age_group, team.level].filter(Boolean).join(' · ')}
                  </div>
                  {team.divisions?.length > 0 && (
                    <div className="text-xs text-blue-600 mt-0.5 truncate">
                      {team.divisions.map(d => d.name).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="py-12 text-center text-gray-400">No teams found.</div>
      )}
    </div>
  );
}
