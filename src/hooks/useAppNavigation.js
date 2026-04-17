import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchPlayersByTeam, fetchStaffByTeam } from '../api/index.js';
import { STALE } from '../lib/queryConfig.js';

export function useAppNavigation() {
    const queryClient = useQueryClient();
    const [page, setPage] = useState('dashboard');
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [selectedTeamOrgId, setSelectedTeamOrgId] = useState(null);
    const [pendingGameId, setPendingGameId] = useState(null);

    function navigateToTeam(teamId, orgId) {
        setSelectedTeam(teamId);
        setSelectedTeamOrgId(orgId || null);
        setPage('rosters');
        if (teamId) {
            queryClient.prefetchQuery({ queryKey: ['roster', teamId], queryFn: () => fetchPlayersByTeam(teamId), staleTime: STALE.TWO_MIN });
            queryClient.prefetchQuery({ queryKey: ['staff', teamId], queryFn: () => fetchStaffByTeam(teamId), staleTime: STALE.TWO_MIN });
        }
    }

    function navigateToGame(gameId) {
        setPendingGameId(gameId);
        setPage('schedule');
    }

    return {
        page, setPage,
        selectedTeam, setSelectedTeam,
        selectedTeamOrgId, setSelectedTeamOrgId,
        navigateToTeam,
        navigateToGame,
        pendingGameId,
        clearPendingGame: () => setPendingGameId(null),
    };
}
