import { cn } from '../../lib/cn.js';

export default function PlayerCard({
  name,
  number,
  position,
  photo,
  battingHand,
  throwingHand,
  teamColor,
  className,
}) {
  const gradient = teamColor
    ? `linear-gradient(135deg, ${teamColor}, ${adjustBrightness(teamColor, -40)})`
    : undefined;

  return (
    <div
      className={cn(
        'bg-white rounded-xl shadow-card overflow-hidden group',
        'hover:shadow-elevated transition-all duration-200',
        className,
      )}
    >
      {/* Colored header with avatar */}
      <div
        className="relative h-24 bg-gradient-to-br from-field-700 to-field-900 flex items-center justify-center"
        style={gradient ? { background: gradient } : undefined}
      >
        {/* Jersey number corner badge */}
        {number && (
          <div className="absolute top-2 right-2 w-7 h-7 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">#{number}</span>
          </div>
        )}

        {photo ? (
          <img
            src={photo}
            alt={name}
            className="w-16 h-16 rounded-full object-cover border-3 border-white/80 shadow-md group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-2xl font-heading font-bold border-2 border-white/30">
            {number || name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
      </div>

      {/* Info section */}
      <div className="px-4 py-3 text-center">
        <h3 className="font-semibold text-gray-900 truncate text-sm">{name}</h3>
        {position && (
          <p className="text-xs text-gray-500 mt-0.5 font-medium">{position}</p>
        )}
        {(battingHand || throwingHand) && (
          <div className="flex justify-center gap-3 mt-2 text-[11px] text-gray-400">
            {battingHand && <span>B: <strong className="text-gray-600">{battingHand}</strong></span>}
            {throwingHand && <span>T: <strong className="text-gray-600">{throwingHand}</strong></span>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Darken/lighten a hex color by amount (-100 to 100) */
function adjustBrightness(hex, amount) {
  if (!hex) return hex;
  const c = hex.replace('#', '');
  const num = parseInt(c, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
