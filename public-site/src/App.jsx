import { Component, useEffect, useState, useMemo } from 'react';
import Home from './components/Home.jsx';
import Teams from './components/Teams.jsx';
import Standings from './components/Standings.jsx';
import Scores from './components/Scores.jsx';
import TeamDetail from './components/TeamDetail.jsx';
import GameDetail from './components/GameDetail.jsx';
import TravelMatrix from './components/TravelMatrix.jsx';
import Tournaments from './components/Tournaments.jsx';
import TournamentDetail from './components/TournamentDetail.jsx';
import FieldPrep from './components/FieldPrep.jsx';
import { fetchBranding, fetchTeams } from './api/index.js';

class SiteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'An unexpected error occurred.' };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#f87171' }}>
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1.25rem', fontWeight: 700 }}>Something went wrong</h2>
          <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>{this.state.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false, message: null }); }}
            style={{ marginTop: '1rem', padding: '0.4rem 1rem', borderRadius: '6px', background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const TABS = [
  { key: 'home',      label: 'Home'      },
  { key: 'standings', label: 'Standings' },
  { key: 'scores',    label: 'Scores'    },
  { key: 'teams',     label: 'Teams'     },
  { key: 'tournaments', label: 'Tournaments' },
  { key: 'travel',    label: 'Travel'    },
  { key: 'prep',      label: 'Field Prep' },
];

function toSlug(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function parsePath(pathname) {
  const path = pathname.replace(/^\/site/, '') || '/';
  const mg = path.match(/^\/game\/(\d+)$/);
  if (mg) return { view: 'game', gameId: parseInt(mg[1], 10) };
  const mt = path.match(/^\/tournament\/(\d+)$/);
  if (mt) return { view: 'tournament', tournamentId: parseInt(mt[1], 10) };
  const m = path.match(/^\/team\/(.+)$/);
  if (m) return { view: 'team', teamSlug: m[1] };
  const tab = (path.replace(/^\//, '').split('/')[0]) || 'home';
  return { view: 'tab', tab: TABS.some(t => t.key === tab) ? tab : 'home' };
}

export default function App() {
  const [nav, setNav]           = useState(() => parsePath(window.location.pathname));
  const [menuOpen, setMenuOpen] = useState(false);
  const [branding, setBranding] = useState({ app_name: 'LeagueHaven', logo_url: null, feature_officials: true, feature_tournaments: true });
  const [allTeams, setAllTeams] = useState([]);

  useEffect(() => {
    fetchBranding()
      .then(data => setBranding({
        app_name: data?.app_name || 'LeagueHaven',
        logo_url: data?.logo_url || null,
        feature_officials: data?.feature_officials !== false,
        feature_tournaments: data?.feature_tournaments !== false,
      }))
      .catch(() => {});
    fetchTeams().then(setAllTeams).catch(() => {});
  }, []);

  useEffect(() => {
    const cssValue = branding?.logo_url ? `url("${branding.logo_url}")` : 'none';
    document.documentElement.style.setProperty('--league-logo-watermark', cssValue);
  }, [branding?.logo_url]);

  // Sync nav with browser back/forward
  useEffect(() => {
    const onPopState = () => setNav(parsePath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Resolve slug → numeric teamId from cached teams list
  const resolvedTeamId = useMemo(() => {
    if (nav.view !== 'team') return null;
    if (nav.teamId) return nav.teamId; // already resolved (programmatic navigation)
    if (!nav.teamSlug || !allTeams.length) return null;
    return allTeams.find(t => toSlug(t.long_name || t.name) === nav.teamSlug)?.id ?? null;
  }, [nav, allTeams]);

  // Update page title for SEO
  useEffect(() => {
    const appName = branding.app_name || 'LeagueHaven';
    if (nav.view === 'team' && resolvedTeamId && allTeams.length) {
      const team = allTeams.find(t => t.id === resolvedTeamId);
      document.title = team ? `${team.long_name || team.name} — ${appName}` : appName;
    } else {
      document.title = appName;
    }
  }, [nav, resolvedTeamId, allTeams, branding.app_name]);

  function navigateToGame(gameId) {
    window.history.pushState({}, '', `/site/game/${gameId}`);
    setNav({ view: 'game', gameId });
  }

  function navigateToTeam(teamId) {
    const team = allTeams.find(t => t.id === teamId);
    const slug = team ? toSlug(team.long_name || team.name) : String(teamId);
    window.history.pushState({}, '', `/site/team/${slug}`);
    setNav({ view: 'team', teamSlug: slug, teamId });
  }

  function navigateToTournament(tournamentId) {
    window.history.pushState({}, '', `/site/tournament/${tournamentId}`);
    setNav({ view: 'tournament', tournamentId });
  }

  function navigateToTab(tab) {
    const path = tab === 'home' ? '/site/' : `/site/${tab}`;
    window.history.pushState({}, '', path);
    setNav({ view: 'tab', tab });
    setMenuOpen(false);
  }

  const activeTab = nav.view === 'tab' ? nav.tab : null;
  const visibleTabs = TABS.filter(t => t.key !== 'tournaments' || branding.feature_tournaments !== false);

  return (
    <div className="min-h-screen bg-league-watermark text-gray-100">

      {/* Header */}
      <header className="bg-chrome-900 border-b border-gray-700/60 border-t-4 border-t-signal-600 sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 py-3 max-w-6xl mx-auto">

          {/* Logo + name */}
          <button
            onClick={() => navigateToTab('home')}
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
            {visibleTabs.map(tab => (
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
            {visibleTabs.map(tab => (
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
        {nav.view === 'game' ? (
          <GameDetail
            gameId={nav.gameId}
            onBack={() => window.history.back()}
            onNavigateToTeam={navigateToTeam}
            officialsEnabled={branding.feature_officials !== false}
          />
        ) : nav.view === 'tournament' ? (
          branding.feature_tournaments !== false ? (
            <TournamentDetail
              tournamentId={nav.tournamentId}
              onBack={() => window.history.back()}
            />
          ) : (
            <div className="py-16 text-center text-gray-400">Tournaments are not enabled.</div>
          )
        ) : nav.view === 'team' ? (
          resolvedTeamId
            ? <TeamDetail
                teamId={resolvedTeamId}
                onNavigateToTeam={navigateToTeam}
                onNavigateToGame={navigateToGame}
                onBack={() => window.history.back()}
              />
            : <div className="py-16 text-center text-gray-400">Loading team…</div>
        ) : (
          <SiteErrorBoundary>
            {nav.tab === 'home'      && <Home      onNavigateToTeam={navigateToTeam} onNavigateToGame={navigateToGame} onNavigateToTab={navigateToTab} />}
            {nav.tab === 'standings' && <Standings onNavigateToTeam={navigateToTeam} />}
            {nav.tab === 'scores'    && <Scores    onNavigateToTeam={navigateToTeam} onNavigateToGame={navigateToGame} officialsEnabled={branding.feature_officials !== false} />}
            {nav.tab === 'teams'     && <Teams     onNavigateToTeam={navigateToTeam} />}
            {nav.tab === 'tournaments' && branding.feature_tournaments !== false && <Tournaments onNavigateToTournament={navigateToTournament} />}
            {nav.tab === 'travel'    && <TravelMatrix />}
            {nav.tab === 'prep'      && <FieldPrep  onNavigateToGame={navigateToGame} officialsEnabled={branding.feature_officials !== false} />}
          </SiteErrorBoundary>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12 py-6 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} {branding.app_name || 'LeagueHaven'}
      </footer>
    </div>
  );
}
