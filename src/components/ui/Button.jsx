import { cn } from '../../lib/cn.js';

const variants = {
  primary:   'bg-action-600 text-white hover:bg-action-700 focus-visible:ring-action-500/40',
  secondary: 'bg-gray-800 text-gray-200 border border-gray-600 hover:bg-gray-700 focus-visible:ring-action-500/30',
  ghost:     'text-gray-300 hover:bg-gray-700 focus-visible:ring-gray-400/30',
  danger:    'bg-signal-600 text-white hover:bg-signal-700 focus-visible:ring-signal-500/40',
  warn:      'bg-accent-700 text-white hover:bg-accent-800 focus-visible:ring-accent-500/40',
  chrome:    'bg-chrome-600 text-white hover:bg-chrome-700 focus-visible:ring-chrome-500/40',
  // Legacy aliases
  dirt:      'bg-accent-700 text-white hover:bg-accent-800 focus-visible:ring-accent-500/40',
  navy:      'bg-chrome-600 text-white hover:bg-chrome-700 focus-visible:ring-chrome-500/40',
};

const sizes = {
  xs: 'px-2.5 py-1 text-xs gap-1',
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  loading = false,
  disabled,
  icon,
  ...props
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-semibold rounded-lg',
        'transition-all duration-150 cursor-pointer',
        'focus:outline-none focus-visible:ring-2',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {!loading && icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
