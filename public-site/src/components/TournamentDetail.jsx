import { useState, useEffect, useCallback } from 'react';
import {
  fetchTournament, fetchTournamentPools, fetchPoolStandings, fetchGame,
} from '../api/index.js';
import TeamLogo from './TeamLogo.jsx';

const REFRESH_MS = 15_000;

const FORMAT_LABELS = {
  single_elimination: 'Single Elimination',
  double_elimination: 'Double Elimination',
};

const GAME_STATUS_STYLE = {
  scheduled:   'bg-chrome-800/60 text-chrome-300 border-chrome-700/40',
  unscheduled: 'bg-chrome-800/40 text-gray-500 border-chrome-700/30',
  in_progress: 'bg-accent-900/40 text-accent-300 border-accent-700/40',
  completed:   'bg-action-900/40 text-action-300 border-action-700/40',
  cancelled:   'bg-signal-900/40 text-signal-300 border-signal-700/40',
};

const GAME_STATUS_LABEL = {
  scheduled: 'Scheduled', unscheduled: 'TBD',
  in_progress: '● LIVE', completed: 'Final', cancelled: 'Cancelled',
};

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function TournamentDetail({ tournamentId, onBack }) {
  const [data, setData]   = useState(null);
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab]     = useState('info');

  const load = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const [td, pd] = await Promise.all([
        fetchTournament(tournamentId),
        fetchTournamentPools(tournamentId).catch(() => []),
      ]);
      setData(td);
      setPools(pd || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <div className="text-gray-400 text-center py-16">Loading tournament…</div>;
  if (error)   return <div className="text-signal-400 text-center py-16">{error}</div>;
  if (!data)   return null;

  const hasPools  = pools.length > 0;
  const hasRounds = (data.rounds || []).length > 0;

  const bracketGames = (data.rounds || []).flatMap(r =>
    r.matches.filter(m => !m.is_bye && m.game).map(m => ({
      ...m.game,
      round_name: r.title,
      team_a: m.teams[0],
      team_b: m.teams[1],
      winner_id: m.winnerId,
    }))
  );

  const anyLive = bracketGames.some(g => g.status === 'in_progress');

  const visibleTabs = [
    { key: 'info',     label: 'Info'      },
    hasPools  && { key: 'pools',    label: 'Pool Play' },
    hasRounds && { key: 'bracket',  label: 'Bracket'   },
    (hasRounds || hasPools) && { key: 'schedule', label: 'Schedule'  },
  ].filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 mb-4 transition-colors">
        ← Back
      </button>

      <div className="mb-4">
        <h1 className="text-2xl font-display font-bold text-white flex items-center gap-2">
          🏆 {data.tournament.name}
        </h1>
        {data.tournament.org_name && <p className="text-gray-400 text-sm mt-1">{data.tournament.org_name}</p>}
      </div>

      {anyLive && (
        <div className="mb-3 flex items-center gap-2 text-accent-300 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-accent-400 animate-ping inline-block" />
          Live game in progress — refreshing every 15 seconds
        </div>
      )}

      <div className="flex gap-1 p-1 bg-chrome-900 rounded-lg mb-5 overflow-x-auto">
        {visibleTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 min-w-fit text-sm font-semibold py-1.5 px-3 rounded-md transition-colors whitespace-nowrap ${
              tab === t.key ? 'bg-chrome-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info'     && <InfoTab tournament={data.tournament} teams={data.teams} />}
      {tab === 'pools'    && <PoolsTab tournamentId={tournamentId} pools={pools} />}
      {tab === 'bracket'  && <BracketTab rounds={data.rounds} />}
      {tab === 'schedule' && <ScheduleTab games={bracketGames} />}
    </div>
  );
}

