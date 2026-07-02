// ─── Predefined Mock Scenarios ──────────────────────────────────────────────────

export const MOCK_SINGLE_ELIM = [
  {
    title: 'Quarterfinals',
    matches: [
      { id: 1, nextMatchId: 5, teams: [{ id: 1, name: 'Eagles', score: 0, is_temp: false }, { id: 2, name: 'Falcons', score: 0, is_temp: false }] },
      { id: 2, nextMatchId: 5, teams: [{ id: 3, name: 'Tigers', score: 0, is_temp: false }, { id: 4, name: 'Lions', score: 0, is_temp: false }] },
      { id: 3, nextMatchId: 6, teams: [{ id: 'temp_1', name: 'Waitlist Team A', score: 0, is_temp: true }, { id: 6, name: 'Wolves', score: 0, is_temp: false }] },
      { id: 4, nextMatchId: 6, teams: [{ id: 7, name: 'Sharks', score: 0, is_temp: false }, { id: 8, name: 'Dolphins', score: 0, is_temp: false }] },
    ]
  },
  {
    title: 'Semifinals',
    matches: [
      { id: 5, nextMatchId: 7, teams: [null, null] },
      { id: 6, nextMatchId: 7, teams: [null, null] },
    ]
  },
  {
    title: 'Championship',
    matches: [
      { id: 7, nextMatchId: null, teams: [null, null] },
    ]
  }
];

export const MOCK_IN_PROGRESS = [
  {
    title: 'Quarterfinals',
    matches: [
      { id: 1, nextMatchId: 5, winnerId: 1, teams: [{ id: 1, name: 'Eagles', score: 5, is_temp: false }, { id: 2, name: 'Falcons', score: 2, is_temp: false }] },
      { id: 2, nextMatchId: 5, winnerId: 3, teams: [{ id: 3, name: 'Tigers', score: 4, is_temp: false }, { id: 4, name: 'Lions', score: 3, is_temp: false }] },
      { id: 3, nextMatchId: 6, winnerId: 6, teams: [{ id: 'temp_1', name: 'Waitlist Team A', score: 1, is_temp: true }, { id: 6, name: 'Wolves', score: 7, is_temp: false }] },
      { id: 4, nextMatchId: 6, teams: [{ id: 7, name: 'Sharks', score: 0, is_temp: false }, { id: 8, name: 'Dolphins', score: 0, is_temp: false }] }, // match still pending
    ]
  },
  {
    title: 'Semifinals',
    matches: [
      { id: 5, nextMatchId: 7, teams: [{ id: 1, name: 'Eagles', score: 0, is_temp: false }, { id: 3, name: 'Tigers', score: 0, is_temp: false }] },
      { id: 6, nextMatchId: 7, teams: [{ id: 6, name: 'Wolves', score: 0, is_temp: false }, null] },
    ]
  },
  {
    title: 'Championship',
    matches: [
      { id: 7, nextMatchId: null, teams: [null, null] },
    ]
  }
];

export const MOCK_DOUBLE_ELIM = [
  {
    title: 'Upper Bracket R1',
    matches: [
      { id: 1, nextMatchId: 3, loserMatchId: 4, teams: [{ id: 1, name: 'Red Sox', score: 0 }, { id: 2, name: 'Yankees', score: 0 }] },
      { id: 2, nextMatchId: 3, loserMatchId: 4, teams: [{ id: 3, name: 'Dodgers', score: 0 }, { id: 4, name: 'Giants', score: 0 }] },
    ]
  },
  {
    title: 'Upper Final / Lower R1',
    matches: [
      { id: 3, title: 'Upper Final', nextMatchId: 5, loserMatchId: 5, teams: [null, null] },
      { id: 4, title: 'Lower Bracket', nextMatchId: 5, teams: [null, null] },
    ]
  },
  {
    title: 'Grand Final',
    matches: [
      { id: 5, nextMatchId: null, teams: [null, null] },
    ]
  }
];

export const fetchTestBracketData = async (scenario = 'MOCK_SINGLE_ELIM') => {
  // Simulate a network delay
  return new Promise((resolve) => {
    setTimeout(() => {
      if (scenario === 'MOCK_IN_PROGRESS') {
        resolve(MOCK_IN_PROGRESS);
      } else if (scenario === 'MOCK_DOUBLE_ELIM') {
        resolve(MOCK_DOUBLE_ELIM);
      } else {
        resolve(MOCK_SINGLE_ELIM);
      }
    }, 500);
  });
};
