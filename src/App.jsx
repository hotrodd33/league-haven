import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./context/AuthContext.jsx";
import { fetchPlayer, fetchPendingApprovals, fetchAnnouncements } from "./api/index.js";
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
    const { isAuthenticated, isAdmin, isAccountant, isOrgAdmin, isUmpire, user, role, logout, canEditTeam, isSuperAdmin } = useAuth();
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

    // Fetch pending counts for nav badges
    useEffect(() => {
        if (!isAuthenticated) return;
        const loadCounts = async () => {
            try {
                if (isAdmin || isOrgAdmin || isTeamManager) {
                    const pending = await fetchPendingApprovals();
                    setPendingApprovalCount(Array.isArray(pending) ? pending.filter(u => u.approval_status === 'pending').length : 0);
                }
                if (isAdmin || isOrgAdmin) {
                    const anns = await fetchAnnouncements();
                    setUnreadAnnouncementCount(Array.isArray(anns) ? anns.filter(a => !a.read).length : 0);
                }
            } catch { /* ignore */ }
        };
        loadCounts();
        const interval = setInterval(loadCounts, 60000);
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
    if (params.has('register')) {
        return <TeamRegistration onDone={() => { window.history.replaceState({}, '', window.location.pathname); window.location.reload(); }} />;
    }

    if (!isAuthenticated) return <Login />;

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
            nav.setPage('players');
        } catch (err) { console.error(err); }
    }

    const canEditSelectedPlayer = isSuperAdmin ||
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
                user={user}
                branding={branding}
                features={features}
                pendingApprovalCount={pendingApprovalCount}
                unreadAnnouncementCount={unreadAnnouncementCount}
                onChangePassword={() => setShowChangePassword(true)}
                onLogout={logout}
                onNavigateToTeam={nav.navigateToTeam}
                onMyAccount={() => nav.setPage('account')}
            >
                <FeatureRouter
                    page={nav.page}
                    setPage={nav.setPage}
                    isUmpire={isUmpire}
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
                gameId={importWizardGameId}
            />
        </>
    );
}
