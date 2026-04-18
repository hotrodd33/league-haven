import { useEffect } from 'react';
import { heartbeatGame } from '../api/index.js';

const HEARTBEAT_INTERVAL = 2 * 60 * 1000; // 2 minutes

export function useGameHeartbeat(gameId, enabled = true) {
  useEffect(() => {
    if (!gameId || !enabled) return;
    const beat = () => heartbeatGame(gameId).catch(() => {});
    beat(); // fire immediately on mount so updated_at is fresh right away
    const id = setInterval(beat, HEARTBEAT_INTERVAL);
    return () => clearInterval(id);
  }, [gameId, enabled]);
}
