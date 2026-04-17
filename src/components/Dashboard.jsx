import { useState, useEffect, useCallback } from 'react';
import { cn } from '../lib/cn.js';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchTeams, fetchGames, fetchSeasons, fetchOrganizations, fetchAllPitchRest, fetchAllPlayers, fetchDashboardActivity, fetchAnnouncements, fetchWeather } from '../api/index.js';
import { Card, CardHeader, CardBody, StatCard, Scoreboard, Button } from './ui/index.js';
import {
  UsersIcon, CalendarIcon, TrophyIcon, BuildingIcon,
  PlusIcon, MegaphoneIcon, BellIcon, ClipboardIcon,
  ClockIcon, ChartBarIcon, SparklesIcon, EyeIcon, MapPinIcon,
  DatabaseIcon,
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

const ACTIVITY_ICONS = {
  player: '👤',
  game: '⚾',
  team: '👥',
  registration: '📋',
  import: '📥',
};

function getWeatherForGame(game, weatherMap) {
  if (!game.location_lat || !game.location_lon) return null;
  const key = `${parseFloat(game.location_lat).toFixed(2)},${parseFloat(game.location_lon).toFixed(2)}`;
  return weatherMap[key] || null;
}

const PRIORITY_STYLES = {
  urgent: 'border-red-500/50 bg-red-950/30',
  high: 'border-yellow-500/40 bg-yellow-950/20',
  normal: 'border-blue-500/30 bg-blue-950/15',
  low: 'border-gray-600/30 bg-gray-900/20',
};

const PRIORITY_BADGES = {
  urgent: 'bg-red-500/20 text-red-300',
  high: 'bg-yellow-500/20 text-yellow-300',
  normal: '',
  low: '',
};

/* ═══════════════════════════════════════════════════════
   Dashboard
   ═══════════════════════════════════════════════════════ */

export default function Dashboard({ onNavigate, onViewPlayer }) {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [games, setGames] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [pitchRest, setPitchRest] = useState({});
  const [players, setPlayers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [gameWeather, setGameWeather] = useState({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [t, g, s, o, pr, pl, act, ann] = await Promise.all([
        fetchTeams().catch(() => []),
        fetchGames().catch(() => []),
        fetchSeasons().catch(() => []),
        fetchOrganizations().catch(() => []),
        fetchAllPitchRest().catch(() => ({})),
        fetchAllPlayers().catch(() => []),
        fetchDashboardActivity().catch(() => []),
        fetchAnnouncements().catch(() => []),
      ]);
      setTeams(t || []);
      setGames(g || []);
      setSeasons(s || []);
      setOrgs(o || []);
      setPitchRest(pr || {});
      setPlayers(pl || []);
      setActivity(act || []);
      setAnnouncements(ann || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Fetch weather for today's game locations (deduplicated by lat/lon)
  useEffect(() => {
    if (!games.length) return;
    const todayStr_ = new Date().toISOString().slice(0, 10);
    const todays = games.filter(g => g.game_date === todayStr_ && g.location_lat && g.location_lon);
    if (!todays.length) return;

    // Deduplicate by rounded coords
    const seen = new Set();
    const unique = [];
    for (const g of todays) {
      const key = `${parseFloat(g.location_lat).toFixed(2)},${parseFloat(g.location_lon).toFixed(2)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(g);
      }
    }

    Promise.all(
      unique.map(g =>
        fetchWeather(g.location_lat, g.location_lon)
          .then(w => ({ key: `${parseFloat(g.location_lat).toFixed(2)},${parseFloat(g.location_lon).toFixed(2)}`, weather: w }))
          .catch(() => null)
      )
    ).then(results => {
      const map = {};
      for (const r of results) {
        if (r) map[r.key] = r.weather;
      }
      setGameWeather(map);
    });
  }, [games]);

  /* Derived stats */
  const currentSeason = seasons.find(s => s.is_current) || seasons[0];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  /* Role-based scoping */
  const role = user?.role;
  const isAdmin = role === 'super_admin' || role === 'org_admin';
  const myTeamIds = user?.permissions?.team_ids || [];
  const myOrgIds = user?.permissions?.org_ids || [];

  const scopedGames = isAdmin ? games : games.filter(g =>
    myTeamIds.includes(g.home_team_id) || myTeamIds.includes(g.away_team_id)
  );
  const scopedTeams = isAdmin ? teams : teams.filter(t =>
    myTeamIds.includes(t.id) || myOrgIds.includes(t.org_id)
  );
  const scopedPlayers = isAdmin ? players : players.filter(p =>
    p.teams?.some(t => myTeamIds.includes(t.team_id) || myOrgIds.includes(t.org_id))
  );

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const gamesThisWeek = scopedGames.filter(g => g.game_date >= weekStartStr && g.game_date <= weekEndStr);
  const completedGames = scopedGames.filter(g => g.status === 'final');
  const upcomingGames = scopedGames
    .filter(g => g.game_date >= todayStr && g.status !== 'final' && g.status !== 'cancelled')
    .sort((a, b) => (a.game_date + (a.game_time || '')) > (b.game_date + (b.game_time || '')) ? 1 : -1)
    .slice(0, 5);

  const todaysGames = scopedGames
    .filter(g => g.game_date === todayStr && g.status !== 'cancelled')
    .sort((a, b) => (a.game_time || '').localeCompare(b.game_time || ''));

  /* Players currently on rest (not eligible today) */
  const playersOnRest = Object.entries(pitchRest)
    .filter(([, r]) => !r.eligible_today)
    .map(([pid, r]) => {
      const player = scopedPlayers.find(p => String(p.id) === String(pid));
      return player ? { ...r, id: pid, name: `${player.first_name} ${player.last_name}`, teams: player.teams } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.available_date || '').localeCompare(b.available_date || ''));

  /* Games that have passed but still have no score entered */
  const unscoredGames = scopedGames
    .filter(g => g.game_date < todayStr && g.status === 'scheduled')
    .sort((a, b) => b.game_date > a.game_date ? 1 : -1);

  /* Roster alerts — players missing key info */
  const rosterAlerts = scopedPlayers
    .filter(p => {
      if (!p.date_of_birth) return true;
      if (p.teams?.some(t => !t.jersey_number)) return true;
      return false;
    })
    .map(p => {
      const issues = [];
      if (!p.date_of_birth) issues.push('Missing DOB');
      const teamsNoJersey = (p.teams || []).filter(t => !t.jersey_number);
      if (teamsNoJersey.length > 0) issues.push(`No jersey # on ${teamsNoJersey.map(t => t.team_name).join(', ')}`);
      return { id: p.id, name: `${p.first_name} ${p.last_name}`, issues, teams: p.teams };
    });

  const recentResults = scopedGames
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
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-800 via-blue-700 to-field-700 text-white p-6 sm:p-8 shadow-elevated border border-blue-600/30">
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
                className="bg-field-600/80 hover:bg-field-600 backdrop-blur-sm border border-white/10"
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
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors"
              >
                Manage Announcements →
              </button>
            </div>
          )}
          {announcements.map(a => (
            <div key={a.id} className={cn('rounded-xl border px-5 py-4', PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.normal)}>
              <div className="flex items-start gap-3">
                <MegaphoneIcon className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
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
                  <p className="text-[10px] text-gray-500 mt-2">
                    {a.author_name && `Posted by ${a.author_name} · `}
                    {timeAgo(a.created_at)}
                  </p>
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
            value={scopedTeams.length}
            icon={<UsersIcon className="w-5 h-5" />}
            accentColor="field"
            trendLabel={isAdmin && teams.length > 0 ? `${orgs.length} org${orgs.length !== 1 ? 's' : ''}` : undefined}
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
            trendLabel={scopedGames.length > 0 ? `of ${scopedGames.length} total` : undefined}
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

      {/* ── Today's Games ── */}
      {todaysGames.length > 0 && (
        <section aria-label="Today's games">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-lg font-bold text-gray-100 flex items-center gap-2">
              <ClockIcon className="w-5 h-5 text-baseball-500" />
              Today's Games
              <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-baseball-600/30 text-baseball-300">
                {todaysGames.length}
              </span>
            </h3>
            <button
              onClick={() => onNavigate?.('schedule')}
              className="text-xs font-semibold text-field-300 hover:text-field-200 transition-colors flex items-center gap-1"
            >
              Full Schedule <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {todaysGames.map((g) => (
              <Scoreboard
                key={g.id}
                status={g.status === 'in_progress' ? 'in_progress' : g.status === 'final' ? 'final' : 'scheduled'}
                gameTime={
                  g.game_time ? formatGameTime(g.game_time) : 'Time TBD'
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
                weather={getWeatherForGame(g, gameWeather)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Pitch Count Warnings ── */}
      {playersOnRest.length > 0 && (
        <section aria-label="Pitch count warnings">
          <Card variant="bordered" className="border-red-500/30 bg-red-950/10">
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <h3 className="font-heading text-base font-bold text-gray-100 flex items-center gap-2">
                  <BellIcon className="w-5 h-5 text-red-400" />
                  Pitch Rest Alerts
                  <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-red-500/20 text-red-300">
                    {playersOnRest.length}
                  </span>
                </h3>
                <button
                  onClick={() => onNavigate?.('players')}
                  className="text-xs font-semibold text-field-300 hover:text-field-200 transition-colors flex items-center gap-1"
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
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 shrink-0 ml-3">
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
          <Card variant="bordered" className="border-dirt-500/30 bg-dirt-950/10">
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <h3 className="font-heading text-base font-bold text-gray-100 flex items-center gap-2">
                  <ClipboardIcon className="w-5 h-5 text-dirt-400" />
                  Scores Needed
                  <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-dirt-500/20 text-dirt-300">
                    {unscoredGames.length}
                  </span>
                </h3>
                <button
                  onClick={() => onNavigate?.('schedule')}
                  className="text-xs font-semibold text-field-300 hover:text-field-200 transition-colors flex items-center gap-1"
                >
                  Schedule <span aria-hidden="true">→</span>
                </button>
              </div>
            </CardHeader>
            <CardBody>
              <div className="divide-y divide-gray-700/50">
                {unscoredGames.slice(0, 6).map((g) => (
                  <div key={g.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0 gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-gray-200 block truncate">
                        {g.away_team_name || 'TBD'} @ {g.home_team_name || 'TBD'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatGameDate(g.game_date)}
                        {g.location_name ? ` · ${g.location_name}` : ''}
                      </span>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-dirt-500/20 text-dirt-300 shrink-0">
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

      {/* ── Roster Alerts ── */}
      {rosterAlerts.length > 0 && (
        <section aria-label="Roster alerts">
          <Card variant="bordered" className="border-baseball-500/30 bg-baseball-950/10">
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <h3 className="font-heading text-base font-bold text-gray-100 flex items-center gap-2">
                  <UsersIcon className="w-5 h-5 text-baseball-400" />
                  Roster Alerts
                  <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-baseball-500/20 text-baseball-300">
                    {rosterAlerts.length}
                  </span>
                </h3>
                <button
                  onClick={() => onNavigate?.('players')}
                  className="text-xs font-semibold text-field-300 hover:text-field-200 transition-colors flex items-center gap-1"
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
                        className="text-sm font-medium text-gray-200 hover:text-blue-300 transition-colors block truncate text-left"
                      >
                        {p.name}
                      </button>
                      {p.teams?.length > 0 && (
                        <span className="text-xs text-gray-400">{p.teams.map(t => t.team_name).join(', ')}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 shrink-0 ml-3 justify-end">
                      {p.issues.map((issue, i) => (
                        <span key={i} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-baseball-500/20 text-baseball-300">
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
        </section>
      )}

      {/* ── Two-Column Layout: Games + Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Upcoming Games — 2/3 width */}
        <section className="lg:col-span-2 space-y-4" aria-label="Upcoming games">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-lg font-bold text-gray-100 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-field-600" />
              Upcoming Games
            </h3>
            <button
              onClick={() => onNavigate?.('schedule')}
              className="text-xs font-semibold text-field-300 hover:text-field-200 transition-colors flex items-center gap-1"
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
              <h3 className="font-heading text-base font-bold text-gray-100 flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-field-600" />
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
                  <ChartBarIcon className="w-4 h-4 text-field-600 shrink-0" />
                  <h4 className="text-sm font-bold text-gray-100">Season Overview</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Total games" value={scopedGames.length} />
                  <MiniStat label="Completed" value={completedGames.length} />
                  <MiniStat label="Teams" value={scopedTeams.length} />
                  <MiniStat label="This week" value={gamesThisWeek.length} />
                </div>
                {scopedGames.length > 0 && (
                  <div className="pt-2 border-t border-gray-700">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>Season progress</span>
                      <span className="font-semibold text-gray-300">
                        {scopedGames.length > 0 ? Math.round((completedGames.length / scopedGames.length) * 100) : 0}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-field-500 to-field-600 rounded-full transition-all duration-500"
                        style={{ width: `${scopedGames.length > 0 ? (completedGames.length / scopedGames.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* Recent Activity Feed */}
          {activity.length > 0 && (
            <Card variant="bordered">
              <CardHeader>
                <h3 className="font-heading text-base font-bold text-gray-100 flex items-center gap-2">
                  <ClockIcon className="w-4 h-4 text-field-600" />
                  Recent Activity
                </h3>
              </CardHeader>
              <CardBody className="space-y-0 divide-y divide-gray-700/50">
                {activity.slice(0, 8).map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                    <span className="text-sm mt-0.5 shrink-0">{ACTIVITY_ICONS[item.icon] || '📌'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-300 leading-snug truncate">{item.message}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{timeAgo(item.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </aside>
      </div>

      {/* ── Recent Results ── */}
      {recentResults.length > 0 && (
        <section aria-label="Recent results">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-lg font-bold text-gray-100 flex items-center gap-2">
              <TrophyIcon className="w-5 h-5 text-dirt-600" />
              Recent Results
            </h3>
            <button
              onClick={() => onNavigate?.('standings')}
              className="text-xs font-semibold text-field-300 hover:text-field-200 transition-colors flex items-center gap-1"
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

      {/* ── Data Manager Card ── */}
      {isAdmin && (
      <section aria-label="Data management">
        <Card variant="dirt" className="overflow-hidden">
          <div className="flex flex-col sm:flex-row items-center gap-6 p-6 sm:p-8">
            <div className="shrink-0 w-16 h-16 rounded-2xl bg-dirt-900/30 flex items-center justify-center">
              <DatabaseIcon className="w-8 h-8 text-dirt-300" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="font-heading text-lg font-bold text-gray-100">
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
    field:    'bg-field-900/35 text-field-300 hover:bg-field-900/50',
    blue:     'bg-blue-900/35 text-blue-300 hover:bg-blue-900/55',
    dirt:     'bg-dirt-900/35 text-dirt-300 hover:bg-dirt-900/50',
    baseball: 'bg-baseball-900/35 text-baseball-300 hover:bg-baseball-900/50',
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
      <p className="text-xl font-heading font-bold text-gray-100 tabular-nums">{value}</p>
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
