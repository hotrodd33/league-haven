import { useEffect, useRef } from 'react';
import { cn } from '../../lib/cn.js';
import { XMarkIcon } from './icons.jsx';

const sizes = {
  sm:   'max-w-md',
  md:   'max-w-lg',
  lg:   'max-w-2xl',
  xl:   'max-w-4xl',
  full: 'max-w-[calc(100vw-2rem)]',
};

export default function Modal({
  open,
  onClose,
  size = 'md',
  title,
  children,
  footer,
  className,
}) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === overlayRef.current) onClose?.(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          'w-full bg-gray-800 rounded-xl shadow-2xl animate-scale-in',
          sizes[size],
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h2 className="font-heading text-lg font-bold text-gray-100">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="px-5 py-4 max-h-[calc(100vh-12rem)] overflow-y-auto scrollbar-thin">
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-3 px-5 py-3 bg-gray-900 border-t border-gray-700 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
