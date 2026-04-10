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
import PitchLog from "./components/PitchLog.jsx";
import Directory from "./components/Directory.jsx";

export default function App() {
    const { isAuthenticated, isAdmin, user, logout } = useAuth();
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [selectedTeamOrgId, setSelectedTeamOrgId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [page, setPage] = useState("rosters");
    const [menuOpen, setMenuOpen] = useState(false);

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
            <header className="bg-blue-800 text-white shadow-lg border-t-4 border-baseball-600">
                <div className="flex items-center justify-between px-4 py-3">
                    <h1 className="font-heading text-xl font-bold whitespace-nowrap tracking-wide">⚾ ZVBL Roster Manager</h1>
                    {/* Desktop nav */}
                    <nav className="hidden sm:flex items-center gap-1">
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
                        <button
                            className={`px-3 py-1.5 text-sm rounded-t-md transition-colors ${page === "directory" ? "bg-white/20 text-white font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                            onClick={() => setPage("directory")}
                        >
                            Directory
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
                    <div className="hidden sm:flex items-center gap-3">
                        <span className="text-sm opacity-90">{user?.name || user?.username}</span>
                        <button className="px-3 py-1 text-xs font-semibold bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300" onClick={logout}>
                            Sign Out
                        </button>
                    </div>
                    {/* Mobile hamburger (2-line bun) → X morph */}
                    <button
                        className="sm:hidden relative w-7 h-5 flex flex-col justify-between"
                        onClick={() => setMenuOpen((v) => !v)}
                        aria-label={menuOpen ? "Close menu" : "Open menu"}
                    >
                        <span className={`block h-0.5 w-full bg-white rounded transition-transform duration-300 origin-center ${menuOpen ? "translate-y-[9px] rotate-45" : ""}`} />
                        <span className={`block h-0.5 w-full bg-white rounded transition-transform duration-300 origin-center ${menuOpen ? "-translate-y-[9px] -rotate-45" : ""}`} />
                    </button>
                </div>
                {/* Mobile dropdown */}
                {menuOpen && (
                    <nav className="sm:hidden flex flex-col border-t border-white/20 px-4 pb-3 pt-2 gap-1">
                        {[
                            { key: "organizations", label: "Organizations" },
                            { key: "rosters", label: "Rosters" },
                            { key: "schedule", label: "Schedule" },
                            { key: "standings", label: "Standings" },
                            { key: "directory", label: "Directory" },
                            ...(isAdmin ? [{ key: "league", label: "League" }, { key: "users", label: "Users" }] : []),
                        ].map((item) => (
                            <button
                                key={item.key}
                                className={`text-left px-3 py-2 text-sm rounded-md transition-colors ${page === item.key ? "bg-white/20 text-white font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                                onClick={() => { setPage(item.key); setMenuOpen(false); }}
                            >
                                {item.label}
                            </button>
                        ))}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/20">
                            <span className="text-sm opacity-90">{user?.name || user?.username}</span>
                            <button className="px-3 py-1 text-xs font-semibold bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300" onClick={logout}>
                                Sign Out
                            </button>
                        </div>
                    </nav>
                )}
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
            ) : page === "directory" ? (
                <main className="p-4 max-w-7xl mx-auto">
                    <Directory />
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
                        <PitchLog teamId={selectedTeam} />
                        <TeamSchedule teamId={selectedTeam} onNavigateToTeam={navigateToTeam} />
                    </div>
                </main>
            )}

            {showForm && selectedTeam && <PlayerForm teamId={selectedTeam} player={editingPlayer} onSaved={handleFormSaved} onCancel={handleFormCancel} />}
        </div>
    );
}
