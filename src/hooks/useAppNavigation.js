import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchPlayersByTeam, fetchStaffByTeam } from '../api/index.js';
import { STALE } from '../lib/queryConfig.js';

// ── URL ↔ nav state helpers ───────────────────────────────────────────────────
// Supported paths:
//   /                        → { page: 'dashboard' }
//   /:page                   → { page }
//   /rosters/:id             → { page: 'rosters', selectedTeam: id }
//   /schedule/:id            → { page: 'schedule', pendingGameId: id }
//   /players/:id             → { page: 'players', pendingPlayerId: id }
//   /tournament-schedule/:id → { page: 'tournament-schedule', selectedTournamentId: id }

function parsePath(pathname) {
    const path = pathname.replace(/^\//, '').replace(/\/$/, '') || 'dashboard';
    const parts = path.split('/');
    const page = parts[0] || 'dashboard';
    if (page === 'rosters' && parts[1]) {
        return { page: 'rosters', selectedTeam: parseInt(parts[1], 10), selectedTeamOrgId: null };
    }
    if (page === 'schedule' && parts[1]) {
        return { page: 'schedule', pendingGameId: parseInt(parts[1], 10) };
    }
    if (page === 'players' && parts[1]) {
        return { page: 'players', pendingPlayerId: parseInt(parts[1], 10) };
    }
    if (page === 'tournament-schedule' && parts[1]) {
        return { page: 'tournament-schedule', selectedTournamentId: parseInt(parts[1], 10) };
    }
    return { page };
}

function buildPath(page, { selectedTeam, pendingGameId, pendingPlayerId, selectedTournamentId } = {}) {
    if (page === 'rosters' && selectedTeam) return `/rosters/${selectedTeam}`;
    if (page === 'schedule' && pendingGameId) return `/schedule/${pendingGameId}`;
    if (page === 'players' && pendingPlayerId) return `/players/${pendingPlayerId}`;
    if (page === 'tournament-schedule' && selectedTournamentId) return `/tournament-schedule/${selectedTournamentId}`;
    if (page === 'dashboard') return '/';
    return `/${page}`;
}

export function useAppNavigation() {
    const queryClient = useQueryClient();

    // Initialise from current URL
    const [navState, setNavState] = useState(() => {
        const parsed = parsePath(window.location.pathname);
        return {
            page: parsed.page || 'dashboard',
            selectedTeam: parsed.selectedTeam ?? null,
            selectedTeamOrgId: null,
            pendingGameId: parsed.pendingGameId ?? null,
            pendingPlayerId: parsed.pendingPlayerId ?? null,
            selectedTournamentId: parsed.selectedTournamentId ?? null,
        };
    });

    // Keep URL in sync when state changes
    const pushNav = useCallback((newState, replace = false) => {
        const path = buildPath(newState.page, newState);
        if (replace) {
            window.history.replaceState(newState, '', path);
        } else {
            window.history.pushState(newState, '', path);
        }
        setNavState(newState);
    }, []);

    // Restore state on browser back/forward
    useEffect(() => {
        const onPop = () => {
            const parsed = parsePath(window.location.pathname);
            setNavState(prev => ({
                ...prev,
                page: parsed.page || 'dashboard',
                selectedTeam: parsed.selectedTeam ?? (parsed.page === 'rosters' ? prev.selectedTeam : null),
                pendingGameId: parsed.pendingGameId ?? null,
                pendingPlayerId: parsed.pendingPlayerId ?? null,
                selectedTournamentId: parsed.selectedTournamentId ?? (parsed.page === 'tournament-schedule' ? prev.selectedTournamentId : null),
            }));
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    function setPage(page) {
        pushNav({ ...navState, page });
    }

    function setSelectedTeam(teamId) {
        setNavState(prev => ({ ...prev, selectedTeam: teamId }));
    }

    function setSelectedTeamOrgId(orgId) {
        setNavState(prev => ({ ...prev, selectedTeamOrgId: orgId }));
    }

    function navigateToTeam(teamId, orgId, isTemp = false) {
        // Temporary teams only exist within a tournament context and have no
        // dedicated roster page. In the future this could open a quick-view modal.
        if (isTemp) {
            console.warn('Cannot navigate to a temporary tournament team.');
            return;
        }
        pushNav({
            ...navState,
            page: 'rosters',
            selectedTeam: teamId,
            selectedTeamOrgId: orgId || null,
            pendingGameId: null,
            pendingPlayerId: null,
        });
        if (teamId) {
            queryClient.prefetchQuery({ queryKey: ['roster', teamId], queryFn: () => fetchPlayersByTeam(teamId), staleTime: STALE.TWO_MIN });
            queryClient.prefetchQuery({ queryKey: ['staff', teamId], queryFn: () => fetchStaffByTeam(teamId), staleTime: STALE.TWO_MIN });
        }
    }

    function navigateToGame(gameId) {
        pushNav({ ...navState, page: 'schedule', pendingGameId: gameId });
    }

    function navigateToTournament(tournamentId) {
        pushNav({ ...navState, page: 'tournament-schedule', selectedTournamentId: tournamentId });
    }

    return {
        page: navState.page,
        setPage,
        selectedTeam: navState.selectedTeam,
        setSelectedTeam,
        selectedTeamOrgId: navState.selectedTeamOrgId,
        setSelectedTeamOrgId,
        navigateToTeam,
        navigateToGame,
        navigateToTournament,
        selectedTournamentId: navState.selectedTournamentId,
        setSelectedTournamentId: (id) => setNavState(prev => ({ ...prev, selectedTournamentId: id })),
        pendingGameId: navState.pendingGameId,
        clearPendingGame: () => setNavState(prev => ({ ...prev, pendingGameId: null })),
        pendingPlayerId: navState.pendingPlayerId,
        clearPendingPlayer: () => setNavState(prev => ({ ...prev, pendingPlayerId: null })),
    };
}
