import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STALE } from '../lib/queryConfig.js';
import { fetchTeamStats } from '../api/index.js';
import { cn } from '../lib/cn.js';
import { TrophyIcon, ChartBarIcon } from './ui/icons.jsx';

function fmt(value, abbreviation, dataType) {
  if (value === null || value === undefined) return '—';
  const RATE_STATS = ['AVG', 'OBP', 'SLG', 'OPS', 'ERA', 'WHIP', 'BA'];
  if (RATE_STATS.includes(abbreviation?.toUpperCase()) || dataType === 'decimal') {
    return value.toFixed(3).replace(/^0\./, '.');
  }
  return Math.round(value);
}

function computeDerived(playerRow, abbrev) {
  const v = playerRow;
  switch (abbrev.toUpperCase()) {
    case 'AVG': {
      const h = v['H'], ab = v['AB'];
      if (ab > 0) return h / ab;
      return null;
    }
    case 'OBP': {
      const h = v['H'] || 0, bb = v['BB'] || 0, hbp = v['HBP'] || 0;
      const ab = v['AB'] || 0, sf = v['SF'] || 0;
      const denom = ab + bb + hbp + sf;
      return denom > 0 ? (h + bb + hbp) / denom : null;
    }
    case 'SLG': {
      const ab = v['AB'] || 0;
      if (!ab) return null;
      const h = v['H'] || 0, d = v['2B'] || 0, t = v['3B'] || 0, hr = v['HR'] || 0;
      const singles = h - d - t - hr;
      return (singles + 2 * d + 3 * t + 4 * hr) / ab;
    }
    case 'ERA': {
      const er = v['ER'] || 0, outs = v['OUTS'] || 0, ip = v['IP'] || 0;
      const innings = ip || outs / 3;
      return innings > 0 ? (er * 7) / innings : null;
    }
    case 'WHIP': {
      const bb = v['BB'] || 0, h = v['H'] || 0, outs = v['OUTS'] || 0, ip = v['IP'] || 0;
      const innings = ip || outs / 3;
      return innings > 0 ? (bb + h) / innings : null;
    }
    default:
      return null;
  }
}

