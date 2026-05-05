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
    const [selectedTournamentId, setSelectedTournamentId] = useState(null);

    function navigateToTeam(teamId, orgId, isTemp = false) {
        if (isTemp) {
            // Temporary teams only exist within a tournament context and do not have
            // dedicated roster pages or backend entities to fetch.
            // Navigating to them would cause queries to fail.
            // In the future, this could open a quick-view modal instead.
            console.warn("Cannot navigate to a temporary tournament team.");
            return;
        }

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

    function navigateToTournament(tournamentId) {
        setSelectedTournamentId(tournamentId);
        setPage('tournament-detail');
    }

    return {
        page, setPage,
        selectedTeam, setSelectedTeam,
        selectedTeamOrgId, setSelectedTeamOrgId,
        navigateToTeam,
        navigateToGame,
        navigateToTournament,
        selectedTournamentId, setSelectedTournamentId,
        pendingGameId,
        clearPendingGame: () => setPendingGameId(null),
    };
}
