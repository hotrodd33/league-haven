import React, { useState, useRef, useEffect } from 'react';

// ─── Zoom and Pan Hook ────────────────────────────────────────────────────────
function useZoomPan(containerRef) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isDragging = useRef(false);
  const startDragPos = useRef({ x: 0, y: 0 });

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
    startDragPos.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
  };

  const onMouseMove = (e) => {
    if (!isDragging.current) return;
    e.preventDefault();
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

  return { transform, onMouseDown, onMouseMove, onMouseUp, onMouseLeave };
}

// ─── Match Component ──────────────────────────────────────────────────────────
export const BracketMatch = ({ match, onAdvance, onScoreChange }) => {
  if (!match) return <div className="w-48 h-16" />; // empty placeholder

  const { id, teams, title } = match;

  return (
    <div className="relative w-48 bg-slate-800 border border-slate-700 rounded-md shadow-card flex flex-col overflow-hidden text-sm z-10">
      {title && (
        <div className="bg-slate-900 text-slate-400 text-xs px-2 py-1 border-b border-slate-700 text-center font-semibold">
          {title}
        </div>
      )}
      {teams.map((team, idx) => (
        <div
          key={idx}
          className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-700 transition-colors ${
            idx === 0 ? 'border-b border-slate-700' : ''
          } ${match.winnerId === team?.id ? 'bg-sport-soft font-bold text-sport' : ''}`}
          onClick={() => onAdvance && team && onAdvance(match, team)}
        >
          <span className={team ? 'text-slate-200' : 'text-slate-500 italic'}>
            {team ? team.name : 'TBD'}
          </span>
          {team && onScoreChange ? (
            <input 
              type="text" 
              className="w-10 text-right bg-transparent border-b border-slate-600 focus:border-sport focus:outline-none text-slate-200 font-mono"
              value={team.score ?? ''}
              placeholder="-"
              onChange={(e) => onScoreChange(match, team, e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-slate-400 font-mono">{team?.score ?? '-'}</span>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Round Component ──────────────────────────────────────────────────────────
export const BracketRound = ({ title, matches, onAdvance, onScoreChange, hasConnectors, isFirstRound }) => {
  return (
    <div className="flex flex-col justify-around items-center min-h-full px-8 relative">
      <h3 className="absolute -top-10 text-slate-400 font-heading text-lg whitespace-nowrap">{title}</h3>
      {matches.map((match, idx) => (
        <div key={idx} className="relative flex-1 flex items-center justify-center w-full min-h-[5rem]">
          
          <BracketMatch match={match} onAdvance={onAdvance} onScoreChange={onScoreChange} />
          
          {/* Incoming line from previous round */}
          {!isFirstRound && (
             <div className="absolute top-1/2 -left-8 w-8 border-b-2 border-slate-600 pointer-events-none" />
          )}

          {/* Outgoing lines to next round */}
          {hasConnectors && (
            <>
              {/* Horizontal line extending right */}
              <div className="absolute top-1/2 -right-8 w-8 border-b-2 border-slate-600 pointer-events-none" />
              
              {/* Vertical line connecting pairs */}
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
  bracketData = [], // Array of rounds: [{ title: 'Round 1', matches: [...] }]
  onAdvance,
  onScoreChange
}) {
  const containerRef = useRef(null);
  const { transform, onMouseDown, onMouseMove, onMouseUp, onMouseLeave } = useZoomPan(containerRef);

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
                onAdvance={onAdvance}
                onScoreChange={onScoreChange}
                isFirstRound={rIdx === 0}
                hasConnectors={rIdx < bracketData.length - 1} // Draw lines if not the last round
              />
            ))}
          </div>
        </div>
      </div>
      
    </div>
  );
}
