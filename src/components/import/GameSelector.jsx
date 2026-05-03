import { useState, useEffect } from 'react';
import { Button } from '../ui/index.js';
import { fetchGames } from '../../api/index.js';

/**
 * Inline game selector shown on the Preview step when importing a box score
 * without a pre-set gameId. Lets the user assign the parsed box score to an
 * existing scheduled game (via fuzzy suggestions OR manual schedule search),
 * or import as a new game.
 */
export default function GameSelector({ suggestions, selectedGameId, onSelect, gameDate }) {
  const [showBrowse, setShowBrowse] = useState(false);
  const [browseFrom, setBrowseFrom] = useState(() => shiftDate(gameDate, -14));
  const [browseTo, setBrowseTo] = useState(() => shiftDate(gameDate, 14));
  const [browseGames, setBrowseGames] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState(null);

  useEffect(() => {
    if (!showBrowse) return;
    setBrowseLoading(true);
    setBrowseError(null);
    fetchGames({ from: browseFrom, to: browseTo })
      .then((rows) => setBrowseGames(Array.isArray(rows) ? rows : []))
      .catch((err) => setBrowseError(err.message || 'Could not load schedule'))
      .finally(() => setBrowseLoading(false));
  }, [showBrowse, browseFrom, browseTo]);

  const hasSuggestions = suggestions && suggestions.length > 0;
  const suggestedIds = new Set((suggestions || []).map(s => String(s.gameId)));

  return (
    <div className="bg-gray-900/60 rounded-xl border border-gray-700 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white">Assign to a scheduled game</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          {hasSuggestions
            ? `We found ${suggestions.length} possible match${suggestions.length === 1 ? '' : 'es'}. Pick one, browse your schedule, or import as a new game.`
            : `No close matches on your schedule. Browse your schedule to pick the right game, or import as a new game.`}
        </p>
      </div>

      {hasSuggestions && (
        <div className="space-y-2">
          {suggestions.map((s) => (
            <GameRow
              key={s.gameId}
              game={s}
              active={String(selectedGameId) === String(s.gameId)}
              onClick={() => onSelect(String(selectedGameId) === String(s.gameId) ? null : s.gameId)}
              showConfidence
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowBrowse((v) => !v)}
        >
          {showBrowse ? '× Hide schedule browser' : 'Browse my schedule'}
        </Button>
        <Button
          size="sm"
          variant={selectedGameId === '__new__' ? 'primary' : 'ghost'}
          onClick={() => onSelect(selectedGameId === '__new__' ? null : '__new__')}
        >
          {selectedGameId === '__new__' ? '✓ Will create a new game' : 'Import as a new game'}
        </Button>
      </div>

      {showBrowse && (
        <div className="border-t border-gray-700 pt-3 space-y-3">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <label className="text-gray-400">From</label>
            <input
              type="date"
              value={browseFrom || ''}
              onChange={(e) => setBrowseFrom(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100"
            />
            <label className="text-gray-400">To</label>
            <input
              type="date"
              value={browseTo || ''}
              onChange={(e) => setBrowseTo(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100"
            />
          </div>

          {browseLoading && <p className="text-xs text-gray-400">Loading…</p>}
          {browseError && <p className="text-xs text-red-400">{browseError}</p>}
          {!browseLoading && !browseError && browseGames.length === 0 && (
            <p className="text-xs text-gray-400">No games in that range.</p>
          )}

          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {browseGames
              .filter((g) => !suggestedIds.has(String(g.id)))
              .map((g) => (
                <GameRow
                  key={g.id}
                  game={normalizeGame(g)}
                  active={String(selectedGameId) === String(g.id)}
                  onClick={() => onSelect(String(selectedGameId) === String(g.id) ? null : g.id)}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GameRow({ game, active, onClick, showConfidence }) {
  const badgeColor =
    game.confidence === 'high' ? 'bg-action-900/50 text-action-300 border-action-700'
    : game.confidence === 'medium' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700'
    : 'bg-gray-800 text-gray-400 border-gray-700';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
        active
          ? 'border-action-500 bg-action-900/20'
          : 'border-gray-700 bg-gray-800/40 hover:border-gray-500'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-white truncate">{game.label}</div>
        {showConfidence && game.confidence && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wide ${badgeColor}`}>
            {game.confidence} · {Math.round((game.score || 0) * 100)}%
          </span>
        )}
      </div>
      <div className="text-xs text-gray-400 mt-0.5">
        {game.gameTime ? `${game.gameTime} · ` : ''}status: {game.status || 'scheduled'}
        {game.homeScore != null && game.awayScore != null
          ? ` · ${game.awayScore}–${game.homeScore}`
          : ''}
      </div>
    </button>
  );
}

function normalizeGame(g) {
  return {
    gameId: g.id,
    gameDate: g.game_date,
    gameTime: g.game_time,
    status: g.status,
    homeTeamName: g.home_team_name,
    awayTeamName: g.away_team_name,
    homeScore: g.home_score,
    awayScore: g.away_score,
    label: `${g.away_team_name || '?'} @ ${g.home_team_name || '?'} — ${String(g.game_date || '').slice(0, 10)}`,
  };
}

function shiftDate(iso, days) {
  if (!iso) return '';
  try {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}
