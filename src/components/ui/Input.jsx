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
          className="eyebrow block"
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
            'lh-input',
            icon && 'pl-10',
            error && 'border-signal-400 focus:ring-signal-500/30 focus:border-signal-500',
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
        <p id={`${inputId}-error`} className="text-xs text-signal-400 font-medium" role="alert">
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
