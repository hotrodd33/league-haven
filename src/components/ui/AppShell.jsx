import { useState } from 'react';
import { cn } from '../../lib/cn.js';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

/**
 * AppShell — Premium SaaS layout with collapsible sidebar + sticky top bar.
 *
 * Usage:
 *   <AppShell page={page} onNavigate={setPage} isAdmin={isAdmin} user={user} ...>
 *     <main>...your page content...</main>
 *   </AppShell>
 *
 * Swap into App.jsx when ready to adopt the sidebar layout.
 */
export default function AppShell({
  page,
  onNavigate,
  isAdmin,
  isAccountant,
  isOrgAdmin,
  isTeamManager,
  user,
  branding,
  onChangePassword,
  onLogout,
  onNavigateToTeam,
  children,
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const pageTitle = {
    dashboard: 'Dashboard',
    organizations: 'Organizations',
    rosters: 'Teams',
    schedule: 'Schedule',
    standings: 'Standings',
    directory: 'Directory',
    league: 'League Config',
    users: 'User Management',
    approvals: 'Approvals',
    data: 'Data Manager',
    officials: 'Officials',
    fees: 'League Fees',
    about: 'Help',
    guide: 'Help',
  }[page] || 'Dashboard';

  return (
    <div className="min-h-screen bg-league-watermark">
      {/* Sidebar */}
      <Sidebar
        page={page}
        onNavigate={onNavigate}
        isAdmin={isAdmin}
        isAccountant={isAccountant}
        isOrgAdmin={isOrgAdmin}
        isTeamManager={isTeamManager}
        branding={branding}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main content area — offset by sidebar width */}
      <div
        className={cn(
          'transition-all duration-300',
          sidebarCollapsed ? 'lg:ml-[68px]' : 'lg:ml-64',
        )}
      >
        {/* Top bar */}
        <TopBar
          title={pageTitle}
          breadcrumb={`${branding?.app_name || 'ZVBL'} Roster Manager`}
          user={user}
          onMenuToggle={() => setMobileMenuOpen((v) => !v)}
          onChangePassword={onChangePassword}
          onLogout={onLogout}
          onNavigateToTeam={onNavigateToTeam}
          onShowAbout={() => onNavigate('about')}
          onShowGuide={() => onNavigate('guide')}
        />

        {/* Page content */}
        <main className="p-4 lg:p-6 max-w-7xl mx-auto animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
