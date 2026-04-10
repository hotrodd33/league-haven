import { useState } from 'react';
import Teams from './components/Teams.jsx';
import Standings from './components/Standings.jsx';
import Scores from './components/Scores.jsx';

const TABS = [
  { key: 'standings', label: 'Standings' },
  { key: 'scores', label: 'Scores' },
  { key: 'teams', label: 'Teams' },
];

export default function App() {
  const [page, setPage] = useState('standings');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="bg-blue-800 text-white shadow-lg border-t-4 border-baseball-600">
        <div className="flex items-center justify-between px-4 py-3 max-w-6xl mx-auto">
          <h1 className="font-heading text-xl font-bold whitespace-nowrap tracking-wide">⚾ ZVBL</h1>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${page === tab.key ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                onClick={() => setPage(tab.key)}
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
          >
            <span className={`block h-0.5 w-full bg-white rounded transition-transform duration-300 origin-center ${menuOpen ? 'translate-y-[9px] rotate-45' : ''}`} />
            <span className={`block h-0.5 w-full bg-white rounded transition-transform duration-300 origin-center ${menuOpen ? '-translate-y-[9px] -rotate-45' : ''}`} />
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <nav className="sm:hidden flex flex-col border-t border-white/20 px-4 pb-3 pt-2 gap-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                className={`text-left px-3 py-2 text-sm rounded-md transition-colors ${page === tab.key ? 'bg-white/20 text-white font-semibold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                onClick={() => { setPage(tab.key); setMenuOpen(false); }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* Content */}
      <main className="p-4 max-w-6xl mx-auto">
        {page === 'standings' && <Standings />}
        {page === 'scores' && <Scores />}
        {page === 'teams' && <Teams />}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-12 py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Zionsville Valley Baseball League
      </footer>
    </div>
  );
}
