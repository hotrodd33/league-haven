import { cn } from '../../lib/cn.js';

const variants = {
  success: 'bg-field-100 text-field-800 border-field-200',
  warning: 'bg-dirt-100 text-dirt-900 border-dirt-200',
  danger:  'bg-baseball-50 text-baseball-700 border-baseball-200',
  info:    'bg-blue-100 text-blue-800 border-blue-200',
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
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
