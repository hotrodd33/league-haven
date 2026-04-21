import { useState } from 'react';
import { cn } from '../../lib/cn.js';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import LiveScoreTicker from '../ticker/LiveScoreTicker.jsx';
import BugReportModal from '../BugReportModal.jsx';

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
  features,
  pendingApprovalCount = 0,
  unreadAnnouncementCount = 0,
  onChangePassword,
  onLogout,
  onNavigateToTeam,
  onMyAccount,
  children,
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);

  const pageTitle = {
    dashboard: 'Dashboard',
    organizations: 'Organizations',
    rosters: 'Teams',
    players: 'Players',
    schedule: 'Schedule',
    standings: 'Standings',
    directory: 'Directory',
    league: 'League Config',
    users: 'User Management',
    approvals: 'Approvals',
    data: 'Data Manager',
    announcements: 'Announcements',
    officials: 'Officials',
    fees: 'League Fees',
    about: 'Help',
    guide: 'Help',
    fields: 'Fields',
    travel: 'Travel Matrix',
    account: 'My Account',
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
        features={features}
        pendingApprovalCount={pendingApprovalCount}
        unreadAnnouncementCount={unreadAnnouncementCount}
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
          breadcrumb={`${branding?.app_name || 'LeagueHaven'} Sports Management`}
          user={user}
          onMenuToggle={() => setMobileMenuOpen((v) => !v)}
          onChangePassword={onChangePassword}
          onLogout={onLogout}
          onNavigateToTeam={onNavigateToTeam}
          onMyAccount={onMyAccount}
          onShowAbout={() => onNavigate('about')}
          onShowGuide={() => onNavigate('guide')}
          onReportBug={() => setShowBugReport(true)}
        />

        {/* Live score ticker — hidden when no in-progress games or dismissed */}
        <LiveScoreTicker />

        {/* Page content */}
        <main className="p-4 lg:p-6 max-w-7xl mx-auto animate-fade-in">
          {children}
        </main>
      </div>

      {showBugReport && <BugReportModal onClose={() => setShowBugReport(false)} />}
    </div>
  );
}
