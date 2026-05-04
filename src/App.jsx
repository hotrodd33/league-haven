import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./context/AuthContext.jsx";
import { fetchPlayer, fetchPendingApprovals, fetchUnreadAnnouncementCount } from "./api/index.js";
import { STALE } from "./lib/queryConfig.js";
import { useAppNavigation } from "./hooks/useAppNavigation.js";
import { useBranding } from "./hooks/useBranding.js";
import Login from "./components/Login.jsx";
import ResetPassword from "./components/ResetPassword.jsx";
import ChangePassword from "./components/ChangePassword.jsx";
import TeamRegistration from "./components/TeamRegistration.jsx";
import ConfirmEmail from "./components/ConfirmEmail.jsx";
import AppShell from "./components/ui/AppShell.jsx";
import PlayerForm from "./components/PlayerForm.jsx";
import GameChangerImportWizard from "./components/import/GameChangerImportWizard.jsx";
import FeatureRouter from "./components/FeatureRouter.jsx";

export default function App() {
    const { isAuthenticated, isAdmin, isAccountant, isOrgAdmin, isUmpire, isGuardian, user, role, logout, canEditTeam, isSuperAdmin, mustChangePassword, clearMustChangePassword } = useAuth();
    const isTeamManager = role === 'team_manager';

    const queryClient = useQueryClient();
    const nav = useAppNavigation();
    const { branding, features, setTeamWatermark } = useBranding(isAuthenticated);

    const [showForm, setShowForm] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [showImportWizard, setShowImportWizard] = useState(false);
    const [importWizardGameId, setImportWizardGameId] = useState(null);
    const [selectedPlayerId, setSelectedPlayerId] = useState(null);
    const [selectedPlayerData, setSelectedPlayerData] = useState(null);
    const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
    const [unreadAnnouncementCount, setUnreadAnnouncementCount] = useState(0);
    const [chatUnreadCount, setChatUnreadCount] = useState(0);
    // Capture ?channelId= on initial load (set by push notification deep-link via sw.js).
    // Must be read before the inline replaceState call wipes the URL params.
    const [initialChatChannelId] = useState(() => {
        const p = new URLSearchParams(window.location.search);
        const id = p.get('channelId');
        return id ? Number(id) : null;
    });

    // Fetch pending counts for nav badges
    useEffect(() => {
        if (!isAuthenticated) return;
        const loadCounts = async () => {
            try {
                if (isAdmin || isOrgAdmin || isTeamManager) {
                    const pending = await fetchPendingApprovals();
                    setPendingApprovalCount(Array.isArray(pending) ? pending.filter(u => u.approval_status === 'pending').length : 0);
                }
                if (isAuthenticated) {
                    const { count } = await fetchUnreadAnnouncementCount();
                    setUnreadAnnouncementCount(count || 0);
                }
                // Chat unread count
                const { fetchChatUnreadCount } = await import('./api/index.js');
                const { count: chatCount } = await fetchChatUnreadCount().catch(() => ({ count: 0 }));
                setChatUnreadCount(chatCount || 0);
            } catch { /* ignore */ }
        };
        loadCounts();
        const interval = setInterval(loadCounts, 10000);
        return () => clearInterval(interval);
    }, [isAuthenticated, isAdmin, isOrgAdmin, isTeamManager]);

    // Clear transient page state when navigating away
    useEffect(() => {
        if (nav.page !== 'rosters') {
            document.documentElement.style.removeProperty('--page-logo-watermark');
        }
        if (nav.page !== 'players') {
            setSelectedPlayerId(null);
            setSelectedPlayerData(null);
        }
    }, [nav.page]);

    // On initial load or popstate to /players/:id, load that player
    useEffect(() => {
        if (!isAuthenticated) return;
        if (nav.page === 'players' && nav.pendingPlayerId && !selectedPlayerData) {
            handleViewPlayer(nav.pendingPlayerId).then(() => nav.clearPendingPlayer?.());
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated, nav.page, nav.pendingPlayerId]);

    // URL param handling — must come after all hook calls
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset');
    if (resetToken) {
        return <ResetPassword token={resetToken} onDone={() => { window.history.replaceState({}, '', window.location.pathname); window.location.reload(); }} />;
    }
    const confirmToken = params.get('confirm');
    if (confirmToken) {
        return <ConfirmEmail token={confirmToken} onDone={() => { window.history.replaceState({}, '', window.location.pathname); window.location.reload(); }} />;
    }
    if (!isAuthenticated) {
        if (params.has('register')) {
            return <TeamRegistration onDone={() => { window.history.replaceState({}, '', window.location.pathname); window.location.reload(); }} />;
        }
        return <Login />;
    }

    // Handle push notification deep-links (e.g. ?page=chat from SW click)
    const deepLinkPage = params.get('page');
    if (deepLinkPage && deepLinkPage !== nav.page) {
        window.history.replaceState({}, '', window.location.pathname);
        nav.setPage(deepLinkPage);
    }

    // Force password change before allowing access for admin-created accounts
    if (mustChangePassword) {
        return <ChangePassword forced onPasswordChanged={clearMustChangePassword} onClose={() => {}} />;
    }

    function openImportWizard(gameId = null) {
        setImportWizardGameId(gameId || null);
        setShowImportWizard(true);
    }

    function handleAddPlayer() { setEditingPlayer(null); setShowForm(true); }
    function handleEditPlayer(player) { setEditingPlayer(player); setShowForm(true); }
    function handleFormSaved() { setShowForm(false); setEditingPlayer(null); setRefreshKey((k) => k + 1); }
    function handleFormCancel() { setShowForm(false); setEditingPlayer(null); }

    async function handleViewPlayer(playerId) {
        setSelectedPlayerId(playerId);
        try {
            const p = await queryClient.ensureQueryData({
                queryKey: ['player', playerId],
                queryFn: () => fetchPlayer(playerId),
                staleTime: STALE.TWO_MIN,
            });
            setSelectedPlayerData(p);
            // Push /players/:id to URL so back button works
            window.history.pushState({}, '', `/players/${playerId}`);
            nav.setPage('players');
        } catch (err) { console.error(err); }
    }

    const { claimedPlayerIds } = useAuth();
    const canEditSelectedPlayer = isSuperAdmin ||
        (selectedPlayerId && claimedPlayerIds.includes(selectedPlayerId)) ||
        (selectedPlayerData?.teams || []).some(t => canEditTeam(t.team_id || t.id, t.org_id));

    return (
        <>
            <AppShell
                page={nav.page}
                onNavigate={nav.setPage}
                isAdmin={isAdmin}
                isAccountant={isAccountant}
                isOrgAdmin={isOrgAdmin}
                isTeamManager={isTeamManager}
                isGuardian={isGuardian}
                user={user}
                branding={branding}
                features={features}
                pendingApprovalCount={pendingApprovalCount}
                unreadAnnouncementCount={unreadAnnouncementCount}
                chatUnreadCount={chatUnreadCount}
                onChangePassword={() => setShowChangePassword(true)}
                onLogout={logout}
                onNavigateToTeam={nav.navigateToTeam}
                onMyAccount={() => nav.setPage('account')}
            >
                <FeatureRouter
                    page={nav.page}
                    setPage={nav.setPage}
                    isUmpire={isUmpire}
                    isGuardian={isGuardian}
                    isAdmin={isAdmin}
                    isOrgAdmin={isOrgAdmin}
                    isTeamManager={isTeamManager}
                    isAccountant={isAccountant}
                    features={features}
                    selectedTeam={nav.selectedTeam}
                    selectedTeamOrgId={nav.selectedTeamOrgId}
                    setSelectedTeam={nav.setSelectedTeam}
                    setSelectedTeamOrgId={nav.setSelectedTeamOrgId}
                    navigateToTeam={nav.navigateToTeam}
                    navigateToGame={nav.navigateToGame}
                    onViewPlayer={handleViewPlayer}
                    pendingGameId={nav.pendingGameId}
                    clearPendingGame={nav.clearPendingGame}
                    selectedPlayerData={selectedPlayerData}
                    onClearPlayer={() => { setSelectedPlayerId(null); setSelectedPlayerData(null); }}
                    openImportWizard={openImportWizard}
                    onEditPlayer={handleEditPlayer}
                    onAddPlayer={handleAddPlayer}
                    onTeamWatermarkChange={setTeamWatermark}
                    onTeamsChanged={() => setRefreshKey((k) => k + 1)}
                    refreshKey={refreshKey}
                    canEditSelectedPlayer={canEditSelectedPlayer}
                    onChangePassword={() => setShowChangePassword(true)}
                    initialChatChannelId={initialChatChannelId}
                />
            </AppShell>

            {showForm && nav.selectedTeam && (
                <PlayerForm teamId={nav.selectedTeam} player={editingPlayer} onSaved={handleFormSaved} onCancel={handleFormCancel} />
            )}
            {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} />}
            <GameChangerImportWizard
                open={showImportWizard}
                onClose={() => { setShowImportWizard(false); setImportWizardGameId(null); }}
                onNavigate={nav.setPage}
                onNavigateToGame={nav.navigateToGame}
                gameId={importWizardGameId}
            />
        </>
    );
}
