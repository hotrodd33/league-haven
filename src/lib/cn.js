/**
 * Merge class names, filtering out falsy values.
 * Lightweight alternative to clsx — no dependencies.
 */
export function cn(...args) {
  return args.filter(Boolean).join(' ');
}
