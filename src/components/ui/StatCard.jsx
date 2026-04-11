import { cn } from '../../lib/cn.js';

const accents = {
  field:    'border-l-field-600',
  dirt:     'border-l-dirt-600',
  baseball: 'border-l-baseball-600',
  blue:     'border-l-blue-600',
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
        'bg-white rounded-xl shadow-card border-l-4 p-5 transition-shadow hover:shadow-elevated',
        accents[accentColor],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
            {label}
          </p>
          <p className="mt-1 text-3xl font-heading font-bold text-gray-900 tabular-nums">
            {value}
          </p>
          {trendLabel && (
            <p
              className={cn(
                'mt-1.5 text-xs font-medium flex items-center gap-1',
                trend >= 0 ? 'text-field-600' : 'text-baseball-600',
              )}
            >
              <span aria-hidden="true">{trend >= 0 ? '▲' : '▼'}</span>
              {trendLabel}
            </p>
          )}
        </div>
        {icon && (
          <div className="shrink-0 w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
