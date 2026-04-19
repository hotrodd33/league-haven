import { useEffect, useState } from 'react';
import Teams from './components/Teams.jsx';
import Standings from './components/Standings.jsx';
import Scores from './components/Scores.jsx';
import TeamDetail from './components/TeamDetail.jsx';
import { fetchBranding } from './api/index.js';

const TABS = [
  { key: 'standings', label: 'Standings' },
  { key: 'scores',    label: 'Scores'    },
  { key: 'teams',     label: 'Teams'     },
];

function parseHash(hash) {
  const m = hash.match(/^#\/team\/(\d+)$/);
  if (m) return { view: 'team', teamId: parseInt(m[1], 10) };
  const tab = hash.replace(/^#\//, '') || 'standings';
  return { view: 'tab', tab: TABS.some(t => t.key === tab) ? tab : 'standings' };
}

export default function App() {
  const [nav, setNav]           = useState(() => parseHash(window.location.hash));
  const [menuOpen, setMenuOpen] = useState(false);
  const [branding, setBranding] = useState({ app_name: 'LeagueHaven', logo_url: null });

  useEffect(() => {
    fetchBranding()
      .then(data => setBranding({ app_name: data?.app_name || 'LeagueHaven', logo_url: data?.logo_url || null }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const cssValue = branding?.logo_url ? `url("${branding.logo_url}")` : 'none';
    document.documentElement.style.setProperty('--league-logo-watermark', cssValue);
  }, [branding?.logo_url]);

  // Sync nav with browser back/forward
  useEffect(() => {
    const onHashChange = () => setNav(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function navigateToTeam(teamId) {
    window.location.hash = `#/team/${teamId}`;
  }

  function navigateToTab(tab) {
    window.location.hash = `#/${tab}`;
    setMenuOpen(false);
  }

  const activeTab = nav.view === 'tab' ? nav.tab : null;

  return (
    <div className="min-h-screen bg-league-watermark text-gray-100">

      {/* Header */}
      <header className="bg-chrome-900 border-b border-gray-700/60 border-t-4 border-t-signal-600 sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 py-3 max-w-6xl mx-auto">

          {/* Logo + name */}
          <button
            onClick={() => navigateToTab('standings')}
            className="flex items-center gap-2.5 hover:opacity-85 transition-opacity"
            aria-label="Go to home"
          >
            {branding.logo_url
              ? <img src={branding.logo_url} alt="" aria-hidden="true" className="h-8 w-auto object-contain rounded" />
              : <span className="text-xl leading-none" aria-hidden="true">⚾</span>
            }
            <span className="font-display text-xl font-bold whitespace-nowrap tracking-wide text-white">
              {branding.app_name || 'LeagueHaven'}
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1" aria-label="Main navigation">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => navigateToTab(tab.key)}
                aria-current={activeTab === tab.key ? 'page' : undefined}
                className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
                  activeTab === tab.key
                    ? 'bg-action-700/40 text-action-300'
                    : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden relative w-7 h-5 flex flex-col justify-between"
            onClick={() => setMenuOpen(v => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <span className={`block h-0.5 w-full bg-gray-300 rounded transition-transform duration-300 origin-center ${menuOpen ? 'translate-y-[9px] rotate-45' : ''}`} />
            <span className={`block h-0.5 w-full bg-gray-300 rounded transition-transform duration-300 origin-center ${menuOpen ? '-translate-y-[9px] -rotate-45' : ''}`} />
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <nav className="sm:hidden flex flex-col border-t border-gray-700/60 px-4 pb-3 pt-2 gap-1 bg-chrome-900" aria-label="Mobile navigation">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => navigateToTab(tab.key)}
                aria-current={activeTab === tab.key ? 'page' : undefined}
                className={`text-left px-3 py-2 text-sm rounded-md transition-colors ${
                  activeTab === tab.key
                    ? 'bg-action-700/40 text-action-300 font-semibold'
                    : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* Content */}
      <main className="p-4 max-w-6xl mx-auto">
        {nav.view === 'team' ? (
          <TeamDetail
            teamId={nav.teamId}
            onNavigateToTeam={navigateToTeam}
            onBack={() => window.history.back()}
          />
        ) : (
          <>
            {nav.tab === 'standings' && <Standings onNavigateToTeam={navigateToTeam} />}
            {nav.tab === 'scores'    && <Scores    onNavigateToTeam={navigateToTeam} />}
            {nav.tab === 'teams'     && <Teams     onNavigateToTeam={navigateToTeam} />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12 py-6 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} Zionsville Valley Baseball League
      </footer>
    </div>
  );
}
