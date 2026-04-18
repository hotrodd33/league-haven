import { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { STALE } from '../lib/queryConfig.js';
import { fetchStandings, fetchSeasons } from '../api/index.js';
import TeamLogo from './TeamLogo.jsx';
import { Button, Select, Card, Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell } from './ui';

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
        <h2 className="text-xl font-display font-bold text-white">Standings</h2>
        <div className="flex gap-2 items-center">
          <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="min-w-[160px]">
            <option value="">Select Season</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
            ))}
          </Select>
          <Select
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
            className="min-w-[180px]"
            disabled={!seasonId || divisionOptions.length === 0}
          >
            <option value="">All Divisions</option>
            {divisionOptions.map((div) => (
              <option key={div.id} value={div.id}>{div.name}</option>
            ))}
          </Select>
          {onBack && <Button variant="secondary" onClick={onBack}>← Back</Button>}
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
                <h3 className="text-base font-display font-bold text-action-300 mb-3 border-b-2 border-action-700 pb-1">
                  {div.name || 'Other'}
                </h3>
              )}

              {/* Desktop table */}
              <div className="hidden sm:block">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell className="w-8 text-left">#</TableHeaderCell>
                      <TableHeaderCell className="text-left">Team</TableHeaderCell>
                      <TableHeaderCell className="text-center w-14">PTS</TableHeaderCell>
                      <TableHeaderCell className="text-center w-14">GP</TableHeaderCell>
                      <TableHeaderCell className="text-center w-12">W</TableHeaderCell>
                      <TableHeaderCell className="text-center w-12">L</TableHeaderCell>
                      <TableHeaderCell className="text-center w-12">T</TableHeaderCell>
                      <TableHeaderCell className="text-center w-16">PCT</TableHeaderCell>
                      <TableHeaderCell className="text-center w-12">RF</TableHeaderCell>
                      <TableHeaderCell className="text-center w-12">RA</TableHeaderCell>
                      <TableHeaderCell className="text-center w-14">DIFF</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {div.teams.map((team, idx) => {
                      const diff = team.runs_for - team.runs_against;
                      return (
                        <TableRow key={team.team_id} highlight={idx === 0} style={{ borderLeft: `3px solid ${team.primary_color || '#ccc'}` }}>
                          <TableCell className="text-gray-400 font-mono text-xs">{idx + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <TeamLogo src={team.logo} name={team.team_name} ageGroup={team.age_group} level={team.level} cityAbbr={team.city_abbr} primaryColor={team.primary_color} secondaryColor={team.secondary_color} />
                              <div>
                                <button onClick={() => onNavigateToTeam?.(team.team_id, team.org_id)} className="font-semibold text-action-300 hover:text-action-100 hover:underline text-left">{team.team_name}</button>
                                {team.org_name && <span className="text-xs text-gray-400 ml-1.5">({team.org_name})</span>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-bold text-action-300 tabular-nums">{team.points}</TableCell>
                          <TableCell className="text-center text-gray-400">{team.gp}</TableCell>
                          <TableCell className="text-center font-bold text-gray-100">{team.wins}</TableCell>
                          <TableCell className="text-center font-bold text-gray-100">{team.losses}</TableCell>
                          <TableCell className="text-center text-gray-400">{team.ties || '—'}</TableCell>
                          <TableCell className="text-center tabular-nums">{winPct(team)}</TableCell>
                          <TableCell className="text-center tabular-nums">{team.runs_for}</TableCell>
                          <TableCell className="text-center tabular-nums">{team.runs_against}</TableCell>
                          <TableCell className={`text-center font-semibold tabular-nums ${diff > 0 ? 'text-action-400' : diff < 0 ? 'text-signal-400' : 'text-gray-400'}`}>
                            {diff > 0 ? '+' : ''}{diff}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {div.teams.map((team, idx) => {
                  const diff = team.runs_for - team.runs_against;
                  return (
                    <Card key={team.team_id} variant="bordered" className={idx === 0 ? 'ring-1 ring-action-500/50' : ''} style={{ borderLeft: `3px solid ${team.primary_color || '#ccc'}` }}>
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-mono text-gray-400 w-5">{idx + 1}</span>
                          <TeamLogo src={team.logo} name={team.team_name} ageGroup={team.age_group} level={team.level} cityAbbr={team.city_abbr} primaryColor={team.primary_color} secondaryColor={team.secondary_color} size="w-8 h-8" />
                          <div className="flex-1 min-w-0">
                            <button onClick={() => onNavigateToTeam?.(team.team_id, team.org_id)} className="font-semibold text-sm truncate text-action-300 hover:text-action-100 hover:underline text-left block max-w-full">{team.team_name}</button>
                            {team.org_name && <div className="text-xs text-gray-400">{team.org_name}</div>}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-bold text-sm text-gray-100">{team.wins}-{team.losses}{team.ties ? `-${team.ties}` : ''}</div>
                            <div className="text-xs font-bold text-action-300">{team.points} pts</div>
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
                    </Card>
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
