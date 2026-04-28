import { cn } from '../../lib/cn.js';
import {
  UsersIcon, BuildingIcon, CalendarIcon, TrophyIcon,
  ClipboardIcon, CogIcon, UserGroupIcon, DatabaseIcon,
  ChevronLeftIcon, ChevronRightIcon, HomeIcon, CurrencyDollarIcon,
  MapPinIcon, UserIcon, MegaphoneIcon, GlobeIcon, BookOpenIcon,
  ArrowTrendingUpIcon, AcademicCapIcon, ShieldCheckIcon, LockIcon,
  ArrowTopRightOnSquareIcon,
} from './icons.jsx';

export default function Sidebar({
  page,
  onNavigate,
  isAdmin = false,
  isAccountant = false,
  isOrgAdmin = false,
  isTeamManager = false,
  branding,
  features = {},
  pendingApprovalCount = 0,
  unreadAnnouncementCount = 0,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
}) {
  const ft = (key) => features[key] !== false;

  // Standalone home — no group
  const homeItem = { key: 'dashboard', label: 'Dashboard', icon: HomeIcon };

  // ACTIVITY — day-to-day operational destinations
  const activityItems = [
    { key: 'schedule',  label: 'Schedule',  icon: CalendarIcon },
    { key: 'standings', label: 'Standings', icon: TrophyIcon },
    { key: 'fields',    label: 'Fields',    icon: MapPinIcon },
    { key: 'travel',    label: 'Travel',    icon: ArrowTrendingUpIcon },
  ];

  // ROSTER — teams + every people directory in one place
  const rosterItems = [
    { key: 'rosters', label: 'Teams',   icon: UsersIcon },
    { key: 'players', label: 'Players', icon: UserIcon },
  ];
  if (isAdmin || isOrgAdmin) {
    rosterItems.push({ key: 'coaches', label: 'Coaches', icon: AcademicCapIcon });
  }
  if (isAdmin || isOrgAdmin || isTeamManager) {
    rosterItems.push({ key: 'guardians', label: 'Guardians', icon: UserGroupIcon });
  }
  if ((isAdmin || isOrgAdmin || isAccountant) && ft('feature_officials')) {
    rosterItems.push({ key: 'officials', label: 'Officials', icon: ShieldCheckIcon });
  }
  rosterItems.push({ key: 'directory', label: 'Contacts', icon: BookOpenIcon });

  // ADMIN — configuration, management, infrequent tools
  const adminItems = [];
  if (isAdmin || isOrgAdmin || isTeamManager) {
    adminItems.push({ key: 'approvals', label: 'Approvals', icon: ClipboardIcon, badge: pendingApprovalCount });
  }
  if (isAdmin || isOrgAdmin) {
    adminItems.push({ key: 'announcements', label: 'Announcements', icon: MegaphoneIcon, badge: unreadAnnouncementCount });
  }
  adminItems.push({ key: 'organizations', label: 'Orgs & Teams', icon: BuildingIcon });
  if (isAdmin) {
    adminItems.push({ key: 'users', label: 'Users', icon: LockIcon });
    adminItems.push({ key: 'league', label: 'League Config', icon: CogIcon });
  }
  if ((isAdmin || isAccountant) && ft('feature_financials')) {
    adminItems.push({ key: 'fees', label: 'League Fees', icon: CurrencyDollarIcon });
  }
  if (isAdmin) {
    adminItems.push({ key: 'data', label: 'Data Manager', icon: DatabaseIcon });
  }

  // External outlink — visually separated at the bottom
  const externalItems = [];
  if (branding?.public_site_url) {
    externalItems.push({
      key: 'website',
      label: 'Website',
      icon: GlobeIcon,
      external: true,
      href: `${branding.public_site_url.replace(/\/+$/, '')}/site`,
    });
  }

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
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-chrome-900 text-white',
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
            <span className="ml-3 font-display text-xl font-bold tracking-wide uppercase">
              {branding?.app_name || 'LeagueHaven'}
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1 scrollbar-thin">
          {/* Dashboard — standalone home, above all groups */}
          <div className={cn('pt-1 pb-2', collapsed ? 'px-2' : 'px-0')}>
            <NavItem
              item={homeItem}
              active={page === homeItem.key}
              collapsed={collapsed}
              onClick={() => { onNavigate(homeItem.key); onCloseMobile?.(); }}
            />
          </div>
          <NavGroup label="Activity" items={activityItems} page={page} collapsed={collapsed}
            onNavigate={onNavigate} onCloseMobile={onCloseMobile} />
          <NavGroup label="Roster" items={rosterItems} page={page} collapsed={collapsed}
            onNavigate={onNavigate} onCloseMobile={onCloseMobile} />
          <NavGroup label="Admin" items={adminItems} page={page} collapsed={collapsed}
            onNavigate={onNavigate} onCloseMobile={onCloseMobile} />
          {externalItems.length > 0 && (
            <NavGroup label="External" items={externalItems} page={page} collapsed={collapsed}
              onNavigate={onNavigate} onCloseMobile={onCloseMobile} />
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
  const baseCls = cn(
    'w-full flex items-center rounded-lg transition-all duration-150 text-sm relative',
    collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
    active
      ? 'bg-action-700 text-white shadow-glow-action font-semibold'
      : 'text-white/60 hover:bg-white/8 hover:text-white',
  );

  if (item.href) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={baseCls}
        title={collapsed ? item.label : undefined}
        onClick={onClick}
      >
        <Icon className="w-5 h-5 shrink-0" />
        {!collapsed && (
          <>
            <span className="truncate">{item.label}</span>
            {item.external && <ArrowTopRightOnSquareIcon className="ml-auto w-3.5 h-3.5 shrink-0 text-white/40" />}
          </>
        )}
      </a>
    );
  }

  return (
    <button
      onClick={onClick}
      className={baseCls}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="w-5 h-5 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {item.badge > 0 && (
        <span className={cn(
          'ml-auto shrink-0 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none',
          collapsed ? 'absolute top-0.5 right-0.5 w-4 h-4' : 'min-w-[18px] h-[18px] px-1',
        )}>
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </button>
  );
}

function NavGroup({ label, items, page, collapsed, onNavigate, onCloseMobile }) {
  if (!items.length) return null;
  return (
    <>
      <div className={cn('pt-5 pb-2', collapsed ? 'px-2' : 'px-3')}>
        {!collapsed ? (
          <p className="eyebrow text-white/30">
            {label}
          </p>
        ) : (
          <div className="border-t border-white/10" />
        )}
      </div>
      {items.map((item) => (
        <NavItem
          key={item.key}
          item={item}
          active={page === item.key}
          collapsed={collapsed}
          onClick={() => {
            if (!item.href) onNavigate(item.key);
            onCloseMobile?.();
          }}
        />
      ))}
    </>
  );
}
