import { useState, useEffect, useCallback } from 'react';
import { fetchTeams, fetchGames, fetchTeamRoster, fetchTeamStaff } from '../api/index.js';
import TeamLogo from './TeamLogo.jsx';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const STATUS_STYLES = {
  scheduled:   'bg-chrome-800/60 text-chrome-300 border border-chrome-700/40',
  in_progress: 'bg-accent-900/40 text-accent-300 border border-accent-700/40',
  completed:   'bg-action-900/40 text-action-300 border border-action-700/40',
  cancelled:   'bg-signal-900/40 text-signal-300 border border-signal-700/40',
  postponed:   'bg-gray-800 text-gray-400 border border-gray-700',
};
const STATUS_LABELS = {
  scheduled: 'Scheduled', in_progress: 'Live',
  completed: 'Final',     cancelled: 'Cancelled', postponed: 'Postponed',
};

const ROLE_LABELS = {
  head_coach:       'Head Coach',
  assistant_coach:  'Asst. Coach',
  scorekeeper:      'Scorekeeper',
  org_admin:        'Org Admin',
};

const TABS = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'roster',   label: 'Roster'   },
  { key: 'staff',    label: 'Coaches / Staff' },
];

export default function TeamDetail({ teamId, onNavigateToTeam, onBack }) {
  const [team, setTeam]         = useState(null);
  const [games, setGames]       = useState([]);
  const [roster, setRoster]     = useState([]);
  const [staff, setStaff]       = useState([]);
  const [activeTab, setActiveTab] = useState('schedule');
  const [loading, setLoading]   = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError]       = useState(null);

  // Load team metadata + initial schedule
  useEffect(() => {
    setLoading(true);
    setError(null);
    setTeam(null);
    setGames([]);
    setRoster([]);
    setStaff([]);

    Promise.all([
      fetchTeams().then(all => all.find(t => t.id === teamId) || null),
      fetchGames({ team_id: teamId }),
    ])
      .then(([t, g]) => {
        setTeam(t);
        setGames(g);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [teamId]);

  // Lazy-load roster / staff on tab switch
  const loadTab = useCallback(async (tab) => {
    if (tab === 'schedule') return;
    if (tab === 'roster' && roster.length) return;
    if (tab === 'staff'  && staff.length)  return;
    setTabLoading(true);
    try {
      if (tab === 'roster') setRoster(await fetchTeamRoster(teamId));
      if (tab === 'staff')  setStaff(await fetchTeamStaff(teamId));
    } catch (err) {
      setError(err.message);
    } finally {
      setTabLoading(false);
    }
  }, [teamId, roster.length, staff.length]);

  function switchTab(tab) {
    setActiveTab(tab);
    loadTab(tab);
  }

  if (loading) return <div className="py-16 text-center text-gray-400">Loading team…</div>;
  if (error)   return <div className="lh-alert-error mt-4">{error}</div>;
  if (!team)   return <div className="py-16 text-center text-gray-400">Team not found.</div>;

  // Compute recent record from games
  const completed = games.filter(g => g.status === 'completed');
  const wins   = completed.filter(g => (g.home_team_id === teamId && g.home_score > g.away_score) || (g.away_team_id === teamId && g.away_score > g.home_score)).length;
  const losses = completed.filter(g => (g.home_team_id === teamId && g.home_score < g.away_score) || (g.away_team_id === teamId && g.away_score < g.home_score)).length;
  const ties   = completed.filter(g => g.home_score === g.away_score).length;

  const longName = team.long_name || team.name;

  return (
    <div>
      {/* Back breadcrumb */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 mb-4 transition-colors"
      >
        ← Back
      </button>

      {/* Team header */}
      <div className="bg-gray-800 border border-gray-700 rounded-card-sm p-4 sm:p-6 mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center"
        style={{ borderLeft: `4px solid ${team.primary_color || '#334155'}` }}>
        <TeamLogo
          src={team.logo_url}
          name={longName}
          ageGroup={team.age_group}
          level={team.level}
          cityAbbr={team.city_abbr}
          primaryColor={team.primary_color}
          secondaryColor={team.secondary_color}
          size="w-16 h-16"
        />
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-2xl font-bold text-white tracking-wide">{longName}</h2>
          {team.org_name && <div className="text-sm text-gray-400 mt-0.5">{team.org_name}</div>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-300">
            {team.age_group && <span>{team.age_group}</span>}
            {team.level     && <span>{team.level}</span>}
            {team.divisions?.length > 0 && (
              <span className="text-action-400">{team.divisions.map(d => d.name).join(', ')}</span>
            )}
          </div>
        </div>
        {completed.length > 0 && (
          <div className="shrink-0 text-right">
            <div className="eyebrow mb-1">Record</div>
            <div className="font-display text-2xl font-bold text-white tabular-nums">
              {wins}–{losses}{ties > 0 ? `–${ties}` : ''}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-700 mb-4 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            aria-selected={activeTab === t.key}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors -mb-px ${
              activeTab === t.key
                ? 'border-action-500 text-action-300'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabLoading && <div className="py-8 text-center text-gray-400">Loading…</div>}

      {/* ── SCHEDULE ── */}
      {!tabLoading && activeTab === 'schedule' && (
        <ScheduleTab games={games} teamId={teamId} onNavigateToTeam={onNavigateToTeam} />
      )}

      {/* ── ROSTER ── */}
      {!tabLoading && activeTab === 'roster' && (
        <RosterTab players={roster} teamId={teamId} />
      )}

      {/* ── STAFF ── */}
      {!tabLoading && activeTab === 'staff' && (
        <StaffTab staff={staff} />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/* Schedule tab                                               */
/* ────────────────────────────────────────────────────────── */
function ScheduleTab({ games, teamId, onNavigateToTeam }) {
  if (!games.length) {
    return <div className="py-12 text-center text-gray-400">No games scheduled yet.</div>;
  }

  // Sort: upcoming first (scheduled/in_progress), then completed desc
  const upcoming  = games.filter(g => g.status === 'scheduled' || g.status === 'in_progress')
                         .sort((a, b) => (a.game_date || '').localeCompare(b.game_date || ''));
  const past      = games.filter(g => g.status === 'completed' || g.status === 'cancelled' || g.status === 'postponed')
                         .sort((a, b) => (b.game_date || '').localeCompare(a.game_date || ''));
  const ordered   = [...upcoming, ...past];

  return (
    <div className="space-y-2">
      {ordered.map(g => {
        const isHome  = g.home_team_id === teamId;
        const opp     = isHome ? { name: g.away_team_name, id: g.away_team_id, logo: g.away_logo, age: g.away_age_group, level: g.away_level, abbr: g.away_city_abbr, pc: g.away_primary_color, sc: g.away_secondary_color }
                                : { name: g.home_team_name, id: g.home_team_id, logo: g.home_logo, age: g.home_age_group, level: g.home_level, abbr: g.home_city_abbr, pc: g.home_primary_color, sc: g.home_secondary_color };
        const myScore   = isHome ? g.home_score : g.away_score;
        const oppScore  = isHome ? g.away_score : g.home_score;
        const isScored  = g.status === 'completed' || g.status === 'in_progress';
        const won       = isScored && myScore != null && myScore > oppScore;
        const lost      = isScored && myScore != null && myScore < oppScore;

        return (
          <div key={g.id} className="bg-gray-800 border border-gray-700 rounded-card-sm p-4 hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-3">
              {/* Date / time */}
              <div className="shrink-0 w-20 text-center">
                <div className="text-xs font-semibold text-gray-300">{formatDate(g.game_date)}</div>
                {g.game_time && <div className="text-xs text-gray-500">{formatTime(g.game_time)}</div>}
              </div>

              {/* Opponent */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="eyebrow shrink-0">{isHome ? 'vs' : '@'}</span>
                <TeamLogo src={opp.logo} name={opp.name} ageGroup={opp.age} level={opp.level} cityAbbr={opp.abbr} primaryColor={opp.pc} secondaryColor={opp.sc} size="w-7 h-7" />
                {opp.id ? (
                  <button
                    onClick={() => onNavigateToTeam(opp.id)}
                    className="font-semibold text-sm text-action-300 hover:text-action-100 hover:underline text-left truncate"
                  >
                    {opp.name}
                  </button>
                ) : (
                  <span className="font-semibold text-sm text-gray-300 truncate">{opp.name}</span>
                )}
              </div>

              {/* Score / status */}
              <div className="shrink-0 text-right">
                {isScored ? (
                  <div className={`font-bold tabular-nums text-sm ${won ? 'text-action-300' : lost ? 'text-signal-400' : 'text-gray-300'}`}>
                    {won ? 'W' : lost ? 'L' : 'T'} {myScore}–{oppScore}
                  </div>
                ) : null}
                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5 ${STATUS_STYLES[g.status] || STATUS_STYLES.postponed}`}>
                  {STATUS_LABELS[g.status] || g.status}
                </span>
              </div>
            </div>

            {g.location_name && (
              <div className="mt-2 text-xs text-gray-500 pl-24">
                📍 {g.location_name}{g.location_city ? `, ${g.location_city}` : ''}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/* Roster tab — no contact info exposed                       */
/* ────────────────────────────────────────────────────────── */
function RosterTab({ players, teamId }) {
  if (!players.length) {
    return <div className="py-12 text-center text-gray-400">No players on roster.</div>;
  }

  // Sort by jersey number, then last name
  const sorted = [...players].sort((a, b) => {
    const aj = a.teams?.find(t => t.id === teamId || t.team_id === teamId)?.jersey_number ?? 9999;
    const bj = b.teams?.find(t => t.id === teamId || t.team_id === teamId)?.jersey_number ?? 9999;
    if (aj !== bj) return aj - bj;
    return (a.last_name || '').localeCompare(b.last_name || '');
  });

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        {players.length} player{players.length !== 1 ? 's' : ''} · Contact information is not publicly displayed.
      </p>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-card-sm border border-gray-700/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 border-b border-gray-700">
              <th className="px-3 py-2.5 text-center eyebrow w-12">#</th>
              <th className="px-3 py-2.5 text-left eyebrow">Name</th>
              <th className="px-3 py-2.5 text-left eyebrow">Position(s)</th>
              <th className="px-3 py-2.5 text-center eyebrow">Grade</th>
              <th className="px-3 py-2.5 text-center eyebrow">Bats</th>
              <th className="px-3 py-2.5 text-center eyebrow">Throws</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50 bg-gray-800/40">
            {sorted.map(p => {
              const jersey = p.teams?.find(t => t.id === teamId || t.team_id === teamId)?.jersey_number;
              const positions = p.positions?.map(pos => pos.position || pos).filter(Boolean).join(', ');
              return (
                <tr key={p.id} className="hover:bg-gray-700/30 transition-colors">
                  <td className="px-3 py-2.5 text-center font-mono text-gray-400">
                    {jersey != null ? jersey : '—'}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-gray-100">
                    {p.first_name} {p.last_name}
                  </td>
                  <td className="px-3 py-2.5 text-gray-400">{positions || '—'}</td>
                  <td className="px-3 py-2.5 text-center text-gray-400">{p.grade || '—'}</td>
                  <td className="px-3 py-2.5 text-center text-gray-400">{p.batting_hand || '—'}</td>
                  <td className="px-3 py-2.5 text-center text-gray-400">{p.throwing_hand || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile list */}
      <div className="sm:hidden space-y-2">
        {sorted.map(p => {
          const jersey = p.teams?.find(t => t.id === teamId || t.team_id === teamId)?.jersey_number;
          const positions = p.positions?.map(pos => pos.position || pos).filter(Boolean).join(', ');
          return (
            <div key={p.id} className="bg-gray-800 border border-gray-700 rounded-card-sm p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-mono font-bold text-gray-300 text-sm shrink-0">
                {jersey != null ? jersey : '—'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-100">{p.first_name} {p.last_name}</div>
                <div className="text-xs text-gray-400">{positions || 'No position listed'}</div>
                {p.grade && <div className="text-xs text-gray-500">Grade {p.grade}</div>}
              </div>
              {(p.batting_hand || p.throwing_hand) && (
                <div className="text-xs text-gray-500 shrink-0 text-right">
                  {p.batting_hand && <div>Bats {p.batting_hand}</div>}
                  {p.throwing_hand && <div>Throws {p.throwing_hand}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/* Staff / coaches tab                                        */
/* ────────────────────────────────────────────────────────── */
function StaffTab({ staff }) {
  if (!staff.length) {
    return <div className="py-12 text-center text-gray-400">No coaches or staff listed.</div>;
  }

  const order = ['head_coach', 'assistant_coach', 'scorekeeper', 'org_admin'];
  const sorted = [...staff].sort((a, b) => {
    const ai = order.indexOf(a.role);
    const bi = order.indexOf(b.role);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
    <div className="space-y-2">
      {sorted.map(s => (
        <div key={s.id} className="bg-gray-800 border border-gray-700 rounded-card-sm p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 font-bold text-sm shrink-0">
            {(s.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-100">{s.name}</div>
            <div className="text-xs text-action-400 font-medium">{ROLE_LABELS[s.role] || s.role}</div>
          </div>
          <div className="shrink-0 text-right text-sm space-y-0.5">
            {s.email && (
              <a
                href={`mailto:${s.email}`}
                className="block text-chrome-300 hover:text-chrome-100 hover:underline text-xs"
              >
                {s.email}
              </a>
            )}
            {s.phone && (
              <a
                href={`tel:${s.phone}`}
                className="block text-gray-400 hover:text-gray-200 text-xs"
              >
                {s.phone}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
