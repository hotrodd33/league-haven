import { useState, useEffect, useCallback } from 'react';
import { fetchOfficialDetail, fetchOfficialGames, updateOfficialGamePayment } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';

const btnSecondary = 'px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600 transition-colors';
const STATUS_COLORS = {
  scheduled:   'bg-blue-900/40 text-blue-200',
  in_progress: 'bg-amber-900/40 text-amber-200',
  completed:   'bg-green-900/40 text-green-300',
  cancelled:   'bg-red-900/40 text-red-300',
  postponed:   'bg-gray-700 text-gray-300',
};
const STATUS_LABELS = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Final',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
};

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
  const { isSuperAdmin, canEditOrg } = useAuth();
  const [official, setOfficial] = useState(null);
  const [gamesData, setGamesData] = useState({ games: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingGame, setUpdatingGame] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [off, gd] = await Promise.all([
        fetchOfficialDetail(officialId),
        fetchOfficialGames(officialId),
      ]);
      setOfficial(off);
      setGamesData(gd);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [officialId]);

  useEffect(() => { loadData(); }, [loadData]);

  const canEdit = official
    ? (isSuperAdmin || (official.org_id && canEditOrg(official.org_id)))
    : false;

  async function handleTogglePaid(game) {
    setUpdatingGame(game.game_id);
    try {
      await updateOfficialGamePayment(officialId, game.game_id, {
        is_paid: !game.is_paid,
      });
      // Refresh data
      const gd = await fetchOfficialGames(officialId);
      setGamesData(gd);
    } catch (err) {
      alert(`Failed to update: ${err.message}`);
    } finally {
      setUpdatingGame(null);
    }
  }

  async function handleFeeChange(game, newFee) {
    setUpdatingGame(game.game_id);
    try {
      await updateOfficialGamePayment(officialId, game.game_id, {
        game_fee: newFee,
      });
      const gd = await fetchOfficialGames(officialId);
      setGamesData(gd);
    } catch (err) {
      alert(`Failed to update fee: ${err.message}`);
    } finally {
      setUpdatingGame(null);
    }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading official…</div>;
  if (error) return <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">Error: {error}</div>;
  if (!official) return <div className="py-8 text-center text-gray-400">Official not found</div>;

  const { games, summary } = gamesData;

  return (
    <div>
      {/* Back button */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className={btnSecondary}>← Back to Officials</button>
      </div>

      {/* Profile card */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 sm:p-6 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h1 className="text-xl font-heading font-bold text-white">{official.name}</h1>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${official.org_id ? 'bg-blue-900/40 text-blue-200' : 'bg-purple-900/35 text-purple-200'}`}>
                {official.org_id ? official.org_name || 'Organization' : 'League'}
              </span>
              {official.is_certified && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-900/35 text-green-300">Certified</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm text-gray-300">
              {official.email && <div><span className="text-gray-400">Email:</span> {official.email}</div>}
              {official.phone && <div><span className="text-gray-400">Phone:</span> {official.phone}</div>}
              {official.venmo_id && <div><span className="text-gray-400">Venmo:</span> {official.venmo_id}</div>}
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
          <div className="shrink-0 text-right">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Default Rate</div>
            <div className="text-2xl font-bold text-green-400">{formatMoney(official.rate_per_game)}</div>
            <div className="text-xs text-gray-400">per game</div>
          </div>
        </div>
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Earnings</div>
          <div className="text-2xl font-bold text-gray-100">{formatMoney(summary.total_earnings)}</div>
          <div className="text-xs text-gray-400 mt-0.5">{summary.completed_games} finalized game{summary.completed_games !== 1 ? 's' : ''}</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Payments</div>
          <div className="text-2xl font-bold text-green-400">{formatMoney(summary.total_payments)}</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Due</div>
          <div className={`text-2xl font-bold ${summary.total_due > 0 ? 'text-amber-400' : 'text-gray-400'}`}>{formatMoney(summary.total_due)}</div>
          <div className="text-xs text-gray-400 mt-0.5">finalized & unpaid</div>
        </div>
      </div>

      {/* Games list */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 sm:p-6">
        <h2 className="text-base font-heading font-bold text-white uppercase tracking-wide mb-3">
          Assigned Games ({games.length})
        </h2>
        {games.length === 0 ? (
          <div className="py-8 text-center text-gray-400">No games assigned to this official.</div>
        ) : (
          <div className="space-y-2">
            {games.map((game) => (
              <GameRow
                key={game.game_id}
                game={game}
                canEdit={canEdit}
                updating={updatingGame === game.game_id}
                onTogglePaid={() => handleTogglePaid(game)}
                onFeeChange={(fee) => handleFeeChange(game, fee)}
                defaultRate={summary.default_rate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GameRow({ game, canEdit, updating, onTogglePaid, onFeeChange, defaultRate }) {
  const [editingFee, setEditingFee] = useState(false);
  const [feeValue, setFeeValue] = useState(String(game.game_fee));

  function handleFeeSubmit(e) {
    e.preventDefault();
    const num = parseFloat(feeValue);
    if (!Number.isFinite(num) || num < 0) return;
    setEditingFee(false);
    onFeeChange(num);
  }

  const isFinalized = game.status === 'completed';

  return (
    <div className={`rounded-lg border p-3 ${isFinalized ? 'border-gray-600 bg-gray-750' : 'border-gray-700 bg-gray-800/50'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        {/* Game info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-medium text-gray-200">
              {game.home_team_name} vs {game.away_team_name}
            </span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[game.status] || 'bg-gray-700 text-gray-300'}`}>
              {STATUS_LABELS[game.status] || game.status}
            </span>
          </div>
          <div className="text-xs text-gray-400">
            {formatDate(game.game_date)}
            {game.game_time ? ` · ${formatTime(game.game_time)}` : ''}
            {game.location_name ? ` · ${game.location_name}` : ''}
            {game.season_name ? ` · ${game.season_name}` : ''}
          </div>
          {isFinalized && game.home_score != null && (
            <div className="text-xs text-gray-400 mt-0.5">
              Score: {game.home_score} – {game.away_score}
              {game.innings_played ? ` (${game.innings_played} inn)` : ''}
            </div>
          )}
        </div>

        {/* Fee */}
        <div className="shrink-0 flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Fee</div>
            {editingFee && canEdit ? (
              <form onSubmit={handleFeeSubmit} className="flex items-center gap-1">
                <span className="text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={feeValue}
                  onChange={(e) => setFeeValue(e.target.value)}
                  onBlur={() => setEditingFee(false)}
                  autoFocus
                  className="w-20 px-1.5 py-0.5 bg-gray-900 border border-gray-600 rounded text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </form>
            ) : (
              <button
                onClick={() => { if (canEdit) { setFeeValue(String(game.game_fee)); setEditingFee(true); } }}
                className={`text-sm font-semibold tabular-nums ${canEdit ? 'text-gray-100 hover:text-blue-300 cursor-pointer' : 'text-gray-100 cursor-default'}`}
                title={canEdit ? 'Click to edit fee' : undefined}
                disabled={!canEdit}
              >
                {formatMoney(game.game_fee)}
                {game.game_fee !== defaultRate && (
                  <span className="text-[10px] text-amber-400 ml-1" title="Custom rate">✱</span>
                )}
              </button>
            )}
          </div>

          {/* Paid checkbox */}
          <div className="flex flex-col items-center">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Paid</div>
            <label className="relative inline-flex items-center cursor-pointer mt-0.5">
              <input
                type="checkbox"
                checked={game.is_paid}
                onChange={onTogglePaid}
                disabled={!canEdit || updating}
                className="w-4 h-4 rounded bg-gray-700 border-gray-500 accent-green-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>
            {game.is_paid && game.paid_at && (
              <div className="text-[9px] text-gray-400 mt-0.5">
                {new Date(game.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
