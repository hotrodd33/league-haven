import { useQuery } from '@tanstack/react-query';
import { fetchGames } from '../api/index.js';
import { useDocumentVisible, useRefetchWhenActive } from './useTabActive.js';

const STALE_GAME_MS = 30 * 60 * 1000;
const LIVE_POLL_MS = 30_000;

function hasFreshLiveGame(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const cutoff = Date.now() - STALE_GAME_MS;
  return rows.some((game) => game?.updated_at && new Date(game.updated_at).getTime() > cutoff);
}

export function useLiveGames() {
  const visible = useDocumentVisible();
  const query = useQuery({
    queryKey: ['live-games'],
    queryFn: () => fetchGames({ status: 'in_progress' }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    // Poll only while this tab is open and a game was updated recently.
    // An idle portal with nothing live does not keep querying.
    refetchInterval: (q) => (visible && hasFreshLiveGame(q.state.data) ? LIVE_POLL_MS : false),
    select: (data) => {
      const cutoff = Date.now() - STALE_GAME_MS;
      return data.filter((game) => new Date(game.updated_at).getTime() > cutoff);
    },
  });

  useRefetchWhenActive(visible, query.refetch);

  return query;
}
