import { cn } from '../../lib/cn.js';
import TeamLogo from '../TeamLogo.jsx';

const statusColors = {
  scheduled:  'bg-chrome-900/60 text-chrome-300',
  in_progress: 'bg-accent-900/45 text-accent-300',
  final:      'bg-action-900/55 text-action-300',
  cancelled:  'bg-gray-800 text-gray-400',
  postponed:  'bg-signal-900/45 text-signal-300',
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
    <div className={cn('bg-gray-800 rounded-card shadow-card overflow-hidden', className)}>
      {/* Status bar */}
      <div className="bg-chrome-800 text-white px-4 py-2 flex items-center justify-between">
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
        <div className="px-4 py-2 bg-gray-900 border-t border-gray-700 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            {location && <p className="text-xs text-gray-400 truncate">📍 {location}</p>}
            {weather?.playability && (
              <span className={cn(
                'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0',
                weather.playability.rating === 'good' && 'bg-green-900/40 text-green-300',
                weather.playability.rating === 'fair' && 'bg-yellow-900/40 text-yellow-300',
                weather.playability.rating === 'poor' && 'bg-orange-900/40 text-orange-300',
                weather.playability.rating === 'unplayable' && 'bg-red-900/40 text-red-300',
              )}>
                {weather.playability.rating}
              </span>
            )}
          </div>
          {weather && !weather.unavailable && (
            <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
              <span title={weather.description}>{weather.icon} {weather.temp}°F</span>
              {weather.feelsLike != null && weather.feelsLike !== weather.temp && (
                <span className="text-gray-500" title="Feels like">(feels {weather.feelsLike}°)</span>
              )}
              {weather.windSpeed > 0 && (
                <span className="text-gray-500" title={`Wind gusts: ${weather.windGusts || weather.windSpeed}mph`}>
                  💨 {weather.windSpeed}mph{weather.windDirection ? ` ${weather.windDirection}` : ''}
                </span>
              )}
              {weather.precipitationProbability != null && weather.precipitationProbability > 0 && (
                <span className={cn(
                  weather.precipitationProbability >= 60 ? 'text-orange-400' :
                  weather.precipitationProbability >= 30 ? 'text-yellow-400' : 'text-gray-500',
                )}>
                  🌧️ {weather.precipitationProbability}%
                </span>
              )}
              {weather.uvIndex != null && weather.uvIndex >= 6 && (
                <span className={cn(
                  weather.uvIndex >= 8 ? 'text-red-400' : 'text-orange-400',
                )} title={`UV Index: ${weather.uvIndex}`}>
                  ☀️ UV {Math.round(weather.uvIndex)}
                </span>
              )}
              {weather.isForecast && (
                <span className="text-gray-600 text-[10px] italic ml-auto">forecast</span>
              )}
            </div>
          )}
          {weather?.playability?.reasons?.length > 0 && (
            <p className="text-[10px] text-gray-500">
              ⚠️ {weather.playability.reasons.join(' · ')}
            </p>
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
