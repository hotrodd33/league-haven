import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STALE } from '../lib/queryConfig.js';
import { fetchTeamStats } from '../api/index.js';
import { cn } from '../lib/cn.js';
import { ChartBarIcon } from './ui/icons.jsx';

// ── Column definitions (mirror PlayerDetail.jsx exactly) ──
const BATTING_COLUMNS = [
  { key: 'G',   label: 'G' },
  { key: 'AB',  label: 'AB' },
  { key: 'R',   label: 'R' },
  { key: 'H',   label: 'H' },
  { key: '2B',  label: '2B' },
  { key: '3B',  label: '3B' },
  { key: 'HR',  label: 'HR' },
  { key: 'RBI', label: 'RBI' },
  { key: 'BB',  label: 'BB' },
  { key: 'K',   label: 'SO' },
  { key: 'SB',  label: 'SB' },
  { key: 'AVG', label: 'AVG', rate: true },
  { key: 'OBP', label: 'OBP', rate: true },
  { key: 'SLG', label: 'SLG', rate: true },
  { key: 'OPS', label: 'OPS', rate: true },
];

const PITCHING_COLUMNS = [
  { key: 'G',    label: 'G' },
  { key: 'W',    label: 'W' },
  { key: 'L',    label: 'L' },
  { key: 'SV',   label: 'SV' },
  { key: 'IP',   label: 'IP', display: formatIP },
  { key: 'HA',   label: 'H' },
  { key: 'RA',   label: 'R' },
  { key: 'ER',   label: 'ER' },
  { key: 'BB',   label: 'BB' },
  { key: 'K',    label: 'SO' },
  { key: 'PC',   label: 'PC' },
  { key: 'STK',  label: 'S' },
  { key: 'SPCT', label: 'S%', rate: true, decimals: 1, suffix: '%' },
  { key: 'ERA',  label: 'ERA', rate: true, decimals: 2 },
  { key: 'WHIP', label: 'WHIP', rate: true, decimals: 2 },
];

// ── Rate calculations (mirror PlayerDetail.jsx) ──
function battingRates(b) {
  const ab = +b.AB || 0, h = +b.H || 0, bb = +b.BB || 0;
  const dbl = +b['2B'] || 0, tpl = +b['3B'] || 0, hr = +b.HR || 0;
  const avg = ab > 0 ? h / ab : 0;
  const obp = (ab + bb) > 0 ? (h + bb) / (ab + bb) : 0;
  const tb = h + dbl + 2 * tpl + 3 * hr;
  const slg = ab > 0 ? tb / ab : 0;
  return { AVG: avg, OBP: obp, SLG: slg, OPS: obp + slg };
}

function ipToOuts(ip) {
  const whole = Math.floor(ip);
  const frac = Math.round((ip - whole) * 10);
  return whole * 3 + (frac === 1 ? 1 : frac === 2 ? 2 : 0);
}

function pitchingRates(p) {
  const outs = ipToOuts(+p.IP || 0);
  const innings = outs / 3;
  const er = +p.ER || 0, ha = +p.HA || 0, bb = +p.BB || 0;
  const pc = +p.PC || 0, stk = +p.STK || 0;
  return {
    ERA:  innings > 0 ? (er * 9) / innings : 0,
    WHIP: innings > 0 ? (ha + bb) / innings : 0,
    SPCT: pc > 0 ? (stk / pc) * 100 : null,
  };
}

function formatIP(ip) {
  if (ip == null || ip === '') return '—';
  const n = Number(ip);
  return isNaN(n) ? ip : n.toFixed(1);
}

function formatRate(v, decimals = 3) {
  if (v == null || isNaN(v)) return '—';
  if (decimals === 3) {
    const s = v.toFixed(3);
    return v < 1 ? s.replace(/^0/, '') : s;
  }
  return v.toFixed(decimals);
}

function renderCell(value, col) {
  if (col.rate) {
    const f = formatRate(value, col.decimals ?? 3);
    return (f !== '—' && col.suffix) ? f + col.suffix : f;
  }
  if (col.display) return col.display(value);
  if (value == null || value === '') return '—';
  return value;
}

// ── Build per-player stat map from flat server rows ──
function buildPlayerMap(stats) {
  const map = {};
  for (const r of stats) {
    if (!map[r.player_id]) {
      map[r.player_id] = { name: r.player_name, last_name: r.last_name };
    }
    map[r.player_id][r.abbreviation.toUpperCase()] = r.total;
    map[r.player_id]['__games_' + r.category] = r.games;
  }
  return map;
}

