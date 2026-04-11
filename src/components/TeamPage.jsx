import { useState, useEffect } from 'react';
import { fetchTeams, fetchGames } from '../api/index.js';
import { cn } from '../lib/cn.js';
import TeamLogo, { HomePlate } from './TeamLogo.jsx';
import RosterList from './RosterList.jsx';
import StaffList from './StaffList.jsx';
import PitcherRest from './PitcherRest.jsx';
import PitchLog from './PitchLog.jsx';
import TeamSchedule from './TeamSchedule.jsx';
import { CalendarIcon, ClipboardIcon, UsersIcon, UserGroupIcon } from './ui/icons.jsx';

const TABS = [
  { key: 'overview', label: 'Overview', icon: null },
  { key: 'schedule', label: 'Schedule', icon: CalendarIcon },
  { key: 'pitching', label: 'Pitching', icon: ClipboardIcon },
  { key: 'roster', label: 'Roster', icon: UsersIcon },
  { key: 'coaches', label: 'Coaches', icon: UserGroupIcon },
];

export default function TeamPage({ teamId, teamOrgId, onEditPlayer, onAddPlayer, refreshKey, onNavigateToTeam }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [team, setTeam] = useState(null);
  const [recentGames, setRecentGames] = useState([]);

  // Load team info
  useEffect(() => {
    if (!teamId) { setTeam(null); return; }
    let cancelled = false;
    fetchTeams().then(teams => {
      if (!cancelled) setTeam(teams.find(t => t.id === teamId) || null);
    });
    return () => { cancelled = true; };
  }, [teamId, refreshKey]);

  // Load recent games for overview
  useEffect(() => {
    if (!teamId) { setRecentGames([]); return; }
    let cancelled = false;
    fetchGames({ team_id: teamId }).then(games => {
      if (!cancelled) {
        const completed = games
          .filter(g => g.status === 'completed')
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
          .slice(0, 5);
        setRecentGames(completed);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [teamId, refreshKey]);

  // Reset tab when team changes
  useEffect(() => { setActiveTab('overview'); }, [teamId]);

  if (!teamId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="text-center">
          <UsersIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Select a team to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Team header */}
      {team && <TeamHeader team={team} recentGames={recentGames} />}

      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <nav className="flex -mb-px overflow-x-auto" aria-label="Team tabs">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                )}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div className="pt-4">
        {activeTab === 'overview' && (
          <OverviewTab team={team} recentGames={recentGames} />
        )}
        {activeTab === 'schedule' && (
          <TeamSchedule teamId={teamId} onNavigateToTeam={onNavigateToTeam} />
        )}
        {activeTab === 'pitching' && (
          <div className="space-y-4">
            <PitcherRest teamId={teamId} />
            <PitchLog teamId={teamId} />
          </div>
        )}
        {activeTab === 'roster' && (
          <RosterList teamId={teamId} teamOrgId={teamOrgId} onEditPlayer={onEditPlayer} onAddPlayer={onAddPlayer} refreshKey={refreshKey} />
        )}
        {activeTab === 'coaches' && (
          <StaffList teamId={teamId} teamOrgId={teamOrgId} refreshKey={refreshKey} />
        )}
      </div>
    </div>
  );
}

/* ── Team Header ── */
function TeamHeader({ team, recentGames }) {
  const record = computeRecord(recentGames, team.id);

  return (
    <div
      className="rounded-xl p-4 mb-4 flex items-center gap-4"
      style={{
        background: team.primary_color
          ? `linear-gradient(135deg, ${team.primary_color}18 0%, ${team.primary_color}08 100%)`
          : undefined,
        borderLeft: team.primary_color ? `4px solid ${team.primary_color}` : '4px solid #3b82f6',
      }}
    >
      <div className="shrink-0">
        {(team.logo_url || team.org_logo_url) ? (
          <img src={team.logo_url || team.org_logo_url} alt="" className="w-14 h-14 object-contain rounded-lg" />
        ) : (
          <HomePlate
            cityAbbr={team.city_abbr || team.abbreviation?.slice(0, 3) || ''}
            primaryColor={team.primary_color || '#003366'}
            secondaryColor={team.secondary_color || '#CC0000'}
            size="w-14 h-14"
            textSize="text-[8px]"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-bold text-gray-900 truncate font-display">{team.name}</h2>
        <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5 flex-wrap">
          {team.org_name && <span>{team.org_name}</span>}
          {team.age_group && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1 h-1 bg-gray-300 rounded-full" />
              {team.age_group}
            </span>
          )}
          {team.level && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1 h-1 bg-gray-300 rounded-full" />
              {team.level}
            </span>
          )}
          {team.divisions?.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1 h-1 bg-gray-300 rounded-full" />
              {team.divisions.map(d => d.name).join(', ')}
            </span>
          )}
        </div>
      </div>
      {(record.w > 0 || record.l > 0 || record.t > 0) && (
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-gray-800 font-display">
            {record.w}-{record.l}{record.t > 0 ? `-${record.t}` : ''}
          </p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Record</p>
        </div>
      )}
    </div>
  );
}

