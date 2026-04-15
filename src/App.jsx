import { useEffect, useState } from "react";
import { useAuth } from "./context/AuthContext.jsx";
import { fetchBranding, fetchPlayer } from "./api/index.js";
import Login from "./components/Login.jsx";
import ResetPassword from "./components/ResetPassword.jsx";
import ChangePassword from "./components/ChangePassword.jsx";
import TeamSelector from "./components/TeamSelector.jsx";
import TeamPage from "./components/TeamPage.jsx";
import PlayerForm from "./components/PlayerForm.jsx";
import OrgManager from "./components/OrgManager.jsx";
import UserManager from "./components/UserManager.jsx";
import LeagueConfig from "./components/LeagueConfig.jsx";
import GameSchedule from "./components/GameSchedule.jsx";
import Standings from "./components/Standings.jsx";
import Directory from "./components/Directory.jsx";
import DataManager from "./components/DataManager.jsx";
import Dashboard from "./components/Dashboard.jsx";
import OfficialsManager from "./components/OfficialsManager.jsx";
import UmpireDashboard from "./components/UmpireDashboard.jsx";
import AppShell from "./components/ui/AppShell.jsx";
import GameChangerImportWizard from "./components/import/GameChangerImportWizard.jsx";
import HelpPage from "./components/HelpPage.jsx";
import LeagueFees from "./components/LeagueFees.jsx";
import FieldsPage from "./components/FieldsPage.jsx";
import TeamRegistration from "./components/TeamRegistration.jsx";
import ConfirmEmail from "./components/ConfirmEmail.jsx";
import PlayersPage from "./components/PlayersPage.jsx";
import PlayerDetail from "./components/PlayerDetail.jsx";

