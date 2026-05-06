// This is supposed to mimic GameSchedule.jsx and GameDetail.jsx. Its currently separate because of temporary teams, 
// This can be replaced in the future depending on whats easiest.

import { useState, useEffect, useCallback } from 'react';
import {
  fetchTournamentGame, updateTournamentGame,
  fetchLocations, fetchWeather, fetchWeatherForecast,
} from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import TeamLogo from '../TeamLogo.jsx';
import { Button, Input, Modal } from '../ui/index.js';
import { DARK_STATUS_COLORS } from '../../constants/statusClasses.js';

const STATUS_COLORS = DARK_STATUS_COLORS;

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Final' },
  { value: 'cancelled', label: 'Cancelled' },
];

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Tournament Game Detail — mirrors the look/feel of GameDetail but works
 * with tournament_games data. Gracefully handles temp teams by hiding
 * sections that require real team data.
 */
export default function TournamentGameDetail({ tournamentId, gameId, canManage, onBack, onNavigateToTeam, onNavigateToFields }) {
  const { isAdmin } = useAuth();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Score form
  const [scoreForm, setScoreForm] = useState({ home_score: '', away_score: '' });
  const [editingScore, setEditingScore] = useState(false);

  // Schedule form
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [schedForm, setSchedForm] = useState({ game_date: '', game_time: '', location_id: '', notes: '' });
  const [locations, setLocations] = useState([]);

  // Status
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusValue, setStatusValue] = useState('');

  // Weather
  const [weather, setWeather] = useState(null);

  const loadGame = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const g = await fetchTournamentGame(tournamentId, gameId);
      setGame(g);
      setScoreForm({
        home_score: g.home_score ?? '',
        away_score: g.away_score ?? '',
      });
      setSchedForm({
        game_date: g.game_date || '',
        game_time: g.game_time?.slice(0, 5) || '',
        location_id: g.location_id || '',
        notes: g.notes || '',
      });
      setStatusValue(g.status || 'pending');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [tournamentId, gameId]);

  useEffect(() => { loadGame(); }, [loadGame]);

  // Fetch locations for schedule form
  useEffect(() => {
    if (editingSchedule) {
      fetchLocations().then(setLocations).catch(() => setLocations([]));
    }
  }, [editingSchedule]);

  // Fetch weather
  useEffect(() => {
    if (!game?.location_lat || !game?.location_lon) return;
    if (game.status === 'cancelled') return;

    const todayStr = new Date().toISOString().slice(0, 10);
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 16);
    const maxDateStr = maxDate.toISOString().slice(0, 10);
    if (!game.game_date || game.game_date < todayStr || game.game_date > maxDateStr) return;

    const fetcher = (game.game_date === todayStr && !game.game_time)
      ? fetchWeather(game.location_lat, game.location_lon)
      : fetchWeatherForecast(game.location_lat, game.location_lon, game.game_date, game.game_time || null);

    fetcher.then(w => {
      if (w && !w.unavailable) setWeather(w);
    }).catch(() => { });
  }, [game?.location_lat, game?.location_lon, game?.game_date, game?.game_time, game?.status]);

  async function handleSaveScore(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const hs = scoreForm.home_score !== '' ? Number(scoreForm.home_score) : null;
      const as = scoreForm.away_score !== '' ? Number(scoreForm.away_score) : null;
      const data = {
        home_score: hs,
        away_score: as,
      };
      // Explicit status change required now
      await updateTournamentGame(tournamentId, gameId, data);
      setEditingScore(false);
      await loadGame();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleSaveGameForm(formData) {
    setSaving(true); setError(null);
    try {
      await updateTournamentGame(tournamentId, gameId, {
        game_date: formData.game_date || null,
        game_time: formData.game_time || null,
        location_id: formData.location_id || null,
        notes: formData.notes || null,
        status: formData.status || 'pending',
      });
      setEditingSchedule(false);
      await loadGame();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading game…</div>;
  if (!game) return <div className="py-8 text-center text-signal-400">Game not found</div>;

  const home = game.home_team;
  const away = game.away_team;
  const statusLabel = STATUS_OPTIONS.find(s => s.value === game.status)?.label || game.status;

  return (
    <div>
      {/* Back button + context */}
      <div className="flex items-center gap-2 mb-4">
        <Button variant="secondary" onClick={onBack}>← Back to Bracket</Button>
        {canManage && (
          <Button variant="secondary" onClick={() => setEditingSchedule(true)}>
            ✏️ Edit Game
          </Button>
        )}
        {game.round_name && (
          <span className="text-sm text-slate-400 ml-auto">
            {game.round_name} · Match #{game.match_number}
          </span>
        )}
      </div>

      {editingSchedule && (
        <TournamentGameForm
          game={game}
          locations={locations}
          onSave={handleSaveGameForm}
          onCancel={() => setEditingSchedule(false)}
          saving={saving}
        />
      )}

      {error && <div className="lh-alert lh-alert-error mb-4">{error}</div>}

      {/* Game header */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-gray-400">
            {formatDate(game.game_date)}{game.game_time ? ` · ${formatTime(game.game_time)}` : ''}
          </div>
          <div className="flex items-center gap-2">
            <span className={`lh-badge ${STATUS_COLORS[game.status] || 'bg-gray-800'}`}>
              {statusLabel}
            </span>
            {game.winner_team_id && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-semibold">
                Winner Advanced
              </span>
            )}
          </div>
        </div>

        {/* Matchup */}
        <div className="flex items-center justify-center gap-3 sm:gap-6 mb-3">
          {/* Home */}
          <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <TeamLogo
              src={home?.logo} name={home?.name || 'TBD'}
              ageGroup={home?.age_group} level={home?.level}
              cityAbbr={home?.city_abbr}
              primaryColor={home?.primary_color} secondaryColor={home?.secondary_color}
              size="w-12 h-12"
            />
            {home && !home.is_temp && onNavigateToTeam ? (
              <button
                onClick={() => onNavigateToTeam(home.team_id, home.org_id, false)}
                className="font-bold text-sm text-center truncate w-full text-action-300 hover:text-action-100 hover:underline"
              >
                {home.name}
              </button>
            ) : (
              <span className="font-bold text-sm text-center truncate w-full text-slate-200">
                {home?.name || 'TBD'}
              </span>
            )}
            <div className="w-12 h-1 rounded-full" style={{ background: home?.primary_color || '#ccc' }} />
            <span className="text-xs text-gray-400 uppercase">Home</span>
          </div>

          {/* Score */}
          <div className="text-center shrink-0 px-2">
            <div className="text-4xl sm:text-5xl font-extrabold tabular-nums text-white tracking-tight">
              {game.home_score ?? '—'} <span className="text-gray-500 mx-1">–</span> {game.away_score ?? '—'}
            </div>
          </div>

          {/* Away */}
          <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <TeamLogo
              src={away?.logo} name={away?.name || 'TBD'}
              ageGroup={away?.age_group} level={away?.level}
              cityAbbr={away?.city_abbr}
              primaryColor={away?.primary_color} secondaryColor={away?.secondary_color}
              size="w-12 h-12"
            />
            {away && !away.is_temp && onNavigateToTeam ? (
              <button
                onClick={() => onNavigateToTeam(away.team_id, away.org_id, false)}
                className="font-bold text-sm text-center truncate w-full text-action-300 hover:text-action-100 hover:underline"
              >
                {away.name}
              </button>
            ) : (
              <span className="font-bold text-sm text-center truncate w-full text-slate-200">
                {away?.name || 'TBD'}
              </span>
            )}
            <div className="w-12 h-1 rounded-full" style={{ background: away?.primary_color || '#ccc' }} />
            <span className="text-xs text-gray-400 uppercase">Away</span>
          </div>
        </div>

        {game.location_name && (
          <div className="text-xs text-gray-400 text-center">
            {onNavigateToFields ? (
              <button
                onClick={onNavigateToFields}
                className="hover:text-action-400 hover:underline cursor-pointer inline-flex items-center justify-center"
                title={`View ${game.location_name} in Fields Tab`}
              >
                📍 {game.location_name}{game.location_city ? `, ${game.location_city}` : ''}
              </button>
            ) : (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(game.location_name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-action-400 hover:underline cursor-pointer inline-flex items-center justify-center"
                title={`View ${game.location_name} on Map`}
              >
                📍 {game.location_name}{game.location_city ? `, ${game.location_city}` : ''}
              </a>
            )}
          </div>
        )}
        {game.notes && <div className="text-xs text-gray-400 italic text-center mt-1">{game.notes}</div>}
      </div>

      {/* Weather card */}
      {weather && (
        <div className={`border rounded-xl p-4 sm:p-5 mb-4 ${weather.playability?.rating === 'unplayable' ? 'bg-red-950/20 border-signal-500/30' :
          weather.playability?.rating === 'poor' ? 'bg-orange-950/15 border-orange-500/30' :
            'bg-gray-800 border-gray-700'
          }`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-display font-bold uppercase tracking-wide text-gray-100 flex items-center gap-2">
              {weather.icon} Game Day Weather
              {weather.isForecast && <span className="text-[10px] font-normal normal-case text-gray-500 italic">(forecast)</span>}
            </h3>
            {weather.playability && (
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${weather.playability.rating === 'good' ? 'bg-action-900/40 text-action-300' :
                weather.playability.rating === 'fair' ? 'bg-yellow-900/40 text-yellow-300' :
                  weather.playability.rating === 'poor' ? 'bg-orange-900/40 text-orange-300' :
                    'bg-signal-900/40 text-signal-300'
                }`}>{weather.playability.rating}</span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center p-2 bg-gray-900/50 rounded-lg">
              <div className="text-lg font-bold text-gray-100">{weather.temp}°F</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{weather.description}</div>
            </div>
            <div className="text-center p-2 bg-gray-900/50 rounded-lg">
              <div className="text-lg font-bold text-gray-100">
                {weather.precipitationProbability != null ? `${weather.precipitationProbability}%` : '—'}
              </div>
              <div className="text-[10px] text-gray-500">🌧️ Rain Chance</div>
            </div>
            <div className="text-center p-2 bg-gray-900/50 rounded-lg">
              <div className="text-lg font-bold text-gray-100">{weather.windSpeed}<span className="text-xs text-gray-400">mph</span></div>
              <div className="text-[10px] text-gray-500">💨 Wind</div>
            </div>
            <div className="text-center p-2 bg-gray-900/50 rounded-lg">
              <div className="text-lg font-bold text-gray-100">{weather.humidity != null ? `${weather.humidity}%` : '—'}</div>
              <div className="text-[10px] text-gray-500">💧 Humidity</div>
            </div>
          </div>
        </div>
      )}

      {/* Admin: Score reporting */}
      {canManage && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 sm:p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-display font-bold uppercase tracking-wide text-white">Report Score</h3>
            {!editingScore && (
              <button onClick={() => setEditingScore(true)} className="text-xs text-chrome-400 font-semibold hover:underline">Edit</button>
            )}
          </div>
          {editingScore ? (
            <form onSubmit={handleSaveScore} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label={`${home?.name || 'Home'} Score`} type="number" min="0" value={scoreForm.home_score}
                  onChange={(e) => setScoreForm(prev => ({ ...prev, home_score: e.target.value }))} placeholder="—" />
                <Input label={`${away?.name || 'Away'} Score`} type="number" min="0" value={scoreForm.away_score}
                  onChange={(e) => setScoreForm(prev => ({ ...prev, away_score: e.target.value }))} placeholder="—" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Score'}</Button>
                <Button variant="secondary" onClick={() => {
                  setEditingScore(false);
                  setScoreForm({ home_score: game.home_score ?? '', away_score: game.away_score ?? '' });
                }}>Cancel</Button>
              </div>
              <p className="text-xs text-slate-400">💡 Game status must be explicitly set to Final via "Edit Game" to lock the match and advance the winner.</p>
              {scoreForm.home_score !== '' && scoreForm.away_score !== '' && Number(scoreForm.home_score) === Number(scoreForm.away_score) && (
                <p className="text-xs text-yellow-400">⚠️ Ties are not allowed in elimination tournaments.</p>
              )}
            </form>
          ) : (
            <div className="text-sm text-gray-300">
              {game.home_score != null && game.away_score != null
                ? `${home?.name || 'Home'} ${game.home_score} — ${away?.name || 'Away'} ${game.away_score}`
                : 'No score reported yet. Click Edit to report the score.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tournament Game Form Modal ───────────────────────────────────────────────
function TournamentGameForm({ game, locations, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    game_date: game.game_date || '',
    game_time: game.game_time?.slice(0, 5) || '',
    location_id: game.location_id || '',
    notes: game.notes || '',
    status: game.status || 'pending',
  });

  function handleSubmit(e) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <Modal open onClose={onCancel} title="Edit Tournament Game" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Date" type="date" value={form.game_date} onChange={e => setForm({ ...form, game_date: e.target.value })} />
          <Input label="Time" type="time" value={form.game_time} onChange={e => setForm({ ...form, game_time: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="lh-eyebrow block mb-1">Location</label>
            <select value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })} className="lh-select w-full">
              <option value="">— Select Location —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.city ? ` (${l.city})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="lh-eyebrow block mb-1">Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="lh-select w-full">
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="lh-eyebrow block mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="lh-input w-full" placeholder="Optional notes..." />
        </div>
        <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-slate-700">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Game'}</Button>
        </div>
      </form>
    </Modal>
  );
}
