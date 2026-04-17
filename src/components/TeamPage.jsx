import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTeams, fetchGames, fetchRegistrations } from '../api/index.js';
import { cn } from '../lib/cn.js';
import { useAuth } from '../context/AuthContext.jsx';
import TeamLogo, { HomePlate, plateLabel } from './TeamLogo.jsx';
import RosterList from './RosterList.jsx';
import StaffList from './StaffList.jsx';
import PitcherRest from './PitcherRest.jsx';
import PitchLog from './PitchLog.jsx';
import TeamSchedule from './TeamSchedule.jsx';
import GameDetail from './GameDetail.jsx';
import { CalendarIcon, ClipboardIcon, UsersIcon, UserGroupIcon } from './ui/icons.jsx';
import ContactModal from './ContactModal.jsx';

const TABS = [
  { key: 'overview', label: 'Overview', icon: null },
  { key: 'schedule', label: 'Schedule', icon: CalendarIcon },
  { key: 'pitching', label: 'Pitching', icon: ClipboardIcon },
  { key: 'roster', label: 'Roster', icon: UsersIcon },
  { key: 'coaches', label: 'Coaches', icon: UserGroupIcon },
];

export default function TeamPage({ teamId, teamOrgId, onEditPlayer, onAddPlayer, onViewPlayer, refreshKey, onNavigateToTeam, onWatermarkLogoChange }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [contactModal, setContactModal] = useState(null);
  const { isSuperAdmin, isAccountant, canEditOrg } = useAuth();
  const queryClient = useQueryClient();

  // When a mutation occurs upstream (refreshKey increments), invalidate affected caches
  useEffect(() => {
    if (!refreshKey) return;
    queryClient.invalidateQueries({ queryKey: ['teams'] });
    queryClient.invalidateQueries({ queryKey: ['games', 'team', teamId] });
    queryClient.invalidateQueries({ queryKey: ['registrations'] });
  }, [refreshKey, queryClient, teamId]);

  const { data: allTeams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: fetchTeams,
    enabled: !!teamId,
  });

  const team = allTeams.find(t => t.id === teamId) ?? null;

  const { data: gamesData = [] } = useQuery({
    queryKey: ['games', 'team', teamId],
    queryFn: () => fetchGames({ team_id: teamId }),
    enabled: !!teamId,
  });

  const recentGames = gamesData
    .filter(g => g.status === 'completed')
    .sort((a, b) => (b.game_date || '').localeCompare(a.game_date || ''))
    .slice(0, 5);

  const { data: registrationsData } = useQuery({
    queryKey: ['registrations'],
    queryFn: fetchRegistrations,
    enabled: !!teamId,
  });

  const registrations = (registrationsData?.registrations || []).filter(r => r.team_id === teamId);

  // Reset tab and selected game when team changes
  useEffect(() => { setActiveTab('overview'); setSelectedGameId(null); }, [teamId]);

  const canViewPayment = isSuperAdmin || isAccountant || (teamOrgId && canEditOrg(teamOrgId));

  useEffect(() => {
    onWatermarkLogoChange?.(team?.logo_url || null);
  }, [team?.logo_url, onWatermarkLogoChange]);

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
      {team && <TeamHeader team={team} recentGames={recentGames} onContactTeam={() => setContactModal({ scope: 'team', scopeId: teamId, scopeLabel: team.name })} />}

      {contactModal && (
        <ContactModal
          scope={contactModal.scope}
          scopeId={contactModal.scopeId}
          scopeLabel={contactModal.scopeLabel}
          onClose={() => setContactModal(null)}
        />
      )}

      {/* Tab bar */}
      <div className="border-b border-gray-700 bg-gray-800">
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
                    ? 'border-blue-600 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600'
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
        {activeTab === 'overview' && selectedGameId && (
          <GameDetail gameId={selectedGameId} onBack={() => setSelectedGameId(null)} onNavigateToTeam={onNavigateToTeam} />
        )}
        {activeTab === 'overview' && !selectedGameId && (
          <OverviewTab team={team} recentGames={recentGames} registrations={registrations} canViewPayment={canViewPayment} onSelectGame={setSelectedGameId} />
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
          <RosterList teamId={teamId} teamOrgId={teamOrgId} onEditPlayer={onEditPlayer} onAddPlayer={onAddPlayer} onViewPlayer={onViewPlayer} refreshKey={refreshKey} />
        )}
        {activeTab === 'coaches' && (
          <StaffList teamId={teamId} teamOrgId={teamOrgId} refreshKey={refreshKey} />
        )}
      </div>
    </div>
  );
}

