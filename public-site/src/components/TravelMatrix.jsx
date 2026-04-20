import { useState, useMemo, useEffect } from 'react';
import { fetchTravelMatrix } from '../api/index.js';

function distColor(d) {
  if (d === null || d === 0) return '';
  if (d <= 20) return 'bg-green-900/60 text-green-300';
  if (d <= 35) return 'bg-yellow-900/50 text-yellow-300';
  if (d <= 55) return 'bg-orange-900/50 text-orange-300';
  return 'bg-red-900/50 text-red-300';
}

function distBadge(d) {
  if (d <= 20) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (d <= 35) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  if (d <= 55) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
}

function makeShort(name) {
  const words = name.trim().split(/\s+/);
  if (words.length > 1) return words.map(w => w[0]).join('').toUpperCase().substring(0, 4);
  return name.substring(0, 3).toUpperCase();
}

export default function TravelMatrix() {
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [filterMax, setFilterMax] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [matrix, setMatrix] = useState([]);
  const [method, setMethod] = useState('haversine');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTravelMatrix()
      .then(data => { setOrgs(data.orgs || []); setMatrix(data.matrix || []); setMethod(data.method || 'haversine'); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const teams = useMemo(() => orgs.map(o => o.name), [orgs]);
  const shorts = useMemo(() => orgs.map(o => makeShort(o.name)), [orgs]);

  const sorted = useMemo(() => {
    if (selectedIdx === null || !matrix.length) return [];
    return teams
      .map((name, i) => ({ name, dist: matrix[selectedIdx]?.[i], idx: i }))
      .filter(r => r.idx !== selectedIdx && r.dist !== null)
      .sort((a, b) => a.dist - b.dist);
  }, [selectedIdx, teams, matrix]);

  const avgDist = useMemo(() => {
    if (selectedIdx === null || !matrix.length) return null;
    const vals = (matrix[selectedIdx] || []).filter((v, i) => i !== selectedIdx && v !== null);
    if (!vals.length) return null;
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }, [selectedIdx, matrix]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading travel matrix...</div>;
  }

  if (error) {
    return <div className="rounded-lg border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-300">{error}</div>;
  }

  const hasData = matrix.length > 0 && matrix.some(row => row.some(v => v !== null && v !== 0));

  if (!hasData) {
    return (
      <div className="rounded-xl border border-gray-700 bg-gray-900 p-8 text-center text-gray-500">
        <div className="text-3xl mb-3">🗺️</div>
        <p className="text-sm">Travel distances are not yet available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Travel Distance Matrix</h1>
        <p className="text-sm text-gray-400 mt-1">
          Approximate distances (miles) between league sites. Click any team name to see a sorted trip planner.
        </p>
        <p className="text-xs text-yellow-400/80 mt-1">
          Distances are straight-line estimates. Actual driving distance may be ~20% higher.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 rounded border bg-green-500/20 text-green-400 border-green-500/30">≤ 20 mi — Short</span>
        <span className="px-2 py-1 rounded border bg-yellow-500/20 text-yellow-400 border-yellow-500/30">21–35 mi — Moderate</span>
        <span className="px-2 py-1 rounded border bg-orange-500/20 text-orange-400 border-orange-500/30">36–55 mi — Long</span>
        <span className="px-2 py-1 rounded border bg-red-500/20 text-red-400 border-red-500/30">56+ mi — Far</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Matrix */}
        <div className="xl:col-span-2 overflow-x-auto rounded-xl border border-gray-700 bg-gray-900">
          <table className="text-xs border-collapse min-w-max">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-gray-900 border-b border-r border-gray-700 px-3 py-2 text-left text-gray-400 font-medium min-w-[130px]">
                  Home ↓ / Away →
                </th>
                {shorts.map((s, j) => (
                  <th
                    key={j}
                    title={teams[j]}
                    onClick={() => setSelectedIdx(j === selectedIdx ? null : j)}
                    className={`border-b border-gray-700 px-1.5 py-2 text-center font-mono cursor-pointer select-none transition-colors
                      ${j === selectedIdx ? 'bg-blue-900/60 text-blue-300' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}`}
                    style={{ minWidth: 36 }}
                  >
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((team, i) => (
                <tr key={i} className={i === selectedIdx ? 'bg-blue-900/20' : 'hover:bg-gray-800/40'}>
                  <td
                    onClick={() => setSelectedIdx(i === selectedIdx ? null : i)}
                    className={`sticky left-0 z-10 border-r border-b border-gray-700 px-3 py-1.5 font-medium cursor-pointer whitespace-nowrap select-none transition-colors
                      ${i === selectedIdx
                        ? 'bg-blue-900/60 text-blue-300'
                        : 'bg-gray-900 text-gray-300 hover:text-white hover:bg-gray-800'}`}
                  >
                    {team}
                  </td>
                  {(matrix[i] || []).map((dist, j) => (
                    <td
                      key={j}
                      className={`border-b border-gray-700/50 px-1 py-1.5 text-center tabular-nums transition-colors
                        ${i === j ? 'text-gray-600' : distColor(dist)}
                        ${(i === selectedIdx || j === selectedIdx) && i !== j ? 'ring-1 ring-inset ring-blue-500/40' : ''}`}
                    >
                      {i === j ? '—' : dist ?? '–'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Trip Planner panel */}
        <div className="xl:col-span-1">
          {selectedIdx === null ? (
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-6 text-center text-gray-500 text-sm h-full flex items-center justify-center">
              <div>
                <div className="text-3xl mb-2">🗺️</div>
                Click any team name in the matrix to see a sorted trip planner.
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-4">
              <div>
                <h2 className="font-bold text-white text-base">{teams[selectedIdx]}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Average away trip: <span className="text-white font-medium">{avgDist ?? '–'} mi</span>
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[null, 20, 35, 55].map(v => (
                  <button
                    key={v ?? 'all'}
                    onClick={() => setFilterMax(filterMax === v ? null : v)}
                    className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                      filterMax === v
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'border-gray-600 text-gray-400 hover:border-gray-400'
                    }`}
                  >
                    {v === null ? 'All' : `≤ ${v} mi`}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                {sorted
                  .filter(r => filterMax === null || r.dist <= filterMax)
                  .map(({ name, dist }) => (
                    <div key={name} className="flex items-center justify-between rounded-lg px-3 py-2 bg-gray-800/60">
                      <span className="text-sm text-gray-200">{name}</span>
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${distBadge(dist)}`}>
                        {dist} mi
                      </span>
                    </div>
                  ))}
                {filterMax !== null && sorted.filter(r => r.dist <= filterMax).length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-4">No teams within {filterMax} miles.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
