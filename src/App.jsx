import { useState } from "react";
import { useAuth } from "./context/AuthContext.jsx";
import Login from "./components/Login.jsx";
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

export default function App() {
    const { isAuthenticated, isAdmin, user, logout } = useAuth();
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [selectedTeamOrgId, setSelectedTeamOrgId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [page, setPage] = useState("rosters");

    function navigateToTeam(teamId, orgId) {
        setSelectedTeam(teamId);
        setSelectedTeamOrgId(orgId || null);
        setPage("rosters");
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

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">
            {/* Header */}
            <header className="bg-blue-800 text-white shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-3 gap-2">
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg font-bold whitespace-nowrap">ZVBL Roster Manager</h1>
                        <nav className="flex gap-1">
                            <button
                                className={`px-3 py-1.5 text-sm rounded-t-md transition-colors ${page === "organizations" ? "bg-white/20 text-white font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                                onClick={() => setPage("organizations")}
                            >
                                Organizations
                            </button>
                            <button
                                className={`px-3 py-1.5 text-sm rounded-t-md transition-colors ${page === "rosters" ? "bg-white/20 text-white font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                                onClick={() => setPage("rosters")}
                            >
                                Rosters
                            </button>
                            <button
                                className={`px-3 py-1.5 text-sm rounded-t-md transition-colors ${page === "schedule" ? "bg-white/20 text-white font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                                onClick={() => setPage("schedule")}
                            >
                                Schedule
                            </button>
                            <button
                                className={`px-3 py-1.5 text-sm rounded-t-md transition-colors ${page === "standings" ? "bg-white/20 text-white font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                                onClick={() => setPage("standings")}
                            >
                                Standings
                            </button>
                            {isAdmin && (
                                <button
                                    className={`px-3 py-1.5 text-sm rounded-t-md transition-colors ${page === "league" ? "bg-white/20 text-white font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                                    onClick={() => setPage("league")}
                                >
                                    League
                                </button>
                            )}
                            {isAdmin && (
                                <button
                                    className={`px-3 py-1.5 text-sm rounded-t-md transition-colors ${page === "users" ? "bg-white/20 text-white font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                                    onClick={() => setPage("users")}
                                >
                                    Users
                                </button>
                            )}
                        </nav>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm opacity-90 hidden sm:inline">{user?.name || user?.username}</span>
                        <button className="px-3 py-1 text-xs font-semibold bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300" onClick={logout}>
                            Sign Out
                        </button>
                    </div>
                </div>
            </header>

            {/* Content */}
            {page === "organizations" ? (
                <main className="p-4 max-w-7xl mx-auto">
                    <OrgManager onBack={() => setPage("rosters")} />
                </main>
            ) : page === "users" && isAdmin ? (
                <main className="p-4 max-w-7xl mx-auto">
                    <UserManager onBack={() => setPage("rosters")} />
                </main>
            ) : page === "league" && isAdmin ? (
                <main className="p-4 max-w-7xl mx-auto">
                    <LeagueConfig onBack={() => setPage("rosters")} />
                </main>
            ) : page === "schedule" ? (
                <main className="p-4 max-w-7xl mx-auto">
                    <GameSchedule onBack={() => setPage("rosters")} onNavigateToTeam={navigateToTeam} />
                </main>
            ) : page === "standings" ? (
                <main className="p-4 max-w-7xl mx-auto">
                    <Standings onBack={() => setPage("rosters")} onNavigateToTeam={navigateToTeam} />
                </main>
            ) : (
                <main className="flex flex-col md:flex-row min-h-[calc(100vh-56px)]">
                    <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-gray-200 p-4 shrink-0">
                        <TeamSelector selectedTeam={selectedTeam} onSelectTeam={(id, orgId) => { setSelectedTeam(id); setSelectedTeamOrgId(orgId); }} onTeamsChanged={() => setRefreshKey((k) => k + 1)} />
                    </aside>
                    <div className="flex-1 p-4 overflow-x-auto">
                        <RosterList teamId={selectedTeam} teamOrgId={selectedTeamOrgId} onEditPlayer={handleEditPlayer} onAddPlayer={handleAddPlayer} refreshKey={refreshKey} />
                        <StaffList teamId={selectedTeam} teamOrgId={selectedTeamOrgId} refreshKey={refreshKey} />
                        <PitcherRest teamId={selectedTeam} />
                        <TeamSchedule teamId={selectedTeam} onNavigateToTeam={navigateToTeam} />
                    </div>
                </main>
            )}

            {showForm && selectedTeam && <PlayerForm teamId={selectedTeam} player={editingPlayer} onSaved={handleFormSaved} onCancel={handleFormCancel} />}
        </div>
    );
}