function StatTable({ title, columns, rows, totalRow }) {
  // Only show columns that have at least one non-zero value (excluding rate cols)
  const activeColumns = columns.filter(col => {
    if (col.rate || col.display) return true; // always show computed columns
    return rows.some(r => r[col.key] != null && r[col.key] !== 0 && r[col.key] !== '');
  });

  if (!rows.length) return null;

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-700 bg-gray-900/40">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900/30 border-b border-gray-700">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-300 uppercase tracking-wider sticky left-0 bg-gray-900/30">Player</th>
              {activeColumns.map(c => (
                <th key={c.key} className="text-right px-2 py-2 text-xs font-semibold text-gray-300 uppercase tracking-wider tabular-nums">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                <td className="px-3 py-2 text-gray-100 whitespace-nowrap sticky left-0 bg-gray-800/80">{row.__name}</td>
                {activeColumns.map(c => (
                  <td key={c.key} className="text-right px-2 py-2 text-gray-100 tabular-nums">
                    {renderCell(row[c.key], c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totalRow && (
            <tfoot>
              <tr className="bg-gray-900/40 font-bold border-t border-gray-600">
                <td className="px-3 py-2 text-white sticky left-0 bg-gray-900/40">Team</td>
                {activeColumns.map(c => (
                  <td key={c.key} className="text-right px-2 py-2 text-white tabular-nums">
                    {renderCell(totalRow[c.key], c)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
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

  // Build per-player stat maps
  const playerMap = buildPlayerMap(stats);

  // Batting rows
  const battingRows = Object.entries(playerMap)
    .filter(([, p]) => p['__games_batting'] > 0)
    .sort(([, a], [, b]) => a.last_name.localeCompare(b.last_name))
    .map(([, p]) => {
      const b = { ...p, G: p['__games_batting'] };
      return { __name: p.name, ...b, ...battingRates(b) };
    });

  // Batting team totals
  const battingTotal = battingRows.reduce((acc, r) => {
    for (const c of BATTING_COLUMNS) {
      if (!c.rate) acc[c.key] = (acc[c.key] || 0) + (Number(r[c.key]) || 0);
    }
    return acc;
  }, {});
  Object.assign(battingTotal, battingRates(battingTotal));

  // Pitching rows
  const pitchingRows = Object.entries(playerMap)
    .filter(([, p]) => p['__games_pitching'] > 0)
    .sort(([, a], [, b]) => a.last_name.localeCompare(b.last_name))
    .map(([, p]) => {
      const pt = { ...p, G: p['__games_pitching'] };
      return { __name: p.name, ...pt, ...pitchingRates(pt) };
    });

  // Pitching team totals (count rates from summed raw stats)
  const pitchingTotal = pitchingRows.reduce((acc, r) => {
    for (const c of PITCHING_COLUMNS) {
      if (!c.rate && !c.display) acc[c.key] = (acc[c.key] || 0) + (Number(r[c.key]) || 0);
      // IP needs special summing via outs
      if (c.key === 'IP') {
        acc['__outs'] = (acc['__outs'] || 0) + ipToOuts(Number(r.IP) || 0);
      }
    }
    return acc;
  }, {});
  if (pitchingTotal['__outs'] != null) {
    const outs = pitchingTotal['__outs'];
    pitchingTotal.IP = Math.floor(outs / 3) + (outs % 3) / 10;
  }
  Object.assign(pitchingTotal, pitchingRates(pitchingTotal));

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
              <option key={s.id} value={s.id}>{s.name}{s.year ? ` (${s.year})` : ''}</option>
            ))}
          </select>
        </div>
      )}

      {/* Team record banner */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'W',  value: record.wins,         color: 'text-green-400' },
          { label: 'L',  value: record.losses,        color: 'text-signal-400' },
          { label: 'T',  value: record.ties,          color: 'text-gray-400' },
          { label: 'RS', value: record.runs_scored,   color: 'text-action-400' },
          { label: 'RA', value: record.runs_allowed,  color: 'text-orange-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3 text-center">
            <div className={cn('text-2xl font-display font-bold tabular-nums', color)}>{value}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className={cn(
        'text-center text-sm font-semibold',
        runDiff > 0 ? 'text-green-400' : runDiff < 0 ? 'text-signal-400' : 'text-gray-400'
      )}>
        Run Differential: {runDiff > 0 ? '+' : ''}{runDiff}
      </div>

      {/* Stats tables */}
      {hasStats ? (
        <div className="space-y-6">
          <StatTable
            title="Hitting"
            columns={BATTING_COLUMNS}
            rows={battingRows}
            totalRow={battingRows.length > 1 ? battingTotal : null}
          />
          <StatTable
            title="Pitching"
            columns={PITCHING_COLUMNS}
            rows={pitchingRows}
            totalRow={pitchingRows.length > 1 ? pitchingTotal : null}
          />
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
