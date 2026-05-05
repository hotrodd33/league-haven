import React, { useState, useEffect } from 'react';
import TournamentBracket from '../src/components/TournamentBracket';

export default {
  title: 'Components/TournamentBracket',
  component: TournamentBracket,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    bracketData: {
      control: 'object',
      description: 'The JSON data feeding the bracket. Edit this directly to see UI changes instantly.'
    },
    bracketName: {
      control: 'text'
    }
  }
};

// ─── Mock Data Generators ───────────────────────────────────────────────────

const generateSingleElimData = () => {
  return [
    {
      title: 'Quarterfinals',
      matches: [
        { id: 1, nextMatchId: 5, teams: [{ id: 1, name: 'Eagles', score: 0 }, { id: 2, name: 'Falcons', score: 0 }] },
        { id: 2, nextMatchId: 5, teams: [{ id: 3, name: 'Tigers', score: 0 }, { id: 4, name: 'Lions', score: 0 }] },
        { id: 3, nextMatchId: 6, teams: [{ id: 5, name: 'Bears', score: 0 }, { id: 6, name: 'Wolves', score: 0 }] },
        { id: 4, nextMatchId: 6, teams: [{ id: 7, name: 'Sharks', score: 0 }, { id: 8, name: 'Dolphins', score: 0 }] },
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
};

const generateDoubleElimData = () => {
  return [
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
};

// ─── Simulation Engine ──────────────────────────────────────────────────────

const simulateNextMatchResult = (currentData) => {
  const newData = JSON.parse(JSON.stringify(currentData));
  
  // Find first match that has two valid teams but no winner
  let matchToResolve = null;
  for (const round of newData) {
    for (const m of round.matches) {
      if (!m.winnerId && m.teams[0] !== null && m.teams[1] !== null && m.teams[0]?.name && m.teams[1]?.name) {
        matchToResolve = m;
        break;
      }
    }
    if (matchToResolve) break;
  }

  // If no matches are ready to be resolved, just return current data
  if (!matchToResolve) return newData; 

  // Generate random scores
  let score1 = Math.floor(Math.random() * 5) + 1;
  let score2 = Math.floor(Math.random() * 5) + 1;
  
  // Prevent ties for simplicity in this mock
  if (score1 === score2) score1 += 1;

  const t1 = matchToResolve.teams[0];
  const t2 = matchToResolve.teams[1];
  t1.score = score1;
  t2.score = score2;

  const winner = score1 > score2 ? t1 : t2;
  const loser = score1 > score2 ? t2 : t1;
  matchToResolve.winnerId = winner.id;

  // Helper to push a team to a target match
  const pushTeamToMatch = (teamData, targetMatchId) => {
    if (!targetMatchId) return;
    for (const round of newData) {
      const match = round.matches.find(x => x.id === targetMatchId);
      if (match) {
        const emptySlotIndex = match.teams.findIndex(t => t === null);
        if (emptySlotIndex !== -1) {
          match.teams[emptySlotIndex] = { ...teamData, score: 0 };
        } else {
          match.teams[0] = { ...teamData, score: 0 };
        }
      }
    }
  };

  // Advance winner
  pushTeamToMatch(winner, matchToResolve.nextMatchId);

  // Advance loser to lower bracket if applicable
  if (matchToResolve.loserMatchId) {
    pushTeamToMatch(loser, matchToResolve.loserMatchId);
  }

  return newData;
};

// ─── Stateful Container ─────────────────────────────────────────────────────

const BracketContainer = ({ bracketData: initialData, bracketName, enableSimulation = false }) => {
  const [data, setData] = useState(initialData);
  const [isSimulating, setIsSimulating] = useState(false);

  // Sync state if user edits JSON in Storybook Controls
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Handle Backend Simulation polling
  useEffect(() => {
    let interval;
    if (isSimulating) {
      interval = setInterval(() => {
        setData(prevData => simulateNextMatchResult(prevData));
      }, 2000); // Poll/update every 2 seconds
    }
    return () => clearInterval(interval);
  }, [isSimulating]);

  const handleAdvance = (match, winningTeam) => {
    if (!match.nextMatchId || match.winnerId) return;

    setData(prevData => {
      const newData = JSON.parse(JSON.stringify(prevData));
      
      const losingTeam = match.teams.find(t => t && t.id !== winningTeam.id) || null;

      const pushTeamToMatch = (teamData, targetMatchId) => {
        if (!targetMatchId || !teamData) return;
        for (const round of newData) {
          const m = round.matches.find(x => x.id === targetMatchId);
          if (m) {
            const emptySlotIndex = m.teams.findIndex(t => t === null);
            if (emptySlotIndex !== -1) {
              m.teams[emptySlotIndex] = { ...teamData, score: 0 };
            } else {
              m.teams[0] = { ...teamData, score: 0 };
            }
          }
        }
      };

      for (const round of newData) {
        const m = round.matches.find(x => x.id === match.id);
        if (m) m.winnerId = winningTeam.id;
      }

      pushTeamToMatch(winningTeam, match.nextMatchId);
      
      if (match.loserMatchId && losingTeam) {
        pushTeamToMatch(losingTeam, match.loserMatchId);
      }

      return newData;
    });
  };

  const handleScoreChange = (match, team, newScore) => {
    setData(prevData => {
      const newData = JSON.parse(JSON.stringify(prevData));
      for (const round of newData) {
        const m = round.matches.find(x => x.id === match.id);
        if (m) {
          const t = m.teams.find(x => x && x.id === team.id);
          if (t) t.score = newScore;
        }
      }
      return newData;
    });
  };

  return (
    <div className="w-full h-screen bg-slate-900 p-8 flex justify-center items-center relative">
      
      {/* Simulation Control Panel */}
      {enableSimulation && (
        <div className="absolute top-4 right-4 z-50 bg-slate-800/90 backdrop-blur-sm p-4 rounded-xl border border-slate-700 shadow-elevated w-72">
          <h3 className="text-white font-display text-lg mb-1">Backend Simulator</h3>
          <p className="text-slate-400 text-xs mb-4">
            Simulates the frontend polling the backend for updated match data every 2 seconds.
          </p>
          
          <button 
            onClick={() => setIsSimulating(!isSimulating)}
            className={`w-full py-2 rounded-lg font-semibold transition-colors flex justify-center items-center gap-2 ${
              isSimulating 
                ? 'bg-signal-500 hover:bg-signal-600 text-white shadow-glow-green' 
                : 'bg-sport hover:bg-sport-600 text-white'
            }`}
            style={isSimulating ? { boxShadow: '0 0 15px rgba(230, 57, 70, 0.4)' } : {}}
          >
            {isSimulating ? (
              <>
                <span className="live-ring bg-white"></span>
                Polling Backend...
              </>
            ) : (
              'Start Simulation'
            )}
          </button>
          
          <button 
            onClick={() => {
              setIsSimulating(false);
              setData(initialData); // Reset
            }}
            className="w-full mt-2 py-2 rounded-lg font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
          >
            Reset Bracket
          </button>
        </div>
      )}

      <div className="w-full max-w-7xl h-[800px]">
        <TournamentBracket 
          bracketName={bracketName}
          bracketData={data} 
          onAdvance={handleAdvance}
          onScoreChange={handleScoreChange}
        />
      </div>
    </div>
  );
};

// ─── Stories ────────────────────────────────────────────────────────────────

export const SingleElimination = {
  render: (args) => <BracketContainer {...args} />,
  args: {
    bracketName: "Summer Classic (Single Elim)",
    bracketData: generateSingleElimData(),
  }
};

export const DoubleElimination = {
  render: (args) => <BracketContainer {...args} />,
  args: {
    bracketName: "Fall Championship (Double Elim Preview)",
    bracketData: generateDoubleElimData(),
  }
};

export const LiveBackendSimulation = {
  render: (args) => <BracketContainer {...args} enableSimulation={true} />,
  args: {
    bracketName: "Live Tourney Feed (Simulated)",
    bracketData: generateSingleElimData(),
  }
};
