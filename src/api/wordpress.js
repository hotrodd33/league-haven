const API_BASE = '/wp-json/sportspress/v2';

function authHeaders(credentials) {
  const encoded = btoa(`${credentials.username}:${credentials.appPassword}`);
  return {
    Authorization: `Basic ${encoded}`,
    'Content-Type': 'application/json',
  };
}

async function apiFetch(endpoint, credentials, options = {}) {
  const url = `${credentials.siteUrl}${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(credentials),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.message || `API error: ${response.status} ${response.statusText}`
    );
  }

  if (response.status === 204) return null;
  return response.json();
}

// ── Teams ──
// SportsPress registers sp_team with rest_base 'teams'

export async function fetchTeams(credentials) {
  return apiFetch('/teams?per_page=100&orderby=title&order=asc', credentials);
}

// ── Positions ──
// SportsPress sp_position taxonomy

export async function fetchPositions(credentials) {
  return apiFetch('/positions?per_page=100', credentials);
}

// ── Players ──
// SportsPress registers sp_player with rest_base 'players'

export async function fetchPlayersByTeam(credentials, teamId) {
  // SportsPress v2 doesn't support filtering players by team as a query param.
  // Fetch all players and filter client-side by team membership.
  const allPlayers = await apiFetch(
    '/players?per_page=100&orderby=title&order=asc',
    credentials
  );
  const tid = Number(teamId);
  return allPlayers.filter(
    (p) =>
      (Array.isArray(p.teams) && p.teams.includes(tid)) ||
      (Array.isArray(p.current_teams) && p.current_teams.includes(tid))
  );
}

export async function fetchPlayer(credentials, playerId) {
  return apiFetch(`/players/${playerId}`, credentials);
}

export async function createPlayer(credentials, playerData) {
  const { body, meta } = buildPlayerBody(playerData);
  const player = await apiFetch('/players', credentials, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (Object.keys(meta).length > 0) {
    await savePlayerMeta(credentials, player.id, meta);
  }
  return player;
}

export async function updatePlayer(credentials, playerId, playerData) {
  const { body, meta } = buildPlayerBody(playerData);
  const player = await apiFetch(`/players/${playerId}`, credentials, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  await savePlayerMeta(credentials, playerId, meta);
  return player;
}

export async function deletePlayer(credentials, playerId) {
  return apiFetch(`/players/${playerId}?force=true`, credentials, {
    method: 'DELETE',
  });
}

// ── Validate credentials ──

export async function validateCredentials(credentials) {
  // Try fetching the current user to validate
  const url = `${credentials.siteUrl}/wp-json/wp/v2/users/me`;
  const response = await fetch(url, {
    headers: authHeaders(credentials),
  });
  if (!response.ok) {
    throw new Error('Invalid credentials or site URL');
  }
  return response.json();
}

// ── Custom meta via ZVBL plugin ──

async function savePlayerMeta(credentials, playerId, meta) {
  const url = `${credentials.siteUrl}/wp-json/zvbl/v1/player-meta/${playerId}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: authHeaders(credentials),
    body: JSON.stringify(meta),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || 'Failed to save player meta');
  }
  return response.json();
}

export async function fetchPlayerMeta(credentials, playerId) {
  const url = `${credentials.siteUrl}/wp-json/zvbl/v1/player-meta/${playerId}`;
  const response = await fetch(url, {
    headers: authHeaders(credentials),
  });
  if (!response.ok) return {};
  return response.json();
}

// ── Helpers ──

function buildPlayerBody(data) {
  const body = {
    title: data.name,
    status: 'publish',
  };

  // Team assignment — SportsPress exposes this as 'teams' in REST
  if (data.teamId) {
    body.teams = [Number(data.teamId)];
  }

  // Position assignment — SportsPress exposes as 'positions' in REST
  if (data.positions && data.positions.length > 0) {
    body.positions = data.positions.map(Number);
  }

  // Jersey number — SportsPress exposes as top-level 'number'
  if (data.jerseyNumber !== undefined && data.jerseyNumber !== '') {
    body.number = Number(data.jerseyNumber);
  }

  // Custom meta fields — saved via ZVBL plugin endpoint
  const meta = {};
  if (data.dateOfBirth !== undefined) {
    meta.zvbl_date_of_birth = data.dateOfBirth;
  }
  if (data.battingHand !== undefined) {
    meta.zvbl_batting_hand = data.battingHand;
  }
  if (data.throwingHand !== undefined) {
    meta.zvbl_throwing_hand = data.throwingHand;
  }
  if (data.parentEmail !== undefined) {
    meta.zvbl_parent_email = data.parentEmail;
  }
  if (data.parentPhone !== undefined) {
    meta.zvbl_parent_phone = data.parentPhone;
  }

  return { body, meta };
}
