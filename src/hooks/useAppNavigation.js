import { useState } from 'react';

export function useAppNavigation() {
    const [page, setPage] = useState('dashboard');
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [selectedTeamOrgId, setSelectedTeamOrgId] = useState(null);
    const [pendingGameId, setPendingGameId] = useState(null);

    function navigateToTeam(teamId, orgId) {
        setSelectedTeam(teamId);
        setSelectedTeamOrgId(orgId || null);
        setPage('rosters');
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