/* ── Team Header ── */
function TeamHeader({ team, recentGames, onContactTeam }) {
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
            label={plateLabel(team.age_group, team.level)}
            cityAbbr={team.city_abbr || team.abbreviation?.slice(0, 3) || ''}
            primaryColor={team.primary_color || '#003366'}
            secondaryColor={team.secondary_color || '#CC0000'}
            size="w-14 h-14"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-heading font-bold text-white truncate">{team.name}</h2>
        <div className="flex items-center gap-3 text-sm text-gray-400 mt-0.5 flex-wrap">
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
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onContactTeam}
          className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-900/30 rounded-lg transition-colors"
          title="Email team"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </button>
        {(record.w > 0 || record.l > 0 || record.t > 0) && (
          <div className="text-right">
            <p className="text-lg font-bold text-gray-200 font-display">
              {record.w}-{record.l}{record.t > 0 ? `-${record.t}` : ''}
            </p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Record</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Overview Tab ── */
function OverviewTab({ team, recentGames, registrations, canViewPayment, onSelectGame }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Team Info */}
      <div className="bg-gray-800 rounded-xl shadow-card p-4">
        <h3 className="text-base font-heading font-bold text-white uppercase tracking-wide mb-3">Team Info</h3>
        <dl className="space-y-2 text-sm">
          {team?.org_name && <InfoRow label="Organization" value={team.org_name} />}
          {team?.age_group && <InfoRow label="Age Group" value={team.age_group} />}
          {team?.level && <InfoRow label="Level" value={team.level} />}
          {team?.divisions?.length > 0 && (
            <InfoRow label={team.divisions.length > 1 ? 'Divisions' : 'Division'} value={team.divisions.map(d => d.name).join(', ')} />
          )}
          {team?.primary_color && (
            <div className="flex items-center justify-between">
              <dt className="text-gray-400 font-medium">Colors</dt>
              <dd className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full border border-gray-700" style={{ backgroundColor: team.primary_color }} />
                {team.secondary_color && (
                  <span className="w-5 h-5 rounded-full border border-gray-700" style={{ backgroundColor: team.secondary_color }} />
                )}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Recent Games */}
      <div className="bg-gray-800 rounded-xl shadow-card p-4">
        <h3 className="text-base font-heading font-bold text-white uppercase tracking-wide mb-3">Recent Games</h3>
        {recentGames.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No completed games yet</p>
        ) : (
          <div className="space-y-2">
            {recentGames.map(game => (
              <RecentGameRow key={game.id} game={game} teamId={team?.id} onSelect={() => onSelectGame(game.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Payment Status */}
      {canViewPayment && registrations.length > 0 && (
        <div className="bg-gray-800 rounded-xl shadow-card p-4 md:col-span-2">
          <h3 className="text-base font-heading font-bold text-white uppercase tracking-wide mb-3">Payment Status</h3>
          <div className="space-y-2">
            {registrations.map(reg => {
              const fee = reg.effective_fee;
              const paid = !!reg.is_paid;
              return (
                <div key={reg.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-700 last:border-0">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-gray-200">{reg.season_name}{reg.season_year ? ` ${reg.season_year}` : ''}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {fee != null && <span className="text-sm text-gray-300">${fee.toFixed(2)}</span>}
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] font-bold',
                      paid ? 'bg-green-900/35 text-green-300' : 'bg-red-900/30 text-red-400'
                    )}>
                      {paid ? 'Paid' : 'Unpaid'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-400 font-medium">{label}</dt>
      <dd className="text-gray-200">{value}</dd>
    </div>
  );
}

function RecentGameRow({ game, teamId, onSelect }) {
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

  const resultColors = { W: 'text-green-400 bg-green-900/30', L: 'text-red-400 bg-red-900/30', T: 'text-gray-300 bg-gray-800' };

  const d = game.game_date ? new Date(game.game_date + 'T00:00:00') : null;
  const dateStr = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

  return (
    <div onClick={onSelect} className="flex items-center gap-2 py-1.5 border-b border-gray-700 last:border-0 cursor-pointer hover:bg-gray-700/40 rounded -mx-1 px-1 transition-colors">
      <span className="text-xs text-gray-400 w-12 shrink-0">{dateStr}</span>
      {result && (
        <span className={cn('text-xs font-bold w-5 text-center rounded px-1', resultColors[result])}>
          {result}
        </span>
      )}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {opponentLogo && <img src={opponentLogo} alt="" className="w-5 h-5 object-contain rounded shrink-0" />}
        <span className="text-sm text-gray-300 truncate">
          {isHome ? 'vs' : '@'} {opponentName || 'TBD'}
        </span>
      </div>
      {ownScore != null && oppScore != null && (
        <span className="text-sm font-semibold text-gray-200 shrink-0">{ownScore}–{oppScore}</span>
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
