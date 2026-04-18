import { useQuery } from '@tanstack/react-query';
import { fetchGames } from '../api/index.js';

export function useLiveGames() {
  return useQuery({
    queryKey: ['live-games'],
    queryFn: () => fetchGames({ status: 'in_progress' }),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}
