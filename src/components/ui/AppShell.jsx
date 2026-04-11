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
  user,
  onChangePassword,
  onLogout,
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
    data: 'Data Manager',
  }[page] || 'Dashboard';

  return (
    <div className="min-h-screen bg-cream-200 bg-diamond-pattern">
      {/* Sidebar */}
      <Sidebar
        page={page}
        onNavigate={onNavigate}
        isAdmin={isAdmin}
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
          breadcrumb="ZVBL Roster Manager"
          user={user}
          onMenuToggle={() => setMobileMenuOpen((v) => !v)}
          onChangePassword={onChangePassword}
          onLogout={onLogout}
        />

        {/* Page content */}
        <main className="p-4 lg:p-6 max-w-7xl mx-auto animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
