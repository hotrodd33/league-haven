import ErrorBoundary from './ErrorBoundary.jsx';
import { useRef } from 'react';
import GuardianHome from './GuardianHome.jsx';
import Chat from './Chat.jsx';
import Dashboard from './Dashboard.jsx';
import OrgManager from './OrgManager.jsx';
import UserManager from './UserManager.jsx';
import LeagueConfig from './LeagueConfig.jsx';
import GameSchedule from './GameSchedule.jsx';
import Standings from './Standings.jsx';
import Directory from './Directory.jsx';
import DataManager from './DataManager.jsx';
import OfficialsManager from './OfficialsManager.jsx';
import UmpireDashboard from './UmpireDashboard.jsx';
import HelpPage from './HelpPage.jsx';
import LeagueFees from './LeagueFees.jsx';
import FieldsPage from './FieldsPage.jsx';
import PlayersPage from './PlayersPage.jsx';
import PlayerDetail from './PlayerDetail.jsx';
import MyAccount from './MyAccount.jsx';
import ManageAnnouncements from './ManageAnnouncements.jsx';
import TeamSelector from './TeamSelector.jsx';
import TeamPage from './TeamPage.jsx';
import GuardiansPage from './GuardiansPage.jsx';
import CoachesPage from './CoachesPage.jsx';
import TravelMatrix from './TravelMatrix.jsx';
import TournamentsPage from './TournamentsPage.jsx';
import TournamentDetail from './TournamentDetail.jsx';

export default function FeatureRouter(props) {
    return (
        <ErrorBoundary key={props.page}>
            <PageContent {...props} />
        </ErrorBoundary>
    );
}

function PageContent({
    page, setPage,
    isUmpire, isAdmin, isOrgAdmin, isTeamManager, isAccountant, isGuardian,
    features,
    selectedTeam, selectedTeamOrgId, setSelectedTeam, setSelectedTeamOrgId,
    navigateToTeam, navigateToGame, navigateToTournament,
    onViewPlayer,
    pendingGameId, clearPendingGame,
    selectedPlayerData, onClearPlayer,
    selectedTournamentId,
    openImportWizard,
    onEditPlayer, onAddPlayer,
    onTeamWatermarkChange, onTeamsChanged,
    refreshKey,
    canEditSelectedPlayer,
    onChangePassword,
}) {
    if (isUmpire && page === 'dashboard') {
        return <UmpireDashboard onBack={() => setPage('dashboard')} />;
    }
    if (isGuardian && (page === 'dashboard' || page === 'guardian-home')) {
        return <GuardianHome onViewPlayer={onViewPlayer} />;
    }

    switch (page) {
        case 'guardian-home':
            return <GuardianHome onViewPlayer={onViewPlayer} />;

        case 'chat':
            return features.feature_chat !== false ? <Chat /> : null;

        case 'dashboard':
            return <Dashboard onNavigate={setPage} onViewPlayer={onViewPlayer} onNavigateToGame={navigateToGame} />;

        case 'umpire':
            return <UmpireDashboard onBack={() => setPage('dashboard')} />;

        case 'organizations':
            return <OrgManager onBack={() => setPage('dashboard')} onNavigateToTeam={navigateToTeam} />;

        case 'users':
            return isAdmin ? <UserManager onBack={() => setPage('dashboard')} /> : null;

        case 'approvals':
            return (isAdmin || isOrgAdmin || isTeamManager)
                ? <UserManager onBack={() => setPage('dashboard')} initialTab="approvals" showUsersTab={isAdmin} />
                : null;

        case 'league':
            return isAdmin ? <LeagueConfig onBack={() => setPage('dashboard')} /> : null;

        case 'schedule':
            return <GameSchedule onBack={() => setPage('dashboard')} onNavigateToTeam={navigateToTeam} initialGameId={pendingGameId} onGameIdConsumed={clearPendingGame} onOpenImport={openImportWizard} onViewPlayer={onViewPlayer} />;

        case 'standings':
            return <Standings onBack={() => setPage('dashboard')} onNavigateToTeam={navigateToTeam} />;

        case 'directory':
            return <Directory onEditTeam={navigateToTeam} />;

        case 'fields':
            return <FieldsPage onViewGame={navigateToGame} />;

        case 'players':
            if (selectedPlayerData) {
                return (
                    <PlayerDetail
                        player={selectedPlayerData}
                        onBack={onClearPlayer}
                        onNavigateToTeam={navigateToTeam}
                        canEdit={canEditSelectedPlayer}
                    />
                );
            }
            return <PlayersPage onSelectPlayer={onViewPlayer} />;

        case 'guardians':
            return (isAdmin || isOrgAdmin || isTeamManager)
                ? <GuardiansPage onViewPlayer={onViewPlayer} />
                : null;

        case 'coaches':
            return (isAdmin || isOrgAdmin)
                ? <CoachesPage />
                : null;

        case 'account':
            return <MyAccount onChangePassword={onChangePassword} />;

        case 'announcements':
            return (isAdmin || isOrgAdmin) ? <ManageAnnouncements /> : null;

        case 'data':
            return isAdmin ? <DataManager onOpenImport={() => openImportWizard()} /> : null;

        case 'officials':
            return (isAdmin || isAccountant || isOrgAdmin) && features.feature_officials !== false
                ? <OfficialsManager onBack={() => setPage('dashboard')} />
                : null;

        case 'fees':
            return (isAdmin || isAccountant) && features.feature_financials !== false
                ? <LeagueFees onBack={() => setPage('dashboard')} />
                : null;

        case 'travel':
            return <TravelMatrix />;

        case 'tournaments':
            return <TournamentsPage onSelectTournament={navigateToTournament} />;

        case 'tournament-detail':
            return (
                <TournamentDetail
                    tournamentId={selectedTournamentId}
                    onBack={() => setPage('tournaments')}
                    onNavigateToTeam={navigateToTeam}
                    onNavigateToFields={() => setPage('fields')}
                />
            );

        case 'about':
            return <HelpPage initialTab="about" onBack={() => setPage('dashboard')} />;

        case 'guide':
            return <HelpPage initialTab="guide" onBack={() => setPage('dashboard')} />;

        case 'rosters':
        default: {
            const editTeamTriggerRef = useRef(null);
            return (
                <div className="flex flex-col lg:flex-row gap-4 -m-4 lg:-m-6">
                    <aside className="w-full lg:w-64 bg-gray-800 border border-gray-700 rounded-xl shadow-card p-4 shrink-0 lg:m-6 lg:mr-0 lg:self-start lg:sticky lg:top-20">
                        <TeamSelector
                            selectedTeam={selectedTeam}
                            onSelectTeam={(id, orgId) => { setSelectedTeam(id); setSelectedTeamOrgId(orgId); }}
                            onTeamsChanged={onTeamsChanged}
                            onRegisterEditTrigger={fn => { editTeamTriggerRef.current = fn; }}
                        />
                    </aside>
                    <div className="flex-1 p-4 lg:p-6 overflow-x-auto lg:sticky lg:top-20 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
                        <TeamPage
                            teamId={selectedTeam}
                            teamOrgId={selectedTeamOrgId}
                            onEditPlayer={onEditPlayer}
                            onAddPlayer={onAddPlayer}
                            onViewPlayer={onViewPlayer}
                            refreshKey={refreshKey}
                            onNavigateToTeam={navigateToTeam}
                            onWatermarkLogoChange={onTeamWatermarkChange}
                            onEditTeam={isAdmin ? () => editTeamTriggerRef.current?.() : null}
                        />
                    </div>
                </div>
            );
        }
    }
}
