import { cn } from '../../lib/cn.js';

const variants = {
  default:  'bg-gray-800 shadow-card',
  elevated: 'bg-gray-800 shadow-elevated',
  bordered: 'bg-gray-800 border border-gray-700',
  accent:   'bg-gray-800 shadow-card border-t-4 border-field-600',
  field:    'bg-gray-800 shadow-card border-t-4 border-field-700',
  dirt:     'bg-gray-800 shadow-card border-t-4 border-dirt-700',
  strike:   'bg-gray-800 shadow-card border-t-4 border-baseball-600',
};

export function Card({ variant = 'default', className, children, ...props }) {
  return (
    <div
      className={cn('rounded-xl overflow-hidden', variants[variant], className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, action }) {
  return (
    <div className={cn('px-5 py-4 border-b border-gray-700 flex items-center justify-between gap-4', className)}>
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

export function CardFooter({ className, children }) {
  return (
    <div className={cn('px-5 py-3 bg-gray-900/50 border-t border-gray-700', className)}>
      {children}
    </div>
  );
}
