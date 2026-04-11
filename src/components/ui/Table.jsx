import { cn } from '../../lib/cn.js';

export function Table({ className, children }) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-gray-200 bg-white', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ className, children }) {
  return (
    <thead className={cn('bg-gray-50 text-left', className)}>
      {children}
    </thead>
  );
}

export function TableHeaderCell({ className, children, sortable, sorted, sortDir, onClick, ...props }) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap',
        sortable && 'cursor-pointer select-none hover:text-gray-700 transition-colors',
        className,
      )}
      onClick={sortable ? onClick : undefined}
      aria-sort={sorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      {...props}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sorted && (
          <span className="text-field-600" aria-hidden="true">
            {sortDir === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </span>
    </th>
  );
}

export function TableBody({ className, children }) {
  return <tbody className={cn('divide-y divide-gray-100', className)}>{children}</tbody>;
}

export function TableRow({ className, highlight, children, ...props }) {
  return (
    <tr
      className={cn(
        'hover:bg-gray-50/50 transition-colors',
        highlight && 'bg-field-50/50',
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableCell({ className, children, ...props }) {
  return (
    <td className={cn('px-4 py-3 text-gray-700', className)} {...props}>
      {children}
    </td>
  );
}

export function TableEmpty({ colSpan, message = 'No data found', icon }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center">
        {icon && <div className="text-3xl mb-2 opacity-40">{icon}</div>}
        <p className="text-sm text-gray-400">{message}</p>
      </td>
    </tr>
  );
}
