import { useState, useEffect, useCallback } from 'react';
import { fetchGames, fetchTeams, fetchSeasons } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import GameDetail from './GameDetail.jsx';
import PitchTracker from './PitchTracker.jsx';
import TeamLogo from './TeamLogo.jsx';
import { GameForm } from './GameSchedule.jsx';
import { DARK_STATUS_COLORS, DARK_TRACK_BUTTON_TONE } from '../constants/statusClasses.js';

const STATUS_COLORS = DARK_STATUS_COLORS;
const GC_BADGE_CLASS = 'inline-flex items-center rounded-sm bg-black px-1 py-0.5 text-[9px] font-bold leading-none tracking-tight text-[#00f092]';

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

function toSortStamp(game) {
  const datePart = game?.game_date ? String(game.game_date) : '1900-01-01';
  const timePart = game?.game_time ? String(game.game_time).slice(0, 5) : '00:00';
  const stamp = new Date(`${datePart}T${timePart}:00`).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

export default function TeamSchedule({ teamId, onNavigateToTeam }) {
  const { isAdmin, canScoreGame } = useAuth();
  const [games, setGames] = useState([]);
  const [teams, setTeams] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [trackingGameId, setTrackingGameId] = useState(null);

  const loadGames = useCallback(() => {
    if (!teamId) { setGames([]); return; }
    setLoading(true);
    fetchGames({ team_id: teamId })
      .then(setGames)
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => { loadGames(); }, [loadGames]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    Promise.all([fetchTeams(), fetchSeasons()])
      .then(([teamsData, seasonsData]) => {
        if (cancelled) return;
        setTeams(teamsData || []);
        setSeasons(seasonsData || []);
      })
      .catch(() => {
        if (cancelled) return;
        setTeams([]);
        setSeasons([]);
      });
    return () => { cancelled = true; };
  }, [isAdmin]);

  if (trackingGameId) {
    return (
      <div className="mt-6">
        <PitchTracker gameId={trackingGameId} onBack={() => { setTrackingGameId(null); loadGames(); }} />
      </div>
    );
  }

  if (selectedGameId) {
    return (
      <div className="mt-6">
        <GameDetail gameId={selectedGameId} onBack={() => { setSelectedGameId(null); loadGames(); }} onNavigateToTeam={onNavigateToTeam} />
      </div>
    );
  }

  if (!teamId) return null;
  if (loading) return <div className="py-4 text-center text-gray-400 text-sm">Loading schedule…</div>;

  const activeSeason = seasons.find((season) => season.is_active);
  const defaultSeasonId = activeSeason ? String(activeSeason.id) : '';
  const sortedGames = [...games].sort((a, b) => toSortStamp(b) - toSortStamp(a));

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Schedule ({games.length})</h3>
        {isAdmin && (
          <button
            onClick={() => setShowForm((prev) => !prev)}
            className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {showForm ? 'Cancel' : '+ Add Game'}
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <div className="mb-3 bg-gray-800 border border-gray-700 rounded-lg p-3">
          <GameForm
            game={null}
            teams={teams}
            seasons={seasons}
            defaultSeasonId={defaultSeasonId}
            defaultHomeTeamId={teamId}
            onDone={() => { setShowForm(false); loadGames(); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {!games.length ? (
        <div className="text-sm text-gray-400">No games scheduled.</div>
      ) : (
        <div className="space-y-2">
          {sortedGames.map(game => {
          const isHome = game.home_team_id === teamId;
          const opponent = isHome ? game.away_team_name : game.home_team_name;
          const opponentLogo = isHome ? game.away_logo : game.home_logo;
          const oppCityAbbr = isHome ? game.away_city_abbr : game.home_city_abbr;
          const oppAgeGroup = isHome ? game.away_age_group : game.home_age_group;
          const oppLevel = isHome ? game.away_level : game.home_level;
          const oppPrimary = isHome ? game.away_primary_color : game.home_primary_color;
          const oppSecondary = isHome ? game.away_secondary_color : game.home_secondary_color;
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
          const resultColor = result === 'W' ? 'text-green-400' : result === 'L' ? 'text-red-400' : result === 'T' ? 'text-gray-400' : '';
          const isUnplayed = game.status !== 'completed';
          const cardTone = isUnplayed
            ? 'bg-slate-800/85 border-slate-600/80'
            : 'bg-gray-800 border-gray-700';

            return (
              <div key={game.id} onClick={() => setSelectedGameId(game.id)}
                className={`${cardTone} border rounded-lg px-3 py-2 flex items-center gap-3 text-sm cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all`}>
              {/* Date + Time */}
              <div className="w-24 shrink-0">
                <div className="font-semibold text-gray-300 text-xs">{formatDate(game.game_date)}</div>
                <div className="text-xs text-gray-400">{formatTime(game.game_time) || 'TBD'}</div>
              </div>

              {/* Opponent */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs text-gray-400 font-semibold w-5 shrink-0">{prefix}</span>
                <TeamLogo src={opponentLogo} name={opponent} ageGroup={oppAgeGroup} level={oppLevel} cityAbbr={oppCityAbbr} primaryColor={oppPrimary} secondaryColor={oppSecondary} size="w-6 h-6" />
                <span className="font-semibold text-gray-200 truncate">{opponent}</span>
              </div>

              {/* Score / Status */}
              <div className="shrink-0 text-right flex items-center gap-2">
                {game.is_gamechanger_imported && (
                  <span className={GC_BADGE_CLASS} title="Imported from GameChanger" aria-label="Imported from GameChanger">
                    GC
                  </span>
                )}
                {isCompleted ? (
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-xs px-1.5 py-0.5 rounded ${resultColor}`}>{result}</span>
                    <span className="font-semibold text-gray-200 tabular-nums">{teamScore}–{oppScore}</span>
                  </div>
                ) : (
                  <>
                    {canScoreGame(game.home_team_id, game.away_team_id, game.home_org_id, game.away_org_id) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setTrackingGameId(game.id); }}
                        className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${DARK_TRACK_BUTTON_TONE}`}
                        title="Live pitch tracker"
                      >
                        ⚾ Track
                      </button>
                    )}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[game.status] || 'bg-gray-800'}`}>
                      {game.status_label}
                    </span>
                  </>
                )}
              </div>

              {!!game.official_names?.length && (
                <div className="hidden lg:block text-xs text-gray-400 truncate max-w-[220px]">
                  👤 {game.official_names.join(', ')}
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