// ── Info Tab ──────────────────────────────────────────────────────────────────
function InfoTab({ tournament: t, teams }) {
  const activeTeams = (teams || []).filter(tm => tm.registration_status !== 'withdrawn');
  return (
    <div className="space-y-5">
      <div className="bg-chrome-800/60 border border-chrome-700/50 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {(t.start_date || t.end_date) && (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Dates</p>
              <p className="text-gray-200">
                {formatDate(t.start_date)}
                {t.start_date && t.end_date && t.start_date !== t.end_date && ` — ${formatDate(t.end_date)}`}
              </p>
            </div>
          )}
          {t.format && (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Format</p>
              <p className="text-gray-200">{FORMAT_LABELS[t.format] || t.format}</p>
            </div>
          )}
          {t.entry_fee != null && Number(t.entry_fee) > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Entry Fee</p>
              <p className="text-gray-200">${Number(t.entry_fee).toFixed(2)}</p>
            </div>
          )}
          {t.registration_deadline && (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Deadline</p>
              <p className="text-gray-200">{formatDate(t.registration_deadline)}</p>
            </div>
          )}
        </div>
        {t.location_notes && <p className="text-gray-300 text-sm">📍 {t.location_notes}</p>}
        {t.description    && <p className="text-gray-300 text-sm">{t.description}</p>}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs bg-chrome-700/50 text-gray-300 px-2 py-1 rounded-md">
            {activeTeams.length}/{t.team_count} teams
          </span>
          {t.registration_open ? (
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md">
              Registration Open
            </span>
          ) : (
            <span className="text-xs text-gray-500 bg-chrome-700/50 px-2 py-1 rounded-md">Registration Closed</span>
          )}
        </div>
      </div>

      {activeTeams.length > 0 && (
        <div className="bg-chrome-800/60 border border-chrome-700/50 rounded-xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            Teams Registered ({activeTeams.length})
          </h2>
          <div className="space-y-2">
            {activeTeams.map(team => (
              <div key={team.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-chrome-700/30 last:border-0">
                <TeamLogo src={team.logo} name={team.name} size="w-6 h-6"
                  primaryColor={team.primary_color} secondaryColor={team.secondary_color} />
                <span className="text-gray-200 flex-1">{team.name}</span>
                {team.seed != null && <span className="text-xs text-gray-600">#{team.seed}</span>}
                {team.registration_status === 'waitlisted' && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                    Waitlisted
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pool Standings Tab ────────────────────────────────────────────────────────
function PoolsTab({ tournamentId, pools }) {
  return (
    <div className="space-y-5">
      {pools.map(pool => (
        <PoolCard key={pool.id} tournamentId={tournamentId} pool={pool} />
      ))}
    </div>
  );
}

function PoolCard({ tournamentId, pool }) {
  const [standings, setStandings] = useState([]);
  const [totals, setTotals]       = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchPoolStandings(tournamentId, pool.id);
      setStandings(d.standings || []);
      setTotals(d.totals || null);
    } catch { /* ignore */ }
  }, [tournamentId, pool.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="bg-chrome-800/60 border border-chrome-700/50 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-chrome-900/60 border-b border-chrome-700/40">
        <h3 className="font-semibold text-white text-sm">{pool.name}</h3>
        {totals && (
          <span className="text-xs text-gray-500">
            {totals.completed_games}/{totals.matches} games
          </span>
        )}
      </div>

      {standings.length === 0 ? (
        <p className="text-gray-500 text-sm p-4">No results yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-500 uppercase tracking-wider bg-chrome-900/40">
                <th className="py-2 px-3 text-left w-7">#</th>
                <th className="py-2 px-3 text-left">Team</th>
                <th className="py-2 px-3 text-right">W</th>
                <th className="py-2 px-3 text-right">L</th>
                <th className="py-2 px-3 text-right">T</th>
                <th className="py-2 px-3 text-right">RF</th>
                <th className="py-2 px-3 text-right">RA</th>
                <th className="py-2 px-3 text-right">RD</th>
                <th className="py-2 px-3 text-right font-bold">Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, idx) => (
                <tr key={row.tournament_team_id}
                  className={`border-t border-chrome-700/30 ${idx === 0 ? 'text-white' : 'text-gray-300'}`}>
                  <td className="py-2.5 px-3 text-gray-500 text-xs">{row.rank}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <TeamLogo src={row.logo} name={row.name} size="w-5 h-5"
                        primaryColor={row.primary_color} secondaryColor={row.secondary_color} />
                      <span className="whitespace-nowrap">{row.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right">{row.wins}</td>
                  <td className="py-2.5 px-3 text-right">{row.losses}</td>
                  <td className="py-2.5 px-3 text-right">{row.ties}</td>
                  <td className="py-2.5 px-3 text-right">{row.runs_for}</td>
                  <td className="py-2.5 px-3 text-right">{row.runs_against}</td>
                  <td className="py-2.5 px-3 text-right">
                    <span className={row.run_diff > 0 ? 'text-emerald-400' : row.run_diff < 0 ? 'text-red-400' : ''}>
                      {row.run_diff > 0 ? `+${row.run_diff}` : row.run_diff}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Bracket Tab ───────────────────────────────────────────────────────────────
function BracketTab({ rounds }) {
  return (
    <div className="space-y-6 pb-4">
      {(rounds || []).map(round => (
        <div key={round.id}>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">{round.title}</h3>
            {round.round_type === 'losers' && (
              <span className="text-[10px] text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded-full">Consolation</span>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {round.matches.filter(m => !m.is_bye).map(match => (
              <LiveMatchCard key={match.id} match={match} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LiveMatchCard({ match }) {
  const [live, setLive] = useState(null);
  const gameId = match.game?.id;

  const load = useCallback(async () => {
    if (!gameId) return;
    try { setLive(await fetchGame(gameId)); } catch { /* ignore */ }
  }, [gameId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!gameId) return;
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load, gameId]);

  const status = live?.status ?? match.game?.status ?? 'unscheduled';
  const hs = live?.home_score ?? null;
  const as_ = live?.away_score ?? null;
  const isScored = hs != null && as_ != null;
  const teamA = match.teams[0];
  const teamB = match.teams[1];

  return (
    <div className="bg-chrome-800/60 border border-chrome-700/40 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span>
          {(live?.game_date || match.game?.game_date) && formatDate(live?.game_date || match.game?.game_date)}
          {(live?.game_time || match.game?.game_time) && ` · ${formatTime(live?.game_time || match.game?.game_time)}`}
          {(live?.location_name || match.game?.location_name) && (
            <span className="ml-1">· {live?.location_name || match.game?.location_name}</span>
          )}
        </span>
        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${GAME_STATUS_STYLE[status] || GAME_STATUS_STYLE.unscheduled}`}>
          {GAME_STATUS_LABEL[status] || status}
        </span>
      </div>

      {[{ team: teamA, score: hs }, { team: teamB, score: as_ }].map(({ team, score }, i) => {
        const opp = i === 0 ? as_ : hs;
        const wins = isScored && score != null && score > opp;
        return (
          <div key={i} className={`flex items-center gap-2 ${wins ? 'text-white' : 'text-gray-400'}`}>
            {team ? (
              <>
                <TeamLogo src={team.logo} name={team.name} size="w-6 h-6"
                  primaryColor={team.primary_color} secondaryColor={team.secondary_color} />
                <span className={`flex-1 text-sm truncate ${wins ? 'font-bold' : ''}`}>{team.name}</span>
                {team.seed != null && <span className="text-[10px] text-gray-600 shrink-0">#{team.seed}</span>}
              </>
            ) : (
              <span className="flex-1 text-sm text-gray-600 italic">TBD</span>
            )}
            {isScored && score != null && (
              <span className={`text-base font-bold w-6 text-right shrink-0 ${wins ? 'text-white' : ''}`}>{score}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Schedule Tab ──────────────────────────────────────────────────────────────
function ScheduleTab({ games }) {
  const sorted = [...games].sort((a, b) => {
    if (!a.game_date && !b.game_date) return 0;
    if (!a.game_date) return 1;
    if (!b.game_date) return -1;
    return a.game_date.localeCompare(b.game_date) || (a.game_time || '').localeCompare(b.game_time || '');
  });

  if (!sorted.length) {
    return <p className="text-gray-500 text-sm py-8 text-center">No games scheduled yet.</p>;
  }

  const byDate = {};
  for (const g of sorted) {
    const key = g.game_date || 'TBD';
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(g);
  }

  return (
    <div className="space-y-5">
      {Object.entries(byDate).map(([date, gms]) => (
        <div key={date}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
            {date === 'TBD' ? 'Date TBD' : formatDate(date)}
          </h3>
          <div className="space-y-2">
            {gms.map((g, i) => (
              <ScheduleGameRow key={i} game={g} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScheduleGameRow({ game }) {
  const [live, setLive] = useState(null);

  const load = useCallback(async () => {
    if (!game.id) return;
    try { setLive(await fetchGame(game.id)); } catch { /* ignore */ }
  }, [game.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!game.id) return;
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load, game.id]);

  const status = live?.status ?? game.status ?? 'unscheduled';
  const hs   = live?.home_score ?? null;
  const as_  = live?.away_score ?? null;
  const scored = hs != null && as_ != null;

  return (
    <div className="bg-chrome-800/60 border border-chrome-700/40 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2 text-[11px] text-gray-500">
        <span>
          {game.round_name && <span className="mr-2 text-gray-600">{game.round_name}</span>}
          {(live?.game_time || game.game_time) && formatTime(live?.game_time || game.game_time)}
        </span>
        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${GAME_STATUS_STYLE[status] || GAME_STATUS_STYLE.unscheduled}`}>
          {GAME_STATUS_LABEL[status] || status}
        </span>
      </div>

      <div className="space-y-1.5">
        {[{ team: game.team_a, score: hs, opp: as_ }, { team: game.team_b, score: as_, opp: hs }].map(({ team, score, opp }, i) => {
          const wins = scored && score != null && score > opp;
          return (
            <div key={i} className={`flex items-center gap-2 ${wins ? 'text-white' : 'text-gray-400'}`}>
              {team ? (
                <>
                  <TeamLogo src={team.logo} name={team.name} size="w-5 h-5"
                    primaryColor={team.primary_color} secondaryColor={team.secondary_color} />
                  <span className={`flex-1 text-sm truncate ${wins ? 'font-semibold' : ''}`}>{team.name}</span>
                </>
              ) : (
                <span className="flex-1 text-sm text-gray-600 italic">TBD</span>
              )}
              {scored && score != null && (
                <span className={`text-sm font-bold w-5 text-right ${wins ? 'text-white' : ''}`}>{score}</span>
              )}
            </div>
          );
        })}
      </div>

      {(live?.location_name || game.location_name) && (
        <p className="text-[10px] text-gray-600 mt-1.5 truncate">
          📍 {live?.location_name || game.location_name}
        </p>
      )}
    </div>
  );
}
