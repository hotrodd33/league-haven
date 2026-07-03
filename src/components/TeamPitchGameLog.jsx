import { useEffect, useState } from 'react';
import { fetchTeamPitchGameLog } from '../api/index.js';
import { Card, CardHeader } from './ui';

function fmtDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

export default function TeamPitchGameLog({ teamId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!teamId) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchTeamPitchGameLog(teamId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load team pitch counts');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  if (!teamId) return null;
  if (loading) return <div className="text-sm text-gray-400 text-center py-4">Loading pitch counts by game...</div>;
  if (error) return <div className="text-sm text-signal-400 text-center py-4">{error}</div>;
  if (!data) return null;

  const games = data.games || [];
  const players = data.players || [];

  return (
    <Card variant="bordered">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-display font-bold uppercase tracking-wide text-white">
            Pitch Counts By Game
          </h3>
          <div className="text-xs text-gray-400">
            Team: <span className="text-gray-200 font-semibold">{data.team_name || 'Unknown'}</span>
          </div>
        </div>
      </CardHeader>

      {games.length === 0 ? (
        <div className="px-5 pb-5 text-sm text-gray-400">No tournament games found for this team yet.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-200">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-900">
                  <th className="text-left px-4 sm:px-6 py-2 eyebrow whitespace-nowrap">Player</th>
                  {games.map((g) => (
                    <th key={g.game_id} className="text-center px-2 py-2 eyebrow whitespace-nowrap" title={`${g.home_away || ''} ${g.opponent_name || 'TBD'} on ${g.game_date || 'TBD'}`}>
                      G{g.game_index}
                    </th>
                  ))}
                  <th className="text-center px-3 py-2 eyebrow whitespace-nowrap" title={data.day_date ? `Latest game day: ${data.day_date}` : 'Latest game day'}>
                    Day Total {data.day_date ? `(${fmtDate(data.day_date)})` : ''}
                  </th>
                  <th className="text-center px-3 py-2 eyebrow whitespace-nowrap">Tourney Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {players.map((p) => (
                  <tr key={p.player_id} className="hover:bg-gray-900 transition-colors">
                    <td className="px-4 sm:px-6 py-2.5 whitespace-nowrap font-medium">
                      {p.jersey_number != null && (
                        <span className="text-xs text-gray-400 font-mono mr-2">#{p.jersey_number}</span>
                      )}
                      {p.first_name} {p.last_name}
                    </td>
                    {games.map((g) => (
                      <td key={g.game_id} className="text-center px-2 py-2.5 tabular-nums font-semibold">
                        {Number(p.by_game?.[g.game_id] || 0)}
                      </td>
                    ))}
                    <td className="text-center px-3 py-2.5 tabular-nums font-semibold text-chrome-300">{Number(p.day_total || 0)}</td>
                    <td className="text-center px-3 py-2.5 tabular-nums font-bold text-chrome-200">{Number(p.tournament_total || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 sm:px-6 pb-4 pt-3 text-xs text-gray-400 space-y-1">
            {games.map((g) => (
              <div key={`legend-${g.game_id}`}>
                <span className="font-semibold text-gray-300">G{g.game_index}</span>: {fmtDate(g.game_date)} {g.home_away || ''} {g.opponent_name || 'TBD'}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