function StatTable({ title, players, statDefs, category }) {
  const catDefs = statDefs
    .filter(d => d.category === category)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (!catDefs.length || !players.length) return null;

  // Build a lookup: player_id → { abbrev: total }
  const playerStatMap = {};
  for (const p of players) {
    if (!playerStatMap[p.player_id]) {
      playerStatMap[p.player_id] = { name: p.player_name, last_name: p.last_name, games: p.games };
    }
    playerStatMap[p.player_id][p.abbreviation] = p.total;
  }

  const rows = Object.values(playerStatMap).sort((a, b) =>
    a.last_name.localeCompare(b.last_name)
  );

  if (!rows.length) return null;

  // Compute team totals
  const totals = {};
  for (const def of catDefs) {
    const ab = def.abbreviation;
    const isDerived = ['AVG', 'OBP', 'SLG', 'ERA', 'WHIP'].includes(ab.toUpperCase());
    if (isDerived) {
      // compute from totals
      const totalMap = {};
      for (const def2 of catDefs) {
        totalMap[def2.abbreviation] = rows.reduce((s, r) => s + (r[def2.abbreviation] || 0), 0);
      }
      const v = computeDerived(totalMap, ab);
      totals[ab] = v;
    } else {
      totals[ab] = rows.reduce((s, r) => s + (r[ab] || 0), 0);
    }
  }

  return (
    <div>
      <h4 className="text-sm font-display font-bold uppercase tracking-wide text-gray-300 mb-2">{title}</h4>
      <div className="overflow-x-auto rounded-xl border border-gray-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-800/80 text-gray-400 uppercase tracking-wide">
              <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-gray-800/80">Player</th>
              <th className="text-center px-2 py-2 font-semibold">G</th>
              {catDefs.map(d => (
                <th key={d.id} className="text-center px-2 py-2 font-semibold" title={d.name}>{d.abbreviation}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-700/30 transition-colors">
                <td className="px-3 py-2 font-medium text-gray-200 whitespace-nowrap sticky left-0 bg-gray-800/90">{row.name}</td>
                <td className="text-center px-2 py-2 text-gray-400">{row.games}</td>
                {catDefs.map(d => {
                  const ab = d.abbreviation;
                  const isDerived = ['AVG', 'OBP', 'SLG', 'ERA', 'WHIP'].includes(ab.toUpperCase());
                  const val = isDerived ? computeDerived(row, ab) : (row[ab] ?? null);
                  return (
                    <td key={d.id} className="text-center px-2 py-2 text-gray-300 tabular-nums">
                      {val != null ? fmt(val, ab, d.data_type) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-800/60 border-t border-gray-600 font-semibold text-gray-200">
              <td className="px-3 py-2 sticky left-0 bg-gray-800/60">Team</td>
              <td className="text-center px-2 py-2 text-gray-400">—</td>
              {catDefs.map(d => (
                <td key={d.id} className="text-center px-2 py-2 tabular-nums">
                  {totals[d.abbreviation] != null ? fmt(totals[d.abbreviation], d.abbreviation, d.data_type) : '—'}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function TeamStats({ teamId }) {
  const [seasonId, setSeasonId] = useState('');

  const { data, isPending, isError } = useQuery({
    queryKey: ['team-stats', teamId, seasonId],
    queryFn: () => fetchTeamStats(teamId, seasonId || undefined),
    enabled: !!teamId,
    staleTime: STALE.ONE_MIN,
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-sm animate-pulse">
        Loading stats…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12 text-signal-400 text-sm">
        Failed to load team stats.
      </div>
    );
  }

  const { record, seasons, stats } = data;
  const hasStats = stats.length > 0;

  // Unique stat definitions from returned data
  const statDefs = [...new Map(
    stats.map(s => [s.stat_def_id, { id: s.stat_def_id, abbreviation: s.abbreviation, category: s.category, data_type: s.data_type, sort_order: s.sort_order, name: s.abbreviation }])
  ).values()];

  const battingPlayers = stats.filter(s => s.category === 'batting');
  const pitchingPlayers = stats.filter(s => s.category === 'pitching');
  const fieldingPlayers = stats.filter(s => s.category === 'fielding');

  const runDiff = record.runs_scored - record.runs_allowed;

  return (
    <div className="space-y-6 p-1">
      {/* Season selector */}
      {seasons.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 font-semibold">Season:</label>
          <select
            value={seasonId}
            onChange={e => setSeasonId(e.target.value)}
            className="text-xs bg-gray-800 border border-gray-600 text-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-action-500"
          >
            <option value="">All Seasons</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name} {s.year ? `(${s.year})` : ''}</option>
            ))}
          </select>
        </div>
      )}

      {/* Team record banner */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'W', value: record.wins, color: 'text-green-400' },
          { label: 'L', value: record.losses, color: 'text-signal-400' },
          { label: 'T', value: record.ties, color: 'text-gray-400' },
          { label: 'RS', value: record.runs_scored, color: 'text-action-400' },
          { label: 'RA', value: record.runs_allowed, color: 'text-orange-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3 text-center">
            <div className={cn('text-2xl font-display font-bold tabular-nums', color)}>{value}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Run differential */}
      <div className={cn(
        'text-center text-sm font-semibold',
        runDiff > 0 ? 'text-green-400' : runDiff < 0 ? 'text-signal-400' : 'text-gray-400'
      )}>
        Run Differential: {runDiff > 0 ? '+' : ''}{runDiff}
      </div>

      {/* Stats tables */}
      {hasStats ? (
        <div className="space-y-6">
          <StatTable title="Batting" players={battingPlayers} statDefs={statDefs} category="batting" />
          <StatTable title="Pitching" players={pitchingPlayers} statDefs={statDefs} category="pitching" />
          <StatTable title="Fielding" players={fieldingPlayers} statDefs={statDefs} category="fielding" />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <ChartBarIcon className="w-10 h-10 text-gray-600" />
          <p className="text-sm font-semibold text-gray-400">No stats recorded yet</p>
          <p className="text-xs text-gray-500">Stats entered on game detail pages will appear here.</p>
        </div>
      )}
    </div>
  );
}
