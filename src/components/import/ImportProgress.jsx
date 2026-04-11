import { cn } from '../../lib/cn.js';

/* ═══════════════════════════════════════════════════════
   Step 5 — Import Progress
   Baseball-themed progress animation.
   ═══════════════════════════════════════════════════════ */

export default function ImportProgress({ progress = 0, status = 'uploading' }) {
  const messages = {
    uploading:  'Uploading your file…',
    parsing:    'Parsing data…',
    matching:   'Matching players…',
    importing:  'Importing records…',
    finalizing: 'Finalizing import…',
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-8">
      {/* Baseball loader */}
      <div className="relative w-24 h-24">
        {/* Diamond base */}
        <svg viewBox="0 0 100 100" className="w-full h-full animate-pulse-soft" aria-hidden="true">
          <path
            d="M50 10 L90 50 L50 90 L10 50 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-field-200"
          />
          <path
            d="M50 10 L90 50 L50 90 L10 50 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeDasharray="240"
            strokeDashoffset={240 - (240 * progress / 100)}
            className="text-field-600 transition-all duration-500"
            strokeLinecap="round"
          />
        </svg>

        {/* Baseball in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={cn(
            'w-10 h-10 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center shadow-card',
            progress > 0 && 'animate-spin-slow',
          )}>
            <span className="text-lg" aria-hidden="true">⚾</span>
          </div>
        </div>
      </div>

      {/* Progress info */}
      <div className="text-center space-y-3 max-w-xs">
        <p className="text-sm font-semibold text-gray-900">
          {messages[status] || 'Processing…'}
        </p>

        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-field-500 to-field-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.max(progress, 3)}%` }}
          />
        </div>

        <p className="text-xs text-gray-400 tabular-nums">
          {Math.round(progress)}% complete
        </p>
      </div>
    </div>
  );
}
