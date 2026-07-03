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
  if (params.team_id)   qs.set('team_id',   params.team_id);
  if (params.status)    qs.set('status',     params.status);
  if (params.from)      qs.set('from',       params.from);
  if (params.to)        qs.set('to',         params.to);
  qs.set('slim', 'true'); // public site only needs display fields
  const q = qs.toString();
  return apiFetch(`/games${q ? '?' + q : ''}`);
}

export function fetchDivisions() {
  return apiFetch('/league-config/divisions');
}

export function fetchBranding() {
  return apiFetch('/league-config/branding');
}

export function fetchTeamRoster(teamId) {
  return apiFetch(`/players?team_id=${teamId}&with_teams=true`);
}

export function fetchTeamStaff(teamId) {
  return apiFetch(`/staff?team_id=${teamId}`);
}

export function fetchTravelMatrix() {
  return apiFetch('/travel');
}

export function fetchTournaments(params = {}) {
  const qs = new URLSearchParams();
  if (params.registration_open) qs.set('registration_open', '1');
  if (params.org_id) qs.set('org_id', params.org_id);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const q = qs.toString();
  return apiFetch(`/tournaments${q ? '?' + q : ''}`);
}

export function fetchTournament(id) {
  return apiFetch(`/tournaments/${id}`);
}

export function fetchTournamentPools(tournamentId) {
  return apiFetch(`/tournaments/${tournamentId}/pools`);
}

export function fetchPoolStandings(tournamentId, poolId) {
  return apiFetch(`/tournaments/${tournamentId}/pools/${poolId}/standings`);
}

export function fetchGame(gameId) {
  return apiFetch(`/games/${gameId}`);
}

export function fetchPitchCounts(gameId) {
  return apiFetch(`/games/${gameId}/pitch-counts`);
}
