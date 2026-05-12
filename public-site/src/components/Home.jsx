import { useEffect, useMemo, useState } from 'react';
import { fetchGames, fetchSeasons } from '../api/index.js';
import TeamLogo from './TeamLogo.jsx';

function toLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function todayISO() {
  return toLocalISO(new Date());
}

function addDaysISO(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toLocalISO(d);
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
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

function GameRow({ game, onNavigateToGame, onNavigateToTeam, showDate }) {
  const isScored = game.status === 'completed' || game.status === 'in_progress';
  const awayWin  = isScored && (game.away_score ?? 0) > (game.home_score ?? 0);
  const homeWin  = isScored && (game.home_score ?? 0) > (game.away_score ?? 0);

  return (
    <div
      onClick={() => onNavigateToGame?.(game.id)}
      className="bg-gray-800 border border-gray-700 rounded-card-sm p-3 hover:border-action-600 hover:bg-gray-700/50 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3">
        {/* Time/date + status — left rail */}
        <div className="shrink-0 w-20 text-center">
          {showDate && (
            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">
              {formatDateLabel(game.game_date)}
            </div>
          )}
          <div className="text-sm font-semibold text-gray-300">
            {isScored ? '—' : formatTime(game.game_time) || 'TBD'}
          </div>
          <span className={`inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[game.status] || STATUS_STYLES.postponed}`}>
            {game.status === 'in_progress' && <span className="live-ring" />}
            {STATUS_LABELS[game.status] || game.status}
          </span>
        </div>

        {/* Matchup — center, fills remaining space */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <TeamLogo src={game.away_logo} name={game.away_team_name} ageGroup={game.away_age_group} level={game.away_level} cityAbbr={game.away_city_abbr} primaryColor={game.away_primary_color} secondaryColor={game.away_secondary_color} size="w-6 h-6" />
            <div className="flex-1 min-w-0">
              <button
                onClick={e => { e.stopPropagation(); game.away_team_id && onNavigateToTeam?.(game.away_team_id); }}
                disabled={!game.away_team_id}
                className={`font-semibold text-sm truncate max-w-full inline-block align-middle text-left hover:underline ${awayWin ? 'text-action-300' : isScored ? 'text-gray-400' : 'text-gray-200'} disabled:pointer-events-none`}
              >
                {game.away_team_name}
              </button>
            </div>
            {isScored && (
              <span className={`font-bold tabular-nums shrink-0 w-8 text-right ${awayWin ? 'text-action-300' : 'text-gray-400'}`}>
                {game.away_score ?? 0}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <TeamLogo src={game.home_logo} name={game.home_team_name} ageGroup={game.home_age_group} level={game.home_level} cityAbbr={game.home_city_abbr} primaryColor={game.home_primary_color} secondaryColor={game.home_secondary_color} size="w-6 h-6" />
            <div className="flex-1 min-w-0">
              <button
                onClick={e => { e.stopPropagation(); game.home_team_id && onNavigateToTeam?.(game.home_team_id); }}
                disabled={!game.home_team_id}
                className={`font-semibold text-sm truncate max-w-full inline-block align-middle text-left hover:underline ${homeWin ? 'text-action-300' : isScored ? 'text-gray-400' : 'text-gray-200'} disabled:pointer-events-none`}
              >
                {game.home_team_name}
              </button>
            </div>
            {isScored && (
              <span className={`font-bold tabular-nums shrink-0 w-8 text-right ${homeWin ? 'text-action-300' : 'text-gray-400'}`}>
                {game.home_score ?? 0}
              </span>
            )}
          </div>
          {game.location_name && (
            <div className="text-[11px] text-gray-500 truncate pl-8">
              📍 {game.location_name}{game.location_city ? `, ${game.location_city}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, games, emptyText, onNavigateToGame, onNavigateToTeam, onSeeAll, showDate }) {
  return (
    <section>
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-wide text-white">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        {onSeeAll && games.length > 0 && (
          <button onClick={onSeeAll} className="text-xs font-semibold text-action-300 hover:text-action-100 hover:underline">
            View all →
          </button>
        )}
      </div>
      {games.length === 0 ? (
        <div className="bg-gray-800/60 border border-gray-700/60 border-dashed rounded-card-sm py-6 text-center text-sm text-gray-500">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-2">
          {games.map(g => (
            <GameRow key={g.id} game={g} onNavigateToGame={onNavigateToGame} onNavigateToTeam={onNavigateToTeam} showDate={showDate} />
          ))}
        </div>
      )}
    </section>
  );
}

const UPCOMING_LIMIT = 8;

export default function Home({ onNavigateToGame, onNavigateToTeam, onNavigateToTab }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const today = useMemo(() => todayISO(), []);
  const yesterday = useMemo(() => addDaysISO(today, -1), [today]);
  const weekOut = useMemo(() => addDaysISO(today, 7), [today]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSeasons()
      .then(seasons => {
        const active = (seasons || []).find(s => s.is_active);
        return fetchGames({
          season_id: active?.id,
          from: yesterday,
          to: weekOut,
        });
      })
      .then(data => {
        if (cancelled) return;
        setGames(data || []);
      })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [yesterday, weekOut]);

  const { todayGames, yesterdayResults, upcoming } = useMemo(() => {
    const sortByTime = (a, b) => (a.game_time || '99:99').localeCompare(b.game_time || '99:99');
    const sortByDateTime = (a, b) => {
      const dc = (a.game_date || '').localeCompare(b.game_date || '');
      return dc !== 0 ? dc : sortByTime(a, b);
    };
    const todayList = games.filter(g => g.game_date === today).sort(sortByTime);
    const yesterdayList = games
      .filter(g => g.game_date === yesterday && g.status === 'completed')
      .sort(sortByTime);
    const upcomingList = games
      .filter(g => g.game_date > today && g.game_date <= weekOut && g.status !== 'cancelled' && g.status !== 'postponed')
      .sort(sortByDateTime)
      .slice(0, UPCOMING_LIMIT);
    return { todayGames: todayList, yesterdayResults: yesterdayList, upcoming: upcomingList };
  }, [games, today, yesterday, weekOut]);

  if (loading && !games.length) {
    return <div className="py-12 text-center text-gray-400">Loading…</div>;
  }
  if (error) {
    return <div className="lh-alert-error mb-4">{error}</div>;
  }

  return (
    <div className="space-y-8">
      <Section
        title="Today's Games"
        subtitle={formatDateLabel(today)}
        games={todayGames}
        emptyText="No games scheduled today."
        onNavigateToGame={onNavigateToGame}
        onNavigateToTeam={onNavigateToTeam}
        onSeeAll={() => onNavigateToTab?.('scores')}
      />
      <Section
        title="Yesterday's Results"
        subtitle={formatDateLabel(yesterday)}
        games={yesterdayResults}
        emptyText="No completed games yesterday."
        onNavigateToGame={onNavigateToGame}
        onNavigateToTeam={onNavigateToTeam}
        onSeeAll={() => onNavigateToTab?.('scores')}
      />
      <Section
        title="Upcoming This Week"
        subtitle="Next 7 days"
        games={upcoming}
        emptyText="No upcoming games this week."
        onNavigateToGame={onNavigateToGame}
        onNavigateToTeam={onNavigateToTeam}
        onSeeAll={() => onNavigateToTab?.('scores')}
        showDate
      />
    </div>
  );
}
