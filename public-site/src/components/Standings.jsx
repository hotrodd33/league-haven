import { useState, useEffect, useCallback } from 'react';
import { fetchStandings, fetchSeasons } from '../api/index.js';
import TeamLogo from './TeamLogo.jsx';

export default function Standings() {
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState('');
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSeasons()
      .then(data => {
        setSeasons(data);
        const active = data.find(s => s.is_active);
        if (active) setSeasonId(String(active.id));
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const loadStandings = useCallback(async () => {
    if (!seasonId) { setStandings([]); return; }
    setLoading(true); setError(null);
    try {
      setStandings(await fetchStandings(seasonId));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [seasonId]);

  useEffect(() => { loadStandings(); }, [loadStandings]);

  // Group by division
  const divisions = [];
  const divMap = {};
  for (const row of standings) {
    const key = row.division_id ? String(row.division_id) : '__none__';
    if (!divMap[key]) {
      divMap[key] = { key, name: row.division_name || null, teams: [] };
      divisions.push(divMap[key]);
    }
    divMap[key].teams.push(row);
  }

  if (loading && !standings.length) return <div className="py-12 text-center text-gray-400">Loading standings…</div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h2 className="font-heading text-2xl font-bold tracking-wide text-blue-800">Standings</h2>
        {seasons.length > 1 && (
          <select
            value={seasonId}
            onChange={e => setSeasonId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">Select Season</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name} {s.year}{s.is_active ? ' (Current)' : ''}</option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}

      {divisions.length === 0 && !loading && (
        <div className="py-12 text-center text-gray-400">No standings data available.</div>
      )}

      {divisions.map(div => (
        <div key={div.key} className="mb-8">
          {div.name && (
            <h3 className="font-heading text-lg font-semibold text-blue-900 border-b-2 border-blue-200 pb-2 mb-3 tracking-wide">
              {div.name}
            </h3>
          )}

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm bg-white rounded-lg shadow-sm overflow-hidden">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide w-8"></th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">Team</th>
                  <th className="px-3 py-2 text-center text-xs font-bold uppercase text-gray-500 tracking-wide">W</th>
                  <th className="px-3 py-2 text-center text-xs font-bold uppercase text-gray-500 tracking-wide">L</th>
                  <th className="px-3 py-2 text-center text-xs font-bold uppercase text-gray-500 tracking-wide">T</th>
                  <th className="px-3 py-2 text-center text-xs font-bold uppercase text-gray-500 tracking-wide">PTS</th>
                  <th className="px-3 py-2 text-center text-xs font-bold uppercase text-gray-500 tracking-wide">GP</th>
                  <th className="px-3 py-2 text-center text-xs font-bold uppercase text-gray-500 tracking-wide">RF</th>
                  <th className="px-3 py-2 text-center text-xs font-bold uppercase text-gray-500 tracking-wide">RA</th>
                  <th className="px-3 py-2 text-center text-xs font-bold uppercase text-gray-500 tracking-wide">DIFF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {div.teams.map((t, idx) => {
                  const diff = t.runs_for - t.runs_against;
                  return (
                    <tr key={t.team_id} className={idx === 0 && t.gp > 0 ? 'bg-yellow-50/50' : 'hover:bg-gray-50'} style={{ borderLeft: `3px solid ${t.primary_color || '#ccc'}` }}>
                      <td className="px-3 py-2">
                        <TeamLogo src={t.logo} name={t.team_name} cityAbbr={t.city_abbr} primaryColor={t.primary_color} secondaryColor={t.secondary_color} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold">{t.team_name}</div>
                        <div className="text-xs text-gray-400">{t.org_name}</div>
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{t.wins}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{t.losses}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{t.ties}</td>
                      <td className="px-3 py-2 text-center tabular-nums font-bold text-blue-800">{t.points}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-gray-500">{t.gp}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{t.runs_for}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{t.runs_against}</td>
                      <td className={`px-3 py-2 text-center tabular-nums font-semibold ${diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {diff > 0 ? '+' : ''}{diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {div.teams.map((t, idx) => {
              const diff = t.runs_for - t.runs_against;
              return (
                <div key={t.team_id} className={`bg-white border rounded-lg p-3 flex items-center gap-3 ${idx === 0 && t.gp > 0 ? 'border-yellow-300 ring-1 ring-yellow-200' : 'border-gray-200'}`} style={{ borderLeft: `3px solid ${t.primary_color || '#ccc'}` }}>
                  <TeamLogo src={t.logo} name={t.team_name} cityAbbr={t.city_abbr} primaryColor={t.primary_color} secondaryColor={t.secondary_color} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{t.team_name}</div>
                    <div className="text-xs text-gray-400">{t.org_name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-blue-800 text-lg tabular-nums">{t.points}<span className="text-xs text-gray-400 ml-1">pts</span></div>
                    <div className="text-xs text-gray-500 tabular-nums">{t.wins}W {t.losses}L {t.ties}T</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
