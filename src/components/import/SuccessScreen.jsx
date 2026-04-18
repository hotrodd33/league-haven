import { cn } from '../../lib/cn.js';
import { Button } from '../ui/index.js';
import {
  UsersIcon, CalendarIcon, HomeIcon, ArrowUpTrayIcon, TrophyIcon,
  SparklesIcon,
} from '../ui/icons.jsx';

/* ═══════════════════════════════════════════════════════
   Step 6 — Success Screen
   Celebration with summary stats and next actions.
   ═══════════════════════════════════════════════════════ */

export default function SuccessScreen({ result, onNavigate, onImportAnother, onClose }) {
  const summary = result || {};

  return (
    <div className="flex flex-col items-center py-8 space-y-8 animate-fade-in">
      {/* Celebration */}
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-action-900/30 flex items-center justify-center animate-scale-in">
          <span className="text-4xl" aria-hidden="true">🎉</span>
        </div>
        {/* Sparkle accents */}
        <SparklesIcon className="absolute -top-1 -right-1 w-6 h-6 text-accent-400 animate-pulse-soft" />
        <SparklesIcon className="absolute -bottom-1 -left-2 w-4 h-4 text-action-400 animate-pulse-soft" style={{ animationDelay: '0.5s' }} />
      </div>

      <div className="text-center space-y-2 max-w-sm">
        <h3 className="font-display text-2xl font-bold text-gray-100">
          Import Complete!
        </h3>
        <p className="text-sm text-gray-400">
          Your GameChanger data has been successfully imported.
        </p>
      </div>

      {/* Summary stats */}
      {(summary.players > 0 || summary.games > 0 || summary.stats > 0) && (
        <div className="w-full bg-action-900/20 rounded-xl border border-action-700 p-5">
          <div className="flex flex-wrap justify-center gap-4">
            {summary.players > 0 && (
              <SummaryStat icon="👤" value={summary.players} label="Players" />
            )}
            {summary.games > 0 && (
              <SummaryStat icon="⚾" value={summary.games} label="Games" />
            )}
            {summary.stats > 0 && (
              <SummaryStat icon="📊" value={summary.stats} label="Stat Rows" />
            )}
            {summary.created > 0 && (
              <SummaryStat icon="✨" value={summary.created} label="Created" />
            )}
            {summary.updated > 0 && (
              <SummaryStat icon="🔄" value={summary.updated} label="Updated" />
            )}
            {summary.skipped > 0 && (
              <SummaryStat icon="⏭️" value={summary.skipped} label="Skipped" />
            )}
          </div>

          {summary.message && (
            <p className="mt-4 text-center text-xs text-action-200 font-medium bg-action-900/60 rounded-lg px-3 py-2">
                {summary.message}
            </p>
          )}
        </div>
      )}

      {/* Warnings (e.g. duplicate game import) */}
      {summary.warnings?.length > 0 && (
        <div className="w-full bg-amber-50 rounded-xl border border-amber-200 p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
            <span aria-hidden="true">⚠️</span> Heads Up
          </p>
          {summary.warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-800">{w}</p>
          ))}
        </div>
      )}

      {/* Next actions */}
      <div className="w-full space-y-2">
        <p className="eyebrow text-center mb-3">
          What's next?
        </p>

        <div className="grid grid-cols-1 gap-2">
          <NextAction
            icon={<UsersIcon className="w-4 h-4" />}
            label="View Team"
            description="Check your updated team"
            onClick={() => { onClose(); onNavigate?.('rosters'); }}
          />
          <NextAction
            icon={<CalendarIcon className="w-4 h-4" />}
            label="View Schedule"
            description="See imported games"
            onClick={() => { onClose(); onNavigate?.('schedule'); }}
          />
          <NextAction
            icon={<TrophyIcon className="w-4 h-4" />}
            label="View Standings"
            description="Check league standings"
            onClick={() => { onClose(); onNavigate?.('standings'); }}
          />
          <NextAction
            icon={<HomeIcon className="w-4 h-4" />}
            label="Go to Dashboard"
            description="Return to the overview"
            onClick={() => { onClose(); onNavigate?.('dashboard'); }}
          />
        </div>

        <div className="pt-4 border-t border-gray-700 mt-4">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            icon={<ArrowUpTrayIcon className="w-4 h-4" />}
            onClick={onImportAnother}
          >
            Import Another File
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ icon, value, label }) {
  return (
    <div className="text-center px-3">
      <span className="text-base" aria-hidden="true">{icon}</span>
      <p className="text-2xl font-display font-bold text-gray-100 tabular-nums">{value}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">{label}</p>
    </div>
  );
}

function NextAction({ icon, label, description, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-700 bg-gray-800 hover:bg-gray-900 hover:border-gray-600 transition-all text-left"
    >
      <div className="w-8 h-8 rounded-lg bg-action-900/20 flex items-center justify-center text-action-600 shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-100">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <span className="text-gray-300 text-sm" aria-hidden="true">→</span>
    </button>
  );
}
