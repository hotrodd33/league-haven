import { useState, useEffect, useCallback } from 'react';
import {
  fetchAssignedGames, fetchAvailableGames, fetchGameInterests,
  expressGameInterest, removeGameInterest, fetchSeasons, fetchUmpireProfile,
} from '../api/index.js';
import { calculateAge } from '../utils/dob.js';
import { Button, Badge, Card, CardBody, Select } from './ui';

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

  function GameCard({ game, showButton, buttonLabel, onButtonClick, isProcessing, infoBadge }) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-chrome-500/50 transition-colors">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase">{formatDate(game.game_date)}</span>
              <span className="text-sm font-semibold text-gray-300">{formatTime(game.game_time)}</span>
            </div>
            
            <div className="flex items-center gap-2 justify-between mb-2">
              <span className="font-semibold text-sm text-chrome-300 truncate">{game.home_team_name}</span>
              <span className="text-xs text-gray-400">vs</span>
              <span className="font-semibold text-sm text-chrome-300 truncate">{game.away_team_name}</span>
            </div>
            
            {game.location_name && (
              <p className="text-xs text-gray-400 mb-2">📍 {game.location_name}</p>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {game.home_division && (
                <Badge variant="warning">{game.home_division}</Badge>
              )}
              <Badge variant="success">{game.status || 'Scheduled'}</Badge>
              {game.assigned_count > 0 && (
                <span className="text-xs text-gray-400">
                  {game.assigned_count} umpire{game.assigned_count > 1 ? 's' : ''} assigned
                </span>
              )}
            </div>

            {infoBadge && (
              <div className="mt-2">
                <Badge variant="info">{infoBadge}</Badge>
              </div>
            )}
          </div>

          {showButton && (
            <Button
              size="sm"
              variant={buttonLabel === 'Remove Interest' ? 'danger' : 'primary'}
              onClick={() => onButtonClick(game.id)}
              disabled={isProcessing === game.id}
            >
              {isProcessing === game.id ? '…' : buttonLabel}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading your dashboard…</div>;
  if (error) return <div className="lh-alert lh-alert-error">Error: {error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-display font-bold text-white">Umpire Dashboard</h2>
        {onBack && <Button variant="ghost" onClick={onBack}>← Back</Button>}
      </div>

      {/* Profile Card */}
      {profile && (
        <Card variant="bordered" className="mb-4">
          <h3 className="text-base font-display font-bold text-white uppercase tracking-wide mb-3">Your Profile</h3>
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
              <span className={profile.is_certified ? "text-sm text-action-300 font-semibold" : "text-sm text-gray-400"}>
                {profile.is_certified ? '✓ Certified' : 'Not certified'}
              </span>
            </div>
          </div>
        </Card>
      )}
      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-700 overflow-x-auto">
        <button onClick={() => setActiveTab('completed')}
          className={`lh-tab ${activeTab === 'completed' ? 'lh-tab-active' : 'lh-tab-inactive'}`}>
          Completed ({assignedGames.filter(g => g.status === 'completed').length})
        </button>
        <button onClick={() => setActiveTab('assigned')}
          className={`lh-tab ${activeTab === 'assigned' ? 'lh-tab-active' : 'lh-tab-inactive'}`}>
          Assigned ({assignedGames.filter(g => g.status !== 'completed').length})
        </button>
        <button onClick={() => setActiveTab('interested')}
          className={`lh-tab ${activeTab === 'interested' ? 'lh-tab-active' : 'lh-tab-inactive'}`}>
          Interested ({interestedGames.length})
        </button>
        <button onClick={() => setActiveTab('available')}
          className={`lh-tab ${activeTab === 'available' ? 'lh-tab-active' : 'lh-tab-inactive'}`}>
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
                infoBadge={game.is_assigned && game.assigned_official_names ? `Game assigned to: ${game.assigned_official_names}` : null}
              />
            ))
          )}
        </div>
      )}

      {/* Available Games */}
      {activeTab === 'available' && (
        <div>
          <div className="mb-4">
            <Select
              value={filterSeason}
              onChange={(e) => setFilterSeason(e.target.value)}
              className="min-w-[160px]"
            >
              <option value="">All Seasons</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.year}){s.is_active ? ' ★' : ''}
                </option>
              ))}
            </Select>
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
