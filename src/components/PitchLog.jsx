import { useState, useEffect } from 'react';
import { fetchTeamPitcherStats } from '../api/index.js';

function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
}

export default function PitchLog({ teamId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
  if (loading) return <div className="mt-6 text-sm text-gray-400 text-center py-4">Loading pitch log…</div>;
  if (error) return <div className="mt-6 text-sm text-red-400 text-center py-4">{error}</div>;
  if (!data) return null;

  const { players, today, rules } = data;

  // Rest-day calculator from rules thresholds
  function getRestDays(pitchCount) {
    if (!rules || !rules.rest_thresholds) return 0;
    for (const t of rules.rest_thresholds) {
      if (pitchCount >= t.min) return t.days;
    }
    return 0;
  }

  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }

  // Build array of dates: today-6 … today … today+3
  const dates = [];
  for (let i = 6; i >= -3; i--) {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  // Build per-pitcher lookup with rest days and violations computed for ALL days
  const pitchers = players
    .filter(p => p.pitches_last_7 > 0)
    .map(p => {
      const byDate = {};
      for (const day of p.last_7_days) {
        byDate[day.date] = day.total_pitches;
      }

      // Compute rest periods from every pitching day in the visible window
      // restDates = dates where this pitcher should be resting
      const restDates = new Set();
      // violations = dates where they pitched while they should have been resting
      const violationDates = new Set();

      // Sort pitching days chronologically to walk forward
      const pitchDays = Object.keys(byDate).sort();
      for (const pd of pitchDays) {
        const rest = getRestDays(byDate[pd]);
        for (let d = 1; d <= rest; d++) {
          restDates.add(addDays(pd, d));
        }
      }

      // Check for violations: pitched on a rest day
      for (const pd of pitchDays) {
        if (restDates.has(pd)) {
          violationDates.add(pd);
        }
      }

      // Future ineligible dates (rest still owed from most recent pitching)
      const futureRestDates = new Set();
      for (const rd of restDates) {
        if (rd > today) futureRestDates.add(rd);
      }

      return { ...p, byDate, restDates, violationDates, futureRestDates };
    });

  if (pitchers.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-700">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-300">
            Pitch Log
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-gray-200">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 sm:px-6 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  Player
                </th>
                {dates.map(d => {
                  const isFuture = d > today;
                  const isToday = d === today;
                  return (
                    <th
                      key={d}
                      className={`text-center px-2 py-2 text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${isToday ? 'text-blue-300 bg-blue-900/40' : isFuture ? 'text-gray-400 bg-gray-900/50' : 'text-gray-400'}`}
                    >
                      {dayLabel(d)}
                    </th>
                  );
                })}
                <th className="text-center px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {pitchers.map(p => (
                <tr key={p.player_id} className="hover:bg-gray-900 transition-colors">
                  <td className="px-4 sm:px-6 py-2.5 whitespace-nowrap font-medium">
                    {p.jersey_number != null && (
                      <span className="text-xs text-gray-400 font-mono mr-2">#{p.jersey_number}</span>
                    )}
                    {p.first_name} {p.last_name}
                  </td>
                  {dates.map(d => {
                    const count = p.byDate[d];
                    const isFuture = d > today;
                    const isToday = d === today;
                    const isRest = p.restDates.has(d);
                    const isViolation = p.violationDates.has(d);
                    const isFutureRest = isFuture && p.futureRestDates.has(d);

                    let cls = 'text-center px-2 py-2.5 tabular-nums';
                    if (isViolation) {
                      // Pitched on a rest day — dark red outline + background
                      cls += ' bg-red-900/45 text-red-300 font-bold ring-2 ring-inset ring-red-500';
                    } else if (isFutureRest) {
                      // Future rest day — red background
                      cls += ' bg-red-900/25 text-red-400 font-semibold';
                    } else if (isRest && !count) {
                      // Past rest day, correctly rested — light highlight
                      cls += ' bg-red-900/30 text-red-400';
                    } else if (isToday) {
                      cls += ' bg-blue-900/40 font-semibold';
                    } else if (isFuture) {
                      cls += ' bg-gray-900/50';
                    } else {
                      cls += count ? ' font-semibold' : ' text-gray-300';
                    }
                    return (
                      <td key={d} className={cls}>
                        {isFutureRest ? '✕' : isRest && !count ? '⏸' : count || '—'}
                      </td>
                    );
                  })}
                  <td className="text-center px-3 py-2.5 tabular-nums font-bold text-blue-300">
                    {p.pitches_last_7}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
