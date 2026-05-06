import React, { useState, useRef, useEffect } from 'react';
import TeamLogo from '../TeamLogo.jsx';


// This is supposed to be the the component that renders the actual tournament bracket.

// ─── Status styling helpers ───────────────────────────────────────────────────
const GAME_STATUS_STYLES = {
  pending: 'border-slate-700',
  scheduled: 'border-sky-600/40',
  in_progress: 'border-emerald-500/60 ring-1 ring-emerald-500/30',
  completed: 'border-slate-600',
  cancelled: 'border-slate-700 opacity-60',
  unscheduled: 'border-slate-700 border-dashed',
};

const GAME_STATUS_BADGES = {
  scheduled: { label: 'Scheduled', cls: 'bg-sky-500/15 text-sky-400 border-sky-500/25' },
  in_progress: { label: 'Live', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse' },
  completed: { label: 'Final', cls: 'bg-slate-500/20 text-slate-300 border-slate-500/25' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-500/15 text-red-400 border-red-500/25' },
};

function formatDate(d) {
  if (!d) return null;
  const dt = new Date(d + 'T00:00:00');
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Zoom and Pan Hook ────────────────────────────────────────────────────────
function useZoomPan(containerRef) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isDragging = useRef(false);
  const startDragPos = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);

  const onWheel = (e) => {
    e.preventDefault();
    const scaleAdjust = e.deltaY * -0.001;
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(Math.max(0.2, prev.scale + scaleAdjust), 3),
    }));
  };

  const onMouseDown = (e) => {
    isDragging.current = true;
    didDrag.current = false;
    startDragPos.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
  };

  const onMouseMove = (e) => {
    if (!isDragging.current) return;
    e.preventDefault();
    didDrag.current = true;
    setTransform((prev) => ({
      ...prev,
      x: e.clientX - startDragPos.current.x,
      y: e.clientY - startDragPos.current.y,
    }));
  };

  const onMouseUp = () => {
    isDragging.current = false;
    if (containerRef.current) containerRef.current.style.cursor = 'grab';
  };

  const onMouseLeave = () => {
    isDragging.current = false;
    if (containerRef.current) containerRef.current.style.cursor = 'grab';
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
    }
  }, [containerRef]);

  return { transform, didDrag, onMouseDown, onMouseMove, onMouseUp, onMouseLeave };
}

