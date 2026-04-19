import { useState, useEffect, useCallback } from 'react';
import { fetchGames, fetchSeasons } from '../api/index.js';
import TeamLogo from './TeamLogo.jsx';

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

const STATUS_STYLES = {
  scheduled:   'bg-chrome-800/60 text-chrome-300 border border-chrome-700/40',
  in_progress: 'bg-accent-900/40 text-accent-300 border border-accent-700/40',
  completed:   'bg-action-900/40 text-action-300 border border-action-700/40',
  cancelled:   'bg-signal-900/40 text-signal-300 border border-signal-700/40',
  postponed:   'bg-gray-800 text-gray-400 border border-gray-700',
};
const STATUS_LABELS = {
  scheduled:   'Scheduled',
  in_progress: 'Live',
  completed:   'Final',
  cancelled:   'Cancelled',
  postponed:   'Postponed',
};

export default function Scores() {
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState('');
  const [filter, setFilter] = useState('all');
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
      if (filter === 'upcoming')  params.status = 'scheduled';
      setGames(await fetchGames(params));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [seasonId, filter]);

  useEffect(() => { loadGames(); }, [loadGames]);

  const byDivision = {};
  for (const g of games) {
    const divKey  = g.division_id ? String(g.division_id) : '__none__';
    const divName = g.division_name || 'Unassigned';
    if (!byDivision[divKey]) byDivision[divKey] = { name: divName, sort: g.division_sort || 'zzz', dates: {} };
    const dateKey = g.game_date || 'TBD';
    if (!byDivision[divKey].dates[dateKey]) byDivision[divKey].dates[dateKey] = [];
    byDivision[divKey].dates[dateKey].push(g);
  }
  const divisionGroups = Object.values(byDivision).sort((a, b) => a.sort.localeCompare(b.sort));

  if (loading && !games.length) {
    return <div className="py-12 text-center text-gray-400">Loading scores…</div>;
  }

  const filterBtns = [
    { key: 'all',       label: 'All'      },
    { key: 'completed', label: 'Final'    },
    { key: 'upcoming',  label: 'Upcoming' },
  ];

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h2 className="font-display text-2xl font-bold tracking-wide text-white">Scores</h2>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex rounded-md overflow-hidden border border-gray-700">
            {filterBtns.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
                  filter === f.key
                    ? 'bg-action-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
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
        </div>
      </div>

      {error && <div className="lh-alert-error mb-4">{error}</div>}

      {divisionGroups.length === 0 && !loading && (
        <div className="py-12 text-center text-gray-400">No games found.</div>
      )}

      {divisionGroups.map(div => (
        <div key={div.name} className="mb-8">
          <h3 className="font-display text-base font-bold text-action-300 border-b-2 border-action-700 pb-1 mb-3 tracking-wide">
            {div.name}
          </h3>

          {Object.entries(div.dates)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, dateGames]) => (
              <div key={date} className="mb-4">
                <div className="eyebrow mb-2">{formatDate(date)}</div>
                <div className="space-y-2">
                  {dateGames.map(g => {
                    const isScored = g.status === 'completed' || g.status === 'in_progress';
                    const awayWin  = isScored && (g.away_score ?? 0) > (g.home_score ?? 0);
                    const homeWin  = isScored && (g.home_score ?? 0) > (g.away_score ?? 0);
                    return (
                      <div key={g.id} className="bg-gray-800 border border-gray-700 rounded-card-sm p-4 hover:border-gray-600 transition-colors">
                        <div className="flex items-center justify-between gap-4">
                          {/* Away team */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <TeamLogo src={g.away_logo} name={g.away_team_name} ageGroup={g.away_age_group} level={g.away_level} cityAbbr={g.away_city_abbr} primaryColor={g.away_primary_color} secondaryColor={g.away_secondary_color} />
                            <div className="min-w-0">
                              <div className={`font-semibold text-sm truncate ${awayWin ? 'text-gray-100' : isScored ? 'text-gray-400' : 'text-gray-200'}`}>
                                {g.away_team_name}
                              </div>
                              <div className="text-xs text-gray-500">Away</div>
                            </div>
                          </div>

                          {/* Score / time */}
                          <div className="text-center shrink-0 px-3">
                            {isScored ? (
                              <div className="flex items-center gap-2">
                                <span className={`text-2xl font-bold tabular-nums ${awayWin ? 'text-action-300' : 'text-gray-400'}`}>
                                  {g.away_score ?? 0}
                                </span>
                                <span className="text-gray-600 text-lg">–</span>
                                <span className={`text-2xl font-bold tabular-nums ${homeWin ? 'text-action-300' : 'text-gray-400'}`}>
                                  {g.home_score ?? 0}
                                </span>
                              </div>
                            ) : (
                              <div className="text-sm font-semibold text-gray-300">
                                {g.game_time ? formatTime(g.game_time) : 'TBD'}
                              </div>
                            )}
                            <span className={`inline-flex items-center gap-1 mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[g.status] || STATUS_STYLES.postponed}`}>
                              {g.status === 'in_progress' && <span className="live-ring" />}
                              {STATUS_LABELS[g.status] || g.status}
                            </span>
                          </div>

                          {/* Home team */}
                          <div className="flex items-center gap-3 flex-1 min-w-0 justify-end text-right">
                            <div className="min-w-0">
                              <div className={`font-semibold text-sm truncate ${homeWin ? 'text-gray-100' : isScored ? 'text-gray-400' : 'text-gray-200'}`}>
                                {g.home_team_name}
                              </div>
                              <div className="text-xs text-gray-500">Home</div>
                            </div>
                            <TeamLogo src={g.home_logo} name={g.home_team_name} ageGroup={g.home_age_group} level={g.home_level} cityAbbr={g.home_city_abbr} primaryColor={g.home_primary_color} secondaryColor={g.home_secondary_color} />
                          </div>
                        </div>

                        {(g.location_name || !!g.official_names?.length) && (
                          <div className="mt-2.5 pt-2 border-t border-gray-700 flex flex-col gap-0.5">
                            {g.location_name && (
                              <div className="text-xs text-gray-500 text-center">
                                📍 {g.location_name}{g.location_city ? `, ${g.location_city}` : ''}
                              </div>
                            )}
                            {!!g.official_names?.length && (
                              <div className="text-xs text-gray-500 text-center">
                                {g.official_names.length === 1 ? 'Umpire:' : 'Umpires:'} {g.official_names.join(', ')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
