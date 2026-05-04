import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '../lib/queryConfig.js';
import { cn } from '../lib/cn.js';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchDashboardSummary, fetchAllPitchRest, fetchDashboardActivity, fetchAnnouncements, markAnnouncementRead, fetchWeather, fetchWeatherForecast } from '../api/index.js';
import { Card, CardHeader, CardBody, StatCard, Scoreboard, Button } from './ui/index.js';
import {
  UsersIcon, CalendarIcon, TrophyIcon, BuildingIcon,
  PlusIcon, MegaphoneIcon, BellIcon, ClipboardIcon,
  ClockIcon, ChartBarIcon, SparklesIcon, EyeIcon, MapPinIcon,
  DatabaseIcon, UserIcon, BaseballIcon, ArrowDownTrayIcon,
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

function timeAgo(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const ACTIVITY_ICON_COMPONENTS = {
  player:       <UserIcon className="w-3.5 h-3.5" />,
  game:         <BaseballIcon className="w-3.5 h-3.5" />,
  team:         <UsersIcon className="w-3.5 h-3.5" />,
  registration: <ClipboardIcon className="w-3.5 h-3.5" />,
  import:       <ArrowDownTrayIcon className="w-3.5 h-3.5" />,
};

function getWeatherForGame(game, weatherMap) {
  if (!game.location_lat || !game.location_lon) return null;
  // Try game-specific key first (for forecasts), then location-only key (for current weather)
  const gameKey = `${game.id}`;
  const locKey = `${parseFloat(game.location_lat).toFixed(2)},${parseFloat(game.location_lon).toFixed(2)}`;
  return weatherMap[gameKey] || weatherMap[locKey] || null;
}

const PRIORITY_STYLES = {
  urgent: 'border-signal-500/50 bg-red-950/30',
  high: 'border-yellow-500/40 bg-yellow-950/20',
  normal: 'border-chrome-500/30 bg-chrome-950/15',
  low: 'border-gray-600/30 bg-gray-900/20',
};

const PRIORITY_BADGES = {
  urgent: 'bg-signal-500/20 text-signal-300',
  high: 'bg-yellow-500/20 text-yellow-300',
  normal: '',
  low: '',
};

/* ═══════════════════════════════════════════════════════
   Dashboard
   ═══════════════════════════════════════════════════════ */

export default function Dashboard({ onNavigate, onViewPlayer, onNavigateToGame }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [gameWeather, setGameWeather] = useState({});

  const { data: summary = null,  isPending: summaryPending  } = useQuery({ queryKey: ['dashboard-summary'],   queryFn: fetchDashboardSummary,  staleTime: STALE.ONE_MIN });
  const { data: pitchRest = {}                               } = useQuery({ queryKey: ['pitch-rest', 'all'], queryFn: fetchAllPitchRest,       staleTime: STALE.THIRTY_SEC });
  const { data: activity = []                                } = useQuery({ queryKey: ['dashboard-activity'],queryFn: fetchDashboardActivity,  staleTime: STALE.THIRTY_SEC });
  const { data: announcements = []                           } = useQuery({ queryKey: ['announcements'],     queryFn: fetchAnnouncements,      staleTime: STALE.TWO_MIN });

  const loading = summaryPending;

  // Fetch weather for today's games (current) and upcoming games (forecast)
  const weatherFetchedRef = useRef(new Set());

  useEffect(() => {
    const allTodaysGames = summary?.todaysGames || [];
    const allUpcomingGames = summary?.upcomingGames || [];
    if (!allTodaysGames.length && !allUpcomingGames.length) return;

    // Current weather for today's games (deduplicated by location, skip already-fetched)
    const todaysWithLoc = allTodaysGames.filter(g =>
      g.location_lat && g.location_lon &&
      !weatherFetchedRef.current.has(`loc:${parseFloat(g.location_lat).toFixed(2)},${parseFloat(g.location_lon).toFixed(2)}`)
    );
    const seenLocs = new Set();
    const uniqueToday = [];
    for (const g of todaysWithLoc) {
      const key = `${parseFloat(g.location_lat).toFixed(2)},${parseFloat(g.location_lon).toFixed(2)}`;
      if (!seenLocs.has(key)) { seenLocs.add(key); uniqueToday.push(g); }
    }

    // Forecast weather for upcoming games (within 16 days, skip already-fetched)
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 16);
    const maxDateStr = maxDate.toISOString().split('T')[0];
    const upcomingWithLoc = allUpcomingGames.filter(g =>
      g.game_date <= maxDateStr && g.location_lat && g.location_lon &&
      !weatherFetchedRef.current.has(String(g.id))
    );

    if (!uniqueToday.length && !upcomingWithLoc.length) return;

    for (const g of uniqueToday) {
      weatherFetchedRef.current.add(`loc:${parseFloat(g.location_lat).toFixed(2)},${parseFloat(g.location_lon).toFixed(2)}`);
    }
    for (const g of upcomingWithLoc) weatherFetchedRef.current.add(String(g.id));

    const currentPromises = uniqueToday.map(g => {
      // Use forecast for game hour if time is set, otherwise current weather
      const fetcher = g.game_time
        ? fetchWeatherForecast(g.location_lat, g.location_lon, g.game_date, g.game_time)
        : fetchWeather(g.location_lat, g.location_lon);
      return fetcher
        .then(w => ({ key: `${parseFloat(g.location_lat).toFixed(2)},${parseFloat(g.location_lon).toFixed(2)}`, weather: w }))
        .catch(() => null);
    });

    const forecastPromises = upcomingWithLoc.map(g =>
      fetchWeatherForecast(g.location_lat, g.location_lon, g.game_date, g.game_time || null)
        .then(w => ({ key: `${g.id}`, weather: w }))
        .catch(() => null)
    );

    Promise.all([...currentPromises, ...forecastPromises]).then(results => {
      const map = {};
      for (const r of results) {
        if (r && r.weather && !r.weather.unavailable) map[r.key] = r.weather;
      }
      setGameWeather(prev => ({ ...prev, ...map }));
    });
  }, [summary]);

  /* Derived data from summary */
  const todaysGames = summary?.todaysGames || [];
  const upcomingGames = summary?.upcomingGames || [];
  const recentResults = summary?.recentResults || [];
  const unscoredGames = summary?.unscoredGames || [];
  const counts = summary?.counts || { gamesThisWeek: 0, completedGames: 0, totalGames: 0, teams: 0, orgs: 0 };
  const currentSeason = summary?.currentSeason || null;
  const rosterAlerts = summary?.rosterAlerts || [];

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  /* Role-based UI decisions (scoping is done server-side) */
  const role = user?.role;
  const isAdmin = role === 'super_admin' || role === 'org_admin';

  /* Players currently on rest — name and teams come from extended pitch-rest endpoint */
  const playersOnRest = Object.entries(pitchRest)
    .filter(([, r]) => !r.eligible_today && r.name)
    .map(([pid, r]) => ({ ...r, id: pid }))
    .sort((a, b) => (a.available_date || '').localeCompare(b.available_date || ''));

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
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-chrome-800 via-chrome-700 to-action-700 text-white p-6 sm:p-8 shadow-elevated border border-chrome-600/30">
        {/* Decorative diamond pattern */}
        <div className="absolute inset-0 bg-diamond-pattern opacity-20 pointer-events-none" aria-hidden="true" />
        <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-action-600/20 rounded-full blur-3xl" aria-hidden="true" />
        <div className="absolute -left-8 -top-8 w-32 h-32 bg-accent-600/15 rounded-full blur-2xl" aria-hidden="true" />

        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-wide">
                {greeting()}, {firstName}
              </h2>
              <p className="mt-1 text-white/70 text-sm">
                {currentSeason
                  ? `${currentSeason.name} Season`
                  : 'Welcome to LeagueHaven Sports Management'
                }
                {' · '}{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {role !== 'umpire' && role !== 'accountant' && (
              <Button
                variant="primary"
                size="sm"
                icon={<PlusIcon className="w-4 h-4" />}
                onClick={() => onNavigate?.('schedule')}
                className="bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20"
              >
                New Game
              </Button>
              )}
              {isAdmin && (
              <Button
                variant="primary"
                size="sm"
                icon={<DatabaseIcon className="w-4 h-4" />}
                onClick={() => onNavigate?.('data')}
                className="bg-action-600/80 hover:bg-action-600 backdrop-blur-sm border border-white/10"
              >
                Data Manager
              </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Announcements ── */}
      {(announcements.length > 0 || isAdmin) && (
        <section aria-label="Announcements" className="space-y-3">
          {isAdmin && (
            <div className="flex justify-end">
              <button
                onClick={() => onNavigate('announcements')}
                className="text-xs text-chrome-400 hover:text-chrome-300 font-semibold transition-colors"
              >
                Manage Announcements →
              </button>
            </div>
          )}
          {announcements.map(a => (
            <div key={a.id} className={cn('rounded-xl border px-5 py-4', PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.normal)}>
              <div className="flex items-start gap-3">
                <MegaphoneIcon className="w-5 h-5 text-chrome-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-gray-100">{a.title}</h4>
                    {(a.priority === 'urgent' || a.priority === 'high') && (
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', PRIORITY_BADGES[a.priority])}>
                        {a.priority}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">{a.body}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[10px] text-gray-500">
                      {a.author_name && `Posted by ${a.author_name} · `}
                      {timeAgo(a.created_at)}
                    </p>
                    {!a.read && (
                      <button
                        onClick={async () => {
                          queryClient.setQueryData(['announcements'], (old = []) => old.filter(x => x.id !== a.id));
                          try {
                            await markAnnouncementRead(a.id);
                          } catch {
                            queryClient.invalidateQueries({ queryKey: ['announcements'] });
                          }
                        }}
                        className="text-[10px] text-chrome-400 hover:text-chrome-300 font-semibold transition-colors cursor-pointer"
                      >
                        Dismiss ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Stat Cards Grid ── */}
      <section aria-label="League statistics">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={isAdmin ? "Total Teams" : "My Teams"}
            value={counts.teams}
            icon={<UsersIcon className="w-5 h-5" />}
            accentColor="field"
            trendLabel={isAdmin && counts.orgs > 0 ? `${counts.orgs} org${counts.orgs !== 1 ? 's' : ''}` : undefined}
            trend={1}
          />
          <StatCard
            label="Games This Week"
            value={counts.gamesThisWeek}
            icon={<CalendarIcon className="w-5 h-5" />}
            accentColor="blue"
          />
          <StatCard
            label="Games Played"
            value={counts.completedGames}
            icon={<TrophyIcon className="w-5 h-5" />}
            accentColor="dirt"
            trendLabel={counts.totalGames > 0 ? `of ${counts.totalGames} total` : undefined}
            trend={1}
          />
          <StatCard
            label="Organizations"
            value={counts.orgs}
            icon={<BuildingIcon className="w-5 h-5" />}
            accentColor="baseball"
          />
        </div>
      </section>

      {/* ── Today's Games ── */}
      {todaysGames.length > 0 && (
        <section aria-label="Today's games">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-bold text-gray-100 flex items-center gap-2">
              <ClockIcon className="w-5 h-5 text-signal-500" />
              Today's Games
              <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-signal-600/30 text-signal-300">
                {todaysGames.length}
              </span>
            </h3>
            <button
              onClick={() => onNavigate?.('schedule')}
              className="text-xs font-semibold text-action-300 hover:text-action-200 transition-colors flex items-center gap-1"
            >
              Full Schedule <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {todaysGames.map((g) => (
              <div key={g.id} className="cursor-pointer" onClick={() => onNavigateToGame?.(g.id)}>
              <Scoreboard
                status={g.status === 'in_progress' ? 'in_progress' : g.status === 'final' ? 'final' : 'scheduled'}
                gameTime={
                  g.game_time ? formatGameTime(g.game_time) : 'Time TBD'
                }
                homeTeam={{
                  name: g.home_team_name || 'TBD',
                  logo: g.home_logo,
                  ageGroup: g.home_age_group,
                  level: g.home_level,
                  cityAbbr: cityAbbr(g.home_team_city),
                  primaryColor: g.home_primary_color,
                  secondaryColor: g.home_secondary_color,
                }}
                awayTeam={{
                  name: g.away_team_name || 'TBD',
                  logo: g.away_logo,
                  ageGroup: g.away_age_group,
                  level: g.away_level,
                  cityAbbr: cityAbbr(g.away_team_city),
                  primaryColor: g.away_primary_color,
                  secondaryColor: g.away_secondary_color,
                }}
                homeScore={g.home_score}
                awayScore={g.away_score}
                location={g.location_name}
                weather={getWeatherForGame(g, gameWeather)}
              />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Weather Alerts ── */}
      {(() => {
        const weatherAlerts = [...todaysGames, ...upcomingGames]
          .filter(g => {
            const w = getWeatherForGame(g, gameWeather);
            return w?.playability && (w.playability.rating === 'poor' || w.playability.rating === 'unplayable');
          })
          .map(g => ({ game: g, weather: getWeatherForGame(g, gameWeather) }));
        if (!weatherAlerts.length) return null;
        return (
          <section aria-label="Weather alerts">
            <Card variant="bordered" className="border-orange-500/30 bg-orange-950/10">
              <CardHeader>
                <h3 className="font-display text-base font-bold text-gray-100 flex items-center gap-2">
                  ⚠️ Weather Alerts
                  <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-orange-500/20 text-orange-300">
                    {weatherAlerts.length}
                  </span>
                </h3>
              </CardHeader>
              <CardBody className="space-y-2">
                {weatherAlerts.map(({ game: g, weather: w }) => (
                  <div
                    key={g.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg border',
                      w.playability.rating === 'unplayable'
                        ? 'bg-red-950/20 border-signal-500/30'
                        : 'bg-orange-950/15 border-orange-500/20',
                    )}
                  >
                    <span className="text-xl shrink-0">{w.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-100 truncate">
                        {g.away_team_name || 'TBD'} @ {g.home_team_name || 'TBD'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {g.game_date === todayStr ? 'Today' : formatGameDate(g.game_date)}
                        {g.game_time ? ` · ${formatGameTime(g.game_time)}` : ''}
                        {g.location_name ? ` · ${g.location_name}` : ''}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {w.playability.reasons.join(' · ')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={cn(
                        'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                        w.playability.rating === 'unplayable' ? 'bg-signal-900/40 text-signal-300' : 'bg-orange-900/40 text-orange-300',
                      )}>
                        {w.playability.rating}
                      </span>
                      {w.precipitationProbability != null && (
                        <p className="text-xs text-gray-400 mt-1">🌧️ {w.precipitationProbability}%</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          </section>
        );
      })()}

      {/* ── Pitch Count Warnings ── */}
      {playersOnRest.length > 0 && (
        <section aria-label="Pitch count warnings">
          <Card variant="bordered" className="border-signal-500/30 bg-red-950/10">
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <h3 className="font-display text-base font-bold text-gray-100 flex items-center gap-2">
                  <BellIcon className="w-5 h-5 text-signal-400" />
                  Pitch Rest Alerts
                  <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-signal-500/20 text-signal-300">
                    {playersOnRest.length}
                  </span>
                </h3>
                <button
                  onClick={() => onNavigate?.('players')}
                  className="text-xs font-semibold text-action-300 hover:text-action-200 transition-colors flex items-center gap-1"
                >
                  All Players <span aria-hidden="true">→</span>
                </button>
              </div>
            </CardHeader>
            <CardBody>
              <div className="divide-y divide-gray-700/50">
                {playersOnRest.slice(0, 8).map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-200 truncate block">{p.name}</span>
                      {p.teams?.length > 0 && (
                        <span className="text-xs text-gray-400">{p.teams.map(t => t.team_name).join(', ')}</span>
                      )}
                    </div>
                    <span className="lh-badge lh-badge-danger shrink-0 ml-3">
                      Avail: {new Date(p.available_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
                {playersOnRest.length > 8 && (
                  <p className="pt-2 text-xs text-gray-400 text-center">
                    +{playersOnRest.length - 8} more players on rest
                  </p>
                )}
              </div>
            </CardBody>
          </Card>
        </section>
      )}

      {/* ── Unscored Games ── */}
      {unscoredGames.length > 0 && (
        <section aria-label="Unscored games">
          <Card variant="bordered" className="border-accent-500/30 bg-accent-950/10">
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <h3 className="font-display text-base font-bold text-gray-100 flex items-center gap-2">
                  <ClipboardIcon className="w-5 h-5 text-accent-400" />
                  Scores Needed
                  <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-accent-500/20 text-accent-300">
                    {unscoredGames.length}
                  </span>
                </h3>
                <button
                  onClick={() => onNavigate?.('schedule')}
                  className="text-xs font-semibold text-action-300 hover:text-action-200 transition-colors flex items-center gap-1"
                >
                  Schedule <span aria-hidden="true">→</span>
                </button>
              </div>
            </CardHeader>
            <CardBody>
              <div className="divide-y divide-gray-700/50">
                {unscoredGames.slice(0, 6).map((g) => (
                  <div key={g.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0 gap-3 cursor-pointer hover:bg-gray-700/30 rounded px-1 -mx-1" onClick={() => onNavigateToGame?.(g.id)}>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-gray-200 block truncate">
                        {g.away_team_name || 'TBD'} @ {g.home_team_name || 'TBD'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatGameDate(g.game_date)}
                        {g.location_name ? ` · ${g.location_name}` : ''}
                      </span>
                    </div>
                    <span className="lh-badge lh-badge-warn shrink-0">
                      No score
                    </span>
                  </div>
                ))}
                {unscoredGames.length > 6 && (
                  <p className="pt-2 text-xs text-gray-400 text-center">
                    +{unscoredGames.length - 6} more games need scores
                  </p>
                )}
              </div>
            </CardBody>
          </Card>
        </section>
      )}

      {/* ── Two-Column Layout: Games + Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Upcoming Games — 2/3 width */}
        <section className="lg:col-span-2 space-y-4" aria-label="Upcoming games">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-gray-100 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-action-600" />
              Upcoming Games
            </h3>
            <button
              onClick={() => onNavigate?.('schedule')}
              className="text-xs font-semibold text-action-300 hover:text-action-200 transition-colors flex items-center gap-1"
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
                <div key={g.id} className="cursor-pointer" onClick={() => onNavigateToGame?.(g.id)}>
                <Scoreboard
                  status={g.status === 'in_progress' ? 'in_progress' : 'scheduled'}
                  gameTime={
                    formatGameDate(g.game_date) +
                    (g.game_time ? ` · ${formatGameTime(g.game_time)}` : '')
                  }
                  homeTeam={{
                    name: g.home_team_name || 'TBD',
                    logo: g.home_logo,
                    ageGroup: g.home_age_group,
                    level: g.home_level,
                    cityAbbr: cityAbbr(g.home_team_city),
                    primaryColor: g.home_primary_color,
                    secondaryColor: g.home_secondary_color,
                  }}
                  awayTeam={{
                    name: g.away_team_name || 'TBD',
                    logo: g.away_logo,
                    ageGroup: g.away_age_group,
                    level: g.away_level,
                    cityAbbr: cityAbbr(g.away_team_city),
                    primaryColor: g.away_primary_color,
                    secondaryColor: g.away_secondary_color,
                  }}
                  homeScore={g.home_score}
                  awayScore={g.away_score}
                  location={g.location_name}
                  weather={getWeatherForGame(g, gameWeather)}
                />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sidebar: Quick Actions + Recent Results — 1/3 width */}
        <aside className="space-y-6">

          {/* Quick Actions */}
          <Card variant="field">
            <CardHeader>
              <h3 className="font-display text-base font-bold text-gray-100 flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-action-600" />
                Quick Actions
              </h3>
            </CardHeader>
            <CardBody className="space-y-2">
              {(role === 'score_reporter') && (
                <QuickAction
                  icon={<ClipboardIcon className="w-4 h-4" />}
                  label="Enter Game Scores"
                  onClick={() => onNavigate?.('schedule')}
                  color="dirt"
                />
              )}
              {role !== 'umpire' && role !== 'accountant' && (
                <QuickAction
                  icon={<PlusIcon className="w-4 h-4" />}
                  label="Schedule New Game"
                  onClick={() => onNavigate?.('schedule')}
                  color="field"
                />
              )}
              {role !== 'score_reporter' && role !== 'umpire' && (
                <QuickAction
                  icon={<UsersIcon className="w-4 h-4" />}
                  label="Manage Teams"
                  onClick={() => onNavigate?.('rosters')}
                  color="blue"
                />
              )}
              {isAdmin && (
                <QuickAction
                  icon={<DatabaseIcon className="w-4 h-4" />}
                  label="Data Manager"
                  onClick={() => onNavigate?.('data')}
                  color="dirt"
                />
              )}
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
                  <ChartBarIcon className="w-4 h-4 text-action-600 shrink-0" />
                  <h4 className="text-sm font-bold text-gray-100">Season Overview</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Total games" value={counts.totalGames} />
                  <MiniStat label="Completed" value={counts.completedGames} />
                  <MiniStat label="Teams" value={counts.teams} />
                  <MiniStat label="This week" value={counts.gamesThisWeek} />
                </div>
                {counts.totalGames > 0 && (
                  <div className="pt-2 border-t border-gray-700">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>Season progress</span>
                      <span className="font-semibold text-gray-300">
                        {Math.round((counts.completedGames / counts.totalGames) * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-action-500 to-action-600 rounded-full transition-all duration-500"
                        style={{ width: `${(counts.completedGames / counts.totalGames) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </aside>
      </div>

      {/* ── Roster Alerts + Recent Activity — Side by Side ── */}
      {(rosterAlerts.length > 0 || activity.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Roster Alerts */}
          {rosterAlerts.length > 0 && (
            <Card variant="bordered" className="border-signal-500/30 bg-signal-950/10">
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <h3 className="font-display text-base font-bold text-gray-100 flex items-center gap-2">
                    <UsersIcon className="w-5 h-5 text-signal-400" />
                    Roster Alerts
                    <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-signal-500/20 text-signal-300">
                      {rosterAlerts.length}
                    </span>
                  </h3>
                  <button
                    onClick={() => onNavigate?.('players')}
                    className="text-xs font-semibold text-action-300 hover:text-action-200 transition-colors flex items-center gap-1"
                  >
                    All Players <span aria-hidden="true">→</span>
                  </button>
                </div>
              </CardHeader>
              <CardBody>
                <div className="divide-y divide-gray-700/50">
                  {rosterAlerts.slice(0, 8).map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0 gap-3">
                      <div className="min-w-0">
                        <button
                          onClick={() => onViewPlayer?.(p.id)}
                          className="text-sm font-medium text-gray-200 hover:text-chrome-300 transition-colors block truncate text-left"
                        >
                          {p.name}
                        </button>
                        {p.teams?.length > 0 && (
                          <span className="text-xs text-gray-400">{p.teams.map(t => t.team_name).join(', ')}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 shrink-0 ml-3 justify-end">
                        {p.issues.map((issue, i) => (
                          <span key={i} className="lh-badge lh-badge-danger">
                            {issue}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {rosterAlerts.length > 8 && (
                    <p className="pt-2 text-xs text-gray-400 text-center">
                      +{rosterAlerts.length - 8} more players with missing info
                    </p>
                  )}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Recent Activity */}
          {activity.length > 0 && (
            <Card variant="bordered">
              <CardHeader>
                <h3 className="font-display text-base font-bold text-gray-100 flex items-center gap-2">
                  <ClockIcon className="w-4 h-4 text-action-600" />
                  Recent Activity
                </h3>
              </CardHeader>
              <CardBody className="space-y-0 divide-y divide-gray-700/50">
                {activity.slice(0, 8).map((item, i) => {
                  const isGameLink = item.type === 'game_updated' && item.entity_id;
                  const isPlayerLink = item.type === 'player_added' && item.entity_id;
                  const icon = ACTIVITY_ICON_COMPONENTS[item.icon] || <ClipboardIcon className="w-3.5 h-3.5" />;
                  const content = (
                    <>
                      <span className="text-gray-400 shrink-0 mt-0.5">{icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-300 leading-snug truncate">{item.message}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{timeAgo(item.timestamp)}</p>
                      </div>
                    </>
                  );
                  if (isGameLink) {
                    return (
                      <button key={i} onClick={() => onNavigateToGame?.(item.entity_id)}
                        className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0 w-full text-left hover:bg-gray-700/30 rounded px-1 -mx-1 transition-colors">
                        {content}
                      </button>
                    );
                  }
                  if (isPlayerLink) {
                    return (
                      <button key={i} onClick={() => onViewPlayer?.(item.entity_id)}
                        className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0 w-full text-left hover:bg-gray-700/30 rounded px-1 -mx-1 transition-colors">
                        {content}
                      </button>
                    );
                  }
                  return (
                    <div key={i} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                      {content}
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* ── Recent Results ── */}
      {recentResults.length > 0 && (
        <section aria-label="Recent results">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-bold text-gray-100 flex items-center gap-2">
              <TrophyIcon className="w-5 h-5 text-accent-600" />
              Recent Results
            </h3>
            <button
              onClick={() => onNavigate?.('standings')}
              className="text-xs font-semibold text-action-300 hover:text-action-200 transition-colors flex items-center gap-1"
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
                  logo: g.home_logo,
                  ageGroup: g.home_age_group,
                  level: g.home_level,
                  cityAbbr: cityAbbr(g.home_team_city),
                  primaryColor: g.home_primary_color,
                  secondaryColor: g.home_secondary_color,
                }}
                awayTeam={{
                  name: g.away_team_name || 'TBD',
                  logo: g.away_logo,
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

      {/* ── Data Manager Card ── */}
      {isAdmin && (
      <section aria-label="Data management">
        <Card variant="dirt" className="overflow-hidden">
          <div className="flex flex-col sm:flex-row items-center gap-6 p-6 sm:p-8">
            <div className="shrink-0 w-16 h-16 rounded-2xl bg-accent-900/30 flex items-center justify-center">
              <DatabaseIcon className="w-8 h-8 text-accent-300" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="font-display text-lg font-bold text-gray-100">
                Data Manager
              </h3>
              <p className="mt-1 text-sm text-gray-400">
                Import, export, and manage all league data in one place.
                CSV imports, GameChanger integration, and bulk operations.
              </p>
            </div>
            <Button
              variant="dirt"
              size="md"
              icon={<DatabaseIcon className="w-4 h-4" />}
              onClick={() => onNavigate?.('data')}
            >
              Open Data Manager
            </Button>
          </div>
        </Card>
      </section>
      )}

      {/* ── Footer ── */}
      <footer className="pt-4 pb-2 border-t border-gray-700/50">
        <p className="text-center text-xs text-gray-400">
          LeagueHaven Sports Management · Built by DigiSeeIt Design · {new Date().getFullYear()}
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
    field:    'bg-action-900/35 text-action-300 hover:bg-action-900/50',
    blue:     'bg-chrome-900/35 text-chrome-300 hover:bg-chrome-900/55',
    dirt:     'bg-accent-900/35 text-accent-300 hover:bg-accent-900/50',
    baseball: 'bg-signal-900/35 text-signal-300 hover:bg-signal-900/50',
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
    <div className="text-center p-2 bg-gray-900 rounded-lg">
      <p className="text-xl font-display font-bold text-gray-100 tabular-nums">{value}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mt-0.5">{label}</p>
    </div>
  );
}

function EmptyState({ icon, title, description, action }) {
  return (
    <Card variant="bordered" className="bg-stitch-pattern">
      <CardBody className="py-12 text-center">
        {icon && <div className="text-4xl mb-3 opacity-40">{icon}</div>}
        <h4 className="text-sm font-semibold text-gray-300">{title}</h4>
        {description && <p className="mt-1 text-xs text-gray-400 max-w-xs mx-auto">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
      </CardBody>
    </Card>
  );
}
