import { useState } from "react";
import { useAuth } from "./context/AuthContext.jsx";
import Login from "./components/Login.jsx";
import ResetPassword from "./components/ResetPassword.jsx";
import ChangePassword from "./components/ChangePassword.jsx";
import TeamSelector from "./components/TeamSelector.jsx";
import RosterList from "./components/RosterList.jsx";
import PlayerForm from "./components/PlayerForm.jsx";
import StaffList from "./components/StaffList.jsx";
import OrgManager from "./components/OrgManager.jsx";
import UserManager from "./components/UserManager.jsx";
import LeagueConfig from "./components/LeagueConfig.jsx";
import GameSchedule from "./components/GameSchedule.jsx";
import Standings from "./components/Standings.jsx";
import TeamSchedule from "./components/TeamSchedule.jsx";
import PitcherRest from "./components/PitcherRest.jsx";
import PitchLog from "./components/PitchLog.jsx";
import Directory from "./components/Directory.jsx";
import DataManager from "./components/DataManager.jsx";
import Dashboard from "./components/Dashboard.jsx";
import AppShell from "./components/ui/AppShell.jsx";
import GameChangerImportWizard from "./components/import/GameChangerImportWizard.jsx";

export default function App() {
    const { isAuthenticated, isAdmin, user, logout } = useAuth();
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [selectedTeamOrgId, setSelectedTeamOrgId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [page, setPage] = useState("dashboard");
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [showImportWizard, setShowImportWizard] = useState(false);

    function navigateToTeam(teamId, orgId) {
        setSelectedTeam(teamId);
        setSelectedTeamOrgId(orgId || null);
        setPage("rosters");
    }

    // Handle password reset token in URL (?reset=TOKEN)
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset');
    if (resetToken) {
        return <ResetPassword token={resetToken} onDone={() => { window.history.replaceState({}, '', window.location.pathname); window.location.reload(); }} />;
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
        switch (page) {
            case 'dashboard':
                return <Dashboard onNavigate={setPage} onOpenImport={() => setShowImportWizard(true)} />;

            case 'organizations':
                return <OrgManager onBack={() => setPage("dashboard")} />;

            case 'users':
                return isAdmin ? <UserManager onBack={() => setPage("dashboard")} /> : null;

            case 'league':
                return isAdmin ? <LeagueConfig onBack={() => setPage("dashboard")} /> : null;

            case 'schedule':
                return <GameSchedule onBack={() => setPage("dashboard")} onNavigateToTeam={navigateToTeam} />;

            case 'standings':
                return <Standings onBack={() => setPage("dashboard")} onNavigateToTeam={navigateToTeam} />;

            case 'directory':
                return <Directory onEditTeam={navigateToTeam} />;

            case 'data':
                return isAdmin ? <DataManager /> : null;

            case 'rosters':
            default:
                return (
                    <div className="flex flex-col lg:flex-row gap-4 -m-4 lg:-m-6">
                        <aside className="w-full lg:w-64 bg-white rounded-xl shadow-card p-4 shrink-0 lg:m-6 lg:mr-0 lg:self-start lg:sticky lg:top-20">
                            <TeamSelector selectedTeam={selectedTeam} onSelectTeam={(id, orgId) => { setSelectedTeam(id); setSelectedTeamOrgId(orgId); }} onTeamsChanged={() => setRefreshKey((k) => k + 1)} />
                        </aside>
                        <div className="flex-1 p-4 lg:p-6 overflow-x-auto space-y-4">
                            <RosterList teamId={selectedTeam} teamOrgId={selectedTeamOrgId} onEditPlayer={handleEditPlayer} onAddPlayer={handleAddPlayer} refreshKey={refreshKey} />
                            <StaffList teamId={selectedTeam} teamOrgId={selectedTeamOrgId} refreshKey={refreshKey} />
                            <PitcherRest teamId={selectedTeam} />
                            <PitchLog teamId={selectedTeam} />
                            <TeamSchedule teamId={selectedTeam} onNavigateToTeam={navigateToTeam} />
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
                user={user}
                onChangePassword={() => setShowChangePassword(true)}
                onLogout={logout}
            >
                {renderPage()}
            </AppShell>

            {showForm && selectedTeam && <PlayerForm teamId={selectedTeam} player={editingPlayer} onSaved={handleFormSaved} onCancel={handleFormCancel} />}
            {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} />}
            <GameChangerImportWizard
                open={showImportWizard}
                onClose={() => setShowImportWizard(false)}
                onNavigate={setPage}
            />
        </>
    );
}
