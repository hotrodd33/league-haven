const API_BASE = '/api';

function isAuthBootstrapEndpoint(endpoint) {
  return endpoint.startsWith('/auth/login')
    || endpoint.startsWith('/auth/register')
    || endpoint.startsWith('/auth/forgot-password')
    || endpoint.startsWith('/auth/reset-password')
    || endpoint.startsWith('/auth/resend-confirmation');
}

function getToken() {
  try {
    const saved = localStorage.getItem('zvbl_roster_auth');
    if (saved) {
      const { token } = JSON.parse(saved);
      return token;
    }
  } catch {
    // ignore
  }
  return null;
}

function authHeaders() {
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiFetch(endpoint, options = {}) {
  const headers = { ...authHeaders(), ...options.headers };
  // Only set Content-Type for non-FormData bodies
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    if (isAuthBootstrapEndpoint(endpoint)) {
      const errorBody = await response.json().catch(() => ({}));
      const err = new Error(errorBody.error || 'Invalid credentials');
      err.status = response.status;
      err.details = errorBody;
      throw err;
    }
    localStorage.removeItem('zvbl_roster_auth');
    window.location.reload();
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const err = new Error(errorBody.error || `API error: ${response.status}`);
    err.status = response.status;
    err.details = errorBody;
    throw err;
  }

  if (response.status === 204) return null;
  return response.json();
}

// ── Auth ──

export async function login(username, password) {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function register(username, password, name, email, team_ids) {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, name, email, team_ids }),
  });
}

