import { useState, useEffect } from 'react';
import { fetchTeamPitcherStats } from '../api/index.js';

function formatShortDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDayOfWeek(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

const STATUS_BADGE = {
  available: 'bg-green-900/35 text-green-300',
  resting: 'bg-yellow-900/35 text-yellow-300',
  unavailable: 'bg-red-900/35 text-red-300',
};

export default function PitcherRest({ teamId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!teamId) { setData(null); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    fetchTeamPitcherStats(teamId)
      .then(d => { if (!cancelled) setData(d); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teamId]);

  if (!teamId) return null;
  if (loading) return <div className="mt-6 text-sm text-gray-400 text-center py-4">Loading pitcher data…</div>;
  if (error) return <div className="mt-6 text-sm text-red-600 text-center py-4">{error}</div>;
  if (!data) return null;

  const { players, daily_limit, rules, today, season, age_category } = data;

  // Only show players who have pitched this season or are on the roster
  // (all roster players come back from the API)
  const pitchers = players.filter(p => p.season_total_pitches > 0 || p.pitches_last_7 > 0);
  const nonPitchers = players.filter(p => p.season_total_pitches === 0 && p.pitches_last_7 === 0);

  function getStatus(p) {
    if (!p.eligible_today) return 'unavailable';
    if (p.rest_days_required > 0 && p.available_date <= today) return 'available';
    if (p.pitches_last_7 > 0 && p.rest_after_today > 0) return 'resting';
    return 'available';
  }

  function statusLabel(p) {
    if (!p.eligible_today) {
      if (p.available_date > today) return `Avail ${formatShortDate(p.available_date)}`;
      return 'Unavailable';
    }
    return 'Available';
  }

  return (
    <div className="mt-6">
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden text-gray-200">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-300">
              Pitcher Rest & Stats
            </h3>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              {age_category && <span className="uppercase font-semibold">{age_category}</span>}
              {daily_limit && <span>Limit: {daily_limit}/day</span>}
              {season && <span>{season.name} {season.year}</span>}
            </div>
          </div>
          {/* Rest rules legend */}
          {rules && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
              {rules.rest_thresholds.slice().reverse().map((t, i) => (
                <span key={i}>{t.min}+ pitches → {t.days}d rest</span>
              ))}
              <span>Max 2 consecutive days</span>
            </div>
          )}
        </div>

        {/* Pitchers table */}
        {pitchers.length > 0 ? (
          <div>
            {/* Desktop header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 sm:px-6 py-2 border-b border-gray-50">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Pitcher</div>
              <div className="col-span-2 text-center">Status</div>
              <div className="col-span-1 text-right">7d</div>
              <div className="col-span-2 text-right">Season</div>
              <div className="col-span-1 text-right">Apps</div>
              <div className="col-span-2 text-right">Last Pitched</div>
            </div>

            {pitchers.map(p => {
              const status = getStatus(p);
              const isExpanded = expanded === p.player_id;

              return (
                <div key={p.player_id}>
                  {/* Summary row */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : p.player_id)}
                    className="w-full text-left grid grid-cols-12 gap-2 items-center px-4 sm:px-6 py-2.5 hover:bg-gray-900 transition-colors border-b border-gray-50"
                  >
                    <div className="col-span-1 text-xs text-gray-400 font-mono">{p.jersey_number || '—'}</div>
                    <div className="col-span-3 text-sm font-medium truncate">{p.first_name} {p.last_name}</div>
                    <div className="col-span-2 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>
                        {statusLabel(p)}
                      </span>
                    </div>
                    <div className="col-span-1 text-sm text-right tabular-nums font-semibold">{p.pitches_last_7 || '—'}</div>
                    <div className="col-span-2 text-sm text-right tabular-nums">{p.season_total_pitches || '—'}</div>
                    <div className="col-span-1 text-sm text-right tabular-nums text-gray-400">{p.season_appearances || '—'}</div>
                    <div className="col-span-2 text-xs text-right text-gray-400">{p.last_pitched ? formatShortDate(p.last_pitched) : '—'}</div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="bg-gray-900 px-4 sm:px-6 py-3 border-b border-gray-700">
                      {/* Ineligibility reasons */}
                      {!p.eligible_today && p.reasons.length > 0 && (
                        <div className="mb-3 bg-red-900/30 border border-red-200 text-red-400 text-xs rounded-lg px-3 py-2">
                          <strong>Ineligible to pitch today:</strong>
                          <ul className="mt-1 list-disc list-inside">
                            {p.reasons.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}

                      {/* Today info */}
                      {p.today_pitches > 0 && (
                        <div className="mb-3 bg-blue-900/30 border border-blue-200 text-blue-300 text-xs rounded-lg px-3 py-2">
                          Threw <strong>{p.today_pitches}</strong> pitches today
                          {p.rest_after_today != null && (
                            <> — needs <strong>{p.rest_after_today} rest day{p.rest_after_today !== 1 ? 's' : ''}</strong>
                            {p.next_available_after_today && <> (available {formatShortDate(p.next_available_after_today)})</>}
                            </>
                          )}
                          {p.remaining_today != null && p.remaining_today > 0 && (
                            <> · <strong>{p.remaining_today}</strong> remaining today</>
                          )}
                        </div>
                      )}

                      {/* Recent 7 days */}
                      {p.last_7_days.length > 0 ? (
                        <div>
                          <div className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Last 7 Days</div>
                          <div className="space-y-1.5">
                            {p.last_7_days.map(day => (
                              <div key={day.date} className="flex items-center gap-3 text-xs">
                                <span className="w-16 text-gray-400 font-medium">{formatDayOfWeek(day.date)} {formatShortDate(day.date)}</span>
                                <span className="font-bold tabular-nums w-12">{day.total_pitches} pc</span>
                                <span className="text-gray-400 truncate">
                                  {day.games.map((g, i) => (
                                    <span key={i}>
                                      {i > 0 && ', '}
                                      {g.home_away} {g.opponent_name} ({g.pitch_count}p)
                                    </span>
                                  ))}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">No activity in last 7 days.</div>
                      )}

                      {/* Season summary */}
                      <div className="mt-3 pt-2 border-t border-gray-700 grid grid-cols-3 gap-4 text-xs">
                        <div>
                          <span className="text-gray-400 uppercase font-semibold">Season Pitches</span>
                          <div className="text-lg font-bold tabular-nums">{p.season_total_pitches || 0}</div>
                        </div>
                        <div>
                          <span className="text-gray-400 uppercase font-semibold">Appearances</span>
                          <div className="text-lg font-bold tabular-nums">{p.season_appearances || 0}</div>
                        </div>
                        <div>
                          <span className="text-gray-400 uppercase font-semibold">Avg/App</span>
                          <div className="text-lg font-bold tabular-nums">
                            {p.season_appearances > 0
                              ? (p.season_total_pitches / p.season_appearances).toFixed(1)
                              : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 sm:px-6 py-6 text-sm text-gray-400 text-center">
            No pitching data recorded yet this season.
          </div>
        )}

        {/* Non-pitchers (available, haven't pitched) */}
        {nonPitchers.length > 0 && pitchers.length > 0 && (
          <div className="border-t border-gray-700 px-4 sm:px-6 py-3">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
              Have Not Pitched ({nonPitchers.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {nonPitchers.map(p => (
                <span key={p.player_id} className="text-xs bg-green-900/30 text-green-400 px-2 py-1 rounded-full font-medium">
                  {p.jersey_number ? `#${p.jersey_number} ` : ''}{p.first_name} {p.last_name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