/* ── Overview Tab ── */
function OverviewTab({ team, recentGames }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Team Info */}
      <div className="bg-white rounded-xl shadow-card p-4">
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3">Team Info</h3>
        <dl className="space-y-2 text-sm">
          {team?.org_name && <InfoRow label="Organization" value={team.org_name} />}
          {team?.age_group && <InfoRow label="Age Group" value={team.age_group} />}
          {team?.level && <InfoRow label="Level" value={team.level} />}
          {team?.divisions?.length > 0 && (
            <InfoRow label={team.divisions.length > 1 ? 'Divisions' : 'Division'} value={team.divisions.map(d => d.name).join(', ')} />
          )}
          {team?.primary_color && (
            <div className="flex items-center justify-between">
              <dt className="text-gray-500 font-medium">Colors</dt>
              <dd className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full border border-gray-200" style={{ backgroundColor: team.primary_color }} />
                {team.secondary_color && (
                  <span className="w-5 h-5 rounded-full border border-gray-200" style={{ backgroundColor: team.secondary_color }} />
                )}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Recent Games */}
      <div className="bg-white rounded-xl shadow-card p-4">
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3">Recent Games</h3>
        {recentGames.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No completed games yet</p>
        ) : (
          <div className="space-y-2">
            {recentGames.map(game => (
              <RecentGameRow key={game.id} game={game} teamId={team?.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500 font-medium">{label}</dt>
      <dd className="text-gray-800">{value}</dd>
    </div>
  );
}

function RecentGameRow({ game, teamId }) {
  const isHome = game.home_team_id === teamId;
  const ownScore = isHome ? game.home_score : game.away_score;
  const oppScore = isHome ? game.away_score : game.home_score;
  const opponentName = isHome ? game.away_team_name : game.home_team_name;
  const opponentLogo = isHome ? game.away_team_logo : game.home_team_logo;

  let result = null;
  if (ownScore != null && oppScore != null) {
    if (ownScore > oppScore) result = 'W';
    else if (ownScore < oppScore) result = 'L';
    else result = 'T';
  }

  const resultColors = { W: 'text-green-700 bg-green-50', L: 'text-red-700 bg-red-50', T: 'text-gray-600 bg-gray-100' };

  const d = game.date ? new Date(game.date + 'T00:00:00') : null;
  const dateStr = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 w-12 shrink-0">{dateStr}</span>
      {result && (
        <span className={cn('text-xs font-bold w-5 text-center rounded px-1', resultColors[result])}>
          {result}
        </span>
      )}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {opponentLogo && <img src={opponentLogo} alt="" className="w-5 h-5 object-contain rounded shrink-0" />}
        <span className="text-sm text-gray-700 truncate">
          {isHome ? 'vs' : '@'} {opponentName || 'TBD'}
        </span>
      </div>
      {ownScore != null && oppScore != null && (
        <span className="text-sm font-semibold text-gray-800 shrink-0">{ownScore}–{oppScore}</span>
      )}
    </div>
  );
}

function computeRecord(games, teamId) {
  let w = 0, l = 0, t = 0;
  for (const g of games) {
    const isHome = g.home_team_id === teamId;
    const own = isHome ? g.home_score : g.away_score;
    const opp = isHome ? g.away_score : g.home_score;
    if (own == null || opp == null) continue;
    if (own > opp) w++;
    else if (own < opp) l++;
    else t++;
  }
  return { w, l, t };
}
