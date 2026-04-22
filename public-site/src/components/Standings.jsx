import { useState, useEffect } from 'react';
import { fetchStandings, fetchSeasons } from '../api/index.js';
import TeamLogo from './TeamLogo.jsx';

function winPct(team) {
  if (!team.gp) return '---';
  return ((team.wins + (team.ties * 0.5)) / team.gp).toFixed(3).replace(/^0(?=\.)/, '');
}

export default function Standings({ onNavigateToTeam }) {
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [standings, setStandings] = useState([]);
  const [seasonsLoading, setSeasonsLoading] = useState(true);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSeasons()
      .then(data => {
        setSeasons(data);
        const active = data.find(s => s.is_active);
        if (active) setSeasonId(String(active.id));
      })
      .catch(err => setError(err.message))
      .finally(() => setSeasonsLoading(false));
  }, []);

  useEffect(() => {
    if (!seasonId) { setStandings([]); return; }
    setStandingsLoading(true);
    setError(null);
    fetchStandings(seasonId)
      .then(data => setStandings(data))
      .catch(err => setError(err.message))
      .finally(() => setStandingsLoading(false));
  }, [seasonId]);

  useEffect(() => { setDivisionFilter(''); }, [seasonId]);

  const loading = seasonsLoading || standingsLoading;

  const divisionOptions = Object.values(
    standings.reduce((acc, row) => {
      if (!row.division_id) return acc;
      const key = String(row.division_id);
      if (!acc[key]) {
        acc[key] = { id: key, name: row.division_name || 'Other', sort: row.division_sort || 'zzz' };
      }
      return acc;
    }, {})
  ).sort((a, b) => a.sort.localeCompare(b.sort) || a.name.localeCompare(b.name));

  const filteredStandings = divisionFilter
    ? standings.filter(row => String(row.division_id) === divisionFilter)
    : standings;

  const divisions = [];
  const divMap = {};
  for (const row of filteredStandings) {
    const key = row.division_id ? String(row.division_id) : '__none__';
    if (!divMap[key]) {
      divMap[key] = { key, name: row.division_name || null, teams: [] };
      divisions.push(divMap[key]);
    }
    divMap[key].teams.push(row);
  }

  if (loading && !standings.length) {
    return <div className="py-12 text-center text-gray-400">Loading standings…</div>;
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h2 className="font-display text-2xl font-bold tracking-wide text-white">Standings</h2>
        <div className="flex gap-2 items-center">
          {seasons.length > 1 && (
            <select
              value={seasonId}
              onChange={e => setSeasonId(e.target.value)}
              className="lh-select"
            >
              <option value="">Select Season</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>{s.name} {s.year}{s.is_active ? ' ★' : ''}</option>
              ))}
            </select>
          )}
          <select
            value={divisionFilter}
            onChange={e => setDivisionFilter(e.target.value)}
            className="lh-select"
            disabled={!seasonId || divisionOptions.length === 0}
          >
            <option value="">All Divisions</option>
            {divisionOptions.map(div => (
              <option key={div.id} value={div.id}>{div.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="lh-alert-error mb-4">{error}</div>}

      {divisions.length === 0 && !loading && (
        <div className="py-12 text-center text-gray-400">No standings data available.</div>
      )}

      <div className="space-y-8">
        {divisions.map(div => (
          <div key={div.key}>
            {div.name && (
              <h3 className="font-display text-base font-bold text-action-300 border-b-2 border-action-700 pb-1 mb-3 tracking-wide">
                {div.name}
              </h3>
            )}

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto rounded-card-sm border border-gray-700/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900 border-b border-gray-700">
                    <th className="px-3 py-2.5 text-left eyebrow w-8">#</th>
                    <th className="px-3 py-2.5 text-left eyebrow">Team</th>
                    <th className="px-3 py-2.5 text-center eyebrow w-14">PTS</th>
                    <th className="px-3 py-2.5 text-center eyebrow w-14">GP</th>
                    <th className="px-3 py-2.5 text-center eyebrow w-12">W</th>
                    <th className="px-3 py-2.5 text-center eyebrow w-12">L</th>
                    <th className="px-3 py-2.5 text-center eyebrow w-12">T</th>
                    <th className="px-3 py-2.5 text-center eyebrow w-16">PCT</th>
                    <th className="px-3 py-2.5 text-center eyebrow w-12">RF</th>
                    <th className="px-3 py-2.5 text-center eyebrow w-12">RA</th>
                    <th className="px-3 py-2.5 text-center eyebrow w-14">DIFF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50 bg-gray-800/40">
                  {div.teams.map((t, idx) => {
                    const diff = t.runs_for - t.runs_against;
                    return (
                      <tr
                        key={t.team_id}
                        className={`transition-colors hover:bg-gray-700/30 ${idx === 0 && t.gp > 0 ? 'bg-action-900/20' : ''}`}
                        style={{ borderLeft: `3px solid ${t.primary_color || '#334155'}` }}
                      >
                        <td className="px-3 py-2.5 text-gray-500 font-mono text-xs">{idx + 1}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <TeamLogo src={t.logo} name={t.team_name} ageGroup={t.age_group} level={t.level} cityAbbr={t.city_abbr} primaryColor={t.primary_color} secondaryColor={t.secondary_color} />
                            <div>
                              <button
                                onClick={() => onNavigateToTeam?.(t.team_id)}
                                className="font-semibold text-action-300 hover:text-action-100 hover:underline text-left"
                              >
                                {t.team_name}
                              </button>
                              {t.org_name && <div className="text-xs text-gray-500">{t.org_name}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-action-300 tabular-nums">{t.points}</td>
                        <td className="px-3 py-2.5 text-center text-gray-400 tabular-nums">{t.gp}</td>
                        <td className="px-3 py-2.5 text-center font-bold text-gray-100 tabular-nums">{t.wins}</td>
                        <td className="px-3 py-2.5 text-center font-bold text-gray-100 tabular-nums">{t.losses}</td>
                        <td className="px-3 py-2.5 text-center text-gray-400 tabular-nums">{t.ties || '—'}</td>
                        <td className="px-3 py-2.5 text-center text-gray-300 tabular-nums">{winPct(t)}</td>
                        <td className="px-3 py-2.5 text-center text-gray-300 tabular-nums">{t.runs_for}</td>
                        <td className="px-3 py-2.5 text-center text-gray-300 tabular-nums">{t.runs_against}</td>
                        <td className={`px-3 py-2.5 text-center font-semibold tabular-nums ${diff > 0 ? 'text-action-400' : diff < 0 ? 'text-signal-400' : 'text-gray-400'}`}>
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
                  <div
                    key={t.team_id}
                    className={`bg-gray-800 border rounded-card-sm p-3 ${idx === 0 && t.gp > 0 ? 'border-action-700/60 ring-1 ring-action-700/30' : 'border-gray-700'}`}
                    style={{ borderLeft: `3px solid ${t.primary_color || '#334155'}` }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono text-gray-500 w-5">{idx + 1}</span>
                      <TeamLogo src={t.logo} name={t.team_name} ageGroup={t.age_group} level={t.level} cityAbbr={t.city_abbr} primaryColor={t.primary_color} secondaryColor={t.secondary_color} size="w-8 h-8" />
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => onNavigateToTeam?.(t.team_id)}
                          className="font-semibold text-sm text-action-300 hover:text-action-100 hover:underline text-left truncate block max-w-full"
                        >
                          {t.team_name}
                        </button>
                        {t.org_name && <div className="text-xs text-gray-500">{t.org_name}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-sm text-gray-100 tabular-nums">{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ''}</div>
                        <div className="text-xs font-bold text-action-300 tabular-nums">{t.points} pts</div>
                        <div className="text-[11px] text-gray-500 tabular-nums">PCT {winPct(t)}</div>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 border-t border-gray-700 pt-1.5">
                      <span>GP: {t.gp}</span>
                      <span>RF: {t.runs_for}</span>
                      <span>RA: {t.runs_against}</span>
                      <span className={`font-semibold ${diff > 0 ? 'text-action-400' : diff < 0 ? 'text-signal-400' : ''}`}>
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
    </div>
  );
}
