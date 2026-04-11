import { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/cn.js';
import { Bars3Icon, LockIcon, ArrowRightStartOnRectangleIcon } from './icons.jsx';

export default function TopBar({
  title,
  breadcrumb,
  user,
  onMenuToggle,
  onChangePassword,
  onLogout,
  children,
}) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  const initials = (user?.name || user?.username || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-200 h-16 flex items-center gap-4 px-4 lg:px-6">
      {/* Mobile menu toggle */}
      <button
        className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        onClick={onMenuToggle}
        aria-label="Toggle navigation"
      >
        <Bars3Icon className="w-5 h-5" />
      </button>

      {/* Title / breadcrumb */}
      <div className="flex-1 min-w-0">
        {breadcrumb && (
          <p className="text-[11px] text-gray-400 uppercase tracking-wide truncate">
            {breadcrumb}
          </p>
        )}
        <h1 className="font-heading text-lg font-bold text-gray-900 truncate leading-tight">
          {title}
        </h1>
      </div>

      {/* Actions slot — pass extra buttons, search, etc. */}
      {children}

      {/* User avatar + dropdown */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={() => setUserMenuOpen((v) => !v)}
          className="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          aria-haspopup="true"
          aria-expanded={userMenuOpen}
        >
          <div className="hidden sm:block text-right leading-tight">
            <p className="text-sm font-medium text-gray-900 truncate max-w-[120px]">
              {user?.name || user?.username}
            </p>
            <p className="text-[10px] text-gray-400 capitalize">
              {user?.role?.replace(/_/g, ' ')}
            </p>
          </div>
          <div className="w-8 h-8 rounded-full bg-field-100 text-field-700 flex items-center justify-center font-semibold text-xs border border-field-200">
            {initials}
          </div>
        </button>

        {/* Dropdown menu */}
        {userMenuOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-elevated border border-gray-100 py-1 animate-scale-in origin-top-right z-50">
            <div className="px-3 py-2 border-b border-gray-100 sm:hidden">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.name || user?.username}
              </p>
              <p className="text-xs text-gray-400 capitalize">
                {user?.role?.replace(/_/g, ' ')}
              </p>
            </div>
            <button
              onClick={() => { setUserMenuOpen(false); onChangePassword?.(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <LockIcon className="w-4 h-4 text-gray-400" />
              Change Password
            </button>
            <button
              onClick={() => { setUserMenuOpen(false); onLogout?.(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-baseball-600 hover:bg-baseball-50 transition-colors"
            >
              <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
