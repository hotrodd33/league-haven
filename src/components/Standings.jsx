import { useState, useEffect, useCallback } from 'react';
import { fetchStandings, fetchSeasons } from '../api/index.js';

const btnSecondary = "px-4 py-2 bg-gray-200 text-gray-800 text-sm font-semibold rounded-lg hover:bg-gray-300 transition-colors";

function TeamLogo({ src, name, size = 'w-7 h-7' }) {
  if (!src) return <div className={`${size} bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-500 shrink-0`}>{(name || '?')[0]}</div>;
  return <img src={src} alt="" className={`${size} object-contain rounded shrink-0`} />;
}

export default function Standings({ onBack }) {
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState('');
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSeasons().then(data => {
      setSeasons(data);
      const active = data.find(s => s.is_active);
      if (active) setSeasonId(String(active.id));
    }).catch(err => setError(err.message))
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

  if (loading && !standings.length) return <div className="py-8 text-center text-gray-500">Loading standings…</div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold">Standings</h2>
        <div className="flex gap-2 items-center">
          <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-w-[160px]">
            <option value="">Select Season</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
            ))}
          </select>
          {onBack && <button onClick={onBack} className={btnSecondary}>← Back</button>}
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}

      {!seasonId ? (
        <div className="py-12 text-center text-gray-500">Select a season to view standings.</div>
      ) : standings.length === 0 && !loading ? (
        <div className="py-12 text-center text-gray-500">No completed games yet this season.</div>
      ) : (
        <div className="space-y-8">
          {divisions.map(div => (
            <div key={div.key}>
              {(divisions.length > 1 || div.name) && (
                <h3 className="text-base font-bold text-blue-900 mb-3 border-b-2 border-blue-200 pb-1">
                  {div.name || 'Other'}
                </h3>
              )}

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-2 px-2 font-semibold text-gray-500 uppercase text-xs tracking-wide w-8">#</th>
                      <th className="text-left py-2 px-2 font-semibold text-gray-500 uppercase text-xs tracking-wide">Team</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-500 uppercase text-xs tracking-wide w-12">W</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-500 uppercase text-xs tracking-wide w-12">L</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-500 uppercase text-xs tracking-wide w-12">T</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-500 uppercase text-xs tracking-wide w-14">GP</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-500 uppercase text-xs tracking-wide w-16">PCT</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-500 uppercase text-xs tracking-wide w-12">RF</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-500 uppercase text-xs tracking-wide w-12">RA</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-500 uppercase text-xs tracking-wide w-14">DIFF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {div.teams.map((team, idx) => {
                      const pct = team.gp > 0 ? ((team.wins + team.ties * 0.5) / team.gp) : 0;
                      const diff = team.runs_for - team.runs_against;
                      return (
                        <tr key={team.team_id} className={`border-b border-gray-100 ${idx === 0 ? 'bg-yellow-50/50' : 'hover:bg-gray-50'}`}>
                          <td className="py-2.5 px-2 text-gray-400 font-mono text-xs">{idx + 1}</td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-2">
                              <TeamLogo src={team.logo} name={team.team_name} />
                              <div>
                                <span className="font-semibold">{team.team_name}</span>
                                {team.org_name && <span className="text-xs text-gray-400 ml-1.5">({team.org_name})</span>}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center font-bold">{team.wins}</td>
                          <td className="py-2.5 px-2 text-center font-bold">{team.losses}</td>
                          <td className="py-2.5 px-2 text-center text-gray-500">{team.ties || '—'}</td>
                          <td className="py-2.5 px-2 text-center text-gray-500">{team.gp}</td>
                          <td className="py-2.5 px-2 text-center font-semibold tabular-nums">{pct.toFixed(3).replace(/^0/, '')}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600 tabular-nums">{team.runs_for}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600 tabular-nums">{team.runs_against}</td>
                          <td className={`py-2.5 px-2 text-center font-semibold tabular-nums ${diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-600' : 'text-gray-500'}`}>
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
                {div.teams.map((team, idx) => {
                  const pct = team.gp > 0 ? ((team.wins + team.ties * 0.5) / team.gp) : 0;
                  const diff = team.runs_for - team.runs_against;
                  return (
                    <div key={team.team_id} className={`bg-white border border-gray-200 rounded-lg p-3 ${idx === 0 ? 'ring-1 ring-yellow-300' : ''}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-mono text-gray-400 w-5">{idx + 1}</span>
                        <TeamLogo src={team.logo} name={team.team_name} size="w-8 h-8" />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{team.team_name}</div>
                          {team.org_name && <div className="text-xs text-gray-400">{team.org_name}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-sm">{team.wins}-{team.losses}{team.ties ? `-${team.ties}` : ''}</div>
                          <div className="text-xs text-gray-500">{pct.toFixed(3).replace(/^0/, '')}</div>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 border-t border-gray-100 pt-1.5">
                        <span>GP: {team.gp}</span>
                        <span>RF: {team.runs_for}</span>
                        <span>RA: {team.runs_against}</span>
                        <span className={`font-semibold ${diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-600' : ''}`}>
                          DIFF: {diff > 0 ? '+' : ''}{diff}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