export async function forgotPassword(email) {
  return apiFetch('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token, password) {
  return apiFetch('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export async function changePassword(currentPassword, newPassword) {
  return apiFetch('/auth/change-password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function inviteUser(userId) {
  return apiFetch(`/users/${userId}/invite`, { method: 'POST' });
}

// ── Teams ──

export async function fetchTeams() {
  return apiFetch('/teams');
}

export async function createTeam(data) {
  return apiFetch('/teams', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTeam(id, data) {
  return apiFetch(`/teams/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteTeam(id) {
  return apiFetch(`/teams/${id}`, {
    method: 'DELETE',
  });
}

export async function uploadTeamLogo(teamId, file) {
  const fd = new FormData();
  fd.append('logo', file);
  return apiFetch(`/teams/${teamId}/logo`, { method: 'POST', body: fd });
}

export async function removeTeamLogo(teamId) {
  return apiFetch(`/teams/${teamId}/logo`, { method: 'DELETE' });
}

// ── Positions ──

export async function fetchPositions() {
  return apiFetch('/positions');
}

// ── Players ──

export async function fetchPlayersByTeam(teamId) {
  return apiFetch(`/players?team_id=${teamId}`);
}

export async function fetchPlayer(playerId) {
  return apiFetch(`/players/${playerId}`);
}

export async function createPlayer(data) {
  return apiFetch('/players', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePlayer(playerId, data) {
  return apiFetch(`/players/${playerId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deletePlayer(playerId) {
  return apiFetch(`/players/${playerId}`, {
    method: 'DELETE',
  });
}

export async function searchPlayers(query) {
  return apiFetch(`/players?search=${encodeURIComponent(query)}`);
}

export async function assignPlayerToTeam(teamId, playerId, jerseyNumber) {
  return apiFetch('/players/assign', {
    method: 'POST',
    body: JSON.stringify({ team_id: teamId, player_id: playerId, jersey_number: jerseyNumber || null }),
  });
}

export async function unassignPlayerFromTeam(teamId, playerId) {
  return apiFetch('/players/unassign', {
    method: 'POST',
    body: JSON.stringify({ team_id: teamId, player_id: playerId }),
  });
}

export async function updatePlayerJersey(teamId, playerId, jerseyNumber) {
  return apiFetch('/players/jersey', {
    method: 'PUT',
    body: JSON.stringify({ team_id: teamId, player_id: playerId, jersey_number: jerseyNumber || null }),
  });
}

export async function fetchAllPlayers(filters = {}) {
  const params = new URLSearchParams();
  if (filters.org_id) params.set('org_id', filters.org_id);
  if (filters.team_id) params.set('team_id', filters.team_id);
  if (filters.search) params.set('search', filters.search);
  params.set('with_teams', 'true');
  return apiFetch(`/players?${params}`);
}

// ── Player Guardians ──

export async function fetchPlayerContacts(playerId) {
  return apiFetch(`/player-contacts/${playerId}`);
}
export const fetchPlayerGuardians = fetchPlayerContacts;

export async function createPlayerContact(playerId, data) {
  return apiFetch(`/player-contacts/${playerId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
export const createPlayerGuardian = createPlayerContact;

export async function updatePlayerContact(playerId, contactId, data) {
  return apiFetch(`/player-contacts/${playerId}/${contactId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
export const updatePlayerGuardian = updatePlayerContact;

export async function deletePlayerContact(playerId, contactId) {
  return apiFetch(`/player-contacts/${playerId}/${contactId}`, { method: 'DELETE' });
}
export const deletePlayerGuardian = deletePlayerContact;

// ── Player Notes ──

export async function fetchPlayerNotes(playerId) {
  return apiFetch(`/player-notes/${playerId}`);
}

export async function createPlayerNote(playerId, note) {
  return apiFetch(`/player-notes/${playerId}`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export async function updatePlayerNote(playerId, noteId, note) {
  return apiFetch(`/player-notes/${playerId}/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify({ note }),
  });
}

export async function deletePlayerNote(playerId, noteId) {
  return apiFetch(`/player-notes/${playerId}/${noteId}`, { method: 'DELETE' });
}

// ── Player Documents ──

export async function fetchPlayerDocuments(playerId) {
  return apiFetch(`/player-documents/${playerId}`);
}

export async function uploadPlayerDocument(playerId, file, docType = 'birth_certificate') {
  const fd = new FormData();
  fd.append('document', file);
  fd.append('doc_type', docType);
  return apiFetch(`/player-documents/${playerId}`, { method: 'POST', body: fd });
}

export async function downloadPlayerDocument(playerId, docId) {
  return apiFetch(`/player-documents/${playerId}/${docId}/download`);
}

export async function deletePlayerDocument(playerId, docId) {
  return apiFetch(`/player-documents/${playerId}/${docId}`, { method: 'DELETE' });
}

// ── Stat Definitions ──

export async function fetchStatDefinitions(filters = {}) {
  const params = new URLSearchParams();
  if (filters.category) params.set('category', filters.category);
  if (filters.active_only) params.set('active_only', 'true');
  const qs = params.toString();
  return apiFetch(`/stats/definitions${qs ? '?' + qs : ''}`);
}

export async function createStatDefinition(data) {
  return apiFetch('/stats/definitions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateStatDefinition(id, data) {
  return apiFetch(`/stats/definitions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteStatDefinition(id) {
  return apiFetch(`/stats/definitions/${id}`, { method: 'DELETE' });
}

// ── Player Game Stats ──

export async function fetchPlayerStats(playerId, gameId) {
  const params = gameId ? `?game_id=${gameId}` : '';
  return apiFetch(`/stats/player/${playerId}${params}`);
}

export async function fetchGameStats(gameId) {
  return apiFetch(`/stats/game/${gameId}`);
}

export async function savePlayerGameStats(playerId, gameId, stats, teamId) {
  return apiFetch(`/stats/player/${playerId}/game/${gameId}`, {
    method: 'POST',
    body: JSON.stringify({ stats, team_id: teamId }),
  });
}

export async function clearPlayerGameStats(playerId, gameId) {
  return apiFetch(`/stats/player/${playerId}/game/${gameId}`, { method: 'DELETE' });
}

// ── Staff ──

export async function fetchStaffByTeam(teamId) {
  return apiFetch(`/staff?team_id=${teamId}`);
}

export async function createStaff(data) {
  return apiFetch('/staff', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateStaff(staffId, data) {
  return apiFetch(`/staff/${staffId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteStaff(staffId) {
  return apiFetch(`/staff/${staffId}`, {
    method: 'DELETE',
  });
}

export async function searchStaff(query) {
  return apiFetch(`/staff?search=${encodeURIComponent(query)}`);
}

export async function assignStaffToTeam(teamId, staffId, role) {
  return apiFetch('/staff/assign', {
    method: 'POST',
    body: JSON.stringify({ team_id: teamId, staff_id: staffId, role }),
  });
}

export async function unassignStaffFromTeam(teamId, staffId) {
  return apiFetch('/staff/unassign', {
    method: 'POST',
    body: JSON.stringify({ team_id: teamId, staff_id: staffId }),
  });
}

// ── Games / Schedule ──

export async function fetchGames(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(filters)) {
    if (val != null && val !== '') params.append(key, val);
  }
  const qs = params.toString();
  return apiFetch(`/games${qs ? '?' + qs : ''}`);
}

export async function fetchGame(gameId) {
  return apiFetch(`/games/${gameId}`);
}

export async function createGame(data) {
  return apiFetch('/games', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateGame(gameId, data) {
  return apiFetch(`/games/${gameId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteGame(gameId) {
  return apiFetch(`/games/${gameId}`, {
    method: 'DELETE',
  });
}

export async function heartbeatGame(gameId) {
  return apiFetch(`/games/${gameId}/heartbeat`, { method: 'PUT' });
}

// ── Standings ──

export async function fetchStandings(seasonId) {
  return apiFetch(`/games/standings?season_id=${seasonId}`);
}

// ── Pitch Counts ──

export async function fetchPitchCounts(gameId) {
  return apiFetch(`/games/${gameId}/pitch-counts`);
}

export async function createPitchCount(gameId, data) {
  return apiFetch(`/games/${gameId}/pitch-counts`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePitchCount(gameId, id, data) {
  return apiFetch(`/games/${gameId}/pitch-counts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deletePitchCount(gameId, id) {
  return apiFetch(`/games/${gameId}/pitch-counts/${id}`, {
    method: 'DELETE',
  });
}

// ── Pitch Rules ──

export async function fetchPitchEligibility(teamId, gameDate, gameId) {
  const params = new URLSearchParams({ team_id: teamId, game_date: gameDate });
  if (gameId) params.set('game_id', gameId);
  return apiFetch(`/pitch-rules/eligibility?${params}`);
}

export async function fetchTeamPitcherStats(teamId) {
  return apiFetch(`/pitch-rules/team-stats?team_id=${teamId}`);
}

export async function fetchAllPitchRest() {
  return apiFetch('/pitch-rules/all-rest');
}

// ── Dashboard ──

export async function fetchDashboardActivity(limit = 15) {
  return apiFetch(`/dashboard/activity?limit=${limit}`);
}

// ── Announcements ──

export async function fetchAnnouncements() {
  return apiFetch('/announcements');
}

export async function fetchAllAnnouncements() {
  return apiFetch('/announcements/all');
}

export async function createAnnouncement(data) {
  return apiFetch('/announcements', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateAnnouncement(id, data) {
  return apiFetch(`/announcements/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteAnnouncement(id) {
  return apiFetch(`/announcements/${id}`, { method: 'DELETE' });
}

// ── Weather ──

export async function fetchWeather(lat, lon) {
  return apiFetch(`/weather?lat=${lat}&lon=${lon}`);
}

export async function fetchWeatherForecast(lat, lon, date, time) {
  const params = new URLSearchParams({ lat, lon, date });
  if (time) params.set('time', time);
  return apiFetch(`/weather/forecast?${params}`);
}

// ── Organizations ──

export async function fetchOrganizations() {
  return apiFetch('/organizations');
}

export async function fetchDirectory() {
  return apiFetch('/organizations/directory');
}

export async function fetchOrganization(orgId) {
  return apiFetch(`/organizations/${orgId}`);
}

export async function createOrganization(data) {
  return apiFetch('/organizations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateOrganization(orgId, data) {
  return apiFetch(`/organizations/${orgId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteOrganization(orgId) {
  return apiFetch(`/organizations/${orgId}`, {
    method: 'DELETE',
  });
}

export async function uploadOrgLogo(orgId, file) {
  const fd = new FormData();
  fd.append('logo', file);
  return apiFetch(`/organizations/${orgId}/logo`, { method: 'POST', body: fd });
}

export async function removeOrgLogo(orgId) {
  return apiFetch(`/organizations/${orgId}/logo`, { method: 'DELETE' });
}

// ── Officials ──

export async function fetchOfficials(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(filters)) {
    if (val != null && val !== '') params.append(key, val);
  }
  const qs = params.toString();
  return apiFetch(`/officials${qs ? '?' + qs : ''}`);
}

export async function fetchAssignableOfficials(orgId) {
  return apiFetch(`/officials/assignable?org_id=${orgId}`);
}

export async function createOfficial(data) {
  return apiFetch('/officials', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateOfficial(id, data) {
  return apiFetch(`/officials/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteOfficial(id) {
  return apiFetch(`/officials/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchOfficialDetail(id) {
  return apiFetch(`/officials/${id}/detail`);
}

export async function fetchOfficialGames(id) {
  return apiFetch(`/officials/${id}/games`);
}

export async function updateOfficialGamePayment(officialId, gameId, data) {
  return apiFetch(`/officials/${officialId}/games/${gameId}/payment`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateOfficialAgeGroups(officialId, ageGroupIds) {
  return apiFetch(`/officials/${officialId}/age-groups`, {
    method: 'PUT',
    body: JSON.stringify({ age_group_ids: ageGroupIds }),
  });
}

export async function fetchOfficialInterestedGames(id) {
  return apiFetch(`/officials/${id}/interested-games`);
}

export async function assignOfficialToGame(officialId, gameId) {
  return apiFetch(`/officials/${officialId}/games/${gameId}/assign`, { method: 'POST' });
}

export async function unassignOfficialFromGame(officialId, gameId) {
  return apiFetch(`/officials/${officialId}/games/${gameId}/assign`, { method: 'DELETE' });
}

// ── Field Locations ──

export async function fetchLocations(orgId) {
  const q = orgId ? `?org_id=${orgId}` : '';
  return apiFetch(`/locations${q}`);
}

export async function createLocation(data) {
  return apiFetch('/locations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateLocation(locId, data) {
  return apiFetch(`/locations/${locId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteLocation(locId) {
  return apiFetch(`/locations/${locId}`, {
    method: 'DELETE',
  });
}

// ── Reservations ──

export async function fetchReservations(locationId, from, to) {
  const params = new URLSearchParams({ location_id: locationId });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return apiFetch(`/reservations?${params}`);
}

export async function fetchTeamPractices(teamId) {
  return apiFetch(`/reservations/team/${teamId}`);
}

export async function createReservation(data) {
  return apiFetch('/reservations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateReservation(id, data) {
  return apiFetch(`/reservations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteReservation(id) {
  return apiFetch(`/reservations/${id}`, {
    method: 'DELETE',
  });
}

export async function checkGameConflicts(locationId, gameDate, gameTime) {
  return apiFetch(`/reservations/check-game-conflicts?location_id=${locationId}&game_date=${gameDate}&game_time=${gameTime}`);
}

// ── League Config ──

export async function fetchAgeGroups() {
  return apiFetch('/league-config/age-groups');
}

export async function createAgeGroup(data) {
  return apiFetch('/league-config/age-groups', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAgeGroup(id, data) {
  return apiFetch(`/league-config/age-groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAgeGroup(id) {
  return apiFetch(`/league-config/age-groups/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchLevels() {
  return apiFetch('/league-config/levels');
}

export async function createLevel(data) {
  return apiFetch('/league-config/levels', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateLevel(id, data) {
  return apiFetch(`/league-config/levels/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteLevel(id) {
  return apiFetch(`/league-config/levels/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchDivisions(seasonId) {
  const url = seasonId ? `/league-config/divisions?season_id=${seasonId}` : '/league-config/divisions';
  return apiFetch(url);
}

export async function createDivision(data) {
  return apiFetch('/league-config/divisions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateDivision(id, data) {
  return apiFetch(`/league-config/divisions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteDivision(id) {
  return apiFetch(`/league-config/divisions/${id}`, {
    method: 'DELETE',
  });
}

// ── Seasons ──

export async function fetchSeasons() {
  return apiFetch('/league-config/seasons');
}

export async function fetchBranding() {
  return apiFetch('/league-config/branding');
}

export async function updateBranding(data) {
  return apiFetch('/league-config/branding', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function uploadBrandingLogo(file) {
  const fd = new FormData();
  fd.append('logo', file);
  return apiFetch('/league-config/branding/logo', {
    method: 'POST',
    body: fd,
  });
}

export async function deleteBrandingLogo() {
  return apiFetch('/league-config/branding/logo', { method: 'DELETE' });
}

export async function fetchScheduleSettings() {
  return apiFetch('/league-config/schedule-settings');
}

export async function updateScheduleSettings(data) {
  return apiFetch('/league-config/schedule-settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function fetchFeatureToggles() {
  return apiFetch('/league-config/features');
}

export async function updateFeatureToggles(data) {
  return apiFetch('/league-config/features', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function createSeason(data) {
  return apiFetch('/league-config/seasons', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSeason(id, data) {
  return apiFetch(`/league-config/seasons/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteSeason(id) {
  return apiFetch(`/league-config/seasons/${id}`, {
    method: 'DELETE',
  });
}

// ── Users (admin) ──

export async function fetchMe() {
  return apiFetch('/auth/me');
}

export async function fetchUsers() {
  return apiFetch('/users');
}

export async function createUser(data) {
  return apiFetch('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUser(userId, data) {
  return apiFetch(`/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(userId) {
  return apiFetch(`/users/${userId}`, {
    method: 'DELETE',
  });
}

export async function updateUserPermissions(userId, permissions) {
  return apiFetch(`/users/${userId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify(permissions),
  });
}

// ── Data Manager ──

export async function clearData(entities) {
  return apiFetch('/data-manager/clear', {
    method: 'POST',
    body: JSON.stringify({ entities }),
  });
}

export function exportDataUrl(entity, { teamId, orgId } = {}) {
  const params = new URLSearchParams();
  if (teamId) params.set('team_id', teamId);
  if (orgId) params.set('org_id', orgId);
  const qs = params.toString();
  return `${API_BASE}/data-manager/export/${entity}${qs ? '?' + qs : ''}`;
}

export async function importData(entity, csv, mode, seasonId) {
  return apiFetch(`/data-manager/import/${entity}`, {
    method: 'POST',
    body: JSON.stringify({ csv, mode, season_id: seasonId }),
  });
}

/* ── GameChanger Import ── */
export async function importGameChanger(fileOrText, importType, options = {}) {
  if (typeof fileOrText === 'string') {
    // Pasted text mode — send as JSON
    return apiFetch('/import/gamechanger', {
      method: 'POST',
      body: JSON.stringify({
        pastedText: fileOrText,
        importType,
        gameId: options.gameId || undefined,
        teamId: options.teamId || undefined,
        seasonId: options.seasonId || undefined,
        overwrite: options.overwrite ?? undefined,
        onlyNew: options.onlyNew ?? undefined,
        teamMappings: options.teamMappings || undefined,
        playerMappings: options.playerMappings || undefined,
        columnMappings: options.columnMappings || undefined,
      }),
    });
  }
  const fd = new FormData();
  fd.append('gamechangerFile', fileOrText);
  fd.append('importType', importType);
  if (options.gameId) fd.append('gameId', options.gameId);
  if (options.teamId) fd.append('teamId', options.teamId);
  if (options.seasonId) fd.append('seasonId', options.seasonId);
  if (options.overwrite != null) fd.append('overwrite', String(options.overwrite));
  if (options.onlyNew != null) fd.append('onlyNew', String(options.onlyNew));
  if (options.teamMappings) fd.append('teamMappings', JSON.stringify(options.teamMappings));
  if (options.playerMappings) fd.append('playerMappings', JSON.stringify(options.playerMappings));
  if (options.columnMappings) fd.append('columnMappings', JSON.stringify(options.columnMappings));
  return apiFetch('/import/gamechanger', { method: 'POST', body: fd });
}

export async function previewGameChanger(fileOrText, importType) {
  if (typeof fileOrText === 'string') {
    // Pasted text mode — send as JSON
    return apiFetch('/import/gamechanger/preview', {
      method: 'POST',
      body: JSON.stringify({ pastedText: fileOrText, importType, preview: 'true' }),
    });
  }
  const fd = new FormData();
  fd.append('gamechangerFile', fileOrText);
  fd.append('importType', importType);
  fd.append('preview', 'true');
  return apiFetch('/import/gamechanger/preview', { method: 'POST', body: fd });
}

/* ── Team Name Aliases ── */

/* ── Schedule Import ── */
export async function previewScheduleImport(csvText) {
  return apiFetch('/import/schedule/preview', {
    method: 'POST',
    body: JSON.stringify({ csvText }),
  });
}

export async function importSchedule(games, seasonId, teamMappings, venueMappings) {
  return apiFetch('/import/schedule', {
    method: 'POST',
    body: JSON.stringify({ games, seasonId, teamMappings, venueMappings }),
  });
}

/* ── Team Name Aliases (legacy) ── */
export async function fetchTeamAliases() {
  return apiFetch('/import/team-aliases');
}

export async function createTeamAlias(externalName, teamId, source = 'gamechanger') {
  return apiFetch('/import/team-aliases', {
    method: 'POST',
    body: JSON.stringify({ externalName, teamId, source }),
  });
}

export async function deleteTeamAlias(id) {
  return apiFetch(`/import/team-aliases/${id}`, { method: 'DELETE' });
}

/* ── Contact / Email ── */
export async function fetchContactRecipients(scope, scopeId) {
  const params = new URLSearchParams({ scope });
  if (scopeId) params.set('scopeId', scopeId);
  return apiFetch(`/contact/recipients?${params}`);
}

export async function sendContactEmail({ scope, scopeId, subject, body }) {
  return apiFetch('/contact', {
    method: 'POST',
    body: JSON.stringify({ scope, scopeId, subject, body }),
  });
}

/* ── Umpires ── */
export async function fetchUmpireUsers() {
  return apiFetch('/officials/umpire-users');
}

export async function registerAsUmpire(username, password, name, email, phone, org_ids, date_of_birth, is_certified, years_of_experience) {
  return apiFetch('/auth/register-umpire', {
    method: 'POST',
    body: JSON.stringify({ username, password, name, email, phone, org_ids, date_of_birth, is_certified, years_of_experience }),
  });
}

export async function fetchUmpireProfile() {
  return apiFetch('/umpires/me');
}

export async function fetchAssignedGames() {
  return apiFetch('/umpires/assigned-games');
}

export async function fetchAvailableGames(seasonId = null) {
  const params = seasonId ? `?season_id=${seasonId}` : '';
  return apiFetch(`/umpires/available-games${params}`);
}

export async function fetchGameInterests() {
  return apiFetch('/umpires/game-interests');
}

export async function expressGameInterest(gameId) {
  return apiFetch('/umpires/interest', {
    method: 'POST',
    body: JSON.stringify({ game_id: gameId }),
  });
}

export async function removeGameInterest(gameId) {
  return apiFetch(`/umpires/interest/${gameId}`, { method: 'DELETE' });
}

// ── Registrations (League Fees) ──

export async function fetchRegistrations(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(filters)) {
    if (val != null && val !== '') params.append(key, val);
  }
  const qs = params.toString();
  return apiFetch(`/registrations${qs ? '?' + qs : ''}`);
}

export async function createRegistration(data) {
  return apiFetch('/registrations', { method: 'POST', body: JSON.stringify(data) });
}

export async function bulkRegisterTeams(seasonId) {
  return apiFetch('/registrations/bulk', { method: 'POST', body: JSON.stringify({ season_id: seasonId }) });
}

export async function updateRegistration(id, data) {
  return apiFetch(`/registrations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteRegistration(id) {
  return apiFetch(`/registrations/${id}`, { method: 'DELETE' });
}

// ── Team Registration (Travel Director) ──

export async function fetchRegistrationConfig() {
  return apiFetch('/auth/registration-config');
}

export async function registerDirector(data) {
  return apiFetch('/auth/register-director', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function registerCoach(data) {
  return apiFetch('/auth/register-coach', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function confirmEmail(token) {
  return apiFetch(`/auth/confirm-email?token=${encodeURIComponent(token)}`);
}

export async function resendConfirmation(email) {
  return apiFetch('/auth/resend-confirmation', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

// ── Approval Workflow ──

export async function fetchPendingApprovals() {
  return apiFetch('/users/pending');
}

export async function approveUser(userId) {
  return apiFetch(`/users/${userId}/approve`, { method: 'POST' });
}

export async function rejectUser(userId, notes) {
  return apiFetch(`/users/${userId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

export async function resetUserApproval(userId) {
  return apiFetch(`/users/${userId}/reset-approval`, { method: 'POST' });
}

// ── Push Notifications ──

export async function fetchVapidKey() {
  return apiFetch('/push/vapid-key');
}

export async function pushSubscribe(subscription) {
  return apiFetch('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
}

export async function pushUnsubscribe(endpoint) {
  return apiFetch('/push/unsubscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });
}

export async function fetchPushStatus() {
  return apiFetch('/push/status');
}

export async function fetchPushDebug() {
  return apiFetch('/push/debug');
}

export async function sendTestPush() {
  return apiFetch('/push/test', { method: 'POST' });
}

export async function fetchNotificationPrefs() {
  return apiFetch('/push/preferences');
}

export async function updateNotificationPrefs(prefs) {
  return apiFetch('/push/preferences', {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
}

export async function sendPushNotification({ title, body, scope, teamIds, orgIds, url }) {
  return apiFetch('/push/send', {
    method: 'POST',
    body: JSON.stringify({ title, body, scope, teamIds, orgIds, url }),
  });
}

// ── Volunteer Roles (config) ──

export async function fetchVolunteerRoles() {
  return apiFetch('/league-config/volunteer-roles');
}

export async function createVolunteerRole(data) {
  return apiFetch('/league-config/volunteer-roles', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateVolunteerRole(id, data) {
  return apiFetch(`/league-config/volunteer-roles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteVolunteerRole(id) {
  return apiFetch(`/league-config/volunteer-roles/${id}`, {
    method: 'DELETE',
  });
}

// ── Guardian Volunteer Interests ──

export async function fetchGuardianVolunteers(guardianId) {
  return apiFetch(`/player-contacts/guardian/${guardianId}/volunteers`);
}

export async function updateGuardianVolunteers(guardianId, roleIds) {
  return apiFetch(`/player-contacts/guardian/${guardianId}/volunteers`, {
    method: 'PUT',
    body: JSON.stringify({ role_ids: roleIds }),
  });
}

// ── All Guardians ──

export async function fetchAllGuardians() {
  return apiFetch('/player-contacts/all-guardians');
}
