import { cn } from '../../lib/cn.js';

const variants = {
  success: 'bg-action-900/55 text-action-300 border-action-700',
  warning: 'bg-accent-900/45 text-accent-300 border-accent-700',
  danger:  'bg-signal-900/45 text-signal-300 border-signal-700',
  info:    'bg-chrome-900/60 text-chrome-300 border-chrome-700',
  neutral: 'bg-gray-800 text-gray-300 border-gray-700',
  sport:   'lh-badge-sport',
};

const sizes = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs',
};

export default function Badge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  className,
  children,
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-semibold rounded-full border',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            variant === 'success' && 'bg-action-400',
            variant === 'warning' && 'bg-accent-400',
            variant === 'danger' && 'bg-signal-400 animate-dot-pulse',
            variant === 'info' && 'bg-chrome-400',
            variant === 'neutral' && 'bg-gray-400',
            variant === 'sport' && 'bg-sport',
          )}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
