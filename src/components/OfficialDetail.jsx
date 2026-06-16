import { useState, useEffect, useCallback } from 'react';
import { fetchOfficialDetail, fetchOfficialGames, updateOfficialGamePayment, fetchOfficialInterestedGames, assignOfficialToGame, unassignOfficialFromGame } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Badge, Card, CardBody } from './ui';

const STATUS_COLORS = {
  scheduled:   'info',
  in_progress: 'warning',
  completed:   'success',
  cancelled:   'danger',
  postponed:   'neutral',
};
const STATUS_LABELS = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Final',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
};

const TABS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'interested', label: 'Interested' },
];

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatMoney(val) {
  return `$${Number(val || 0).toFixed(2)}`;
}

export default function OfficialDetail({ officialId, onBack }) {
  const { isSuperAdmin, isAccountant, isOrgAdmin, canEditOrg } = useAuth();
  const canViewFinancials = isSuperAdmin || isAccountant || isOrgAdmin;
  const [official, setOfficial] = useState(null);
  const [gamesData, setGamesData] = useState({ games: [], summary: {} });
  const [interestedGames, setInterestedGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingGame, setUpdatingGame] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [off, gd, ig] = await Promise.all([
        fetchOfficialDetail(officialId),
        fetchOfficialGames(officialId),
        fetchOfficialInterestedGames(officialId).catch(() => []),
      ]);
      setOfficial(off);
      setGamesData(gd);
      setInterestedGames(ig);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [officialId]);

  useEffect(() => { loadData(); }, [loadData]);

  const canEdit = official
    ? (isSuperAdmin || (official.org_ids?.length && official.org_ids.some(oid => canEditOrg(oid))))
    : false;

  // Optimistic patch: flip a single game's fields locally, then PUT, then reconcile.
  async function patchGame(game, fields) {
    setUpdatingGame(game.game_id);
    setGamesData(prev => ({
      ...prev,
      games: (prev.games || []).map(g =>
        g.game_id === game.game_id ? { ...g, ...fields } : g
      ),
    }));
    try {
      const resp = await updateOfficialGamePayment(officialId, game.game_id, fields);
      if (resp?.assignment) {
        const a = resp.assignment;
        setGamesData(prev => ({
          ...prev,
          games: (prev.games || []).map(g =>
            g.game_id === a.game_id
              ? { ...g,
                  game_fee: a.game_fee != null ? Number(a.game_fee) : g.game_fee,
                  is_paid: !!a.is_paid,
                  paid_at: a.paid_at,
                  no_show: !!a.no_show,
                  effective_fee: a.game_fee != null ? Number(a.game_fee) : g.effective_fee,
                }
              : g
          ),
        }));
      }
      // Refresh summary totals (default rate, total earned/paid/due) from authoritative source.
      const gd = await fetchOfficialGames(officialId);
      setGamesData(gd);
    } catch (err) {
      // Roll back optimistic update on failure.
      const gd = await fetchOfficialGames(officialId).catch(() => null);
      if (gd) setGamesData(gd);
      alert(`Failed to update: ${err.message}`);
    } finally {
      setUpdatingGame(null);
    }
  }

  function handleTogglePaid(game) {
    return patchGame(game, { is_paid: !game.is_paid });
  }

  function handleToggleNoShow(game) {
    return patchGame(game, { no_show: !game.no_show });
  }

  function handleFeeChange(game, newFee) {
    return patchGame(game, { game_fee: newFee });
  }

  async function handleAssign(gameId) {
    setUpdatingGame(gameId);
    try {
      await assignOfficialToGame(officialId, gameId);
      const [gd, ig] = await Promise.all([
        fetchOfficialGames(officialId),
        fetchOfficialInterestedGames(officialId).catch(() => []),
      ]);
      setGamesData(gd);
      setInterestedGames(ig);
    } catch (err) {
      alert(`Failed to assign: ${err.message}`);
    } finally {
      setUpdatingGame(null);
    }
  }

  async function handleUnassign(game) {
    if (!confirm(`Unassign from ${game.home_team_name} vs ${game.away_team_name}?`)) return;
    setUpdatingGame(game.game_id);
    try {
      await unassignOfficialFromGame(officialId, game.game_id);
      const [gd, ig] = await Promise.all([
        fetchOfficialGames(officialId),
        fetchOfficialInterestedGames(officialId).catch(() => []),
      ]);
      setGamesData(gd);
      setInterestedGames(ig);
    } catch (err) {
      alert(`Failed to unassign: ${err.message}`);
    } finally {
      setUpdatingGame(null);
    }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading official…</div>;
  if (error) return <div className="lh-alert lh-alert-error">Error: {error}</div>;
  if (!official) return <div className="py-8 text-center text-gray-400">Official not found</div>;

  const { games, summary } = gamesData;
  // Owed math (and Completed tab) follows server's is_owed_complete: past or completed AND not cancelled.
  // Cancelled games still appear in the Completed tab so history is preserved, but contribute $0.
  const completedGames = games.filter(g => g.is_owed_complete || g.status === 'cancelled');
  const upcomingGames = games.filter(g => !g.is_owed_complete && g.status !== 'cancelled');

  const tabCounts = {
    upcoming: upcomingGames.length,
    completed: completedGames.length,
    interested: interestedGames.length,
  };

  return (
    <div>
      {/* Back button */}
      <div className="flex items-center gap-2 mb-4">
        <Button variant="secondary" onClick={onBack}>← Back to Officials</Button>
      </div>

      {/* Profile card */}
      <Card variant="bordered" className="mb-4">
        <CardBody className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h1 className="text-xl font-display font-bold text-white">{official.name}</h1>
              {official.org_ids?.length ? official.org_names.map((name, i) => (
                <Badge key={official.org_ids[i]} variant="info">{name}</Badge>
              )) : (
                <Badge variant="info">League</Badge>
              )}
              {official.is_certified && (
                <Badge variant="success">Certified</Badge>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm text-gray-300">
              {official.email && <div><span className="text-gray-400">Email:</span> {official.email}</div>}
              {official.phone && <div><span className="text-gray-400">Phone:</span> {official.phone}</div>}
              {official.venmo_id && canViewFinancials && <div><span className="text-gray-400">Venmo:</span> {official.venmo_id}</div>}
              {official.years_of_experience != null && <div><span className="text-gray-400">Experience:</span> {official.years_of_experience} yr{official.years_of_experience !== 1 ? 's' : ''}</div>}
              {(official.address || official.city || official.state || official.zip) && (
                <div className="sm:col-span-2"><span className="text-gray-400">Address:</span> {[official.address, official.city, official.state, official.zip].filter(Boolean).join(', ')}</div>
              )}
              {official.linked_username && (
                <div><span className="text-gray-400">User:</span> @{official.linked_username}</div>
              )}
              {official.date_of_birth && (
                <div><span className="text-gray-400">DOB:</span> {formatDate(official.date_of_birth)}</div>
              )}
            </div>
            {official.notes && <div className="text-sm text-gray-400 italic mt-2">{official.notes}</div>}
          </div>
          {canViewFinancials && (
            <div className="shrink-0 text-right">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Default Rate</div>
              <div className="text-2xl font-bold text-action-400">{official.rate_per_game != null ? formatMoney(official.rate_per_game) : 'Level Rate'}</div>
              <div className="text-xs text-gray-400">per game</div>
            </div>
          )}
        </div>
      </CardBody>
      </Card>
      {/* Financial summary */}
      {canViewFinancials && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Card variant="bordered">
            <CardBody className="text-center">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Earnings</div>
            <div className="text-2xl font-bold text-gray-100">{formatMoney(summary.total_earnings)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{summary.completed_games} finalized game{summary.completed_games !== 1 ? 's' : ''}</div>
          </CardBody>
          </Card>
          <Card variant="bordered">
            <CardBody className="text-center">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Payments</div>
            <div className="text-2xl font-bold text-action-400">{formatMoney(summary.total_payments)}</div>
          </CardBody>
          </Card>
          <Card variant="bordered">
            <CardBody className="text-center">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Due</div>
            <div className={`text-2xl font-bold ${summary.total_due > 0 ? 'text-amber-400' : 'text-gray-400'}`}>{formatMoney(summary.total_due)}</div>
            <div className="text-xs text-gray-400 mt-0.5">finalized & unpaid</div>
          </CardBody>
          </Card>
        </div>
      )}

      {/* Games tabs */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 sm:p-6">
        {/* Tab bar */}
        <div className="flex border-b border-gray-700 mb-4 -mt-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-display font-bold uppercase tracking-wide whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-chrome-500 text-chrome-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
              <Badge variant={activeTab === tab.key ? 'info' : 'neutral'} className="ml-1.5">
                {tabCounts[tab.key]}
              </Badge>
            </button>
          ))}
        </div>

        {/* Upcoming tab */}
        {activeTab === 'upcoming' && (
          <GamesTable
            games={upcomingGames}
            canEdit={canEdit}
            canViewFinancials={canViewFinancials}
            updatingGame={updatingGame}
            onTogglePaid={handleTogglePaid}
            onToggleNoShow={handleToggleNoShow}
            onFeeChange={handleFeeChange}
            onUnassign={handleUnassign}
            defaultRate={summary.default_rate}
            emptyText="No upcoming games."
          />
        )}

        {/* Completed tab */}
        {activeTab === 'completed' && (
          <GamesTable
            games={completedGames}
            canEdit={canEdit}
            canViewFinancials={canViewFinancials}
            updatingGame={updatingGame}
            onTogglePaid={handleTogglePaid}
            onToggleNoShow={handleToggleNoShow}
            onFeeChange={handleFeeChange}
            defaultRate={summary.default_rate}
            emptyText="No completed games."
            isCompleted
          />
        )}

        {/* Interested tab */}
        {activeTab === 'interested' && (
          interestedGames.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No interested games.</div>
          ) : (
            <div className="border border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800 text-gray-300">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Game</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    {canEdit && <th className="px-3 py-2 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {interestedGames.map((game) => (
                    <tr key={game.game_id} className="border-t border-gray-700">
                      <td className="px-3 py-2 text-gray-200 whitespace-nowrap">
                        {formatDate(game.game_date)}
                        <div className="text-xs text-gray-400">{formatTime(game.game_time)}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-200">
                        <div>{game.away_team_name} @ {game.home_team_name}</div>
                        <div className="text-xs text-gray-400">
                          {game.location_name && <span>{game.location_name}</span>}
                          {game.season_name && <span> · {game.season_name}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Badge variant={STATUS_COLORS[game.status] || 'neutral'}>
                            {STATUS_LABELS[game.status] || game.status}
                          </Badge>
                          {game.home_age_group && <Badge variant="info">{game.home_age_group}</Badge>}
                          <Badge variant="neutral">{game.assigned_count} assigned</Badge>
                        </div>
                      </td>
                      {canEdit && (
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="xs"
                            onClick={() => handleAssign(game.game_id)}
                            disabled={updatingGame === game.game_id}
                            loading={updatingGame === game.game_id}
                          >
                            {updatingGame === game.game_id ? 'Assigning…' : 'Assign'}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// Shared table for upcoming + completed games
function GamesTable({ games, canEdit, canViewFinancials, updatingGame, onTogglePaid, onToggleNoShow, onFeeChange, onUnassign, defaultRate, emptyText, isCompleted }) {
  if (games.length === 0) {
    return <div className="py-12 text-center text-gray-400">{emptyText}</div>;
  }
  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-800 text-gray-300">
          <tr>
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">Game</th>
            {canViewFinancials && <th className="px-3 py-2 text-right">Fee</th>}
            <th className="px-3 py-2 text-center">Status</th>
            {canEdit && <th className="px-3 py-2 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {games.map((game) => (
            <OfficialGameRow
              key={game.game_id}
              game={game}
              canEdit={canEdit}
              canViewFinancials={canViewFinancials}
              busy={updatingGame === game.game_id}
              onTogglePaid={() => onTogglePaid(game)}
              onToggleNoShow={() => onToggleNoShow && onToggleNoShow(game)}
              onFeeChange={(fee) => onFeeChange(game, fee)}
              onUnassign={onUnassign ? () => onUnassign(game) : null}
              defaultRate={defaultRate}
              isCompleted={isCompleted}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OfficialGameRow({ game, canEdit, canViewFinancials, busy, onTogglePaid, onToggleNoShow, onFeeChange, onUnassign, defaultRate, isCompleted }) {
  const [editingFee, setEditingFee] = useState(false);
  const [feeValue, setFeeValue] = useState(String(game.game_fee));

  function handleFeeSubmit(e) {
    e.preventDefault();
    const num = parseFloat(feeValue);
    if (!Number.isFinite(num) || num < 0) { setEditingFee(false); return; }
    setEditingFee(false);
    if (num !== Number(game.game_fee)) onFeeChange(num);
  }

  const isFinalized = isCompleted || game.status === 'completed';

  return (
    <tr className="border-t border-gray-700">
      <td className="px-3 py-2 text-gray-200 whitespace-nowrap">
        {formatDate(game.game_date)}
        <div className="text-xs text-gray-400">{formatTime(game.game_time)}</div>
      </td>
      <td className="px-3 py-2 text-gray-200">
        <div>{game.away_team_name} @ {game.home_team_name}</div>
        <div className="text-xs text-gray-400">
          {game.location_name && <span>{game.location_name}</span>}
          {game.season_name && <span> · {game.season_name}</span>}
        </div>
        {isFinalized && game.home_score != null && (
          <div className="text-xs text-gray-400 mt-0.5">
            Score: {game.home_score}–{game.away_score}
            {game.innings_played ? ` (${game.innings_played} inn)` : ''}
          </div>
        )}
      </td>
      {canViewFinancials && (
        <td className="px-3 py-2 text-right text-emerald-300 font-mono">
          {editingFee && canEdit ? (
            <form onSubmit={handleFeeSubmit} className="inline-flex items-center gap-1 justify-end">
              <span className="text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={feeValue}
                onChange={(e) => setFeeValue(e.target.value)}
                onBlur={handleFeeSubmit}
                autoFocus
                className="w-20 px-1.5 py-0.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-action-500"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => { if (canEdit && !game.no_show) { setFeeValue(String(game.game_fee)); setEditingFee(true); } }}
              className={
                game.no_show
                  ? 'text-signal-400 line-through cursor-default'
                  : canEdit ? 'text-emerald-300 hover:text-chrome-300 cursor-pointer' : 'text-emerald-300 cursor-default'
              }
              title={game.no_show ? 'No show — no payment' : canEdit ? 'Click to edit fee' : undefined}
              disabled={!canEdit || game.no_show}
            >
              {formatMoney(game.game_fee)}
              {!game.no_show && defaultRate != null && Number(game.game_fee) !== Number(defaultRate) && (
                <span className="text-[10px] text-amber-400 ml-1" title="Custom rate">✱</span>
              )}
            </button>
          )}
        </td>
      )}
      <td className="px-3 py-2 text-center">
        <div className="flex flex-col items-center gap-1">
          <Badge variant={STATUS_COLORS[game.status] || 'neutral'}>
            {STATUS_LABELS[game.status] || game.status}
          </Badge>
          {game.no_show && <Badge variant="danger">No Show</Badge>}
          {game.is_paid && <Badge variant="success">Paid</Badge>}
        </div>
      </td>
      {canEdit && (
        <td className="px-3 py-2 text-right space-y-1 whitespace-nowrap">
          {isFinalized ? (
            <>
              <Button size="xs" variant={game.is_paid ? 'secondary' : 'primary'} onClick={onTogglePaid} disabled={busy || game.no_show}>
                {game.is_paid ? 'Mark Unpaid' : 'Mark Paid'}
              </Button>{' '}
              <Button size="xs" variant={game.no_show ? 'secondary' : 'danger'} onClick={onToggleNoShow} disabled={busy}>
                {game.no_show ? 'Clear No-Show' : 'No-Show'}
              </Button>
            </>
          ) : (
            onUnassign && (
              <Button size="xs" variant="danger" onClick={onUnassign} disabled={busy}>
                Remove
              </Button>
            )
          )}
        </td>
      )}
    </tr>
  );
}

