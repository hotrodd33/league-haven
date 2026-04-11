import { cn } from '../../lib/cn.js';

export default function Input({
  label,
  error,
  helper,
  icon,
  className,
  wrapperClassName,
  id,
  ...props
}) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={cn('space-y-1', wrapperClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-gray-500 uppercase tracking-wide"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={cn(
            'w-full px-3 py-2 border rounded-lg text-sm transition-colors',
            'focus:outline-none focus:ring-2',
            'placeholder:text-gray-400',
            icon && 'pl-10',
            error
              ? 'border-baseball-400 focus:ring-baseball-500/30 focus:border-baseball-500'
              : 'border-gray-300 focus:ring-field-500/30 focus:border-field-600',
            className,
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={
            error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined
          }
          {...props}
        />
      </div>
      {error && (
        <p id={`${inputId}-error`} className="text-xs text-baseball-600 font-medium" role="alert">
          {error}
        </p>
      )}
      {helper && !error && (
        <p id={`${inputId}-helper`} className="text-xs text-gray-400">
          {helper}
        </p>
      )}
    </div>
  );
}
