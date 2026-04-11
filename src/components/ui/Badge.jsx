import { cn } from '../../lib/cn.js';

const variants = {
  success: 'bg-field-900/35 text-field-300 border-field-700',
  warning: 'bg-dirt-900/35 text-dirt-300 border-dirt-700',
  danger:  'bg-baseball-900/35 text-baseball-300 border-baseball-700',
  info:    'bg-blue-900/35 text-blue-300 border-blue-700',
  neutral: 'bg-gray-800 text-gray-300 border-gray-700',
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
            variant === 'success' && 'bg-field-500',
            variant === 'warning' && 'bg-dirt-500',
            variant === 'danger' && 'bg-baseball-500',
            variant === 'info' && 'bg-blue-500',
            variant === 'neutral' && 'bg-gray-400',
          )}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
