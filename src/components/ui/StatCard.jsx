import { cn } from '../../lib/cn.js';

const accents = {
  field:     'border-l-action-600',
  action:    'border-l-action-600',
  dirt:      'border-l-accent-600',
  accent:    'border-l-accent-600',
  baseball:  'border-l-signal-600',
  signal:    'border-l-signal-600',
  blue:      'border-l-chrome-600',
  chrome:    'border-l-chrome-600',
  sport:     'border-l-sport',
};

export default function StatCard({
  label,
  value,
  trend,
  trendLabel,
  icon,
  accentColor = 'field',
  className,
}) {
  return (
    <div
      className={cn(
        'bg-gray-800 rounded-card shadow-card border-l-4 p-5 transition-all hover:-translate-y-0.5 hover:shadow-elevated',
        accents[accentColor],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow truncate">
            {label}
          </p>
          <p className="mt-1 text-3xl font-display font-bold text-gray-100 stat">
            {value}
          </p>
          {trendLabel && (
            <p
              className={cn(
                'mt-1.5 text-xs font-medium flex items-center gap-1',
                trend >= 0 ? 'text-action-400' : 'text-signal-400',
              )}
            >
              <span aria-hidden="true">{trend >= 0 ? '▲' : '▼'}</span>
              {trendLabel}
            </p>
          )}
        </div>
        {icon && (
          <div className="shrink-0 w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center text-gray-400">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
