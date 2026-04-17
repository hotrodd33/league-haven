import { cn } from '../../lib/cn.js';

const variantMap = {
  success: 'lh-badge-success',
  warning: 'lh-badge-warn',
  danger:  'lh-badge-danger',
  info:    'lh-badge-info',
  neutral: 'lh-badge-neutral',
  sport:   'lh-badge-sport',
};

const dotColors = {
  success: 'bg-action-400',
  warning: 'bg-accent-400',
  danger:  'bg-signal-400 animate-dot-pulse',
  info:    'bg-chrome-400',
  neutral: 'bg-gray-400',
  sport:   'bg-sport',
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
        'lh-badge',
        variantMap[variant],
        className,
      )}
    >
      {dot && (
        <span
          className={cn('dot', dotColors[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
