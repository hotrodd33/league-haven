import { useEffect } from 'react';
import { heartbeatGame } from '../api/index.js';
import { useTabActive } from './useTabActive.js';

const HEARTBEAT_INTERVAL = 2 * 60 * 1000;
const HEARTBEAT_IDLE_MS = 15 * 60 * 1000;

export function useGameHeartbeat(gameId, enabled = true) {
  const active = useTabActive(HEARTBEAT_IDLE_MS);

  useEffect(() => {
    if (!gameId || !enabled || !active) return undefined;
    const beat = () => heartbeatGame(gameId).catch(() => {});
    beat();
    const id = setInterval(beat, HEARTBEAT_INTERVAL);
    return () => clearInterval(id);
  }, [gameId, enabled, active]);
}
