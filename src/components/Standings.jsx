import { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { STALE } from '../lib/queryConfig.js';
import { fetchStandings, fetchSeasons } from '../api/index.js';
import TeamLogo from './TeamLogo.jsx';

const btnSecondary = "btn btn-secondary btn-md";

function winPct(team) {
  if (!team.gp) return '---';
  return ((team.wins + (team.ties * 0.5)) / team.gp).toFixed(3).replace(/^0(?=\.)/, '');
}

export default function Standings({ onBack, onNavigateToTeam }) {
  const [seasonId, setSeasonId] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');

  const { data: seasons = [], error: seasonsError } = useQuery({
    queryKey: ['seasons'],
    queryFn: fetchSeasons,
    staleTime: STALE.HOUR,
  });

  // Set active season once seasons load
  useEffect(() => {
    if (seasons.length && !seasonId) {
      const active = seasons.find(s => s.is_active);
      if (active) setSeasonId(String(active.id));
    }
  }, [seasons, seasonId]);

  // Reset division filter when season changes
  useEffect(() => { setDivisionFilter(''); }, [seasonId]);

  const { data: standings = [], isLoading: standingsLoading, error: standingsError } = useQuery({
    queryKey: ['standings', seasonId],
    queryFn: () => fetchStandings(seasonId),
    enabled: !!seasonId,
    staleTime: STALE.TWO_MIN,
    placeholderData: keepPreviousData,
  });

  const loading = standingsLoading;
  const error = seasonsError || standingsError;

  const divisionOptions = Object.values(
    standings.reduce((acc, row) => {
      if (!row.division_id) return acc;
      const key = String(row.division_id);
      if (!acc[key]) {
        acc[key] = {
          id: key,
          name: row.division_name || 'Other',
          sort: row.division_sort || 'zzz',
        };
      }
      return acc;
    }, {})
  ).sort((a, b) => a.sort.localeCompare(b.sort) || a.name.localeCompare(b.name));

  const filteredStandings = divisionFilter
    ? standings.filter((row) => String(row.division_id) === divisionFilter)
    : standings;

  // Group by division
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

  if (loading && !standings.length) return <div className="py-8 text-center text-gray-400">Loading standings…</div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-heading font-bold text-white">Standings</h2>
        <div className="flex gap-2 items-center">
          <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}
            className="px-3 py-2 border border-gray-600 rounded-lg text-sm text-gray-100 bg-gray-800 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-action-500/30 focus:border-chrome-500">
            <option value="">Select Season</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
            ))}
          </select>
          <select
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
            className="px-3 py-2 border border-gray-600 rounded-lg text-sm text-gray-100 bg-gray-800 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-action-500/30 focus:border-chrome-500"
            disabled={!seasonId || divisionOptions.length === 0}
          >
            <option value="">All Divisions</option>
            {divisionOptions.map((div) => (
              <option key={div.id} value={div.id}>{div.name}</option>
            ))}
          </select>
          {onBack && <button onClick={onBack} className={btnSecondary}>← Back</button>}
        </div>
      </div>

      {error && <div className="lh-alert lh-alert-error mb-4">{error.message}</div>}

      {!seasonId ? (
        <div className="py-12 text-center text-gray-400">Select a season to view standings.</div>
      ) : standings.length === 0 && !loading ? (
        <div className="py-12 text-center text-gray-400">No completed games yet this season.</div>
      ) : (
        <div className="space-y-8">
          {divisions.map(div => (
            <div key={div.key}>
              {(divisions.length > 1 || div.name) && (
                <h3 className="text-base font-heading font-bold text-field-300 mb-3 border-b-2 border-field-700 pb-1">
                  {div.name || 'Other'}
                </h3>
              )}

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-700">
                      <th className="text-left py-2 px-2 font-semibold text-gray-300 uppercase text-xs tracking-wide w-8">#</th>
                      <th className="text-left py-2 px-2 font-semibold text-gray-300 uppercase text-xs tracking-wide">Team</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-300 uppercase text-xs tracking-wide w-14">PTS</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-300 uppercase text-xs tracking-wide w-14">GP</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-300 uppercase text-xs tracking-wide w-12">W</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-300 uppercase text-xs tracking-wide w-12">L</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-300 uppercase text-xs tracking-wide w-12">T</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-300 uppercase text-xs tracking-wide w-16">PCT</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-300 uppercase text-xs tracking-wide w-12">RF</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-300 uppercase text-xs tracking-wide w-12">RA</th>
                      <th className="text-center py-2 px-2 font-semibold text-gray-300 uppercase text-xs tracking-wide w-14">DIFF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {div.teams.map((team, idx) => {
                      const diff = team.runs_for - team.runs_against;
                      return (
                        <tr key={team.team_id} className={`border-b border-gray-700 ${idx === 0 ? 'bg-field-900/20' : 'hover:bg-gray-900'}`} style={{ borderLeft: `3px solid ${team.primary_color || '#ccc'}` }}>
                          <td className="py-2.5 px-2 text-gray-400 font-mono text-xs">{idx + 1}</td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-2">
                              <TeamLogo src={team.logo} name={team.team_name} ageGroup={team.age_group} level={team.level} cityAbbr={team.city_abbr} primaryColor={team.primary_color} secondaryColor={team.secondary_color} />
                              <div>
                                <button onClick={() => onNavigateToTeam?.(team.team_id, team.org_id)} className="font-semibold text-field-300 hover:text-field-100 hover:underline text-left">{team.team_name}</button>
                                {team.org_name && <span className="text-xs text-gray-400 ml-1.5">({team.org_name})</span>}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center font-bold text-field-300 tabular-nums">{team.points}</td>
                          <td className="py-2.5 px-2 text-center text-gray-400">{team.gp}</td>
                          <td className="py-2.5 px-2 text-center font-bold text-gray-100">{team.wins}</td>
                          <td className="py-2.5 px-2 text-center font-bold text-gray-100">{team.losses}</td>
                          <td className="py-2.5 px-2 text-center text-gray-400">{team.ties || '—'}</td>
                          <td className="py-2.5 px-2 text-center text-gray-300 tabular-nums">{winPct(team)}</td>
                          <td className="py-2.5 px-2 text-center text-gray-300 tabular-nums">{team.runs_for}</td>
                          <td className="py-2.5 px-2 text-center text-gray-300 tabular-nums">{team.runs_against}</td>
                          <td className={`py-2.5 px-2 text-center font-semibold tabular-nums ${diff > 0 ? 'text-action-400' : diff < 0 ? 'text-signal-400' : 'text-gray-400'}`}>
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
                  const diff = team.runs_for - team.runs_against;
                  return (
                    <div key={team.team_id} className={`bg-gray-800 border border-gray-700 rounded-lg p-3 ${idx === 0 ? 'ring-1 ring-field-500/50' : ''}`} style={{ borderLeft: `3px solid ${team.primary_color || '#ccc'}` }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-mono text-gray-400 w-5">{idx + 1}</span>
                        <TeamLogo src={team.logo} name={team.team_name} ageGroup={team.age_group} level={team.level} cityAbbr={team.city_abbr} primaryColor={team.primary_color} secondaryColor={team.secondary_color} size="w-8 h-8" />
                        <div className="flex-1 min-w-0">
                          <button onClick={() => onNavigateToTeam?.(team.team_id, team.org_id)} className="font-semibold text-sm truncate text-field-300 hover:text-field-100 hover:underline text-left block max-w-full">{team.team_name}</button>
                          {team.org_name && <div className="text-xs text-gray-400">{team.org_name}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-sm text-gray-100">{team.wins}-{team.losses}{team.ties ? `-${team.ties}` : ''}</div>
                          <div className="text-xs font-bold text-field-300">{team.points} pts</div>
                          <div className="text-[11px] text-gray-400 tabular-nums">PCT {winPct(team)}</div>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-gray-400 border-t border-gray-700 pt-1.5">
                        <span>PTS: {team.points}</span>
                        <span>GP: {team.gp}</span>
                        <span>W-L-T: {team.wins}-{team.losses}-{team.ties || 0}</span>
                        <span>PCT: {winPct(team)}</span>
                        <span>RA: {team.runs_against}</span>
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
      )}
    </div>
  );
}
