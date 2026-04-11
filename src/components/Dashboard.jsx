import { useState, useEffect, useCallback } from 'react';
import { cn } from '../lib/cn.js';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchTeams, fetchGames, fetchSeasons, fetchOrganizations } from '../api/index.js';
import { Card, CardHeader, CardBody, StatCard, Scoreboard, Button } from './ui/index.js';
import {
  UsersIcon, CalendarIcon, TrophyIcon, BuildingIcon,
  PlusIcon, ArrowUpTrayIcon, MegaphoneIcon, BellIcon,
  ClockIcon, ChartBarIcon, SparklesIcon, EyeIcon, MapPinIcon,
} from './ui/icons.jsx';

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatGameDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatGameTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function cityAbbr(city) {
  if (!city) return '';
  const words = city.trim().split(/\s+/);
  return words.length > 1 ? words.map(w => w[0]).join('') : city.substring(0, 3);
}

/* ═══════════════════════════════════════════════════════
   Dashboard
   ═══════════════════════════════════════════════════════ */

export default function Dashboard({ onNavigate, onOpenImport }) {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [games, setGames] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [t, g, s, o] = await Promise.all([
        fetchTeams().catch(() => []),
        fetchGames().catch(() => []),
        fetchSeasons().catch(() => []),
        fetchOrganizations().catch(() => []),
      ]);
      setTeams(t || []);
      setGames(g || []);
      setSeasons(s || []);
      setOrgs(o || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* Derived stats */
  const currentSeason = seasons.find(s => s.is_current) || seasons[0];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const gamesThisWeek = games.filter(g => g.game_date >= weekStartStr && g.game_date <= weekEndStr);
  const completedGames = games.filter(g => g.status === 'final');
  const upcomingGames = games
    .filter(g => g.game_date >= todayStr && g.status !== 'final' && g.status !== 'cancelled')
    .sort((a, b) => (a.game_date + (a.game_time || '')) > (b.game_date + (b.game_time || '')) ? 1 : -1)
    .slice(0, 5);

  const recentResults = games
    .filter(g => g.status === 'final')
    .sort((a, b) => b.game_date > a.game_date ? 1 : -1)
    .slice(0, 5);

  const displayName = user?.name || user?.username || 'Coach';
  const firstName = displayName.split(' ')[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3 animate-pulse-soft">
          <div className="text-4xl">⚾</div>
          <p className="text-sm text-gray-400 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Hero Welcome ── */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-900 via-blue-800 to-field-800 text-white p-6 sm:p-8 shadow-elevated">
        {/* Decorative diamond pattern */}
        <div className="absolute inset-0 bg-diamond-pattern opacity-20 pointer-events-none" aria-hidden="true" />
        <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-field-600/20 rounded-full blur-3xl" aria-hidden="true" />
        <div className="absolute -left-8 -top-8 w-32 h-32 bg-dirt-600/15 rounded-full blur-2xl" aria-hidden="true" />

        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-wide">
                {greeting()}, {firstName}
              </h2>
              <p className="mt-1 text-white/70 text-sm">
                {currentSeason
                  ? `${currentSeason.name} Season`
                  : 'Welcome to ZVBL Roster Manager'
                }
                {' · '}{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="primary"
                size="sm"
                icon={<PlusIcon className="w-4 h-4" />}
                onClick={() => onNavigate?.('schedule')}
                className="bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20"
              >
                New Game
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<ArrowUpTrayIcon className="w-4 h-4" />}
                onClick={() => onOpenImport?.()}
                className="bg-field-600/80 hover:bg-field-600 backdrop-blur-sm border border-white/10"
              >
                Import from GameChanger
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stat Cards Grid ── */}
      <section aria-label="League statistics">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Teams"
            value={teams.length}
            icon={<UsersIcon className="w-5 h-5" />}
            accentColor="field"
            trendLabel={teams.length > 0 ? `${orgs.length} org${orgs.length !== 1 ? 's' : ''}` : undefined}
            trend={1}
          />
          <StatCard
            label="Games This Week"
            value={gamesThisWeek.length}
            icon={<CalendarIcon className="w-5 h-5" />}
            accentColor="blue"
          />
          <StatCard
            label="Games Played"
            value={completedGames.length}
            icon={<TrophyIcon className="w-5 h-5" />}
            accentColor="dirt"
            trendLabel={games.length > 0 ? `of ${games.length} total` : undefined}
            trend={1}
          />
          <StatCard
            label="Organizations"
            value={orgs.length}
            icon={<BuildingIcon className="w-5 h-5" />}
            accentColor="baseball"
          />
        </div>
      </section>

      {/* ── Two-Column Layout: Games + Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Upcoming Games — 2/3 width */}
        <section className="lg:col-span-2 space-y-4" aria-label="Upcoming games">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-lg font-bold text-gray-900 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-field-600" />
              Upcoming Games
            </h3>
            <button
              onClick={() => onNavigate?.('schedule')}
              className="text-xs font-semibold text-field-700 hover:text-field-800 transition-colors flex items-center gap-1"
            >
              View All <span aria-hidden="true">→</span>
            </button>
          </div>

          {upcomingGames.length === 0 ? (
            <EmptyState
              icon="📅"
              title="No upcoming games"
              description="Games will appear here once they're scheduled."
              action={
                <Button size="sm" onClick={() => onNavigate?.('schedule')}>
                  Schedule a Game
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {upcomingGames.map((g) => (
                <Scoreboard
                  key={g.id}
                  status={g.status === 'in_progress' ? 'in_progress' : 'scheduled'}
                  gameTime={
                    formatGameDate(g.game_date) +
                    (g.game_time ? ` · ${formatGameTime(g.game_time)}` : '')
                  }
                  homeTeam={{
                    name: g.home_team_name || 'TBD',
                    logo: g.home_logo_url,
                    ageGroup: g.home_age_group,
                    level: g.home_level,
                    cityAbbr: cityAbbr(g.home_team_city),
                    primaryColor: g.home_primary_color,
                    secondaryColor: g.home_secondary_color,
                  }}
                  awayTeam={{
                    name: g.away_team_name || 'TBD',
                    logo: g.away_logo_url,
                    ageGroup: g.away_age_group,
                    level: g.away_level,
                    cityAbbr: cityAbbr(g.away_team_city),
                    primaryColor: g.away_primary_color,
                    secondaryColor: g.away_secondary_color,
                  }}
                  homeScore={g.home_score}
                  awayScore={g.away_score}
                  location={g.location_name}
                />
              ))}
            </div>
          )}
        </section>

        {/* Sidebar: Quick Actions + Recent Results — 1/3 width */}
        <aside className="space-y-6">

          {/* Quick Actions */}
          <Card variant="field">
            <CardHeader>
              <h3 className="font-heading text-base font-bold text-gray-900 flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-field-600" />
                Quick Actions
              </h3>
            </CardHeader>
            <CardBody className="space-y-2">
              <QuickAction
                icon={<PlusIcon className="w-4 h-4" />}
                label="Schedule New Game"
                onClick={() => onNavigate?.('schedule')}
                color="field"
              />
              <QuickAction
                icon={<UsersIcon className="w-4 h-4" />}
                label="Manage Rosters"
                onClick={() => onNavigate?.('rosters')}
                color="blue"
              />
              <QuickAction
                icon={<ArrowUpTrayIcon className="w-4 h-4" />}
                label="Import from GameChanger"
                onClick={() => onOpenImport?.()}
                color="dirt"
              />
              <QuickAction
                icon={<TrophyIcon className="w-4 h-4" />}
                label="View Standings"
                onClick={() => onNavigate?.('standings')}
                color="baseball"
              />
            </CardBody>
          </Card>

          {/* Season Overview */}
          {currentSeason && (
            <Card variant="bordered">
              <CardBody className="space-y-3">
                <div className="flex items-center gap-2">
                  <ChartBarIcon className="w-4 h-4 text-field-600 shrink-0" />
                  <h4 className="text-sm font-bold text-gray-900">Season Overview</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Total games" value={games.length} />
                  <MiniStat label="Completed" value={completedGames.length} />
                  <MiniStat label="Teams" value={teams.length} />
                  <MiniStat label="This week" value={gamesThisWeek.length} />
                </div>
                {games.length > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>Season progress</span>
                      <span className="font-semibold text-gray-700">
                        {games.length > 0 ? Math.round((completedGames.length / games.length) * 100) : 0}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-field-500 to-field-600 rounded-full transition-all duration-500"
                        style={{ width: `${games.length > 0 ? (completedGames.length / games.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </aside>
      </div>

      {/* ── Recent Results ── */}
      {recentResults.length > 0 && (
        <section aria-label="Recent results">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-lg font-bold text-gray-900 flex items-center gap-2">
              <TrophyIcon className="w-5 h-5 text-dirt-600" />
              Recent Results
            </h3>
            <button
              onClick={() => onNavigate?.('standings')}
              className="text-xs font-semibold text-field-700 hover:text-field-800 transition-colors flex items-center gap-1"
            >
              Standings <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentResults.map((g) => (
              <Scoreboard
                key={g.id}
                status="final"
                gameTime={formatGameDate(g.game_date)}
                homeTeam={{
                  name: g.home_team_name || 'TBD',
                  logo: g.home_logo_url,
                  ageGroup: g.home_age_group,
                  level: g.home_level,
                  cityAbbr: cityAbbr(g.home_team_city),
                  primaryColor: g.home_primary_color,
                  secondaryColor: g.home_secondary_color,
                }}
                awayTeam={{
                  name: g.away_team_name || 'TBD',
                  logo: g.away_logo_url,
                  ageGroup: g.away_age_group,
                  level: g.away_level,
                  cityAbbr: cityAbbr(g.away_team_city),
                  primaryColor: g.away_primary_color,
                  secondaryColor: g.away_secondary_color,
                }}
                homeScore={g.home_score}
                awayScore={g.away_score}
                location={g.location_name}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Data Import Card ── */}
      <section aria-label="Data import">
        <Card variant="dirt" className="overflow-hidden">
          <div className="flex flex-col sm:flex-row items-center gap-6 p-6 sm:p-8">
            <div className="shrink-0 w-16 h-16 rounded-2xl bg-dirt-100 flex items-center justify-center">
              <ArrowUpTrayIcon className="w-8 h-8 text-dirt-700" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="font-heading text-lg font-bold text-gray-900">
                Import from GameChanger
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Bring your stats, rosters, schedules, and box scores over from GameChanger in minutes.
                The easiest migration in youth sports.
              </p>
            </div>
            <Button
              variant="dirt"
              size="md"
              icon={<ArrowUpTrayIcon className="w-4 h-4" />}
              onClick={() => onOpenImport?.()}
            >
              Start Import
            </Button>
          </div>
        </Card>
      </section>

      {/* ── Footer ── */}
      <footer className="pt-4 pb-2 border-t border-gray-200/50">
        <p className="text-center text-xs text-gray-400">
          ZVBL Roster Manager · Built by DigiSeeIt Design · {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Sub-Components
   ═══════════════════════════════════════════════════════ */

function QuickAction({ icon, label, onClick, color = 'field' }) {
  const colors = {
    field:    'bg-field-50 text-field-700 hover:bg-field-100',
    blue:     'bg-blue-50 text-blue-700 hover:bg-blue-100',
    dirt:     'bg-dirt-50 text-dirt-700 hover:bg-dirt-100',
    baseball: 'bg-baseball-50 text-baseball-700 hover:bg-baseball-100',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        colors[color],
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
      <span className="ml-auto text-gray-300" aria-hidden="true">→</span>
    </button>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="text-center p-2 bg-gray-50 rounded-lg">
      <p className="text-xl font-heading font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mt-0.5">{label}</p>
    </div>
  );
}

function EmptyState({ icon, title, description, action }) {
  return (
    <Card variant="bordered" className="bg-stitch-pattern">
      <CardBody className="py-12 text-center">
        {icon && <div className="text-4xl mb-3 opacity-40">{icon}</div>}
        <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
        {description && <p className="mt-1 text-xs text-gray-400 max-w-xs mx-auto">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
      </CardBody>
    </Card>
  );
}
