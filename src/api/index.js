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
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiFetch(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...options.headers,
    },
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

export async function register(username, password, name) {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, name }),
  });
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

// ── Organizations ──

export async function fetchOrganizations() {
  return apiFetch('/organizations');
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
