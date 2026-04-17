import { cn } from '../../lib/cn.js';
import TeamLogo from '../TeamLogo.jsx';

const statusColors = {
  scheduled:  'bg-blue-900/35 text-blue-300',
  in_progress: 'bg-dirt-900/35 text-dirt-300',
  final:      'bg-field-900/35 text-field-300',
  cancelled:  'bg-gray-800 text-gray-400',
  postponed:  'bg-baseball-900/35 text-baseball-300',
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
  weather,
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
    <div className={cn('bg-gray-800 rounded-xl shadow-card overflow-hidden', className)}>
      {/* Status bar */}
      <div className="bg-blue-900 text-white px-4 py-2 flex items-center justify-between">
        <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full', statusColors[status] || 'bg-gray-800 text-gray-400')}>
          {statusLabel}
        </span>
        {gameTime && <span className="text-xs text-white/70">{gameTime}</span>}
      </div>

      {/* Team rows */}
      <div className="divide-y divide-gray-700">
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

      {/* Location + Weather footer */}
      {(location || weather) && (
        <div className="px-4 py-2 bg-gray-900 border-t border-gray-700 flex items-center justify-between gap-2">
          {location && <p className="text-xs text-gray-400 truncate">📍 {location}</p>}
          {weather && (
            <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1" title={weather.description}>
              <span>{weather.icon}</span>
              <span>{weather.temp}°F</span>
              {weather.windSpeed > 0 && <span className="text-gray-500">· {weather.windSpeed}mph</span>}
            </span>
          )}
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
        ageGroup={team.ageGroup}
        level={team.level}
        cityAbbr={team.cityAbbr}
        primaryColor={team.primaryColor}
        secondaryColor={team.secondaryColor}
        size="w-8 h-8"
      />
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm truncate', isWinner ? 'font-bold text-gray-100' : 'font-medium text-gray-300')}>
          {team.name}
        </p>
        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      </div>
      <span
        className={cn(
          'font-heading text-2xl tabular-nums',
          isWinner ? 'font-bold text-gray-100' : 'font-semibold text-gray-400',
        )}
      >
        {score ?? '-'}
      </span>
    </div>
  );
}
