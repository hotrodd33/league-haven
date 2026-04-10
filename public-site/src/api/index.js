const API_BASE = '/api';

async function apiFetch(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export function fetchTeams(orgId) {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch(`/teams${qs}`);
}

export function fetchOrganizations() {
  return apiFetch('/organizations');
}

export function fetchSeasons() {
  return apiFetch('/league-config/seasons');
}

export function fetchStandings(seasonId) {
  return apiFetch(`/games/standings?season_id=${seasonId}`);
}

export function fetchGames(params = {}) {
  const qs = new URLSearchParams();
  if (params.season_id) qs.set('season_id', params.season_id);
  if (params.team_id) qs.set('team_id', params.team_id);
  if (params.status) qs.set('status', params.status);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const q = qs.toString();
  return apiFetch(`/games${q ? '?' + q : ''}`);
}

export function fetchDivisions() {
  return apiFetch('/league-config/divisions');
}
