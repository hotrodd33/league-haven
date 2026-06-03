import { useState, useEffect } from 'react';
import { fetchGame, fetchPitchCounts } from '../api/index.js';
import TeamLogo from './TeamLogo.jsx';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const STATUS_STYLES = {
  scheduled:   'bg-chrome-800/60 text-chrome-300 border border-chrome-700/40',
  in_progress: 'bg-accent-900/40 text-accent-300 border border-accent-700/40',
  completed:   'bg-action-900/40 text-action-300 border border-action-700/40',
  cancelled:   'bg-signal-900/40 text-signal-300 border border-signal-700/40',
  postponed:   'bg-gray-800 text-gray-400 border border-gray-700',
};
const STATUS_LABELS = {
  scheduled: 'Scheduled', in_progress: 'Live',
  completed: 'Final',     cancelled: 'Cancelled', postponed: 'Postponed',
};

export default function GameDetail({ gameId, onBack, onNavigateToTeam, officialsEnabled = true }) {
  const [game, setGame]             = useState(null);
  const [pitchCounts, setPitchCounts] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchGame(gameId), fetchPitchCounts(gameId)])
      .then(([g, pc]) => { setGame(g); setPitchCounts(pc); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [gameId]);

  if (loading) return <div className="py-16 text-center text-gray-400">Loading game…</div>;
  if (error)   return <div className="lh-alert-error mt-4">{error}</div>;
  if (!game)   return <div className="py-16 text-center text-gray-400">Game not found.</div>;

  const isScored = game.status === 'completed' || game.status === 'in_progress';
  const awayWin  = isScored && (game.away_score ?? 0) > (game.home_score ?? 0);
  const homeWin  = isScored && (game.home_score ?? 0) > (game.away_score ?? 0);

  const homePc = pitchCounts.filter(pc => pc.team_id === game.home_team_id);
  const awayPc = pitchCounts.filter(pc => pc.team_id === game.away_team_id);

  const mapsUrl = game.location_lat && game.location_lon
    ? `https://www.google.com/maps/dir/?api=1&destination=${game.location_lat},${game.location_lon}`
    : game.location_name
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          [game.location_name, game.location_address, game.location_city].filter(Boolean).join(', ')
        )}`
      : null;

  return (
    <div>
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 mb-4 transition-colors"
      >
        ← Back
      </button>

      {/* Header card */}
      <div className="bg-gray-800 border border-gray-700 rounded-card-sm p-4 sm:p-6 mb-4">
        {/* Date / status / location */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <div className="font-semibold text-gray-200">{formatDate(game.game_date)}</div>
            {game.game_time && <div className="text-sm text-gray-400">{formatTime(game.game_time)}</div>}
          </div>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[game.status] || STATUS_STYLES.postponed}`}>
            {game.status === 'in_progress' && <span className="live-ring" />}
            {STATUS_LABELS[game.status] || game.status}
          </span>
        </div>

        {/* Score display */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-2">
          {/* Away */}
          <div className="flex flex-col items-center gap-2 text-center">
            <TeamLogo
              src={game.away_logo} name={game.away_team_name}
              ageGroup={game.away_age_group} level={game.away_level}
              cityAbbr={game.away_city_abbr} primaryColor={game.away_primary_color}
              secondaryColor={game.away_secondary_color} size="w-14 h-14"
            />
            <button
              onClick={() => game.away_team_id && onNavigateToTeam?.(game.away_team_id)}
              disabled={!game.away_team_id}
              className="font-semibold text-sm text-gray-200 hover:text-action-300 hover:underline disabled:pointer-events-none"
            >
              {game.away_team_name}
            </button>
            <div className="text-xs text-gray-500">Away</div>
            {isScored && (
              <div className={`text-4xl font-bold tabular-nums font-display ${awayWin ? 'text-action-300' : 'text-gray-400'}`}>
                {game.away_score ?? 0}
              </div>
            )}
          </div>

          {/* VS / divider */}
          <div className="text-gray-600 font-bold text-lg">
            {isScored ? '–' : 'vs'}
          </div>

          {/* Home */}
          <div className="flex flex-col items-center gap-2 text-center">
            <TeamLogo
              src={game.home_logo} name={game.home_team_name}
              ageGroup={game.home_age_group} level={game.home_level}
              cityAbbr={game.home_city_abbr} primaryColor={game.home_primary_color}
              secondaryColor={game.home_secondary_color} size="w-14 h-14"
            />
            <button
              onClick={() => game.home_team_id && onNavigateToTeam?.(game.home_team_id)}
              disabled={!game.home_team_id}
              className="font-semibold text-sm text-gray-200 hover:text-action-300 hover:underline disabled:pointer-events-none"
            >
              {game.home_team_name}
            </button>
            <div className="text-xs text-gray-500">Home</div>
            {isScored && (
              <div className={`text-4xl font-bold tabular-nums font-display ${homeWin ? 'text-action-300' : 'text-gray-400'}`}>
                {game.home_score ?? 0}
              </div>
            )}
          </div>
        </div>

        {/* Location + directions */}
        {(game.location_name || game.notes) && (
          <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
            {game.location_name && (
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <span className="text-sm text-gray-400">
                  📍 {game.location_name}{game.location_city ? `, ${game.location_city}` : ''}
                  {game.location_address && <span className="text-gray-500 ml-1">· {game.location_address}</span>}
                </span>
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-gray-700 text-action-300 hover:bg-gray-600 hover:text-action-100 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12h18M12 3l9 9-9 9" />
                    </svg>
                    Get Directions
                  </a>
                )}
              </div>
            )}
            {game.notes && (
              <p className="text-sm text-gray-400 text-center">{game.notes}</p>
            )}
          </div>
        )}
      </div>

      {/* Umpires */}
      {officialsEnabled && !!game.officials?.length && (
        <div className="bg-gray-800 border border-gray-700 rounded-card-sm p-4 mb-4">
          <h3 className="eyebrow mb-2">Umpires</h3>
          <div className="flex flex-wrap gap-2">
            {game.officials.map(o => (
              <span key={o.id} className="text-sm text-gray-300 bg-gray-700 px-2 py-1 rounded">
                {o.first_name} {o.last_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Pitch counts */}
      {pitchCounts.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-card-sm p-4 mb-4">
          <h3 className="eyebrow mb-3">Pitch Counts</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: game.away_team_name, pcs: awayPc },
              { label: game.home_team_name, pcs: homePc },
            ].map(({ label, pcs }) => pcs.length ? (
              <div key={label}>
                <div className="text-xs font-semibold text-gray-400 mb-2">{label}</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left pb-1 text-xs eyebrow">Pitcher</th>
                      <th className="text-center pb-1 text-xs eyebrow w-16">Pitches</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {pcs.map(pc => (
                      <tr key={pc.id}>
                        <td className="py-1.5 text-gray-300">
                          {pc.jersey_number != null && (
                            <span className="text-gray-500 mr-1.5">#{pc.jersey_number}</span>
                          )}
                          {pc.first_name} {pc.last_name}
                        </td>
                        <td className="py-1.5 text-center font-mono font-semibold text-gray-200">{pc.pitch_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null)}
          </div>
        </div>
      )}
    </div>
  );
}
