const API_BASE = '/api';

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
    localStorage.removeItem('zvbl_roster_auth');
    window.location.reload();
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `API error: ${response.status}`);
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

export async function register(username, password, name, email) {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, name, email }),
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

export function exportDataUrl(entity) {
  return `${API_BASE}/data-manager/export/${entity}`;
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
        teamId: options.teamId || undefined,
        seasonId: options.seasonId || undefined,
        overwrite: options.overwrite ?? undefined,
        onlyNew: options.onlyNew ?? undefined,
        teamMappings: options.teamMappings || undefined,
        playerMappings: options.playerMappings || undefined,
      }),
    });
  }
  const fd = new FormData();
  fd.append('gamechangerFile', fileOrText);
  fd.append('importType', importType);
  if (options.teamId) fd.append('teamId', options.teamId);
  if (options.seasonId) fd.append('seasonId', options.seasonId);
  if (options.overwrite != null) fd.append('overwrite', String(options.overwrite));
  if (options.onlyNew != null) fd.append('onlyNew', String(options.onlyNew));
  if (options.teamMappings) fd.append('teamMappings', JSON.stringify(options.teamMappings));
  if (options.playerMappings) fd.append('playerMappings', JSON.stringify(options.playerMappings));
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