// ─── Match Component (read-only) ──────────────────────────────────────────────
export const BracketMatch = ({ match, onMatchClick, onNavigateToTeam, onNavigateToFields }) => {
  const [highlight, setHighlight] = useState(false);
  const prevMatchRef = useRef(match);

  useEffect(() => {
    if (!match || !prevMatchRef.current) return;
    if (JSON.stringify(prevMatchRef.current) !== JSON.stringify(match)) {
      setHighlight(true);
      const timer = setTimeout(() => setHighlight(false), 1200);
      prevMatchRef.current = match;
      return () => clearTimeout(timer);
    }
  }, [match]);

  if (!match) return <div className="w-52 h-16" />;

  const { teams, game } = match;
  const gameStatus = game?.status || 'pending';
  const isCompleted = gameStatus === 'completed';
  const hasGame = !!match.linked_game_id;
  const statusBorder = GAME_STATUS_STYLES[gameStatus] || GAME_STATUS_STYLES.pending;
  const badge = GAME_STATUS_BADGES[gameStatus] || null;

  const handleCardClick = (e) => {
    // Don't navigate if user was panning
    if (hasGame && onMatchClick) {
      onMatchClick(match);
    }
  };

  return (
    <div className={`relative group w-52 border rounded-md shadow-card flex flex-col overflow-visible text-sm z-10 transition-all duration-700 ${highlight
      ? 'bg-slate-700 border-action-400 ring-2 ring-action-400/50 shadow-[0_0_20px_rgba(56,189,248,0.3)] scale-[1.02]'
      : `bg-slate-800 ${statusBorder} scale-100`
      } ${hasGame ? 'cursor-pointer hover:border-slate-500 hover:bg-slate-750' : ''}`}
      onClick={handleCardClick}>
      {hasGame && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-action-300 whitespace-nowrap pointer-events-none">
          Click for details
        </div>
      )}

      {/* Inner wrapper for overflow clipping */}
      <div className="flex flex-col w-full h-full rounded-[5px] overflow-hidden">
        {/* Status bar / date */}
        <div className="bg-slate-900 text-slate-500 text-[10px] px-2 py-1 border-b border-slate-700 flex items-center justify-between gap-1">
          <span className="font-semibold">M{match.match_number}</span>
          <div className="flex items-center gap-1.5">
            {match._matchData?.is_bye ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-slate-500/20 text-slate-300 border-slate-500/25 tracking-widest">
                BYE
              </span>
            ) : (
              <>
                {game?.game_date && (
                  <span className="text-slate-500">{formatDate(game.game_date)}</span>
                )}
                {badge && (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${badge.cls}`}>
                    {badge.label}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Teams */}
        {teams.map((team, idx) => {
          const isWinner = match.winnerId && match.winnerId === team?.id;
          const isLoser = match.winnerId && team?.id && match.winnerId !== team?.id;
          return (
            <div
              key={idx}
              className={`flex items-center justify-between px-3 py-2 transition-colors ${idx === 0 ? 'border-b border-slate-700' : ''
                } ${isWinner ? 'bg-emerald-500/10 font-bold' : ''} ${isLoser ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {team && (
                  <TeamLogo
                    src={team.logo}
                    name={team.name}
                    ageGroup={team.age_group}
                    level={team.level}
                    cityAbbr={team.city_abbr}
                    primaryColor={team.primary_color}
                    secondaryColor={team.secondary_color}
                    size="w-5 h-5"
                  />
                )}
                <span className={team ? 'text-slate-200 truncate' : 'text-slate-500 italic'}>
                  {team ? (
                    onNavigateToTeam && !team.is_temp ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToTeam(team.team_id, team.org_id, team.is_temp);
                        }}
                        className="hover:text-action-100 hover:underline text-left transition-colors font-semibold truncate max-w-[90px]"
                      >
                        {team.name}
                      </button>
                    ) : (
                      <span className="truncate max-w-[90px] inline-block align-bottom font-semibold">{team.name}</span>
                    )
                  ) : (
                    'TBD'
                  )}
                </span>
              </div>
              {/* Score (static display) */}
              {team?.score != null ? (
                <span className={`font-mono font-bold tabular-nums ${isWinner ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {team.score}
                </span>
              ) : (
                <span className="text-slate-600 font-mono text-xs">
                  {team ? '-' : ''}
                </span>
              )}
            </div>
          );
        })}

        {/* Location */}
        {game?.location_name && (
          <div className="bg-slate-900/50 text-slate-500 text-[10px] px-2 py-0.5 border-t border-slate-700/50 truncate">
            {onNavigateToFields ? (
              <button
                onClick={(e) => { e.stopPropagation(); onNavigateToFields(); }}
                className="hover:text-action-400 hover:underline inline-flex items-center gap-1 w-full text-left"
                title={`View ${game.location_name} in Fields Tab`}
              >
                📍 {game.location_name}
              </button>
            ) : (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(game.location_name)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="hover:text-action-400 hover:underline inline-flex items-center gap-1 w-full"
                title={`View ${game.location_name} on Map`}
              >
                📍 {game.location_name}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Round Component ──────────────────────────────────────────────────────────
export const BracketRound = ({ title, matches, onMatchClick, onNavigateToTeam, onNavigateToFields, hasConnectors, isFirstRound }) => {
  return (
    <div className="flex flex-col justify-around items-center min-h-full px-8 relative">
      <h3 className="absolute -top-10 text-slate-400 font-heading text-lg whitespace-nowrap">{title}</h3>
      {matches.map((match, idx) => (
        <div key={idx} className="relative flex-1 flex items-center justify-center w-52 min-h-[9rem] py-4">

          <BracketMatch match={match} onMatchClick={onMatchClick} onNavigateToTeam={onNavigateToTeam} onNavigateToFields={onNavigateToFields} />

          {/* Incoming line from previous round */}
          {!isFirstRound && (
            <div className="absolute top-1/2 -left-8 w-8 border-b-2 border-slate-600 pointer-events-none" />
          )}

          {/* Outgoing lines to next round */}
          {hasConnectors && (
            <>
              <div className="absolute top-1/2 -right-8 w-8 border-b-2 border-slate-600 pointer-events-none" />
              {idx % 2 === 0 ? (
                <div className="absolute top-1/2 -right-8 h-[50%] border-r-2 border-slate-600 pointer-events-none" />
              ) : (
                <div className="absolute bottom-1/2 -right-8 h-[50%] border-r-2 border-slate-600 pointer-events-none" />
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Main Bracket Component ───────────────────────────────────────────────────
export default function TournamentBracket({
  bracketName = "Tournament Bracket",
  bracketData = [],
  onMatchClick,
  onNavigateToTeam,
  onNavigateToFields,
}) {
  const containerRef = useRef(null);
  const { transform, didDrag, onMouseDown, onMouseMove, onMouseUp, onMouseLeave } = useZoomPan(containerRef);

  // Prevent match clicks when user just finished panning
  const handleMatchClick = (match) => {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    onMatchClick?.(match);
  };

  return (
    <div className="w-full h-full min-h-[600px] bg-slate-950 overflow-hidden relative border border-slate-800 rounded-xl shadow-inner-field select-none">

      {/* UI Overlay */}
      <div className="absolute top-4 left-4 z-10 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-lg border border-slate-700 shadow-card pointer-events-none">
        <h2 className="text-white font-display text-xl">{bracketName}</h2>
        <p className="text-slate-400 text-xs">Scroll to zoom • Click & drag to pan</p>
      </div>

      {/* Panning/Zooming Container */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <div
          className="origin-center transition-transform duration-75 ease-out inline-block min-w-max min-h-max p-20 pt-32"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        >
          <div className="flex flex-row justify-start items-stretch gap-0 min-h-[400px]">
            {bracketData.map((round, rIdx) => (
              <BracketRound
                key={rIdx}
                title={round.title}
                matches={round.matches}
                onMatchClick={handleMatchClick}
                onNavigateToTeam={onNavigateToTeam}
                onNavigateToFields={onNavigateToFields}
                isFirstRound={rIdx === 0}
                hasConnectors={rIdx < bracketData.length - 1}
              />
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
