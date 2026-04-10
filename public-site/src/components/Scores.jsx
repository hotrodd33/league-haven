import { useState, useEffect, useCallback } from 'react';
import { fetchGames, fetchSeasons } from '../api/index.js';

function TeamLogo({ src, name, size = 'w-8 h-8' }) {
  if (!src) return (
    <div className={`${size} bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-500 shrink-0`}>
      {(name || '?')[0]}
    </div>
  );
  return <img src={src} alt="" className={`${size} object-contain rounded shrink-0`} />;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const STATUS_COLORS = {
  scheduled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
  postponed: 'bg-gray-200 text-gray-700',
};
const STATUS_LABELS = {
  scheduled: 'Scheduled',
  in_progress: 'Live',
  completed: 'Final',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
};

export default function Scores() {
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState('');
  const [filter, setFilter] = useState('all'); // all | completed | upcoming
  const [games, setGames] = useState([]);
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

  const loadGames = useCallback(async () => {
    if (!seasonId) { setGames([]); return; }
    setLoading(true); setError(null);
    try {
      const params = { season_id: seasonId };
      if (filter === 'completed') params.status = 'completed';
      if (filter === 'upcoming') params.status = 'scheduled';
      setGames(await fetchGames(params));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [seasonId, filter]);

  useEffect(() => { loadGames(); }, [loadGames]);

  // Group by division, then by date
  const byDivision = {};
  for (const g of games) {
    const divKey = g.division_id ? String(g.division_id) : '__none__';
    const divName = g.division_name || 'Unassigned';
    if (!byDivision[divKey]) byDivision[divKey] = { name: divName, sort: g.division_sort || 'zzz', dates: {} };
    const dateKey = g.game_date || 'TBD';
    if (!byDivision[divKey].dates[dateKey]) byDivision[divKey].dates[dateKey] = [];
    byDivision[divKey].dates[dateKey].push(g);
  }

  const divisionGroups = Object.values(byDivision).sort((a, b) => a.sort.localeCompare(b.sort));

  if (loading && !games.length) return <div className="py-12 text-center text-gray-400">Loading scores…</div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h2 className="font-heading text-2xl font-bold tracking-wide text-blue-800">Scores</h2>
        <div className="flex gap-2 flex-wrap">
          <div className="flex rounded-lg overflow-hidden border border-gray-300">
            {['all', 'completed', 'upcoming'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-sm font-semibold transition-colors ${filter === f ? 'bg-blue-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
              >
                {f === 'all' ? 'All' : f === 'completed' ? 'Final' : 'Upcoming'}
              </button>
            ))}
          </div>
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
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}

      {divisionGroups.length === 0 && !loading && (
        <div className="py-12 text-center text-gray-400">No games found.</div>
      )}

      {divisionGroups.map(div => (
        <div key={div.name} className="mb-8">
          <h3 className="font-heading text-lg font-semibold text-blue-900 border-b-2 border-blue-200 pb-2 mb-3 tracking-wide">
            {div.name}
          </h3>
          {Object.entries(div.dates)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, dateGames]) => (
              <div key={date} className="mb-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {formatDate(date)}
                </div>
                <div className="space-y-2">
                  {dateGames.map(g => (
                    <div key={g.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-center justify-between gap-4">
                        {/* Away team */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <TeamLogo src={g.away_logo} name={g.away_team_name} />
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{g.away_team_name}</div>
                            <div className="text-xs text-gray-400">Away</div>
                          </div>
                        </div>

                        {/* Score / time */}
                        <div className="text-center shrink-0 px-4">
                          {g.status === 'completed' || g.status === 'in_progress' ? (
                            <div className="flex items-center gap-3">
                              <span className={`text-2xl font-bold tabular-nums ${g.away_score > g.home_score ? 'text-blue-800' : 'text-gray-600'}`}>
                                {g.away_score ?? 0}
                              </span>
                              <span className="text-gray-300 text-lg">–</span>
                              <span className={`text-2xl font-bold tabular-nums ${g.home_score > g.away_score ? 'text-blue-800' : 'text-gray-600'}`}>
                                {g.home_score ?? 0}
                              </span>
                            </div>
                          ) : (
                            <div className="text-sm font-semibold text-gray-600">
                              {g.game_time ? formatTime(g.game_time) : 'TBD'}
                            </div>
                          )}
                          <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[g.status] || 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_LABELS[g.status] || g.status}
                          </span>
                        </div>

                        {/* Home team */}
                        <div className="flex items-center gap-3 flex-1 min-w-0 justify-end text-right">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{g.home_team_name}</div>
                            <div className="text-xs text-gray-400">Home</div>
                          </div>
                          <TeamLogo src={g.home_logo} name={g.home_team_name} />
                        </div>
                      </div>

                      {/* Location */}
                      {g.location_name && (
                        <div className="mt-2 text-xs text-gray-400 text-center">
                          📍 {g.location_name}{g.location_city ? `, ${g.location_city}` : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