export default function App() {
    const { isAuthenticated, isAdmin, isAccountant, isOrgAdmin, isUmpire, user, role, logout } = useAuth();
    const isTeamManager = role === 'team_manager';
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [selectedTeamOrgId, setSelectedTeamOrgId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [page, setPage] = useState("dashboard");
    const [pendingGameId, setPendingGameId] = useState(null);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [showImportWizard, setShowImportWizard] = useState(false);
    const [importWizardGameId, setImportWizardGameId] = useState(null);
    const [branding, setBranding] = useState({ app_name: 'LeagueHaven', logo_url: null });
    const [selectedPlayerId, setSelectedPlayerId] = useState(null);
    const [selectedPlayerData, setSelectedPlayerData] = useState(null);

    function openImportWizard(gameId = null) {
        setImportWizardGameId(gameId || null);
        setShowImportWizard(true);
    }

    useEffect(() => {
        if (!isAuthenticated) return;
        fetchBranding()
            .then((data) => setBranding({ app_name: data?.app_name || 'LeagueHaven', logo_url: data?.logo_url || null }))
            .catch(() => { /* non-blocking */ });
    }, [isAuthenticated]);

    useEffect(() => {
        const cssValue = branding?.logo_url ? `url(\"${branding.logo_url}\")` : 'none';
        document.documentElement.style.setProperty('--league-logo-watermark', cssValue);
    }, [branding?.logo_url]);

    useEffect(() => {
        if (page !== 'rosters') {
            document.documentElement.style.removeProperty('--page-logo-watermark');
        }
        if (page !== 'players') {
            setSelectedPlayerId(null);
            setSelectedPlayerData(null);
        }
    }, [page]);

    function handleTeamWatermarkLogoChange(logoUrl) {
        if (logoUrl) {
            const cssValue = `url(\"${logoUrl}\")`;
            document.documentElement.style.setProperty('--page-logo-watermark', cssValue);
        } else {
            document.documentElement.style.removeProperty('--page-logo-watermark');
        }
    }

    function navigateToTeam(teamId, orgId) {
        setSelectedTeam(teamId);
        setSelectedTeamOrgId(orgId || null);
        setPage("rosters");
    }

    function navigateToGame(gameId) {
        setPendingGameId(gameId);
        setPage("schedule");
    }

    // Handle password reset token in URL (?reset=TOKEN)
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset');
    if (resetToken) {
        return <ResetPassword token={resetToken} onDone={() => { window.history.replaceState({}, '', window.location.pathname); window.location.reload(); }} />;
    }

    // Handle email confirmation URL (?confirm=TOKEN)
    const confirmToken = params.get('confirm');
    if (confirmToken) {
        return <ConfirmEmail token={confirmToken} onDone={() => { window.history.replaceState({}, '', window.location.pathname); window.location.reload(); }} />;
    }

    // Handle team registration URL (?register)
    if (params.has('register')) {
        return <TeamRegistration onDone={() => { window.history.replaceState({}, '', window.location.pathname); window.location.reload(); }} />;
    }

    if (!isAuthenticated) {
        return <Login />;
    }

    function handleAddPlayer() {
        setEditingPlayer(null);
        setShowForm(true);
    }

    function handleEditPlayer(player) {
        setEditingPlayer(player);
        setShowForm(true);
    }

    function handleFormSaved() {
        setShowForm(false);
        setEditingPlayer(null);
        setRefreshKey((k) => k + 1);
    }

    function handleFormCancel() {
        setShowForm(false);
        setEditingPlayer(null);
    }

    /* ── Page content renderer ── */
    function renderPage() {
        // Umpires get their own dashboard by default
        if (isUmpire && page === 'dashboard') {
            return <UmpireDashboard onBack={() => setPage("dashboard")} />;
        }

        switch (page) {
            case 'dashboard':
                return <Dashboard onNavigate={setPage} />;

            case 'umpire':
                return <UmpireDashboard onBack={() => setPage("dashboard")} />;

            case 'organizations':
                return <OrgManager onBack={() => setPage("dashboard")} onNavigateToTeam={navigateToTeam} />;

            case 'users':
                return isAdmin ? <UserManager onBack={() => setPage("dashboard")} /> : null;

            case 'approvals':
                return (isAdmin || isOrgAdmin || isTeamManager)
                  ? <UserManager onBack={() => setPage("dashboard")} initialTab="approvals" showUsersTab={isAdmin} />
                  : null;

            case 'league':
                return isAdmin ? <LeagueConfig onBack={() => setPage("dashboard")} /> : null;

            case 'schedule':
                return <GameSchedule onBack={() => setPage("dashboard")} onNavigateToTeam={navigateToTeam} initialGameId={pendingGameId} onGameIdConsumed={() => setPendingGameId(null)} onOpenImport={openImportWizard} />;

            case 'standings':
                return <Standings onBack={() => setPage("dashboard")} onNavigateToTeam={navigateToTeam} />;

            case 'directory':
                return <Directory onEditTeam={navigateToTeam} />;

            case 'fields':
                return <FieldsPage onViewGame={navigateToGame} />;

            case 'players':
                if (selectedPlayerData) {
                    return <PlayerDetail player={selectedPlayerData} onBack={() => { setSelectedPlayerId(null); setSelectedPlayerData(null); }} onNavigateToTeam={navigateToTeam} />;
                }
                return <PlayersPage onSelectPlayer={async (id) => {
                    setSelectedPlayerId(id);
                    try {
                        const p = await fetchPlayer(id);
                        setSelectedPlayerData(p);
                    } catch (err) { console.error(err); }
                }} />;

            case 'data':
                return isAdmin ? <DataManager onOpenImport={() => openImportWizard()} /> : null;

            case 'officials':
                return (isAdmin || isAccountant || isOrgAdmin) ? <OfficialsManager onBack={() => setPage("dashboard")} /> : null;

            case 'fees':
                return (isAdmin || isAccountant) ? <LeagueFees onBack={() => setPage("dashboard")} /> : null;

            case 'about':
                return <HelpPage initialTab="about" onBack={() => setPage("dashboard")} />;

            case 'guide':
                return <HelpPage initialTab="guide" onBack={() => setPage("dashboard")} />;

            case 'rosters':
            default:
                return (
                    <div className="flex flex-col lg:flex-row gap-4 -m-4 lg:-m-6">
                        <aside className="w-full lg:w-64 bg-gray-800 border border-gray-700 rounded-xl shadow-card p-4 shrink-0 lg:m-6 lg:mr-0 lg:self-start lg:sticky lg:top-20">
                            <TeamSelector selectedTeam={selectedTeam} onSelectTeam={(id, orgId) => { setSelectedTeam(id); setSelectedTeamOrgId(orgId); }} onTeamsChanged={() => setRefreshKey((k) => k + 1)} />
                        </aside>
                        <div className="flex-1 p-4 lg:p-6 overflow-x-auto">
                            <TeamPage
                                teamId={selectedTeam}
                                teamOrgId={selectedTeamOrgId}
                                onEditPlayer={handleEditPlayer}
                                onAddPlayer={handleAddPlayer}
                                refreshKey={refreshKey}
                                onNavigateToTeam={navigateToTeam}
                                onWatermarkLogoChange={handleTeamWatermarkLogoChange}
                            />
                        </div>
                    </div>
                );
        }
    }

    return (
        <>
            <AppShell
                page={page}
                onNavigate={setPage}
                isAdmin={isAdmin}
                isAccountant={isAccountant}
                isOrgAdmin={isOrgAdmin}
                isTeamManager={isTeamManager}
                user={user}
                branding={branding}
                onChangePassword={() => setShowChangePassword(true)}
                onLogout={logout}
                onNavigateToTeam={navigateToTeam}
            >
                {renderPage()}
            </AppShell>

            {showForm && selectedTeam && <PlayerForm teamId={selectedTeam} player={editingPlayer} onSaved={handleFormSaved} onCancel={handleFormCancel} />}
            {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} />}
            <GameChangerImportWizard
                open={showImportWizard}
                onClose={() => { setShowImportWizard(false); setImportWizardGameId(null); }}
                onNavigate={setPage}
                gameId={importWizardGameId}
            />
        </>
    );
}
