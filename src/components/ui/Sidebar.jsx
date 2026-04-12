import { cn } from '../../lib/cn.js';
import {
  UsersIcon, BuildingIcon, CalendarIcon, TrophyIcon,
  ClipboardIcon, CogIcon, UserGroupIcon, DatabaseIcon,
  ChevronLeftIcon, ChevronRightIcon, HomeIcon, CurrencyDollarIcon,
} from './icons.jsx';

const mainNav = [
  { key: 'dashboard',     label: 'Dashboard',     icon: HomeIcon },
  { key: 'organizations', label: 'Organizations', icon: BuildingIcon },
  { key: 'rosters',       label: 'Teams',         icon: UsersIcon },
  { key: 'schedule',      label: 'Schedule',      icon: CalendarIcon },
  { key: 'standings',     label: 'Standings',      icon: TrophyIcon },
  { key: 'directory',     label: 'Directory',      icon: ClipboardIcon },
];

const adminNav = [
  { key: 'officials', label: 'Officials', icon: UserGroupIcon },
  { key: 'fees', label: 'League Fees', icon: CurrencyDollarIcon },
  { key: 'league', label: 'League Config', icon: CogIcon },
  { key: 'users',  label: 'Users',         icon: UserGroupIcon },
  { key: 'data',   label: 'Data Manager',  icon: DatabaseIcon },
];

const accountantNav = [
  { key: 'officials', label: 'Officials', icon: UserGroupIcon },
  { key: 'fees', label: 'League Fees', icon: CurrencyDollarIcon },
];

export default function Sidebar({
  page,
  onNavigate,
  isAdmin = false,
  isAccountant = false,
  branding,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
}) {
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-blue-900 text-white',
          'transition-all duration-300 ease-out',
          collapsed ? 'w-[68px]' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className={cn(
          'flex items-center h-16 shrink-0 border-b border-white/10',
          collapsed ? 'justify-center px-2' : 'px-5',
        )}>
          {branding?.logo_url ? (
            <img
              src={branding.logo_url}
              alt="App logo"
              className="w-8 h-8 rounded-md object-cover bg-white/10"
            />
          ) : (
            <span className="text-2xl" aria-hidden="true">⚾</span>
          )}
          {!collapsed && (
            <span className="ml-3 font-heading text-xl font-bold tracking-wide">
              {branding?.app_name || 'ZVBL'}
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1 scrollbar-thin">
          {mainNav.map((item) => (
            <NavItem
              key={item.key}
              item={item}
              active={page === item.key}
              collapsed={collapsed}
              onClick={() => { onNavigate(item.key); onCloseMobile?.(); }}
            />
          ))}

          {isAdmin && (
            <>
              <div className={cn('pt-5 pb-2', collapsed ? 'px-2' : 'px-3')}>
                {!collapsed ? (
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">
                    Administration
                  </p>
                ) : (
                  <div className="border-t border-white/10" />
                )}
              </div>
              {adminNav.map((item) => (
                <NavItem
                  key={item.key}
                  item={item}
                  active={page === item.key}
                  collapsed={collapsed}
                  onClick={() => { onNavigate(item.key); onCloseMobile?.(); }}
                />
              ))}
            </>
          )}

          {!isAdmin && isAccountant && (
            <>
              <div className={cn('pt-5 pb-2', collapsed ? 'px-2' : 'px-3')}>
                {!collapsed ? (
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">
                    Management
                  </p>
                ) : (
                  <div className="border-t border-white/10" />
                )}
              </div>
              {accountantNav.map((item) => (
                <NavItem
                  key={item.key}
                  item={item}
                  active={page === item.key}
                  collapsed={collapsed}
                  onClick={() => { onNavigate(item.key); onCloseMobile?.(); }}
                />
              ))}
            </>
          )}
        </nav>

        {/* Collapse toggle — desktop only */}
        <button
          className={cn(
            'hidden lg:flex items-center justify-center h-11 border-t border-white/10',
            'text-white/40 hover:text-white hover:bg-white/5 transition-colors',
          )}
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRightIcon className="w-4 h-4" />
            : <ChevronLeftIcon className="w-4 h-4" />
          }
        </button>
      </aside>
    </>
  );
}

function NavItem({ item, active, collapsed, onClick }) {
  const Icon = item.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center rounded-lg transition-all duration-150 text-sm',
        collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
        active
          ? 'bg-field-700 text-white shadow-glow-green font-semibold'
          : 'text-white/60 hover:bg-white/8 hover:text-white',
      )}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="w-5 h-5 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  );
}
