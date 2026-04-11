import { cn } from '../../lib/cn.js';
import TeamLogo from '../TeamLogo.jsx';

const statusColors = {
  scheduled:  'bg-blue-100 text-blue-700',
  in_progress: 'bg-dirt-100 text-dirt-800',
  final:      'bg-field-100 text-field-800',
  cancelled:  'bg-gray-100 text-gray-500',
  postponed:  'bg-baseball-50 text-baseball-700',
};

export default function Scoreboard({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  inning,
  status = 'scheduled',
  gameTime,
  location,
  className,
}) {
  const statusLabel = {
    scheduled: 'Scheduled',
    in_progress: inning ? `Inning ${inning}` : 'In Progress',
    final: 'Final',
    cancelled: 'Cancelled',
    postponed: 'Postponed',
  }[status] || status;

  const isFinal = status === 'final';
  const homeWins = isFinal && homeScore > awayScore;
  const awayWins = isFinal && awayScore > homeScore;

  return (
    <div className={cn('bg-white rounded-xl shadow-card overflow-hidden', className)}>
      {/* Status bar */}
      <div className="bg-blue-900 text-white px-4 py-2 flex items-center justify-between">
        <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full', statusColors[status] || 'bg-gray-100 text-gray-500')}>
          {statusLabel}
        </span>
        {gameTime && <span className="text-xs text-white/70">{gameTime}</span>}
      </div>

      {/* Team rows */}
      <div className="divide-y divide-gray-100">
        <TeamRow
          team={awayTeam}
          score={awayScore}
          isWinner={awayWins}
          label="AWAY"
        />
        <TeamRow
          team={homeTeam}
          score={homeScore}
          isWinner={homeWins}
          label="HOME"
        />
      </div>

      {/* Location footer */}
      {location && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-400 truncate">📍 {location}</p>
        </div>
      )}
    </div>
  );
}

function TeamRow({ team, score, isWinner, label }) {
  if (!team) return null;

  return (
    <div className="flex items-center px-4 py-3 gap-3">
      <div
        className="w-1 h-10 rounded-full shrink-0"
        style={{ background: team.primaryColor || '#ccc' }}
        aria-hidden="true"
      />
      <TeamLogo
        src={team.logo}
        name={team.name}
        cityAbbr={team.cityAbbr}
        primaryColor={team.primaryColor}
        secondaryColor={team.secondaryColor}
        size="w-8 h-8"
      />
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm truncate', isWinner ? 'font-bold text-gray-900' : 'font-medium text-gray-700')}>
          {team.name}
        </p>
        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      </div>
      <span
        className={cn(
          'font-heading text-2xl tabular-nums',
          isWinner ? 'font-bold text-gray-900' : 'font-semibold text-gray-400',
        )}
      >
        {score ?? '-'}
      </span>
    </div>
  );
}
