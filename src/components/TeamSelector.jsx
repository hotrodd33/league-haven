import { useState, useEffect } from 'react';
import { fetchTeams } from '../api/index.js';

export default function TeamSelector({ selectedTeam, onSelectTeam }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTeams() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchTeams();
        if (!cancelled) setTeams(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadTeams();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="p-4 text-center text-gray-500">Loading teams…</div>;
  if (error) return <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>;
  if (teams.length === 0) return <div className="p-4 text-center text-gray-500">No teams found.</div>;

  const grouped = {};
  const ungrouped = [];
  for (const team of teams) {
    if (team.org_name) {
      if (!grouped[team.org_name]) grouped[team.org_name] = [];
      grouped[team.org_name].push(team);
    } else {
      ungrouped.push(team);
    }
  }
  const orgNames = Object.keys(grouped).sort();

  return (
    <div>
      <label htmlFor="team-select" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        Select Team
      </label>
      <select
        id="team-select"
        value={selectedTeam || ''}
        onChange={(e) => {
          const id = e.target.value ? Number(e.target.value) : null;
          const team = id ? teams.find(t => t.id === id) : null;
          onSelectTeam(id, team?.org_id || null);
        }}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600"
      >
        <option value="">— Choose a team —</option>
        {orgNames.map((orgName) => (
          <optgroup key={orgName} label={orgName}>
            {grouped[orgName].map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </optgroup>
        ))}
        {ungrouped.length > 0 && orgNames.length > 0 && (
          <optgroup label="Unassigned">
            {ungrouped.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </optgroup>
        )}
        {ungrouped.length > 0 && orgNames.length === 0 && ungrouped.map((team) => (
          <option key={team.id} value={team.id}>{team.name}</option>
        ))}
      </select>
    </div>
  );
}
