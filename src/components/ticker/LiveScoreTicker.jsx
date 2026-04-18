import { useState } from 'react';
import { useLiveGames } from '../../hooks/useLiveGames.js';
import { useTickerDismiss } from '../../hooks/useTickerDismiss.js';
import TickerItem from './TickerItem.jsx';

const SCROLL_THRESHOLD = 4;
const SECS_PER_GAME = 7;

export default function LiveScoreTicker() {
  const { data: games = [] } = useLiveGames();
  const { isDismissed, dismiss } = useTickerDismiss();
  const [animatingOut, setAnimatingOut] = useState(false);

  if (isDismissed || games.length === 0) return null;

  const shouldScroll = games.length > SCROLL_THRESHOLD;
  // Duplicate list for seamless infinite loop (animation moves -50% = one full set)
  const displayGames = shouldScroll ? [...games, ...games] : games;
  const scrollDuration = `${games.length * SECS_PER_GAME}s`;

  function handleDismiss() {
    setAnimatingOut(true);
    setTimeout(dismiss, 280);
  }

  return (
    <div
      style={{ maxHeight: animatingOut ? 0 : 40, opacity: animatingOut ? 0 : 1 }}
      className="sticky top-16 z-20 overflow-hidden transition-all duration-300 ease-in-out bg-gray-900 border-b border-gray-700/70"
    >
      <div className="flex items-center h-10">

        {/* LIVE badge — pinned left */}
        <div className="shrink-0 flex items-center gap-1.5 px-3 h-full border-r border-gray-700/70 bg-gray-900">
          <span className="live-ring" />
          <span className="text-[10px] font-bold tracking-widest text-signal-400 uppercase font-display select-none">
            Live
          </span>
        </div>

        {/* Scrolling / static game track */}
        <div
          className="flex-1 overflow-hidden min-w-0 h-full flex items-center"
          // Pause marquee on hover so users can read scores
          onMouseEnter={e => { if (shouldScroll) e.currentTarget.firstChild?.style && (e.currentTarget.firstChild.style.animationPlayState = 'paused'); }}
          onMouseLeave={e => { if (shouldScroll) e.currentTarget.firstChild?.style && (e.currentTarget.firstChild.style.animationPlayState = 'running'); }}
        >
          <div
            className="flex items-center whitespace-nowrap h-full"
            style={shouldScroll ? {
              animation: `ticker-scroll ${scrollDuration} linear infinite`,
              width: 'max-content',
            } : undefined}
          >
            {displayGames.map((game, i) => (
              <TickerItem key={`${game.id}-${i}`} game={game} />
            ))}
          </div>
        </div>

        {/* Dismiss button — pinned right */}
        <button
          onClick={handleDismiss}
          aria-label="Dismiss score ticker"
          className="shrink-0 w-9 h-full flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors border-l border-gray-700/70"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M1 1l10 10M11 1L1 11" />
          </svg>
        </button>

      </div>
    </div>
  );
}
