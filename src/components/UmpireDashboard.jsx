import { useState, useEffect, useCallback } from 'react';
import {
  fetchAssignedGames, fetchAvailableGames, fetchGameInterests,
  expressGameInterest, removeGameInterest, fetchSeasons, fetchUmpireProfile,
} from '../api/index.js';
import { DARK_BADGES } from '../constants/statusClasses.js';

const btnPrimary = "px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded hover:bg-green-700 transition-colors disabled:opacity-60";
const btnDanger = "px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 transition-colors disabled:opacity-60";
const badgeGreen = `inline-block px-2 py-0.5 ${DARK_BADGES.success} text-xs rounded-full font-semibold`;
const badgeYellow = `inline-block px-2 py-0.5 ${DARK_BADGES.warning} text-xs rounded-full font-semibold`;

function formatDate(dateStr) {
  if (!dateStr) return 'TBD';
  const raw = String(dateStr);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatTime(timeStr) {
  if (!timeStr) return 'TBD';
  const [h, m] = String(timeStr).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 'TBD';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(dateOfBirth + 'T00:00:00');
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

export default function UmpireDashboard({ onBack }) {
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('completed'); // 'completed' | 'assigned' | 'interested' | 'available'
  const [assignedGames, setAssignedGames] = useState([]);
  const [interestedGames, setInterestedGames] = useState([]);
  const [availableGames, setAvailableGames] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [filterSeason, setFilterSeason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [managingInterest, setManagingInterest] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileData, assignedData, interestedData, seasonsData] = await Promise.all([
        fetchUmpireProfile(),
        fetchAssignedGames(),
        fetchGameInterests(),
        fetchSeasons(),
      ]);
      setProfile(profileData);
      setAssignedGames(assignedData);
      setInterestedGames(interestedData);
      setSeasons(seasonsData);
      
      // Default to active season
      const activeSeason = seasonsData.find(s => s.is_active);
      if (activeSeason) setFilterSeason(String(activeSeason.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAvailableGames = useCallback(async () => {
    try {
      const available = await fetchAvailableGames(filterSeason || null);
      setAvailableGames(available);
    } catch (err) {
      console.error('Failed to load available games:', err);
    }
  }, [filterSeason]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'available') {
      loadAvailableGames();
    }
  }, [activeTab, filterSeason, loadAvailableGames]);

  async function handleExpressInterest(gameId) {
    setManagingInterest(gameId);
    try {
      await expressGameInterest(gameId);
      await loadAvailableGames();
      await loadData();
    } catch (err) {
      alert(`Failed to express interest: ${err.message}`);
    } finally {
      setManagingInterest(null);
    }
  }

  async function handleRemoveInterest(gameId) {
    setManagingInterest(gameId);
    try {
      await removeGameInterest(gameId);
      setInterestedGames(prev => prev.filter(g => g.id !== gameId));
      await loadAvailableGames();
    } catch (err) {
      alert(`Failed to remove interest: ${err.message}`);
    } finally {
      setManagingInterest(null);
    }
  }

  function GameCard({ game, showButton, buttonLabel, onButtonClick, isProcessing }) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-blue-500/50 transition-colors">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase">{formatDate(game.game_date)}</span>
              <span className="text-sm font-semibold text-gray-300">{formatTime(game.game_time)}</span>
            </div>
            
            <div className="flex items-center gap-2 justify-between mb-2">
              <span className="font-semibold text-sm text-blue-300 truncate">{game.home_team_name}</span>
              <span className="text-xs text-gray-400">vs</span>
              <span className="font-semibold text-sm text-blue-300 truncate">{game.away_team_name}</span>
            </div>
            
            {game.location_name && (
              <p className="text-xs text-gray-400 mb-2">📍 {game.location_name}</p>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {game.home_division && (
                <span className={badgeYellow}>{game.home_division}</span>
              )}
              <span className={badgeGreen}>{game.status || 'Scheduled'}</span>
              {game.assigned_count > 0 && (
                <span className="text-xs text-gray-400">
                  {game.assigned_count} umpire{game.assigned_count > 1 ? 's' : ''} assigned
                </span>
              )}
            </div>
          </div>

          {showButton && (
            <button
              onClick={() => onButtonClick(game.id)}
              disabled={isProcessing === game.id}
              className={buttonLabel === 'Remove Interest' ? btnDanger : btnPrimary}
            >
              {isProcessing === game.id ? '…' : buttonLabel}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading your dashboard…</div>;
  if (error) return <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">Error: {error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-heading font-bold text-white">Umpire Dashboard</h2>
        {onBack && <button onClick={onBack} className="px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600 transition-colors">← Back</button>}
      </div>

      {/* Profile Card */}
      {profile && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
          <h3 className="text-base font-heading font-bold text-white uppercase tracking-wide mb-3">Your Profile</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Name</p>
              <p className="text-sm text-gray-200">{profile.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Email</p>
              <p className="text-sm text-gray-200">{profile.email}</p>
            </div>
            {profile.date_of_birth && (
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Age</p>
                <p className="text-sm text-gray-200">{calculateAge(profile.date_of_birth)} years old</p>
              </div>
            )}
            {profile.years_of_experience !== null ? (
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Experience</p>
                <p className="text-sm text-gray-200">{profile.years_of_experience} year{profile.years_of_experience !== 1 ? 's' : ''}</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Certification</p>
              <span className={profile.is_certified ? "text-sm text-green-300 font-semibold" : "text-sm text-gray-400"}>
                {profile.is_certified ? '✓ Certified' : 'Not certified'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-700 overflow-x-auto">
        <button
          onClick={() => setActiveTab('completed')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'completed'
              ? 'border-blue-500 text-blue-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          Completed ({assignedGames.filter(g => g.status === 'completed').length})
        </button>
        <button
          onClick={() => setActiveTab('assigned')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'assigned'
              ? 'border-blue-500 text-blue-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          Assigned ({assignedGames.filter(g => g.status !== 'completed').length})
        </button>
        <button
          onClick={() => setActiveTab('interested')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'interested'
              ? 'border-blue-500 text-blue-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          Interested ({interestedGames.length})
        </button>
        <button
          onClick={() => setActiveTab('available')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'available'
              ? 'border-blue-500 text-blue-300'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
        >
          Available
        </button>
      </div>

      {/* Completed Games */}
      {activeTab === 'completed' && (
        <div className="space-y-3">
          {assignedGames.filter(g => g.status === 'completed').length === 0 ? (
            <p className="text-gray-400 text-sm py-6 text-center">No completed games yet.</p>
          ) : (
            assignedGames.filter(g => g.status === 'completed').map(game => (
              <GameCard key={game.id} game={game} />
            ))
          )}
        </div>
      )}

      {/* Assigned Games (not completed) */}
      {activeTab === 'assigned' && (
        <div className="space-y-3">
          {assignedGames.filter(g => g.status !== 'completed').length === 0 ? (
            <p className="text-gray-400 text-sm py-6 text-center">No upcoming assigned games. Check back soon!</p>
          ) : (
            assignedGames.filter(g => g.status !== 'completed').map(game => (
              <GameCard key={game.id} game={game} />
            ))
          )}
        </div>
      )}

      {/* Games I'm Interested In */}
      {activeTab === 'interested' && (
        <div className="space-y-3">
          {interestedGames.length === 0 ? (
            <p className="text-gray-400 text-sm py-6 text-center">No interested games yet. Browse available games to express interest!</p>
          ) : (
            interestedGames.map(game => (
              <GameCard
                key={game.id}
                game={game}
                showButton={!game.is_assigned}
                buttonLabel="Remove Interest"
                onButtonClick={() => handleRemoveInterest(game.id)}
                isProcessing={managingInterest}
              />
            ))
          )}
        </div>
      )}

      {/* Available Games */}
      {activeTab === 'available' && (
        <div>
          <div className="mb-4">
            <select
              value={filterSeason}
              onChange={(e) => setFilterSeason(e.target.value)}
              className="px-3 py-2 border border-gray-600 rounded-lg text-sm text-gray-100 bg-gray-800 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            >
              <option value="">All Seasons</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.year}){s.is_active ? ' ★' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {availableGames.length === 0 ? (
              <p className="text-gray-400 text-sm py-6 text-center">No available games to display.</p>
            ) : (
              availableGames.map(game => (
                <GameCard
                  key={game.id}
                  game={game}
                  showButton={!game.user_interest_id}
                  buttonLabel="Express Interest"
                  onButtonClick={() => handleExpressInterest(game.id)}
                  isProcessing={managingInterest}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
