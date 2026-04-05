import { useState, useEffect, useCallback } from 'react';
import { fetchGames } from '../api/index.js';
import GameDetail from './GameDetail.jsx';

const STATUS_COLORS = {
  scheduled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
  postponed: 'bg-gray-200 text-gray-700',
};

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

function TeamLogo({ src, name }) {
  if (!src) return <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">{(name || '?')[0]}</div>;
  return <img src={src} alt="" className="w-6 h-6 object-contain rounded shrink-0" />;
}

export default function TeamSchedule({ teamId, onNavigateToTeam }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState(null);

  const loadGames = useCallback(() => {
    if (!teamId) { setGames([]); return; }
    setLoading(true);
    fetchGames({ team_id: teamId })
      .then(setGames)
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => { loadGames(); }, [loadGames]);

  if (selectedGameId) {
    return (
      <div className="mt-6">
        <GameDetail gameId={selectedGameId} onBack={() => { setSelectedGameId(null); loadGames(); }} onNavigateToTeam={onNavigateToTeam} />
      </div>
    );
  }

  if (!teamId) return null;
  if (loading) return <div className="py-4 text-center text-gray-400 text-sm">Loading schedule…</div>;
  if (!games.length) return (
    <div className="mt-6">
      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Schedule</h3>
      <div className="text-sm text-gray-400">No games scheduled.</div>
    </div>
  );

  return (
    <div className="mt-6">
      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Schedule ({games.length})</h3>
      <div className="space-y-2">
        {games.map(game => {
          const isHome = game.home_team_id === teamId;
          const opponent = isHome ? game.away_team_name : game.home_team_name;
          const opponentLogo = isHome ? game.away_logo : game.home_logo;
          const prefix = isHome ? 'vs' : '@';
          const teamScore = isHome ? game.home_score : game.away_score;
          const oppScore = isHome ? game.away_score : game.home_score;
          const isCompleted = game.status === 'completed';
          let result = '';
          if (isCompleted && teamScore != null && oppScore != null) {
            if (teamScore > oppScore) result = 'W';
            else if (teamScore < oppScore) result = 'L';
            else result = 'T';
          }
          const resultColor = result === 'W' ? 'text-green-700' : result === 'L' ? 'text-red-600' : result === 'T' ? 'text-gray-500' : '';

          return (
            <div key={game.id} onClick={() => setSelectedGameId(game.id)}
              className="bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-3 text-sm cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
              {/* Date + Time */}
              <div className="w-24 shrink-0">
                <div className="font-semibold text-gray-700 text-xs">{formatDate(game.game_date)}</div>
                <div className="text-xs text-gray-400">{formatTime(game.game_time) || 'TBD'}</div>
              </div>

              {/* Opponent */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs text-gray-400 font-semibold w-5 shrink-0">{prefix}</span>
                <TeamLogo src={opponentLogo} name={opponent} />
                <span className="font-semibold truncate">{opponent}</span>
              </div>

              {/* Score / Status */}
              <div className="shrink-0 text-right">
                {isCompleted ? (
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-xs px-1.5 py-0.5 rounded ${resultColor}`}>{result}</span>
                    <span className="font-semibold tabular-nums">{teamScore}–{oppScore}</span>
                  </div>
                ) : (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[game.status] || 'bg-gray-100'}`}>
                    {game.status_label}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
