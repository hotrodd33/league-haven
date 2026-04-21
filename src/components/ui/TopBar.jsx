import { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/cn.js';
import { Bars3Icon, LockIcon, ArrowRightStartOnRectangleIcon, InformationCircleIcon, BookOpenIcon, UserIcon, BugAntIcon } from './icons.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchTeams } from '../../api/index.js';
import TeamLogo from '../TeamLogo.jsx';

export default function TopBar({
  title,
  breadcrumb,
  user,
  onMenuToggle,
  onChangePassword,
  onLogout,
  onNavigateToTeam,
  onShowAbout,
  onShowGuide,
  onMyAccount,
  onReportBug,
  children,
}) {
  const { isSuperAdmin, permissions } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [myTeams, setMyTeams] = useState([]);
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

  // Load teams the user has access to
  useEffect(() => {
    if (isSuperAdmin) { setMyTeams([]); return; }
    if (!permissions.org_ids.length && !permissions.team_ids.length) { setMyTeams([]); return; }
    fetchTeams().then(all => {
      const teamIds = new Set(permissions.team_ids.map(Number));
      const orgIds = new Set(permissions.org_ids.map(Number));
      const mine = all.filter(t => teamIds.has(t.id) || (t.org_id && orgIds.has(t.org_id)));
      setMyTeams(mine);
    }).catch(() => setMyTeams([]));
  }, [isSuperAdmin, permissions.org_ids, permissions.team_ids]);

  const initials = (user?.name || user?.username || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-30 bg-gray-800/95 backdrop-blur-sm border-b border-gray-700 h-16 flex items-center gap-4 px-4 lg:px-6">
      {/* Mobile menu toggle */}
      <button
        className="lg:hidden p-2 -ml-2 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
        onClick={onMenuToggle}
        aria-label="Toggle navigation"
      >
        <Bars3Icon className="w-5 h-5" />
      </button>

      {/* Title / breadcrumb */}
      <div className="flex-1 min-w-0">
        {breadcrumb && (
          <p className="eyebrow truncate">
            {breadcrumb}
          </p>
        )}
        <h1 className="font-display text-lg font-bold text-gray-100 truncate leading-tight uppercase">
          {title}
        </h1>
      </div>

      {/* Actions slot — pass extra buttons, search, etc. */}
      {children}

      {/* My teams quick-nav */}
      {myTeams.length > 0 && (
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          {myTeams.map(t => (
            <button key={t.id} onClick={() => onNavigateToTeam?.(t.id, t.org_id)}
              title={t.name}
              className="rounded-md hover:ring-2 hover:ring-chrome-400 transition-all">
              <TeamLogo src={t.logo_url} name={t.name} ageGroup={t.age_group} level={t.level}
                cityAbbr={t.city_abbr} primaryColor={t.primary_color} secondaryColor={t.secondary_color}
                size="w-8 h-8" />
            </button>
          ))}
        </div>
      )}

      {/* User avatar + dropdown */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={() => setUserMenuOpen((v) => !v)}
          className="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-700 transition-colors"
          aria-haspopup="true"
          aria-expanded={userMenuOpen}
        >
          <div className="hidden sm:block text-right leading-tight">
            <p className="text-sm font-medium text-gray-100 truncate max-w-[120px]">
              {user?.name || user?.username}
            </p>
            <p className="text-[10px] text-gray-400 capitalize">
              {user?.role?.replace(/_/g, ' ')}
            </p>
          </div>
          <div className="w-8 h-8 rounded-full bg-action-900 text-action-400 flex items-center justify-center font-semibold text-xs border border-action-700">
            {initials}
          </div>
        </button>

        {/* Dropdown menu */}
        {userMenuOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-card shadow-elevated border border-gray-700 py-1 animate-scale-in origin-top-right z-50">
            <div className="px-3 py-2 border-b border-gray-700 sm:hidden">
              <p className="text-sm font-medium text-gray-100 truncate">
                {user?.name || user?.username}
              </p>
              <p className="text-xs text-gray-400 capitalize">
                {user?.role?.replace(/_/g, ' ')}
              </p>
            </div>
            <button
              onClick={() => { setUserMenuOpen(false); onShowAbout?.(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-900 transition-colors"
            >
              <InformationCircleIcon className="w-4 h-4 text-gray-400" />
              About
            </button>
            <button
              onClick={() => { setUserMenuOpen(false); onShowGuide?.(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-900 transition-colors"
            >
              <BookOpenIcon className="w-4 h-4 text-gray-400" />
              User Guide
            </button>
            <div className="border-t border-gray-700 my-1" />
            <button
              onClick={() => { setUserMenuOpen(false); onMyAccount?.(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-900 transition-colors"
            >
              <UserIcon className="w-4 h-4 text-gray-400" />
              My Account
            </button>
            <button
              onClick={() => { setUserMenuOpen(false); onChangePassword?.(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-900 transition-colors"
            >
              <LockIcon className="w-4 h-4 text-gray-400" />
              Change Password
            </button>
            <button
              onClick={() => { setUserMenuOpen(false); onReportBug?.(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-900 transition-colors"
            >
              <BugAntIcon className="w-4 h-4 text-gray-400" />
              Report a Bug
            </button>
            <button
              onClick={() => { setUserMenuOpen(false); onLogout?.(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-signal-300 hover:bg-signal-900/35 transition-colors"
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
