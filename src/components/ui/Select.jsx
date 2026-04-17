import { cn } from '../../lib/cn.js';

export default function Select({
  label,
  error,
  helper,
  className,
  wrapperClassName,
  id,
  children,
  ...props
}) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={cn('space-y-1', wrapperClassName)}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-semibold text-gray-400 uppercase tracking-wide"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          'w-full px-3 py-2 border rounded-lg text-sm transition-colors appearance-none',
          'bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat',
          'bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 20 20\' fill=\'%23837b73\'%3E%3Cpath fill-rule=\'evenodd\' d=\'M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z\' clip-rule=\'evenodd\'/%3E%3C/svg%3E")]',
          'pr-10 focus:outline-none focus:ring-2',
          error
            ? 'border-signal-400 focus:ring-signal-500/30 focus:border-signal-500'
            : 'border-gray-600 focus:ring-action-500/30 focus:border-action-600',
          className,
        )}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={
          error ? `${selectId}-error` : helper ? `${selectId}-helper` : undefined
        }
        {...props}
      >
        {children}
      </select>
      {error && (
        <p id={`${selectId}-error`} className="text-xs text-signal-400 font-medium" role="alert">
          {error}
        </p>
      )}
      {helper && !error && (
        <p id={`${selectId}-helper`} className="text-xs text-gray-400">
          {helper}
        </p>
      )}
    </div>
  );
}
