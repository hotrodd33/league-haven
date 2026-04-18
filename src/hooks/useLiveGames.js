import { useQuery } from '@tanstack/react-query';
import { fetchGames } from '../api/index.js';

const STALE_GAME_MS = 30 * 60 * 1000; // hide games with no update for 30+ minutes

export function useLiveGames() {
  return useQuery({
    queryKey: ['live-games'],
    queryFn: () => fetchGames({ status: 'in_progress' }),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    select: (data) => {
      const cutoff = Date.now() - STALE_GAME_MS;
      return data.filter(g => new Date(g.updated_at).getTime() > cutoff);
    },
  });
}
