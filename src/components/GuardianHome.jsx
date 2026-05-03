import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMyClaims, fetchPlayer } from '../api/index.js';
import GuardianClaimFlow from './GuardianClaimFlow.jsx';
import { Button, Card, CardBody } from './ui';

/**
 * Home screen for logged-in guardians.
 * - Shows approved claimed players (click to view PlayerDetail)
 * - Shows pending/denied claim statuses
 * - Provides "Claim a player" button if they have no approved claims yet or want to claim more
 */
export default function GuardianHome({ onViewPlayer }) {
  const [showClaimFlow, setShowClaimFlow] = useState(false);

  const { data: claims = [], isLoading } = useQuery({
    queryKey: ['my-guardian-claims'],
    queryFn: fetchMyClaims,
    staleTime: 30_000,
  });

  const approvedClaims = claims.filter((c) => c.status === 'approved');
  const pendingClaims = claims.filter((c) => c.status === 'pending');
  const deniedClaims = claims.filter((c) => c.status === 'denied');

  if (showClaimFlow) {
    return (
      <div className="p-4 max-w-xl mx-auto">
        <button
          type="button"
          onClick={() => setShowClaimFlow(false)}
          className="text-sm text-gray-400 hover:text-gray-200 mb-4 flex items-center gap-1"
        >
          ← Back
        </button>
        <GuardianClaimFlow onDone={() => setShowClaimFlow(false)} />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-chrome-200">My Players</h1>
        <Button size="sm" onClick={() => setShowClaimFlow(true)}>
          + Claim a Player
        </Button>
      </div>

      {isLoading && (
        <p className="text-sm text-gray-400 animate-pulse">Loading your players…</p>
      )}

      {/* ── Approved claimed players ── */}
      {!isLoading && approvedClaims.length === 0 && pendingClaims.length === 0 && (
        <Card variant="signal">
          <CardBody className="p-6 text-center space-y-3">
            <div className="text-3xl">⚾</div>
            <p className="text-gray-300 font-medium">No players linked yet.</p>
            <p className="text-sm text-gray-400">
              Click "Claim a Player" to search for your child and submit a request.
            </p>
          </CardBody>
        </Card>
      )}

      {approvedClaims.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Your Players</h2>
          {approvedClaims.map((claim) => (
            <PlayerClaimCard key={claim.id} claim={claim} onViewPlayer={onViewPlayer} />
          ))}
        </div>
      )}

      {/* ── Pending requests ── */}
      {pendingClaims.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Pending Requests</h2>
          {pendingClaims.map((claim) => (
            <div key={claim.id} className="lh-alert lh-alert-info flex items-center justify-between">
              <span>
                <strong>{claim.player_name || `${claim.player_first_name || ''} ${claim.player_last_name || ''}`.trim()}</strong> — waiting for admin review
              </span>
              <span className="text-xs bg-yellow-700/60 text-yellow-200 px-2 py-0.5 rounded-full">Pending</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Denied requests ── */}
      {deniedClaims.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Denied Requests</h2>
          {deniedClaims.map((claim) => (
            <div key={claim.id} className="lh-alert lh-alert-error space-y-1">
              <p>
                <strong>{claim.player_name || `${claim.player_first_name || ''} ${claim.player_last_name || ''}`.trim()}</strong> — claim denied
              </p>
              {claim.notes && (
                <p className="text-xs text-red-300 italic">"{claim.notes}"</p>
              )}
              <button
                type="button"
                onClick={() => setShowClaimFlow(true)}
                className="text-xs text-red-300 hover:underline"
              >
                Re-submit for a different player →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Card for an approved claim; fetches player details and renders a clickable card.
 */
function PlayerClaimCard({ claim, onViewPlayer }) {
  const { data: player } = useQuery({
    queryKey: ['player', claim.player_id],
    queryFn: () => fetchPlayer(claim.player_id),
    staleTime: 60_000,
  });

  const displayName = player
    ? `${player.first_name} ${player.last_name}`
    : claim.player_name || `${claim.player_first_name || ''} ${claim.player_last_name || ''}`.trim();

  return (
    <button
      type="button"
      onClick={() => player && onViewPlayer && onViewPlayer(player.id)}
      className="w-full text-left rounded border border-gray-700 bg-gray-800/50 hover:bg-gray-700/60 transition-colors p-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-100">{displayName}</p>
          {player?.teams?.length > 0 && (
            <p className="text-sm text-gray-400 mt-0.5">
              {player.teams.map((t) => t.name || t).join(', ')}
            </p>
          )}
          {claim.player_teams && !player && (
            <p className="text-sm text-gray-400 mt-0.5">{claim.player_teams}</p>
          )}
        </div>
        <span className="text-chrome-400 text-xl">›</span>
      </div>
    </button>
  );
}
